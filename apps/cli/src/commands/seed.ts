import { createUser, saveProduct, setPassword } from "@flashsale/core";
import { CommandError, type Command } from "../command.js";
import { DEMO_USER } from "../data/demo-user.js";
import { SEED_PRODUCT } from "../data/product.js";
import { resolveSaleConfig } from "../sale-window.js";
import { migrate } from "./migrate.js";

export const seed: Command = {
  name: "seed",
  label: "Migrate and seed (product + sale window)",
  syntax: "[--stock N] [--start ISO|now] [--end ISO | --minutes N] [--force]",
  summary: "Migrate, write the product, seed the sale window and the demo account",
  async run(ctx, args) {
    const config = resolveSaleConfig(args, Date.now());
    const existing = await ctx.gate.getSnapshot();
    // Re-seeding resets stock and forgets every buyer, so it needs a deliberate --force.
    if (existing.totalStock > 0 && !args.flags.force) {
      throw new CommandError(
        `A sale is already seeded (${existing.status}, ${existing.stockLeft} of ${existing.totalStock} left). Re-run with --force to replace it.`,
      );
    }

    const lines = await migrate.run(ctx, args);
    await saveProduct(ctx.db, SEED_PRODUCT);
    await ctx.gate.configure(config);
    // Reset the password if the account exists, so the README credentials always work.
    if (!(await createUser(ctx.db, DEMO_USER.email, DEMO_USER.password))) await setPassword(ctx.db, DEMO_USER.email, DEMO_USER.password);

    return [
      ...lines,
      `Product:  ${SEED_PRODUCT.name} (${SEED_PRODUCT.sku})`,
      `Sale:     ${config.totalStock} units, ${config.startsAt.toISOString()} to ${config.endsAt.toISOString()}`,
      `Demo:     ${DEMO_USER.email} / ${DEMO_USER.password}`,
    ];
  },
};
