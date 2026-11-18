import type { Redis } from "ioredis";
import { SALE_BUYERS_KEY, SALE_CONFIG_KEY, SALE_STOCK_KEY } from "./keys.js";
import { PURCHASE_SCRIPT, RELEASE_SCRIPT } from "./lua-scripts.js";
import type { PurchaseOutcome, PurchaseResult, SaleConfig, SaleSnapshot, SaleStatus } from "./types.js";

type RedisWithSaleCommands = Redis & {
  purchaseItem(configKey: string, stockKey: string, buyersKey: string, userId: string): Promise<[PurchaseOutcome, string?]>;
  releaseItem(stockKey: string, buyersKey: string, userId: string): Promise<["released" | "noop"]>;
};

/**
 * ioredis caches scripts by SHA after the first EVAL, so repeat calls
 * don't re-send the script body. Defining the same command twice on one
 * client (two SaleGates sharing a connection) just overwrites it.
 */
function attachCommands(redis: Redis): RedisWithSaleCommands {
  redis.defineCommand("purchaseItem", { numberOfKeys: 3, lua: PURCHASE_SCRIPT });
  redis.defineCommand("releaseItem", { numberOfKeys: 2, lua: RELEASE_SCRIPT });
  return redis as RedisWithSaleCommands;
}

/**
 * The hot path for the sale. Every purchase attempt, and nothing else,
 * goes through here. No database call on this path: the API can
 * answer a purchase attempt from Redis alone.
 */
export class SaleGate {
  private readonly redis: RedisWithSaleCommands;

  /**
   * `now` only feeds the informational snapshot. The purchase decision
   * itself uses Redis's own clock inside the Lua script, never this.
   */
  constructor(
    redis: Redis,
    private readonly now: () => number = Date.now,
  ) {
    this.redis = attachCommands(redis);
  }

  /** Writes the sale window and stock. Wipes any prior buyer set. */
  async configure(config: SaleConfig): Promise<void> {
    await this.redis
      .multi()
      .hset(SALE_CONFIG_KEY, {
        startsAt: config.startsAt.getTime(),
        endsAt: config.endsAt.getTime(),
        totalStock: config.totalStock,
      })
      .set(SALE_STOCK_KEY, config.totalStock)
      .del(SALE_BUYERS_KEY)
      .exec();
  }

  async purchase(userId: string): Promise<PurchaseResult> {
    const [outcome, stockLeft] = await this.redis.purchaseItem(
      SALE_CONFIG_KEY,
      SALE_STOCK_KEY,
      SALE_BUYERS_KEY,
      userId,
    );
    return stockLeft === undefined ? { outcome } : { outcome, stockLeft: Number(stockLeft) };
  }

  /**
   * Gives a unit back if this user holds one. True when a unit was
   * released, false when there was nothing to release.
   */
  async release(userId: string): Promise<boolean> {
    const [result] = await this.redis.releaseItem(SALE_STOCK_KEY, SALE_BUYERS_KEY, userId);
    return result === "released";
  }

  /** True if this user holds a reservation (queued or confirmed). */
  async isReserved(userId: string): Promise<boolean> {
    const result = await this.redis.sismember(SALE_BUYERS_KEY, userId);
    return result === 1;
  }

  /**
   * Informational snapshot for the status endpoint. Not on the purchase
   * hot path, so a plain (non-atomic) read is fine here: a caller might
   * see stock that's one request stale, which only affects the number
   * shown on screen, never who gets a unit.
   */
  async getSnapshot(): Promise<SaleSnapshot> {
    const [config, stockRaw] = await Promise.all([
      this.redis.hgetall(SALE_CONFIG_KEY),
      this.redis.get(SALE_STOCK_KEY),
    ]);

    const startsAt = Number(config.startsAt ?? 0);
    const endsAt = Number(config.endsAt ?? 0);
    const totalStock = Number(config.totalStock ?? 0);
    const stockLeft = Number(stockRaw ?? 0);
    const now = this.now();

    // Same boundaries as purchase.lua: active from startsAt through endsAt inclusive.
    const status: SaleStatus =
      now < startsAt ? "upcoming" : now > endsAt ? "ended" : stockLeft <= 0 ? "sold_out" : "active";

    return {
      status,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      totalStock,
      stockLeft: Math.max(stockLeft, 0),
    };
  }
}
