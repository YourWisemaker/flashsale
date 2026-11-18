import type { Db } from "mongodb";
import type { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance, deps: { redis: Redis; db: Db }): void {
  app.get("/health", async (_request, reply) => {
    try {
      await Promise.all([deps.redis.ping(), deps.db.command({ ping: 1 })]);
      return reply.code(200).send({ status: "ok" });
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
}
