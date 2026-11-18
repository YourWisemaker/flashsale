/**
 * Redis keys for the sale. Fixed names, no per-sale namespacing: this
 * system sells exactly one product per deployment, per the brief.
 */
export const SALE_CONFIG_KEY = "sale:config";
export const SALE_STOCK_KEY = "sale:stock";
export const SALE_BUYERS_KEY = "sale:buyers";

export const ORDER_QUEUE_NAME = "orders";

/**
 * 5 attempts with exponential backoff starting at 500ms. After the
 * 5th failure the job lands in BullMQ's failed set, which is this
 * system's DLQ (see dlq-replay script in apps/worker), so failed jobs
 * are kept.
 *
 * Completed jobs are removed. BullMQ silently ignores add() for a job
 * id that still exists in any state, so keeping them would mean a
 * returning user in a later (re-seeded) sale never gets confirmed.
 * Double reservation within one sale is already blocked by the Lua
 * gate, so nothing is lost by dropping them. Also keeps Redis from
 * growing by one hash per order forever.
 */
export const ORDER_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 500 },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * BullMQ rejects a bare job id that parses as an integer ("Custom Id
 * cannot be integers"). A numeric userId (a valid input: "12345" is a
 * legal username) would hit that on every single enqueue, so job ids
 * get this prefix instead of using the userId directly. Still a 1:1,
 * deterministic mapping, so BullMQ's duplicate-jobId dedupe still
 * makes the enqueue idempotent per user.
 */
export function orderJobId(userId: string): string {
  return `order-${userId}`;
}
