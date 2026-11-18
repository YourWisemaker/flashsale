import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { TEST_MONGO_URL } from "./test-helpers.js";

// Runs the real entry point (src/index.ts via tsx) as a separate process.
const workerDir = fileURLToPath(new URL("../../..", import.meta.url));
let child: ChildProcess | undefined;

afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
});

function waitForOutput(proc: ChildProcess, text: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes(text)) {
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
}

function exitCode(proc: ChildProcess, timeoutMs: number): Promise<number | "still running"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("still running"), timeoutMs);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
  });
}

describe("worker entry point", () => {
  it("closes the worker and its connections, then exits 0 on SIGTERM", async () => {
    child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: workerDir,
      env: { ...process.env, REDIS_URL: `${process.env.TEST_REDIS_URL ?? "redis://localhost:6379"}/13`, MONGO_URL: TEST_MONGO_URL },
      stdio: "pipe",
    });
    expect(await waitForOutput(child, "worker running", 15_000)).toBe(true);

    child.kill("SIGTERM");

    expect(await exitCode(child, 12_000)).toBe(0);
  }, 30_000);
});
