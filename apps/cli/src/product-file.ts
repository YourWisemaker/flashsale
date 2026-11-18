import type { ProductDocument } from "@flashsale/core";
import { CommandError } from "./command.js";

/**
 * Validates a product read from a JSON file before it reaches Mongo.
 * Pure: takes the parsed value, returns a clean ProductDocument or throws
 * naming the first bad field.
 */
export function parseProduct(value: unknown): ProductDocument {
  if (!isObject(value)) throw new CommandError("Product file must contain a JSON object.");

  const text = (field: string) => {
    const v = value[field];
    if (typeof v !== "string" || v.trim() === "") throw new CommandError(`Product field "${field}" must be a non-empty string.`);
    return v;
  };
  const cents = (field: string) => {
    const v = value[field];
    if (!Number.isInteger(v) || (v as number) <= 0) throw new CommandError(`Product field "${field}" must be a positive whole number of cents.`);
    return v as number;
  };
  const pairs = <K extends string>(field: string, keys: [K, K]) => {
    const v = value[field];
    if (!Array.isArray(v) || v.length === 0) throw new CommandError(`Product field "${field}" must be a non-empty array.`);
    return v.map((item, i) => {
      if (!isObject(item) || keys.some((k) => typeof item[k] !== "string" || item[k] === "")) {
        throw new CommandError(`Product field "${field}[${i}]" needs non-empty "${keys[0]}" and "${keys[1]}".`);
      }
      return { [keys[0]]: item[keys[0]], [keys[1]]: item[keys[1]] } as Record<K, string>;
    });
  };

  const currency = text("currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new CommandError(`Product field "currency" must be a 3-letter code like USD, got "${currency}".`);

  const priceCents = cents("priceCents");
  const originalPriceCents = cents("originalPriceCents");
  if (priceCents > originalPriceCents) throw new CommandError("priceCents can't be higher than originalPriceCents.");

  return {
    sku: text("sku"),
    name: text("name"),
    description: text("description"),
    priceCents,
    originalPriceCents,
    currency,
    images: pairs("images", ["url", "alt"]),
    specs: pairs("specs", ["label", "value"]),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
