import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Runs the real entry point (src/server.ts via tsx) as a separate process.
const apiDir = fileURLToPath(new URL("../../..", import.meta.url));
const env = {
  ...process.env,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379",
  MONGO_URL: `${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_server`,
};

let child: ChildProcess | undefined;
let blocker: Server | undefined;

afterEach(async () => {
  child?.kill("SIGKILL");
  await new Promise<void>((resolve) => (blocker ? blocker.close(() => resolve()) : resolve()));
  child = blocker = undefined;
});

function startApi(extraEnv: Record<string, string>): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { cwd: apiDir, env: { ...env, ...extraEnv }, stdio: "pipe" });
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

async function waitForHealth(port: number, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await fetch(`http://localhost:${port}/health`).then((r) => r.status).catch(() => 0);
    if (status) return status;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return 0;
}

describe("API cluster entry point", () => {
  it("serves health from multiple processes", async () => {
    child = startApi({ PORT: "3917", API_PROCESSES: "2" });
    expect(await waitForHealth(3917, 15_000)).toBe(200);
  }, 20_000);

  it.each([
    ["one process", "1", 3919],
    ["the cluster primary", "2", 3920],
  ])("drains and exits 0 on SIGTERM to %s, freeing the port", async (_name, processes, port) => {
    child = startApi({ PORT: String(port), API_PROCESSES: processes });
    expect(await waitForHealth(port, 15_000)).toBe(200);

    child.kill("SIGTERM");

    expect(await exitCode(child, 12_000)).toBe(0);
    expect(await fetch(`http://localhost:${port}/health`).then(() => "still serving", () => "closed")).toBe("closed");
  }, 30_000);

  it("exits non-zero instead of fork-looping when the port is already taken", async () => {
    blocker = createServer();
    await new Promise<void>((resolve) => blocker!.listen(3918, resolve));

    child = startApi({ PORT: "3918", API_PROCESSES: "2" });

    expect(await exitCode(child, 15_000)).toBe(1);
  }, 20_000);
});
