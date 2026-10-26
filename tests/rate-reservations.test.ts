import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ReservationLimiter } from "../lib/rate-reservations";
import { validateGuessInput } from "../lib/guess-input";
import { GameError } from "../lib/engine";
import { rateLimit } from "../lib/store";

function backend() {
  const booked = new Map<string, number>();
  let calls = 0;
  return {
    booked,
    calls: () => calls,
    reserve: async (key: string, amount: number, maximum: number) => {
      calls++;
      await Promise.resolve();
      const used = booked.get(key) ?? 0,
        granted = Math.min(amount, Math.max(0, maximum - used));
      booked.set(key, used + granted);
      return granted;
    },
  };
}
const denied = (result: PromiseSettledResult<unknown>) => {
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.ok(result.reason instanceof GameError);
    assert.equal(result.reason.status, 429);
  }
};

test("concurrent requests share reservations and never exceed the global limit", async () => {
  const db = backend(),
    limiter = new ReservationLimiter(db.reserve, () => 1000);
  const results = await Promise.allSettled(
    Array.from({ length: 300 }, () => limiter.take("player", "actions", 100)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 100);
  results.filter((r) => r.status === "rejected").forEach(denied);
  assert.equal(db.booked.get("rally:rate:player:actions:0"), 100);
  assert.equal(db.calls(), 26); // 25 allocations and one cached denial.
});
test("independent function instances enforce the same shared cap, including a partial final reservation", async () => {
  const db = backend(),
    instances = Array.from(
      { length: 8 },
      () => new ReservationLimiter(db.reserve, () => 0),
    );
  const results = await Promise.allSettled(
    Array.from({ length: 400 }, (_, i) =>
      instances[i % 8].take("shared", "actions", 101),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 101);
  results.filter((r) => r.status === "rejected").forEach(denied);
  assert.equal(db.booked.get("rally:rate:shared:actions:0"), 101);
});
test("a reservation completing across a minute boundary cannot spend old slots in the new minute", async () => {
  let now = 59999;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const db = backend();
  let first = true;
  const limiter = new ReservationLimiter(
    async (...args) => {
      if (first) {
        first = false;
        await gate;
      }
      return db.reserve(...args);
    },
    () => now,
  );
  const waiting = limiter.take("player", "solo", 120);
  now = 60001;
  release();
  await waiting;
  assert.equal(db.booked.get("rally:rate:player:solo:0"), 4);
  assert.equal(db.booked.get("rally:rate:player:solo:1"), 4);
  await limiter.take("player", "solo", 120);
  assert.equal(db.calls(), 2);
});
test("failed or malformed reservations grant no slots and can recover on retry", async () => {
  const db = backend();
  let fail = true;
  const limiter = new ReservationLimiter(async (...args) => {
    if (fail) throw new Error("Transport unavailable");
    return db.reserve(...args);
  });
  const failed = await Promise.allSettled([
    limiter.take("player", "daily", 120),
    limiter.take("player", "daily", 120),
  ]);
  assert.ok(failed.every((r) => r.status === "rejected"));
  assert.equal(db.calls(), 0);
  fail = false;
  await limiter.take("player", "daily", 120);
  assert.equal(db.calls(), 1);
  const malformed = new ReservationLimiter(async () => 5);
  await assert.rejects(
    malformed.take("player", "daily", 120),
    (error: unknown) => error instanceof GameError && error.status === 503,
  );
});
test("identities, buckets and limits have separate local allowances; eviction only wastes booked slots", async () => {
  const db = backend(),
    limiter = new ReservationLimiter(db.reserve, () => 0, 1);
  for (const [identity, bucket] of [
    ["a", "actions"],
    ["b", "actions"],
    ["a", "solo"],
    ["a", "actions"],
  ])
    await limiter.take(identity, bucket, 100);
  assert.equal(db.booked.get("rally:rate:a:actions:0"), 8);
  assert.equal(db.booked.get("rally:rate:b:actions:0"), 4);
  assert.equal(db.booked.get("rally:rate:a:solo:0"), 4);
  // A lower limit cannot spend cached slots acquired using a higher limit.
  await assert.rejects(
    limiter.take("a", "actions", 1),
    (error: unknown) => error instanceof GameError && error.status === 429,
  );
});
test("the actual storage limiter allows exactly its configured number of concurrent requests", async (t) => {
  // Real Redis exercises the Lua allocator; local storage exercises its CAS fallback.
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  const id = randomUUID();
  const results = await Promise.allSettled(
    Array.from({ length: 105 }, () => rateLimit(id, "optimization-test", 100)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 100);
  results.filter((r) => r.status === "rejected").forEach(denied);
});
test("guess prevalidation rejects invalid words without changing input or requiring storage", () => {
  for (const word of [
    undefined,
    12,
    "ab",
    "abcde!",
    "zzzzz",
    "cráne",
    " crane",
  ])
    assert.throws(
      () => validateGuessInput({ action: "guess", word }),
      GameError,
    );
  const input = { action: "guess", word: "CRANE" };
  validateGuessInput(input);
  assert.equal(input.word, "CRANE");
  validateGuessInput({ action: "start" });
});
