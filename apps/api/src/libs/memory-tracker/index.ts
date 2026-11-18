/**
 * Counts live objects per label using FinalizationRegistry: +1 when
 * tracked, -1 when the garbage collector frees it. A label whose live
 * count keeps climbing after load stops is holding on to something.
 *
 * Off by default (MEMORY_TRACKER=1). When on, the API tracks every
 * request object under "METHOD /route" and serves a snapshot at
 * GET /debug/memory. See USAGE.md.
 */

export interface LabelCounts {
  created: number;
  collected: number;
  live: number;
}

export interface MemorySnapshot {
  labels: Record<string, LabelCounts>;
  process: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number; arrayBuffersMb: number };
}

type Registry = { register(target: object, label: string): void };

const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;

export class MemoryTracker {
  private readonly counts = new Map<string, { created: number; collected: number }>();
  private readonly registry: Registry;

  constructor(
    createRegistry: (onCollect: (label: string) => void) => Registry = (onCollect) => new FinalizationRegistry<string>(onCollect),
    private readonly memoryUsage: () => NodeJS.MemoryUsage = process.memoryUsage,
  ) {
    this.registry = createRegistry((label) => this.collected(label));
  }

  track(target: object, label: string): void {
    this.entry(label).created += 1;
    this.registry.register(target, label);
  }

  snapshot(): MemorySnapshot {
    const labels: Record<string, LabelCounts> = {};
    for (const [label, { created, collected }] of this.counts) labels[label] = { created, collected, live: created - collected };
    const usage = this.memoryUsage();
    return {
      labels,
      process: {
        rssMb: toMb(usage.rss),
        heapUsedMb: toMb(usage.heapUsed),
        heapTotalMb: toMb(usage.heapTotal),
        externalMb: toMb(usage.external),
        arrayBuffersMb: toMb(usage.arrayBuffers),
      },
    };
  }

  private collected(label: string): void {
    this.entry(label).collected += 1;
  }

  private entry(label: string) {
    let entry = this.counts.get(label);
    if (!entry) {
      entry = { created: 0, collected: 0 };
      this.counts.set(label, entry);
    }
    return entry;
  }
}
