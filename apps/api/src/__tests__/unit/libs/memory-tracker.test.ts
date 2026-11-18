import { describe, expect, it } from "vitest";
import { MemoryTracker } from "../../../libs/memory-tracker/index.js";

const MB = 1024 * 1024;
const usage = () => ({ rss: 120 * MB, heapUsed: 40.25 * MB, heapTotal: 64 * MB, external: 3 * MB, arrayBuffers: 0.04 * MB });

/** A registry the test can "garbage collect" on demand. */
function fakeRegistry() {
  const registered: { target: object; label: string }[] = [];
  let collect: (label: string) => void = () => undefined;
  return {
    create(onCollect: (label: string) => void) {
      collect = onCollect;
      return { register: (target: object, label: string) => registered.push({ target, label }) };
    },
    gc(label: string) {
      collect(label);
    },
    registered,
  };
}

describe("MemoryTracker", () => {
  it("counts created, collected and live per label", () => {
    const registry = fakeRegistry();
    const tracker = new MemoryTracker((onCollect) => registry.create(onCollect), usage);

    const a = {};
    tracker.track(a, "GET /api/sale");
    tracker.track({}, "GET /api/sale");
    tracker.track({}, "POST /api/purchase");
    registry.gc("GET /api/sale");

    expect(registry.registered.map((r) => r.label)).toEqual(["GET /api/sale", "GET /api/sale", "POST /api/purchase"]);
    expect(registry.registered[0].target).toBe(a);
    expect(tracker.snapshot().labels).toEqual({
      "GET /api/sale": { created: 2, collected: 1, live: 1 },
      "POST /api/purchase": { created: 1, collected: 0, live: 1 },
    });
  });

  it("reports process memory in MB, one decimal", () => {
    const tracker = new MemoryTracker((onCollect) => fakeRegistry().create(onCollect), usage);
    expect(tracker.snapshot().process).toEqual({ rssMb: 120, heapUsedMb: 40.3, heapTotalMb: 64, externalMb: 3, arrayBuffersMb: 0 });
  });

  it("starts empty, and works with the real FinalizationRegistry and process", () => {
    const tracker = new MemoryTracker();
    expect(tracker.snapshot().labels).toEqual({});
    tracker.track({}, "x");
    expect(tracker.snapshot().labels.x).toEqual({ created: 1, collected: 0, live: 1 });
    expect(tracker.snapshot().process.rssMb).toBeGreaterThan(0);
  });
});
