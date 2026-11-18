import type { Context } from "./context.js";

export interface Args {
  positionals: string[];
  flags: Record<string, string | boolean | undefined>;
  /** Process env, passed in so commands never read globals (and tests can fake it). */
  env: Record<string, string | undefined>;
}

export interface Command {
  name: string;
  /** What the menu shows. */
  label: string;
  /** Arguments and flags, e.g. "<userId>" or "[--force]". */
  syntax?: string;
  /** One line for --help. */
  summary: string;
  /** Destructive commands need a typed "yes" (menu) or --yes (direct). */
  destructive?: boolean;
  /** Prompted for in the menu, passed as positionals in direct mode. */
  needs?: { name: string; prompt: string }[];
  /** Returns the lines to print. Throws CommandError for user mistakes. */
  run(ctx: Context, args: Args): Promise<string[]>;
}

/** A mistake the user can fix (bad input, missing data), not a crash. */
export class CommandError extends Error {}
