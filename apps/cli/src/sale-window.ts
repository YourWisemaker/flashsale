import type { SaleConfig } from "@flashsale/core";
import type { Args } from "./command.js";
import { CommandError } from "./command.js";

const MINUTE = 60_000;

/**
 * Sale window and stock for `seed`, from flags first, then env, then
 * defaults (starts in 1 minute, runs 1 hour, 100 units). Pure: `now` is
 * passed in.
 */
export function resolveSaleConfig(args: Args, now: number): SaleConfig {
  const pick = (flag: string, envKey: string) => {
    const fromFlag = args.flags[flag];
    return typeof fromFlag === "string" ? fromFlag : args.env[envKey];
  };

  const stockRaw = pick("stock", "SALE_STOCK") ?? "100";
  const totalStock = Number(stockRaw);
  if (!Number.isInteger(totalStock) || totalStock < 0) throw new CommandError(`Stock must be a whole number of 0 or more, got "${stockRaw}".`);

  const startsAt = parseDate(pick("start", "SALE_START"), "start", now) ?? new Date(now + MINUTE);

  const minutesRaw = args.flags.minutes;
  let endsAt: Date;
  if (typeof minutesRaw === "string") {
    const minutes = Number(minutesRaw);
    if (!(minutes > 0)) throw new CommandError(`Minutes must be more than 0, got "${minutesRaw}".`);
    endsAt = new Date(startsAt.getTime() + minutes * MINUTE);
  } else {
    endsAt = parseDate(pick("end", "SALE_END"), "end", now) ?? new Date(startsAt.getTime() + 60 * MINUTE);
  }

  if (endsAt <= startsAt) throw new CommandError(`The sale must end after it starts (${startsAt.toISOString()} to ${endsAt.toISOString()}).`);
  return { startsAt, endsAt, totalStock };
}

/** Accepts an ISO date, or "now" so a demo sale can start immediately. */
function parseDate(raw: string | undefined, label: string, now: number): Date | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw === "now") return new Date(now);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new CommandError(`Sale ${label} must be an ISO date like 2026-11-22T09:00:00Z, got "${raw}".`);
  return date;
}
