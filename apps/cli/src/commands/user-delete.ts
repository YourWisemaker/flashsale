import { deleteUser, normalizeEmail } from "@flashsale/core";
import { CommandError, type Command } from "../command.js";
import { userClean } from "./user-clean.js";

export const userDelete: Command = {
  name: "user:delete",
  label: "Delete user account",
  syntax: "<email>",
  summary: "Delete a login and all of its purchase data",
  destructive: true,
  needs: [{ name: "email", prompt: "Email of the account to delete: " }],
  async run(ctx, args) {
    const email = normalizeEmail(args.positionals[0]);
    if (!email) throw new CommandError("Give a valid email, e.g. pnpm cli user:delete someone@example.com");

    // Purchase data first, the same way user:clean does it, so their unit goes back to stock.
    const purchase = await userClean.run(ctx, { ...args, positionals: [email] });
    const deleted = await deleteUser(ctx.db, email);
    return [deleted ? `Account deleted: ${email}` : `No account for ${email}.`, ...purchase];
  },
};
