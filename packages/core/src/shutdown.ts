export interface ShutdownDeps {
  /** Where signal handlers attach. Defaults to `process`. */
  on: (signal: NodeJS.Signals, handler: (signal: NodeJS.Signals) => void) => unknown;
  exit: (code: number) => void;
  log: (message: string) => void;
  /** Hard deadline: past this the process exits 1 even if close() is still waiting. */
  timeoutMs: number;
}

// Stryker disable all: real-process wiring. The "real process" test runs it
// in a child process, where Stryker's active mutant isn't visible.
const defaults: ShutdownDeps = {
  on: (signal, handler) => process.on(signal, handler),
  exit: (code) => process.exit(code),
  log: (message) => console.log(message),
  timeoutMs: 10_000,
};
// Stryker restore all

/**
 * Runs `close` once on SIGTERM or SIGINT, then exits 0. A second signal
 * while closing is ignored rather than cutting the drain short; the
 * timeout is what stops a close() that hangs (a stuck connection, a job
 * that never finishes). 10s fits inside the usual orchestrator grace
 * period (Kubernetes 30s, ECS 30s, systemd 90s).
 */
export function gracefulShutdown(close: () => Promise<void>, overrides: Partial<ShutdownDeps> = {}): void {
  const { on, exit, log, timeoutMs } = { ...defaults, ...overrides };
  let closing = false;

  const handler = async (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    log(`${signal} received, shutting down`);
    const deadline = setTimeout(() => {
      log(`shutdown took longer than ${timeoutMs}ms, forcing exit`);
      exit(1);
    }, timeoutMs);
    try {
      await close();
      clearTimeout(deadline);
      exit(0);
    } catch (err) {
      clearTimeout(deadline);
      log(`shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
      exit(1);
    }
  };

  on("SIGTERM", handler);
  on("SIGINT", handler);
}
