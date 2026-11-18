import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gracefulShutdown } from "../shutdown.js";

function setup(close: () => Promise<void>) {
  const signals = new EventEmitter();
  const exit = vi.fn();
  const log = vi.fn();
  gracefulShutdown(close, { on: (signal, handler) => signals.on(signal, handler), exit, log, timeoutMs: 1_000 });
  const send = async (signal: NodeJS.Signals) => {
    signals.emit(signal, signal);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { send, exit, log };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("gracefulShutdown", () => {
  it.each(["SIGTERM", "SIGINT"] as const)("closes and exits 0 on %s", async (signal) => {
    const close = vi.fn(async () => undefined);
    const { send, exit, log } = setup(close);

    await send(signal);

    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalledWith(`${signal} received, shutting down`);
  });

  it("does nothing until a signal arrives", () => {
    const close = vi.fn(async () => undefined);
    const { exit } = setup(close);

    expect(close).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("ignores a second signal while the first is still closing", async () => {
    let finish!: () => void;
    const close = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { send, exit } = setup(close);

    await send("SIGTERM");
    await send("SIGINT");
    expect(close).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("forces exit 1 when close hangs past the deadline, and not before", async () => {
    const { send, exit, log } = setup(() => new Promise<void>(() => undefined));

    await send("SIGTERM");
    await vi.advanceTimersByTimeAsync(999);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith("shutdown took longer than 1000ms, forcing exit");
  });

  it("exits 1 when close throws, and the deadline doesn't fire afterwards", async () => {
    const { send, exit, log } = setup(async () => {
      throw new Error("mongo went away");
    });

    await send("SIGTERM");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith("shutdown failed: mongo went away");
  });

  it("reports non-Error throws too", async () => {
    const { send, log } = setup(() => Promise.reject("plain string"));
    await send("SIGTERM");
    expect(log).toHaveBeenCalledWith("shutdown failed: plain string");
  });

  it("clears the deadline after a clean close", async () => {
    const { send, exit } = setup(async () => undefined);
    await send("SIGTERM");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("gracefulShutdown with the real process", () => {
  it("hooks SIGTERM, logs, and exits 0 by default", async () => {
    vi.useRealTimers();
    const { spawn } = await import("node:child_process");
    const shutdownModule = new URL("../shutdown.ts", import.meta.url).href;
    // tsx loads the .ts source (so Stryker's mutants run). The interval keeps
    // the loop alive until the shutdown handler exits the process.
    const script = `import { gracefulShutdown } from ${JSON.stringify(shutdownModule)};
      setInterval(() => {}, 1000);
      gracefulShutdown(async () => {});
      console.log("ready");`;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("ready")) child.kill("SIGTERM");
    });

    const code = await new Promise<number | null | "hung">((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve("hung");
      }, 5_000);
      child.once("exit", (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });

    expect(code).toBe(0);
    expect(output).toContain("SIGTERM received, shutting down");
  }, 10_000);
});
