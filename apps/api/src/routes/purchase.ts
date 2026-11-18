import { deriveUserOrderStatus, findOrder, orderJobId, type OrderJobData, type SaleGate } from "@flashsale/core";
import type { Queue } from "bullmq";
import type { Db } from "mongodb";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import { IDEMPOTENCY_HEADER, readIdempotencyKey, type IdempotencyStore, type StoredResponse } from "../idempotency.js";
import { toPurchaseResponse } from "../purchase-response.js";
import type { SessionCookies } from "../session.js";

interface PurchaseDeps {
  saleGate: SaleGate;
  queue: Queue<OrderJobData>;
  db: Db;
  cookies: SessionCookies;
  idempotency: IdempotencyStore;
}

const UNAVAILABLE: StoredResponse = { httpCode: 503, body: { status: "unavailable" } };

const send = (reply: FastifyReply, response: StoredResponse) => reply.code(response.httpCode).send(response.body);

export function registerPurchaseRoutes(app: FastifyInstance, deps: PurchaseDeps): void {
  /** One purchase attempt, start to finish. Never throws: every failure is a response. */
  async function purchase(userId: string, log: FastifyBaseLogger): Promise<StoredResponse> {
    let result;
    try {
      result = await deps.saleGate.purchase(userId);
    } catch (err) {
      // Redis unreachable: nothing was reserved, so there's nothing to undo.
      // Stryker disable next-line all: log wording is not behavior.
      log.error({ err, userId }, "purchase gate failed");
      return UNAVAILABLE;
    }

    if (result.outcome !== "reserved") {
      const response = toPurchaseResponse(result.outcome);
      return { httpCode: response.httpCode, body: { status: response.status } };
    }

    try {
      // A deterministic jobId per user makes the enqueue itself
      // idempotent: BullMQ drops a second add() with a job id already
      // in the queue. See orderJobId's own comment for why it's not
      // just the bare userId.
      await deps.queue.add("confirm-order", { userId, reservedAt: new Date().toISOString() }, { jobId: orderJobId(userId) });
    } catch (err) {
      // Stryker disable next-line all: log wording is not behavior.
      log.error({ err, userId }, "enqueue failed, releasing reservation");
      await deps.saleGate.release(userId);
      return UNAVAILABLE;
    }

    return { httpCode: 202, body: { status: "pending", stockLeft: result.stockLeft } };
  }

  app.post(
    "/api/purchase",
    {
      // Auth first, so the rate limit can be per user: people sharing an
      // office IP don't block each other, and one account can't hammer it.
      onRequest: [deps.cookies.requireUser, app.rateLimit({ keyGenerator: (request) => request.user ?? request.ip })],
    },
    async (request, reply) => {
      // The buyer is whoever the signed session says, never something in
      // the request body, so nobody can buy as someone else.
      const userId = request.user as string;

      const key = readIdempotencyKey(request.headers[IDEMPOTENCY_HEADER]);
      if (key === "invalid") {
        return reply.code(400).send({ error: "invalid_idempotency_key", message: "Idempotency-Key must be 8 to 128 letters, digits, - or _." });
      }
      if (key === null) return send(reply, await purchase(userId, request.log));

      let claim;
      try {
        claim = await deps.idempotency.claim(userId, key);
      } catch {
        return send(reply, UNAVAILABLE);
      }
      // Only an explicit "claimed" runs a purchase; anything else is a duplicate.
      if (claim.state !== "claimed") {
        return claim.state === "replay" ? send(reply.header("idempotent-replayed", "true"), claim.response) : reply.code(409).send({ status: "in_progress" });
      }

      const response = await purchase(userId, request.log);
      // A 503 is worth retrying, so forget the key; anything else is the
      // final answer for this key and is replayed from now on.
      if (response.httpCode === 503) await deps.idempotency.release(userId, key);
      else await deps.idempotency.save(userId, key, response);
      return send(reply, response);
    },
  );

  // Only your own status: there's no way to look up someone else's purchase.
  app.get("/api/purchase/me", { onRequest: deps.cookies.requireUser }, async (request, reply) => {
    const userId = request.user as string;
    const [isReserved, order] = await Promise.all([deps.saleGate.isReserved(userId), findOrder(deps.db, userId)]);
    return reply.code(200).send({ userId, status: deriveUserOrderStatus({ isReserved, hasConfirmedOrder: order !== null }) });
  });
}
