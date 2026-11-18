import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { CommandError } from "./command.js";
import { COMMANDS, findCommand } from "./commands/index.js";
import { openContext } from "./context.js";
import { runMenu } from "./menu.js";
import { helpText, runCommand, type Ask } from "./run.js";

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      yes: { type: "boolean", short: "y" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      stock: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      minutes: { type: "string" },
      file: { type: "string" },
    },
  });
  const [name, ...rest] = positionals;
  const interactive = process.stdin.isTTY === true;

  if (values.help || name === "help" || (!name && !interactive)) {
    console.log(helpText(COMMANDS));
    return 0;
  }

  const command = name ? findCommand(name) : undefined;
  if (name && !command) {
    console.error(`Unknown command "${name}".\n\n${helpText(COMMANDS)}`);
    return 1;
  }

  const ctx = await openContext({
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017/flashsale",
  });

  try {
    if (!command) {
      await runMenu(COMMANDS, ctx, process.env);
      return 0;
    }

    const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
    const ask: Ask | null = rl ? (question) => rl.question(question) : null;
    try {
      const lines = await runCommand(command, ctx, { positionals: rest, flags: values, env: process.env }, ask);
      console.log(lines.join("\n"));
      return 0;
    } finally {
      rl?.close();
    }
  } catch (err) {
    if (!(err instanceof CommandError)) throw err;
    console.error(err.message);
    return 1;
  } finally {
    await ctx.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("cli failed:", err);
    process.exit(1);
  },
);
