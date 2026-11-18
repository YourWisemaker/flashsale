import { readFile } from "node:fs/promises";
import { saveProduct } from "@flashsale/core";
import { CommandError, type Command } from "../command.js";
import { SEED_PRODUCT } from "../data/product.js";
import { parseProduct } from "../product-file.js";

export const productInject: Command = {
  name: "product:inject",
  label: "Inject product",
  syntax: "[--file product.json]",
  summary: "Write the product (default: the built-in one)",
  async run(ctx, args) {
    const file = args.flags.file;
    let product = SEED_PRODUCT;
    if (typeof file === "string") {
      // Stryker disable next-line StringLiteral: equivalent, JSON.parse also accepts the Buffer you'd get without it.
      const raw = await readFile(file, "utf8").catch(() => {
        throw new CommandError(`Can't read product file "${file}".`);
      });
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new CommandError(`"${file}" isn't valid JSON.`);
      }
      product = parseProduct(parsed);
    }

    await saveProduct(ctx.db, product);
    return [`Product injected: ${product.name} (${product.sku}), ${product.images.length} image(s).`];
  },
};
