import type { PurchaseAttemptResult } from "./http.js";

export interface StressReport {
  totalRequests: number;
  durationMs: number;
  requestsPerSecond: number;
  statusCounts: Record<string, number>;
  latency: { p50: number; p95: number; p99: number; max: number };
}

function percentile(sortedLatencies: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedLatencies.length) - 1;
  return sortedLatencies[Math.min(Math.max(index, 0), sortedLatencies.length - 1)] ?? 0;
}

export function buildReport(results: PurchaseAttemptResult[], durationMs: number): StressReport {
  const statusCounts: Record<string, number> = {};
  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }

  const sortedLatencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  return {
    totalRequests: results.length,
    durationMs,
    requestsPerSecond: Math.round((results.length / durationMs) * 1000),
    statusCounts,
    latency: {
      p50: Math.round(percentile(sortedLatencies, 50)),
      p95: Math.round(percentile(sortedLatencies, 95)),
      p99: Math.round(percentile(sortedLatencies, 99)),
      max: Math.round(sortedLatencies.at(-1) ?? 0),
    },
  };
}

export function printReport(name: string, report: StressReport): void {
  console.log(`\n--- ${name} ---`);
  console.log(`requests: ${report.totalRequests} in ${report.durationMs}ms (${report.requestsPerSecond} req/s)`);
  console.log(`latency ms: p50=${report.latency.p50} p95=${report.latency.p95} p99=${report.latency.p99} max=${report.latency.max}`);
  console.log("status counts:", report.statusCounts);
}
