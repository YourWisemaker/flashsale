import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Profiler } from "node:inspector";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDirStore, explainPrompt, shouldCapture, startFreezeProfiler, topFrames } from "../../../libs/freeze-profiler/index.js";

const frame = (functionName: string, url: string, lineNumber: number) => ({ functionName, url, lineNumber, scriptId: "1", columnNumber: 0 });

/** Two functions plus an anonymous native one; samples weighted by timeDeltas (microseconds). */
const PROFILE: Profiler.Profile = {
  nodes: [
    { id: 1, callFrame: frame("(root)", "", 0) },
    { id: 2, callFrame: frame("parseBody", "file:///app/routes.js", 41) },
    { id: 3, callFrame: frame("", "", 0) },
    { id: 4, callFrame: frame("parseBody", "file:///app/routes.js", 41) },
    { id: 5, callFrame: frame("hashPassword", "file:///app/auth.js", 9) },
  ],
  startTime: 0,
  endTime: 1,
  // Deliberately not in self-time order, so sorting has work to do.
  samples: [5, 3, 2, 2, 4, 99],
  timeDeltas: [10_000, 50_000, 100_000, 200_000, 25_000, 1_000],
};

function fakes(maxNs: number) {
  const calls: string[] = [];
  const session = {
    connect: vi.fn(() => calls.push("connect")),
    disconnect: vi.fn(() => calls.push("disconnect")),
    post: vi.fn(async (method: string) => {
      calls.push(method);
      return method === "Profiler.stop" ? { profile: PROFILE } : {};
    }),
  };
  const histogram = { max: maxNs, enable: vi.fn(), disable: vi.fn(), reset: vi.fn() };
  const store = { put: vi.fn(async (key: string) => `mem://${key}`) };
  const log = vi.fn();
  return { calls, session, histogram, store, log };
}

const NOW = () => new Date("2026-11-18T09:30:00.123Z");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("shouldCapture", () => {
  it("captures at or past the threshold", () => {
    expect(shouldCapture(500, 500)).toBe(true);
    expect(shouldCapture(499.9, 500)).toBe(false);
  });
});

describe("topFrames", () => {
  it("sums self time per function and location, heaviest first", () => {
    expect(topFrames(PROFILE, 5)).toEqual([
      { name: "parseBody", location: "file:///app/routes.js:42", selfMs: 325 },
      { name: "(anonymous)", location: "native:1", selfMs: 50 },
      { name: "hashPassword", location: "file:///app/auth.js:10", selfMs: 10 },
    ]);
  });

  it("limits the count and copes with a profile without samples", () => {
    expect(topFrames(PROFILE, 1)).toEqual([{ name: "parseBody", location: "file:///app/routes.js:42", selfMs: 325 }]);
    expect(topFrames({ ...PROFILE, samples: undefined, timeDeltas: undefined }, 5)).toEqual([]);
    expect(topFrames({ ...PROFILE, timeDeltas: undefined }, 5)[0].selfMs).toBe(0);
  });
});

describe("explainPrompt", () => {
  it("lists the stall and each frame", () => {
    const frames = [
      { name: "parseBody", location: "routes.js:42", selfMs: 325.04 },
      { name: "hashPassword", location: "auth.js:10", selfMs: 9.96 },
    ];
    expect(explainPrompt(812.4, frames)).toBe(
      "The event loop stalled for 812 ms. Top functions by self time in that window:\n- parseBody at routes.js:42: 325.0 ms self time\n- hashPassword at auth.js:10: 10.0 ms self time",
    );
  });
});

