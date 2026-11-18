import { normalizeEmail, readOutbox } from "@flashsale/core";
import type { Command } from "../command.js";

/** Where "sent" emails land in this demo (no mail provider), e.g. password reset links. */
export const outbox: Command = {
  name: "outbox",
  label: "Show outbox (sent emails)",
  syntax: "[email]",
  summary: "Show the latest emails the app sent, e.g. password reset links",
  async run(ctx, args) {
    const to = normalizeEmail(args.positionals[0]) ?? undefined;
    const mails = await readOutbox(ctx.db, to, 5);
    if (mails.length === 0) return [to ? `No emails sent to ${to}.` : "Outbox is empty."];
    return mails.flatMap((mail) => [
      `--- ${mail.createdAt.toISOString()}  To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      "",
      mail.text,
      "",
    ]);
  },
};
