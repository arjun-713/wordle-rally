import test from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, isGuessRejection } from "../lib/client-api";

test("client API retains typed guess rejection errors and successful response data", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Unknown word", code: "INVALID_GUESS" },
      { status: 400 },
    ),
  );
  await assert.rejects(
    api("/api/solo", { action: "guess", word: "zzzzz" }),
    (error: unknown) => isGuessRejection(error) && error.status === 400,
  );
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: "lost", guesses: Array(6).fill({}) }),
  );
  const response = await api<{ status: string; guesses: unknown[] }>(
    "/api/solo",
  );
  assert.equal(response.status, "lost");
  assert.equal(response.guesses.length, 6);
});
test("a stalled fetch times out and aborts without retrying a mutation", async (t) => {
  let calls = 0,
    signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    calls++;
    signal = options.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  await assert.rejects(
    api("/api/solo", { action: "guess", word: "rates" }, undefined, 10),
    (error: unknown) =>
      error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
  );
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});
test("the deadline also covers a stalled response body", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response,
  );
  await assert.rejects(
    api("/api/solo", undefined, undefined, 10),
    (error: unknown) =>
      error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
  );
});
test("caller cancellation remains distinguishable from a transport failure", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const controller = new AbortController();
  const pending = api("/api/rooms/ABCDEF", undefined, controller.signal);
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});
