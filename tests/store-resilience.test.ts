import assert from "node:assert/strict";
import test from "node:test";
import { GameError } from "../lib/engine";

const env = {
  UPSTASH_REDIS_REST_URL: "https://redis.test",
  UPSTASH_REDIS_REST_TOKEN: "token",
  RALLY_REDIS_TIMEOUT_MS: "20",
};
function withRedis(t: { after: (fn: () => void) => void }) {
  const saved = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
}
// AbortSignal.timeout's timer is unref'd; hold the event loop open meanwhile.
const stall = (_url: unknown, options: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const alive = setInterval(() => {}, 5);
    options.signal!.addEventListener(
      "abort",
      () => {
        clearInterval(alive);
        reject(new DOMException("Timed out", "TimeoutError"));
      },
      { once: true },
    );
  });

test("a stalled storage read gets a backup before its timeout and cancels the loser", async (t) => {
  withRedis(t);
  process.env.RALLY_REDIS_TIMEOUT_MS = "1200";
  const { read, readMany } = await import("../lib/store");
  let calls = 0,
    first: AbortSignal | undefined,
    backupWhilePending = false;
  t.mock.method(globalThis, "fetch", (url: unknown, options: RequestInit) => {
    if (++calls === 1) {
      first = options.signal!;
      return stall(url, options);
    }
    backupWhilePending = !first!.aborted;
    return Promise.resolve(Response.json({ result: "value" }));
  });
  assert.equal(await read("rally:room:ABCDEF"), "value");
  assert.equal(calls, 2);
  assert.equal(backupWhilePending, true);
  assert.equal(first!.aborted, true);

  calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("bad gateway", { status: 502 });
  });
  await assert.rejects(
    readMany(["a", "b"]),
    (error: unknown) =>
      error instanceof GameError &&
      error.status === 503 &&
      error.code === "STORAGE_SLOW",
  );
  assert.equal(calls, 2);
});

test("a stalled compare-and-set is never repeated", async (t) => {
  withRedis(t);
  const { compareAndSet } = await import("../lib/store");
  let calls = 0;
  t.mock.method(globalThis, "fetch", (url: unknown, options: RequestInit) => {
    calls++;
    return stall(url, options);
  });
  await assert.rejects(
    compareAndSet([{ key: "rally:room:ABCDEF", expected: null, value: "{}" }]),
    (error: unknown) =>
      error instanceof GameError && error.code === "STORAGE_SLOW",
  );
  assert.equal(calls, 1);
});

test("contended mutations stop within their wall-clock budget", async () => {
  const { mutateGame } = await import("../lib/mutation-cache");
  let attempts = 0;
  await assert.rejects(
    mutateGame({
      key: "rally:room:BUDGET",
      optimistic: false,
      load: async () => null,
      attempt: async () => {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return undefined;
      },
      busyMessage: "Busy",
      budgetMs: 20,
    }),
    (error: unknown) =>
      error instanceof GameError &&
      error.status === 503 &&
      error.code === "STORAGE_SLOW",
  );
  assert.ok(attempts < 12);

  await assert.rejects(
    mutateGame({
      key: "rally:room:BUSY",
      optimistic: false,
      load: async () => null,
      attempt: async () => undefined,
      busyMessage: "Busy",
    }),
    (error: unknown) =>
      error instanceof GameError &&
      error.status === 409 &&
      error.code === "BUSY",
  );
});
