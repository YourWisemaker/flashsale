import { CommandError, type Args, type Command } from "./command.js";
import type { Context } from "./context.js";

/** Asks the user something and returns their answer. Injected so tests can answer. */
export type Ask = (question: string) => Promise<string>;

/**
 * Shared by the menu and direct mode: fills missing inputs, asks before
 * anything destructive, then runs. Destructive commands need either --yes
 * or a typed "yes"; without a way to ask (piped stdin, CI) they refuse.
 */
export async function runCommand(command: Command, ctx: Context, args: Args, ask: Ask | null): Promise<string[]> {
  const positionals = [...args.positionals];
  for (const [index, need] of (command.needs ?? []).entries()) {
    if (positionals[index]) continue;
    if (!ask) throw new CommandError(`Missing <${need.name}>. Usage: pnpm cli ${command.name} ${command.syntax ?? ""}`.trimEnd());
    positionals[index] = (await ask(need.prompt)).trim();
  }

  if (command.destructive && args.flags.yes !== true) {
    if (!ask) throw new CommandError(`"${command.name}" deletes data. Re-run with --yes to confirm.`);
    const answer = await ask(`"${command.label}" deletes data in ${ctx.target}. Type "yes" to continue: `);
    if (answer.trim().toLowerCase() !== "yes") return ["Cancelled, nothing changed."];
  }

  return command.run(ctx, { ...args, positionals });
}

export function helpText(commands: Command[]): string {
  const width = Math.max(...commands.map((command) => command.name.length)) + 3;
  return [
    "Usage: pnpm cli [command] [options]",
    "",
    "With no command, opens an interactive menu.",
    "",
    "Commands:",
    ...commands.flatMap((command) => [
      `  ${command.name.padEnd(width)}${command.summary}${command.destructive ? " (asks first, --yes skips)" : ""}`,
      ...(command.syntax ? [`  ${" ".repeat(width)}${command.name} ${command.syntax}`] : []),
    ]),
    "",
    "Connects to REDIS_URL and MONGO_URL from the root .env.",
  ].join("\n");
}
