import { ensureOrderIndexes, ensureResetIndexes, ensureUserIndexes } from "@flashsale/core";
import type { Command } from "../command.js";

export const migrate: Command = {
  name: "migrate",
  label: "Migrate (create indexes)",
  summary: "Create Mongo indexes (safe to re-run)",
  async run(ctx) {
    await ensureOrderIndexes(ctx.db);
    await ensureUserIndexes(ctx.db);
    await ensureResetIndexes(ctx.db);
    return ["Indexes ready: orders.userId (unique), users.email (unique), password_resets (token hash, 30 min expiry)."];
  },
};
