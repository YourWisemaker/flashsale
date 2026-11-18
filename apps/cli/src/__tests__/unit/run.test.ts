import { describe, expect, it, vi } from "vitest";
import { CommandError, type Args, type Command } from "../../command.js";
import { COMMANDS, findCommand } from "../../commands/index.js";
import { redact, type Context } from "../../context.js";
import { helpText, runCommand } from "../../run.js";

const ctx = { target: "redis://test + mongodb://test" } as Context;
const args = (overrides: Partial<Args> = {}): Args => ({ positionals: [], flags: {}, env: {}, ...overrides });

function fakeCommand(overrides: Partial<Command> = {}): Command {
  return { name: "fake", label: "Fake", summary: "does fake things", run: vi.fn(async (_c, a: Args) => [`ran with ${a.positionals.join(",")}`]), ...overrides };
}

describe("runCommand", () => {
  it("runs a safe command without asking anything", async () => {
    const ask = vi.fn();
    expect(await runCommand(fakeCommand(), ctx, args({ positionals: ["a"] }), ask)).toEqual(["ran with a"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("refuses a destructive command when it can't ask and has no --yes", async () => {
    const command = fakeCommand({ destructive: true });
    await expect(runCommand(command, ctx, args(), null)).rejects.toThrow(new CommandError('"fake" deletes data. Re-run with --yes to confirm.'));
    expect(command.run).not.toHaveBeenCalled();
  });

  it("runs a destructive command with --yes, without asking", async () => {
    const command = fakeCommand({ destructive: true });
    const ask = vi.fn();
    expect(await runCommand(command, ctx, args({ flags: { yes: true } }), ask)).toEqual(["ran with "]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks before a destructive command, naming the target, and runs on yes", async () => {
    const ask = vi.fn(async () => " YES ");
    expect(await runCommand(fakeCommand({ destructive: true }), ctx, args(), ask)).toEqual(["ran with "]);
    expect(ask).toHaveBeenCalledWith('"Fake" deletes data in redis://test + mongodb://test. Type "yes" to continue: ');
  });

  it.each(["no", "", "y"])("cancels on any answer other than yes (%j)", async (answer) => {
    const command = fakeCommand({ destructive: true });
    expect(await runCommand(command, ctx, args(), async () => answer)).toEqual(["Cancelled, nothing changed."]);
    expect(command.run).not.toHaveBeenCalled();
  });

  it("prompts for missing inputs and passes them on, trimmed", async () => {
    const command = fakeCommand({ needs: [{ name: "userId", prompt: "Who? " }] });
    const ask = vi.fn(async () => "  arief  ");
    expect(await runCommand(command, ctx, args(), ask)).toEqual(["ran with arief"]);
    expect(ask).toHaveBeenCalledWith("Who? ");
  });

  it("doesn't prompt for inputs already given", async () => {
    const ask = vi.fn();
    await runCommand(fakeCommand({ needs: [{ name: "userId", prompt: "Who? " }] }), ctx, args({ positionals: ["boss"] }), ask);
    expect(ask).not.toHaveBeenCalled();
  });

  it("explains usage without trailing space for a command with no syntax line", async () => {
    const command = fakeCommand({ needs: [{ name: "userId", prompt: "Who? " }] });
    await expect(runCommand(command, ctx, args(), null)).rejects.toThrow(/^Missing <userId>\. Usage: pnpm cli fake$/);
  });

  it("explains usage when an input is missing and it can't ask", async () => {
    const command = fakeCommand({ syntax: "<userId>", needs: [{ name: "userId", prompt: "Who? " }] });
    await expect(runCommand(command, ctx, args(), null)).rejects.toThrow("Missing <userId>. Usage: pnpm cli fake <userId>");
  });
});

describe("command registry", () => {
  it("has unique names and menu labels, and a summary for each", () => {
    expect(new Set(COMMANDS.map((c) => c.name)).size).toBe(COMMANDS.length);
    expect(new Set(COMMANDS.map((c) => c.label)).size).toBe(COMMANDS.length);
    for (const command of COMMANDS) expect(command.summary.length, command.name).toBeGreaterThan(10);
  });

  it("covers the ops tasks the README promises", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([
      "status",
      "migrate",
      "seed",
      "product:inject",
      "product:clean",
      "user:create",
      "user:delete",
      "user:clean",
      "users:clean",
      "reset",
      "dlq:replay",
      "reconcile",
      "outbox",
    ]);
  });

  it("shows these menu labels, in this order", () => {
    expect(COMMANDS.map((c) => c.label)).toEqual([
      "Show status",
      "Migrate (create indexes)",
      "Migrate and seed (product + sale window)",
      "Inject product",
      "Clean up product",
      "Create user account",
      "Delete user account",
      "Clean up specific user data",
      "Clean up all user data",
      "Clean up all data",
      "Replay failed jobs (DLQ)",
      "Reconcile Redis from Mongo",
      "Show outbox (sent emails)",
    ]);
  });

  it("documents the flags of each command that takes any", () => {
    expect(Object.fromEntries(COMMANDS.filter((c) => c.syntax).map((c) => [c.name, c.syntax]))).toEqual({
      seed: "[--stock N] [--start ISO|now] [--end ISO | --minutes N] [--force]",
      "product:inject": "[--file product.json]",
      "user:create": "<email> <password>",
      "user:delete": "<email>",
      "user:clean": "<userId>",
      outbox: "[email]",
    });
  });

  it("asks for what each command needs when run from the menu", () => {
    expect(findCommand("user:clean")?.needs).toEqual([{ name: "userId", prompt: "User id to clean up: " }]);
    expect(findCommand("user:delete")?.needs).toEqual([{ name: "email", prompt: "Email of the account to delete: " }]);
    expect(findCommand("user:create")?.needs).toEqual([
      { name: "email", prompt: "Email: " },
      { name: "password", prompt: "Password (8+ characters): " },
    ]);
  });

  it("marks exactly the commands that delete data as destructive", () => {
    expect(COMMANDS.filter((c) => c.destructive).map((c) => c.name)).toEqual(["product:clean", "user:delete", "user:clean", "users:clean", "reset"]);
  });

  it("finds commands by name", () => {
    expect(findCommand("reset")?.label).toBe("Clean up all data");
    expect(findCommand("nope")).toBeUndefined();
  });
});

describe("helpText", () => {
  const help = helpText(COMMANDS);

  it("lists every command with its summary, and syntax where it has flags", () => {
    expect(help.split("\n").slice(0, 5)).toEqual([
      "Usage: pnpm cli [command] [options]",
      "",
      "With no command, opens an interactive menu.",
      "",
      "Commands:",
    ]);
    expect(help.split("\n").slice(-2)).toEqual(["", "Connects to REDIS_URL and MONGO_URL from the root .env."]);
    expect(help).toMatch(/^ {2}status {11}Sale, product, accounts, buyers, orders and queue at a glance$/m);
    expect(help).toMatch(/^ {19}user:clean <userId>$/m);
    for (const command of COMMANDS) expect(help).toContain(command.summary);
    // One line per command, plus one per command with a syntax line, plus 7 of framing.
    expect(help.split("\n")).toHaveLength(COMMANDS.length + COMMANDS.filter((c) => c.syntax).length + 7);
  });

  it("flags destructive commands", () => {
    expect(help).toContain("Delete everything: sale, buyers, queue, orders, product, accounts, emails (asks first, --yes skips)");
    expect(help).not.toContain("glance (asks first");
  });
});

describe("demo user", () => {
  it("is the login the README lists", async () => {
    const { DEMO_USER } = await import("../../data/demo-user.js");
    expect(DEMO_USER).toEqual({ email: "demo@example.com", password: "FlashSale2026!" });
  });
});

describe("redact", () => {
  it("hides credentials in connection URLs", () => {
    expect(redact("mongodb://admin:s3cret@db.example:27017/shop")).toBe("mongodb://***@db.example:27017/shop");
    expect(redact("redis://:pw@cache:6379")).toBe("redis://***@cache:6379");
  });

  it("leaves URLs without credentials alone", () => {
    expect(redact("redis://localhost:6379")).toBe("redis://localhost:6379");
  });
});
