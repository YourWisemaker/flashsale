import {
  checkCredentials,
  consumeResetToken,
  createResetToken,
  createUser,
  normalizeEmail,
  passwordProblem,
  SESSION_COOKIE,
  sendMail,
  setPassword,
  userExists,
  type SessionTokens,
} from "@flashsale/core";
import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import type { SessionCookies } from "../session.js";

interface AuthDeps {
  db: Db;
  sessions: SessionTokens;
  cookies: SessionCookies;
  webUrl: string;
  authRateLimitMax: number;
}

type Body = { email?: unknown; password?: unknown; token?: unknown };
/** A request may have no body at all; treat that as an empty one. */
const bodyOf = (request: { body: unknown }) => (request.body ?? {}) as Body;

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  // Per IP: slows down password guessing and sign-up or reset-mail spam.
  const limited = { onRequest: app.rateLimit({ max: deps.authRateLimitMax, timeWindow: "1 minute" }) };

  app.post("/api/auth/register", limited, async (request, reply) => {
    const body = bodyOf(request);
    const email = normalizeEmail(body.email);
    if (!email) return reply.code(400).send({ error: "invalid_email", message: "Enter a valid email address." });
    const problem = passwordProblem(body.password);
    if (problem) return reply.code(400).send({ error: "weak_password", message: problem });

    if (!(await createUser(deps.db, email, body.password as string))) {
      return reply.code(409).send({ error: "email_taken", message: "That email already has an account. Log in, or reset your password." });
    }
    deps.cookies.set(reply, email);
    return reply.code(201).send({ email });
  });

  app.post("/api/auth/login", limited, async (request, reply) => {
    const body = bodyOf(request);
    const email = normalizeEmail(body.email);
    // Stryker disable next-line StringLiteral: any non-password fallback fails the same way.
    const password = typeof body.password === "string" ? body.password : "";
    // One message for every failure, so it doesn't reveal which emails have accounts.
    if (!email || !(await checkCredentials(deps.db, email, password))) {
      return reply.code(401).send({ error: "invalid_credentials", message: "Wrong email or password." });
    }
    deps.cookies.set(reply, email);
    return reply.code(200).send({ email });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    deps.cookies.clear(reply);
    return reply.code(204).send();
  });

  app.get("/api/auth/me", async (request, reply) => {
    const email = deps.sessions.verify(request.cookies[SESSION_COOKIE]);
    if (!email) return reply.code(401).send({ error: "unauthorized", message: "Not logged in." });
    return { email };
  });

  app.post("/api/auth/forgot", limited, async (request, reply) => {
    const email = normalizeEmail(bodyOf(request).email);
    if (!email) return reply.code(400).send({ error: "invalid_email", message: "Enter a valid email address." });

    if (await userExists(deps.db, email)) {
      const token = await createResetToken(deps.db, email);
      await sendMail(deps.db, {
        to: email,
        subject: "Reset your Arief Shop password",
        text: `Someone asked to reset the password for ${email}.\n\nSet a new one here:\n${deps.webUrl}/reset-password?token=${token}\n\nThe link works once and expires in 30 minutes. If this wasn't you, ignore this email; your password hasn't changed.`,
      });
    }
    // Same answer either way, so this can't be used to find out who has an account.
    return reply.code(202).send({ status: "sent", message: "If that email has an account, a reset link is on its way." });
  });

  app.post("/api/auth/reset", limited, async (request, reply) => {
    const body = bodyOf(request);
    // Checked before the token is used up, so a too-short password doesn't burn the link.
    const problem = passwordProblem(body.password);
    if (problem) return reply.code(400).send({ error: "weak_password", message: problem });

    const email = await consumeResetToken(deps.db, body.token);
    if (!email) return reply.code(400).send({ error: "invalid_token", message: "This reset link is invalid or has expired. Ask for a new one." });

    await setPassword(deps.db, email, body.password as string);
    deps.cookies.set(reply, email);
    return reply.code(200).send({ email });
  });
}
