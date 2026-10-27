import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { GameError } from "../lib/engine";
import { ReservationLimiter } from "../lib/rate-reservations";
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

test("prefetch hides the next reservation without consuming a slot or exceeding its shared cap", async () => {
  const db = backend(),
    limiter = new ReservationLimiter(db.reserve, () => 0);
  for (let i = 0; i < 3; i++) await limiter.take("prefetch", "actions", 9);
  await limiter.prefetch("prefetch", "actions", 9);
  assert.equal(db.calls(), 2);
  // Three spent slots plus the six remaining permissible requests.
  const next = await Promise.allSettled(
    Array.from({ length: 8 }, () => limiter.take("prefetch", "actions", 9)),
  );
  assert.equal(
    next.filter((result) => result.status === "fulfilled").length,
    6,
  );
  await limiter.prefetch("prefetch", "actions", 9);
  await assert.rejects(limiter.take("prefetch", "actions", 9), GameError);
});
