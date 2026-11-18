import { describe, expect, it, vi } from "vitest";
import { AI_AGENT_MODEL, createAiAgent } from "../../../libs/ai-agent/index.js";

describe("createAiAgent", () => {
  it("sends one message with the system prompt and joins the text blocks", async () => {
    const create = vi.fn(async () => ({
      content: [
        { type: "text", text: "JSON.parse on a 40 MB body." },
        { type: "tool_use", id: "x", name: "y", input: {} },
        { type: "text", text: "Stream it instead." },
      ],
    }));
    const agent = createAiAgent("sk-test", { messages: { create } } as never);

    const answer = await agent.ask("You review profiles.", "What blocked?");

    expect(answer).toBe("JSON.parse on a 40 MB body.\nStream it instead.");
    expect(create).toHaveBeenCalledWith({
      model: AI_AGENT_MODEL,
      max_tokens: 1024,
      system: "You review profiles.",
      messages: [{ role: "user", content: "What blocked?" }],
    });
    expect(AI_AGENT_MODEL).toBe("claude-sonnet-5");
  });

  it("the default client sends the key it was given", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: AI_AGENT_MODEL, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await createAiAgent("sk-test-key").ask("s", "p")).toBe("ok");
      const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
      // This SDK version sends the API key as a bearer token.
      expect(headers.get("authorization")).toBe("Bearer sk-test-key");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
