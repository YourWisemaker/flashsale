import { deriveUserOrderStatus, findOrder, normalizeUserId, orderJobId, type OrderJobData, type SaleGate } from "@flashsale/core";
import type { Queue } from "bullmq";
import type { Db } from "mongodb";
import type { FastifyInstance } from "fastify";
import { toPurchaseResponse } from "../purchase-response.js";

interface PurchaseDeps {
  saleGate: SaleGate;
  queue: Queue<OrderJobData>;
  db: Db;
}

export function registerPurchaseRoutes(app: FastifyInstance, deps: PurchaseDeps): void {
  app.post("/api/purchase", { onRequest: app.rateLimit() }, async (request, reply) => {
    const body = request.body as { userId?: unknown } | undefined;
    const userId = normalizeUserId(body?.userId);

    if (!userId) {
      return reply.code(400).send({ error: "invalid_user", message: "userId is required" });
    }

    let result;
    try {
      result = await deps.saleGate.purchase(userId);
    } catch (err) {
      // Redis unreachable: nothing was reserved, so there's nothing to undo.
      // Stryker disable next-line all: log wording is not behavior.
      request.log.error({ err, userId }, "purchase gate failed");
      return reply.code(503).send({ status: "unavailable" });
    }

    if (result.outcome !== "reserved") {
      const response = toPurchaseResponse(result.outcome);
      return reply.code(response.httpCode).send({ status: response.status });
    }

    try {
      // A deterministic jobId per user makes the enqueue itself
      // idempotent: BullMQ drops a second add() with a job id already
      // in the queue. See orderJobId's own comment for why it's not
      // just the bare userId.
      await deps.queue.add("confirm-order", { userId, reservedAt: new Date().toISOString() }, { jobId: orderJobId(userId) });
    } catch (err) {
      // Stryker disable next-line all: log wording is not behavior.
      request.log.error({ err, userId }, "enqueue failed, releasing reservation");
      await deps.saleGate.release(userId);
      return reply.code(503).send({ status: "unavailable" });
    }

    return reply.code(202).send({ status: "pending", stockLeft: result.stockLeft });
  });

  app.get("/api/purchase/:userId", async (request, reply) => {
    const params = request.params as { userId?: unknown };
    const userId = normalizeUserId(params.userId);

    if (!userId) {
      return reply.code(400).send({ error: "invalid_user", message: "userId is required" });
    }

    const [isReserved, order] = await Promise.all([deps.saleGate.isReserved(userId), findOrder(deps.db, userId)]);
    const status = deriveUserOrderStatus({ isReserved, hasConfirmedOrder: order !== null });

    return reply.code(200).send({ userId, status });
  });
}
