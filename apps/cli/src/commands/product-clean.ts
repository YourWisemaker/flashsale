import { PRODUCTS_COLLECTION } from "@flashsale/core";
import type { Command } from "../command.js";

export const productClean: Command = {
  name: "product:clean",
  label: "Clean up product",
  summary: "Remove the product display data (the sale itself keeps running)",
  destructive: true,
  async run(ctx) {
    const { deletedCount } = await ctx.db.collection(PRODUCTS_COLLECTION).deleteMany({});
    return [deletedCount ? "Product removed." : "No product to remove."];
  },
};
