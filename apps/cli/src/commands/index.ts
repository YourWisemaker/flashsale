import type { Command } from "../command.js";
import { dlqReplay } from "./dlq-replay.js";
import { migrate } from "./migrate.js";
import { outbox } from "./outbox.js";
import { productClean } from "./product-clean.js";
import { productInject } from "./product-inject.js";
import { reconcile } from "./reconcile.js";
import { reset } from "./reset.js";
import { seed } from "./seed.js";
import { status } from "./status.js";
import { userClean } from "./user-clean.js";
import { userCreate } from "./user-create.js";
import { userDelete } from "./user-delete.js";
import { usersClean } from "./users-clean.js";

/** Menu order. A new command is a new file plus one line here. */
export const COMMANDS: Command[] = [
  status,
  migrate,
  seed,
  productInject,
  productClean,
  userCreate,
  userDelete,
  userClean,
  usersClean,
  reset,
  dlqReplay,
  reconcile,
  outbox,
];

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((command) => command.name === name);
}
