import { createUser, normalizeEmail, passwordProblem } from "@flashsale/core";
import { CommandError, type Command } from "../command.js";

export const userCreate: Command = {
  name: "user:create",
  label: "Create user account",
  syntax: "<email> <password>",
  summary: "Create a login (for testing; real users sign up on the site)",
  needs: [
    { name: "email", prompt: "Email: " },
    { name: "password", prompt: "Password (8+ characters): " },
  ],
  async run(ctx, args) {
    const email = normalizeEmail(args.positionals[0]);
    if (!email) throw new CommandError("Give a valid email, e.g. pnpm cli user:create someone@example.com 'a-long-password'");
    const problem = passwordProblem(args.positionals[1]);
    if (problem) throw new CommandError(problem);

    if (!(await createUser(ctx.db, email, args.positionals[1]))) throw new CommandError(`${email} already has an account.`);
    return [`Account created: ${email}`];
  },
};
