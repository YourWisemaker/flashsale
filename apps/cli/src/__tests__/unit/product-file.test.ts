import { describe, expect, it } from "vitest";
import { CommandError } from "../../command.js";
import { parseProduct } from "../../product-file.js";

const valid = () => ({
  sku: "HT-2",
  name: "Hi-Top",
  description: "A sneaker.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [{ url: "/products/a.jpg", alt: "side" }],
  specs: [{ label: "Upper", value: "Suede" }],
});

const rejects = (value: unknown, message: string) => {
  expect(() => parseProduct(value)).toThrow(CommandError);
  expect(() => parseProduct(value)).toThrow(message);
};

describe("parseProduct", () => {
  it("accepts a valid product and keeps only known fields", () => {
    expect(parseProduct({ ...valid(), extra: "dropped", images: [{ url: "/a.jpg", alt: "x", junk: 1 }] })).toEqual({
      ...valid(),
      images: [{ url: "/a.jpg", alt: "x" }],
    });
  });

  it("allows a price equal to the original (no discount)", () => {
    expect(parseProduct({ ...valid(), priceCents: 14900 }).priceCents).toBe(14900);
  });

  it.each([null, [], "text", 42])("rejects a non-object (%j)", (value) => {
    rejects(value, "must contain a JSON object");
  });

  it.each(["sku", "name", "description", "currency"])("rejects a missing or blank %s", (field) => {
    rejects({ ...valid(), [field]: "  " }, `"${field}" must be a non-empty string`);
    rejects({ ...valid(), [field]: 5 }, `"${field}" must be a non-empty string`);
  });

  it.each(["priceCents", "originalPriceCents"])("rejects a %s that isn't a positive whole number", (field) => {
    rejects({ ...valid(), [field]: 89.5 }, `"${field}" must be a positive whole number of cents`);
    rejects({ ...valid(), [field]: 0 }, `"${field}" must be a positive whole number of cents`);
    rejects({ ...valid(), [field]: "8900" }, `"${field}" must be a positive whole number of cents`);
  });

  it("rejects a currency that isn't a 3-letter code", () => {
    rejects({ ...valid(), currency: "usd" }, 'must be a 3-letter code like USD, got "usd"');
    rejects({ ...valid(), currency: "USDX" }, 'got "USDX"');
    rejects({ ...valid(), currency: "XUSD" }, 'got "XUSD"');
  });

  it("rejects a sale price above the original", () => {
    rejects({ ...valid(), priceCents: 20000 }, "priceCents can't be higher than originalPriceCents");
  });

  it.each([
    ["images", "url", "alt"],
    ["specs", "label", "value"],
  ])("rejects empty or malformed %s", (field, a, b) => {
    rejects({ ...valid(), [field]: [] }, `"${field}" must be a non-empty array`);
    rejects({ ...valid(), [field]: "nope" }, `"${field}" must be a non-empty array`);
    rejects({ ...valid(), [field]: [{ [a]: "x" }] }, `"${field}[0]" needs non-empty "${a}" and "${b}"`);
    rejects({ ...valid(), [field]: [{ [a]: "", [b]: "y" }] }, `"${field}[0]" needs non-empty "${a}" and "${b}"`);
    rejects({ ...valid(), [field]: ["text"] }, `"${field}[0]" needs`);
  });
});
