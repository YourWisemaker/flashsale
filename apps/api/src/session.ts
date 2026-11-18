import { SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionTokens } from "@flashsale/core";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Email of the logged-in user, set by requireUser. */
    user: string | null;
  }
}

/** Cookie handling in one place, so every route sets it the same way. */
export function createSessionCookies(sessions: SessionTokens, secure: boolean) {
  return {
    set(reply: FastifyReply, email: string) {
      // httpOnly: page scripts can't read it, so XSS can't steal it.
      // SameSite=Strict: other sites can't make the browser send it, which
      // stops cross-site request forgery against Buy Now.
      reply.setCookie(SESSION_COOKIE, sessions.sign(email), { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: SESSION_TTL_SECONDS });
    },
    clear(reply: FastifyReply) {
      // Stryker disable next-line ObjectLiteral: "/" is also the plugin's default; stated because it must match the path used in set().
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
    },
    /** onRequest hook: 401 unless the request carries a valid session. */
    async requireUser(request: FastifyRequest, reply: FastifyReply) {
      request.user = sessions.verify(request.cookies[SESSION_COOKIE]);
      if (!request.user) return reply.code(401).send({ error: "unauthorized", message: "Log in to continue." });
    },
  };
}

export type SessionCookies = ReturnType<typeof createSessionCookies>;