describe("startFreezeProfiler", () => {
  it("starts sampling, and on a stall saves the window's profile", async () => {
    const f = fakes(800e6);
    await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000, now: NOW });
    expect(f.calls).toEqual(["connect", "Profiler.enable", "Profiler.start"]);
    expect(f.histogram.enable).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(f.histogram.reset).toHaveBeenCalledTimes(1);
    expect(f.calls.slice(3)).toEqual(["Profiler.stop", "Profiler.start"]);
    expect(f.store.put).toHaveBeenCalledWith(`freeze-2026-11-18T09-30-00-123Z-${process.pid}.cpuprofile`, JSON.stringify(PROFILE), "application/json");
    // No agent configured: one save, one log line, no explanation attempt.
    expect(f.store.put).toHaveBeenCalledTimes(1);
    expect(f.log.mock.calls).toEqual([[`event loop froze for 800 ms, profile saved to mem://freeze-2026-11-18T09-30-00-123Z-${process.pid}.cpuprofile`]]);
  });

  it("throws the window away when the loop stayed responsive", async () => {
    const f = fakes(20e6);
    await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000, now: NOW });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(f.calls.slice(3)).toEqual(["Profiler.stop", "Profiler.start"]);
    expect(f.store.put).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it("asks the agent to explain a capture and saves the answer beside it", async () => {
    const f = fakes(900e6);
    const agent = { ask: vi.fn(async () => "parseBody blocks: stream the body.") };
    await startFreezeProfiler({ ...f, agent, thresholdMs: 500, rollMs: 1_000, now: NOW });

    await vi.advanceTimersByTimeAsync(1_000);

    const [system, prompt] = (agent.ask.mock.calls[0] as unknown) as [string, string];
    expect(system).toContain("event loop froze");
    expect(prompt).toContain("stalled for 900 ms");
    expect(prompt).toContain("parseBody at file:///app/routes.js:42");
    const base = `freeze-2026-11-18T09-30-00-123Z-${process.pid}`;
    expect(f.store.put).toHaveBeenLastCalledWith(`${base}.md`, "parseBody blocks: stream the body.", "text/markdown");
    expect(f.log).toHaveBeenLastCalledWith(`freeze explanation saved to mem://${base}.md`);
  });

  it("logs a failed roll instead of throwing, then keeps going", async () => {
    const f = fakes(900e6);
    f.store.put.mockRejectedValueOnce(new Error("disk full"));
    await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000, now: NOW });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.log).toHaveBeenCalledWith("freeze profiler roll failed: disk full");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.store.put).toHaveBeenCalledTimes(2);
  });

  it("reports non-Error failures too", async () => {
    const f = fakes(900e6);
    f.store.put.mockRejectedValueOnce("quota");
    await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000, now: NOW });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.log).toHaveBeenCalledWith("freeze profiler roll failed: quota");
  });

  it("never overlaps rolls while a slow save is still running", async () => {
    const f = fakes(900e6);
    let finish!: () => void;
    f.store.put.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve("mem://slow"))));
    await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000, now: NOW });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(f.histogram.reset).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.histogram.reset).toHaveBeenCalledTimes(2);
  });

  it("stop() ends the timer and the session", async () => {
    const f = fakes(900e6);
    const stop = await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000, now: NOW });

    await stop();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(f.calls.slice(3)).toEqual(["Profiler.stop", "Profiler.disable", "disconnect"]);
    expect(f.histogram.disable).toHaveBeenCalled();
    expect(f.store.put).not.toHaveBeenCalled();
  });

  it("uses the real clock by default", async () => {
    vi.setSystemTime(new Date("2030-01-02T03:04:05.006Z"));
    const f = fakes(900e6);
    await startFreezeProfiler({ ...f, thresholdMs: 500, rollMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.store.put.mock.calls[0][0]).toMatch(/^freeze-2030-01-02T03-04-06-006Z-\d+\.cpuprofile$/);
  });
});

describe("createDirStore", () => {
  it("creates the folder and writes the file", async () => {
    vi.useRealTimers();
    const dir = join(await mkdtemp(join(tmpdir(), "freeze-")), "two", "levels");
    const where = await createDirStore(dir).put("a.cpuprofile", "{\"x\":1}", "application/json");
    expect(where).toBe(join(dir, "a.cpuprofile"));
    expect(await readFile(where, "utf8")).toBe("{\"x\":1}");
    await rm(dir, { recursive: true });
  });
});
