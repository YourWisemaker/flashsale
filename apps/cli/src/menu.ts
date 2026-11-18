import { createInterface } from "node:readline/promises";
import { CommandError } from "./command.js";
import type { Command } from "./command.js";
import type { Context } from "./context.js";
import { runCommand } from "./run.js";

/** Numbered menu over the same commands direct mode runs. Loops until Exit. */
export async function runMenu(commands: Command[], ctx: Context, env: Record<string, string | undefined>): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string) => rl.question(question);

  try {
    console.log(`\nArief Shop ops (${ctx.target})`);
    for (;;) {
      console.log("");
      commands.forEach((command, i) => console.log(`  ${String(i + 1).padStart(2)}. ${command.label}${command.destructive ? " *" : ""}`));
      console.log("   0. Exit");
      console.log("  (* asks before deleting anything)");

      const choice = (await ask("\nPick a number: ")).trim();
      if (choice === "0" || choice === "") return;
      const command = commands[Number(choice) - 1];
      if (!command) {
        console.log(`No option "${choice}".`);
        continue;
      }

      try {
        const lines = await runCommand(command, ctx, { positionals: [], flags: {}, env }, ask);
        console.log(lines.join("\n"));
      } catch (err) {
        if (!(err instanceof CommandError)) throw err;
        console.log(`! ${err.message}`);
      }
    }
  } finally {
    rl.close();
  }
}
