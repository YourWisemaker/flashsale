import Anthropic from "@anthropic-ai/sdk";

export const AI_AGENT_MODEL = "claude-sonnet-5";

export interface AiAgent {
  /** One question in, plain text out. */
  ask(system: string, prompt: string): Promise<string>;
}

type MessagesClient = { messages: Pick<Anthropic["messages"], "create"> };

/**
 * Thin wrapper over the Anthropic Messages API: one call, no tools, no
 * streaming. Only used off the request path (explaining a captured
 * freeze profile), never while serving a purchase.
 */
export function createAiAgent(apiKey: string, client: MessagesClient = new Anthropic({ apiKey })): AiAgent {
  return {
    async ask(system, prompt) {
      const message = await client.messages.create({
        model: AI_AGENT_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
    },
  };
}
