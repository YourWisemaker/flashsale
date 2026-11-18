import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Profiler } from "node:inspector";
import type { AiAgent } from "../ai-agent/index.js";
import type { ObjectStore } from "../aws/index.js";

/**
 * Event loop freeze profiler. Off by default (FREEZE_PROFILER=1 turns it on).
 *
 * A V8 CPU profile runs all the time and is cut every `rollMs`. If the
 * event loop stalled past `thresholdMs` during that window, the window's
 * profile is saved (local dir or S3) so the blocking call stack can be
 * opened in Chrome DevTools. Otherwise it's thrown away. Optionally an
 * AI agent writes a short explanation next to it.
 *
 * Sampling costs a few percent of CPU, which is why it's opt-in: turn it
 * on for a stress run or for one instance that's misbehaving.
 */

export interface InspectorSession {
  connect(): void;
  disconnect(): void;
  post(method: "Profiler.enable" | "Profiler.start" | "Profiler.disable"): Promise<unknown>;
  post(method: "Profiler.stop"): Promise<{ profile: Profiler.Profile }>;
}

export interface DelayHistogram {
  enable(): void;
  disable(): void;
  reset(): void;
  /** Nanoseconds, like `monitorEventLoopDelay`. */
  readonly max: number;
}

export interface FreezeProfilerDeps {
  session: InspectorSession;
  histogram: DelayHistogram;
  store: ObjectStore;
  agent?: AiAgent;
  thresholdMs: number;
  rollMs: number;
  log: (message: string) => void;
  now?: () => Date;
}

export function shouldCapture(maxDelayMs: number, thresholdMs: number): boolean {
  return maxDelayMs >= thresholdMs;
}

export interface Frame {
  name: string;
  location: string;
  selfMs: number;
}

/** Functions with the most self time in a profile: what was actually running while the loop was stuck. */
export function topFrames(profile: Profiler.Profile, count: number): Frame[] {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfMs = new Map<number, number>();
  // Stryker disable next-line ArrayDeclaration: a made-up sample id matches no node and is skipped below.
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  samples.forEach((id, i) => selfMs.set(id, (selfMs.get(id) ?? 0) + (deltas[i] ?? 0) / 1000));

  const byFrame = new Map<string, Frame>();
  for (const [id, ms] of selfMs) {
    const frame = nodes.get(id)?.callFrame;
    if (!frame) continue;
    const name = frame.functionName || "(anonymous)";
    const location = `${frame.url || "native"}:${frame.lineNumber + 1}`;
    const key = `${name} ${location}`;
    const existing = byFrame.get(key);
    byFrame.set(key, { name, location, selfMs: (existing?.selfMs ?? 0) + ms });
  }
  return [...byFrame.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, count);
}

const EXPLAIN_SYSTEM =
  "You review CPU profiles from a Node.js Fastify API whose event loop froze. Name the most likely blocking call, why it blocks, and one concrete fix. Under 150 words. No preamble.";

export function explainPrompt(maxDelayMs: number, frames: Frame[]): string {
  const lines = frames.map((f) => `- ${f.name} at ${f.location}: ${f.selfMs.toFixed(1)} ms self time`);
  return `The event loop stalled for ${maxDelayMs.toFixed(0)} ms. Top functions by self time in that window:\n${lines.join("\n")}`;
}

/** Local-disk store, the default when no S3 bucket is configured. */
export function createDirStore(dir: string): ObjectStore {
  return {
    async put(key, body) {
      await mkdir(dir, { recursive: true });
      const path = join(dir, key);
      await writeFile(path, body);
      return path;
    },
  };
}

/** Starts sampling. Returns a stop function for graceful shutdown. */
export async function startFreezeProfiler(deps: FreezeProfilerDeps): Promise<() => Promise<void>> {
  const now = deps.now ?? (() => new Date());
  deps.session.connect();
  await deps.session.post("Profiler.enable");
  await deps.session.post("Profiler.start");
  deps.histogram.enable();

  let rolling = false;
  const roll = async () => {
    // A slow upload must not overlap the next window.
    if (rolling) return;
    rolling = true;
    try {
      const maxDelayMs = deps.histogram.max / 1e6;
      deps.histogram.reset();
      const { profile } = await deps.session.post("Profiler.stop");
      await deps.session.post("Profiler.start");
      if (!shouldCapture(maxDelayMs, deps.thresholdMs)) return;

      const key = `freeze-${now().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
      const where = await deps.store.put(`${key}.cpuprofile`, JSON.stringify(profile), "application/json");
      deps.log(`event loop froze for ${maxDelayMs.toFixed(0)} ms, profile saved to ${where}`);
      if (!deps.agent) return;

      const explanation = await deps.agent.ask(EXPLAIN_SYSTEM, explainPrompt(maxDelayMs, topFrames(profile, 10)));
      const note = await deps.store.put(`${key}.md`, explanation, "text/markdown");
      deps.log(`freeze explanation saved to ${note}`);
    } catch (err) {
      // The profiler is a diagnostic: it never takes the API down with it.
      deps.log(`freeze profiler roll failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      rolling = false;
    }
  };

  const timer = setInterval(roll, deps.rollMs);
  timer.unref();

  return async () => {
    clearInterval(timer);
    deps.histogram.disable();
    await deps.session.post("Profiler.stop");
    await deps.session.post("Profiler.disable");
    deps.session.disconnect();
  };
}
