import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { roomPollDelay } from "../lib/room-polling";
import { createRoom, roomAction } from "./room-client";
import { roomSnapshot } from "../lib/service";
import { compareAndSet, read, readMany } from "../lib/store";
import type { PublicRoom, Room } from "../lib/types";

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
test("polling slows quiet rooms, pauses finished hosts and departed players, and wakes at deadlines", async () => {
  const { room } = await pair(30),
    now = Date.now();
  assert.equal(roomPollDelay(room, 0, now), 5000);
  const untimed = structuredClone(room);
  untimed.config.seconds = 0;
  assert.equal(roomPollDelay(untimed, 50000, now), 15000);
  assert.equal(roomPollDelay(room, 0, room.current!.endsAt - 900), 1050);
  assert.equal(roomPollDelay(room, 0, room.current!.endsAt + 1), 150);
  assert.equal(roomPollDelay(room, 0, now, 1), 5000);
  assert.equal(roomPollDelay(room, 0, now, 8), 30000);
  const finished = structuredClone(room);
  finished.status = "finished";
  assert.equal(roomPollDelay(finished, 0, now), null);
  finished.me = finished.players[1].id;
  assert.equal(roomPollDelay(finished, 0, now), 5000);
  assert.equal(roomPollDelay(finished, 40000, now), 15000);
  assert.equal(roomPollDelay(finished, 130000, now), 30000);
  finished.players[1].active = false;
  assert.equal(roomPollDelay(finished, 0, now), null);
});
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
test("a newly joined player bypasses an older membership cache", async () => {
  const id = randomUUID(),
    friend = randomUUID();
  const room = await createRoom(id, {
    name: "Host",
    config: { mode: "duel", players: 2, rounds: 1, seconds: 0 },
  });
  const raw = (await read(`rally:room:${room.code}`))!;
  await roomAction(room.code, friend, { action: "join", name: "Friend" });
  const result = await roomSnapshot(room.code, friend, async () => raw);
  assert.equal(result.fresh, true);
  assert.equal(result.view.players.length, 2);
  await assert.rejects(
    roomSnapshot(room.code, id, async () => raw, NaN),
    /revision/,
  );
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
