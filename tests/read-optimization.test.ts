import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { roomSnapshot } from "../lib/service";
import { compareAndSet, read, readMany } from "../lib/store";
import type { Room } from "../lib/types";
import { createRoom, roomAction } from "./room-client";

async function pair(seconds = 0) {
  const id = randomUUID(),
    friend = randomUUID();
  const created = await createRoom(id, {
    name: "Host",
    config: { mode: "duel", players: 2, rounds: 2, seconds },
  });
  await roomAction(created.code, friend, { action: "join", name: "Friend" });
  const room = await roomAction(created.code, id, { action: "start" });
  return { id, friend, room, code: room.code, key: `rally:room:${room.code}` };
}
test("cached room snapshots retain per-player privacy and refuse outsider access", async () => {
  const { id, friend, key, code } = await pair();
  const secret: Room = JSON.parse((await read(key))!);
  const own = await roomAction(code, id, {
    action: "guess",
    round: 0,
    word: secret.rounds[0].answer,
  });
  const raw = (await read(key))!;
  const host = await roomSnapshot(code, id, async () => raw);
  const guest = await roomSnapshot(code, friend, async () => raw);
  assert.equal(host.fresh, false);
  assert.equal(guest.fresh, false);
  assert.equal(host.view.current!.guesses.length, 1);
  assert.equal(guest.view.current!.guesses.length, 0);
  assert.equal(host.view.current!.answer, undefined);
  assert.equal(guest.view.current!.answer, undefined);
  assert.equal("rounds" in host.view, false);
  assert.equal(host.view.results.length, 0);
  assert.equal(host.view.revision, own.revision);
  await assert.rejects(
    roomSnapshot(code, randomUUID(), async () => raw),
    /Join this room/,
  );
});
test("a caller carrying a newer revision bypasses an older cached snapshot", async () => {
  const { id, code, key } = await pair();
  const old = (await read(key))!,
    secret: Room = JSON.parse(old);
  const next = await roomAction(code, id, {
    action: "guess",
    round: 0,
    word: secret.rounds[0].answer,
  });
  const result = await roomSnapshot(code, id, async () => old, next.revision);
  assert.equal(result.fresh, true);
  assert.equal(result.view.revision, next.revision);
  assert.equal(result.view.current!.guesses.length, 1);
});
test("expired cached rounds settle from fresh data and record stats without duplicate points", async () => {
  const { id, code, key } = await pair(30);
  const raw = (await read(key))!,
    expired: Room = JSON.parse(raw);
  expired.rounds[0].endsAt = Date.now() - 100;
  const stale = JSON.stringify(expired);
  assert.equal(
    await compareAndSet([{ key, expected: raw, value: stale, ttl: 86400 }]),
    true,
  );
  const result = await roomSnapshot(code, id, async () => stale);
  assert.equal(result.fresh, true);
  assert.equal(result.view.current!.ended, true);
  const repeated = await roomSnapshot(code, id, async () => stale);
  assert.equal(repeated.view.revision, result.view.revision);
  assert.ok(repeated.view.players.every((p) => p.score === 0));
});
test("batched CAS preserves mixed TTLs, rejects a stale member atomically, and handles missing keys", async () => {
  const prefix = `optimization:${randomUUID()}`,
    keys = [`${prefix}:room`, `${prefix}:history`, `${prefix}:profile`];
  assert.equal(
    await compareAndSet(
      keys.map((key, i) => ({
        key,
        expected: null,
        value: `v${i}`,
        ...(i === 0 ? { ttl: 1 } : {}),
      })),
    ),
    true,
  );
  assert.deepEqual(
    await readMany([keys[2], `${prefix}:missing`, keys[0], keys[1]]),
    ["v2", null, "v0", "v1"],
  );
  assert.equal(
    await compareAndSet([
      { key: keys[0], expected: "v0", value: "updated" },
      { key: keys[1], expected: "stale", value: "bad" },
    ]),
    false,
  );
  assert.deepEqual(await readMany(keys), ["v0", "v1", "v2"]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual(await readMany(keys), [null, "v1", "v2"]);
  assert.equal(await compareAndSet([]), true);
  assert.deepEqual(await readMany([]), []);
});

test("an optimistic guess snapshot rechecks cross-instance changes before accepting or rejecting", async () => {
  const { rememberMutation } = await import("../lib/mutation-cache");
  const { id, friend, code, key } = await pair();
  const old = (await read(key))!,
    initial: Room = JSON.parse(old);
  await roomAction(code, friend, {
    action: "guess",
    round: 0,
    word: initial.rounds[0].answer,
  });
  rememberMutation(key, old); // Simulate a different warm function with an older copy.
  const accepted = await roomAction(code, id, {
    action: "guess",
    round: 0,
    word: initial.rounds[0].answer,
  });
  assert.deepEqual(
    accepted.players.map((p) => p.score),
    [1, 1],
  );
  await roomAction(code, id, { action: "next", round: 0 });
  rememberMutation(key, old);
  await assert.rejects(
    roomAction(code, id, {
      action: "guess",
      round: 0,
      word: initial.rounds[0].answer,
    }),
    /round has ended/,
  );
  assert.equal((await roomAction(code, id)).current!.guesses.length, 0);
});

test("sixteen simultaneous players keep every guess, settlement and score in normal and racing rooms", async () => {
  for (const mode of ["free", "race"] as const) {
    const ids = Array.from({ length: 16 }, () => randomUUID());
    const created = await createRoom(ids[0], {
      name: "Host",
      config: { mode, players: 16, rounds: 1, seconds: 0, scoring: "bonus" },
    });
    for (const [i, id] of ids.entries())
      if (i)
        await roomAction(created.code, id, {
          action: "join",
          name: `Player ${i}`,
        });
    const started = await roomAction(created.code, ids[0], { action: "start" });
    const key = `rally:room:${created.code}`,
      raw: Room = JSON.parse((await read(key))!);
    const wrong = raw.rounds[0].answer === "crane" ? "slate" : "crane";
    await Promise.all(
      ids.map((id) =>
        roomAction(created.code, id, {
          action: "guess",
          word: wrong,
          round: 0,
          matchId: started.matchId,
        }),
      ),
    );
    await Promise.all(
      ids.map((id) =>
        roomAction(created.code, id, {
          action: "guess",
          word: raw.rounds[0].answer,
          round: 0,
          matchId: started.matchId,
        }),
      ),
    );
    const finished = await roomAction(created.code, ids[0]);
    assert.equal(finished.status, "finished");
    assert.equal(finished.current!.solved.length, 16);
    assert.ok(finished.players.every((p) => p.score === 5));
    assert.ok(Object.values(finished.current!.attempts).every((n) => n === 2));
    assert.equal(finished.matches!.length, 1);
    const revisions = finished.revision;
    await assert.rejects(
      roomAction(created.code, ids[0], {
        action: "guess",
        word: wrong,
        round: 0,
        matchId: started.matchId,
      }),
    );
    assert.equal((await roomAction(created.code, ids[0])).revision, revisions);
  }
});

test("repeated room creation shares one atomic receipt scoped to its creator", async () => {
  const { createdRoom } = await import("../lib/service");
  const id = randomUUID(),
    requestId = randomUUID();
  const input = {
    name: "Host",
    requestId,
    config: { mode: "duel", players: 2, rounds: 1, seconds: 0 },
  };
  const rooms = await Promise.all(
    Array.from({ length: 4 }, () => createRoom(id, input)),
  );
  assert.equal(new Set(rooms.map((r) => r.code)).size, 1);
  assert.equal((await createdRoom(id, requestId))!.code, rooms[0].code);
  assert.equal(await createdRoom(randomUUID(), requestId), null);
  assert.equal(await createdRoom(id, randomUUID()), null);
});
