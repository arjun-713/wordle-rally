import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import guesses from "../data/guesses.json";
import { compareAndSet, read } from "../lib/store";
import type { Room } from "../lib/types";
import { createRoom, roomAction } from "./room-client";
const config = { mode: "duel", players: 2, rounds: 2, seconds: 30 };
async function setup(players = 2, mode = "duel") {
  const ids = Array.from({ length: players }, () => randomUUID());
  const room = await createRoom(ids[0], {
    config: { ...config, players, mode },
    name: "Host",
  });
  await Promise.all(
    ids
      .slice(1)
      .map((id, i) =>
        roomAction(room.code, id, { action: "join", name: `Friend ${i + 1}` }),
      ),
  );
  return { code: room.code, ids };
}
async function secret(code: string): Promise<Room> {
  return JSON.parse((await read(`rally:room:${code}`))!);
}
async function expire(code: string) {
  const key = `rally:room:${code}`,
    raw = (await read(key))!,
    r: Room = JSON.parse(raw);
  r.rounds[r.round].endsAt = Date.now() - 1;
  assert.equal(
    await compareAndSet([
      { key, expected: raw, value: JSON.stringify(r), ttl: 86400 },
    ]),
    true,
  );
}
test("concurrent joins cannot overfill a room", async () => {
  const host = randomUUID(),
    r = await createRoom(host, { config, name: "Host" });
  const joined = await Promise.allSettled(
    [randomUUID(), randomUUID(), randomUUID()].map((id) =>
      roomAction(r.code, id, { action: "join", name: "Rival" }),
    ),
  );
  assert.equal(joined.filter((j) => j.status === "fulfilled").length, 1);
  assert.equal((await secret(r.code)).players.length, 2);
});
test("timeout is enforced on the server and next is host-only and stale-safe", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  await expire(code);
  const view = await roomAction(code, ids[1]);
  assert.equal(view.current?.ended, true);
  assert.deepEqual(
    view.players.map((p) => p.score),
    [0, 0],
  );
  await assert.rejects(
    roomAction(code, ids[1], { action: "next", round: 0 }),
    /Only the host/,
  );
  const calls = await Promise.allSettled(
    [1, 2].map(() => roomAction(code, ids[0], { action: "next", round: 0 })),
  );
  assert.equal(calls.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await secret(code)).round, 1);
  await expire(code);
  assert.equal((await roomAction(code, ids[0])).status, "finished");
});
test("host leaving transfers controls and all exhausted players end a round", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  await roomAction(code, ids[0], { action: "leave" });
  const r = await secret(code);
  assert.equal(r.host, ids[1]);
  const wrong = guesses.filter((w) => w !== r.rounds[0].answer).slice(0, 6);
  for (const word of wrong)
    await roomAction(code, ids[1], { action: "guess", word, round: 0 });
  const view = await roomAction(code, ids[1]);
  assert.equal(view.current?.ended, true);
  assert.deepEqual(
    view.players.map((p) => p.score),
    [0, 0],
  );
});
test("a retried guess request returns the saved board without a second attempt or score", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const answer = (await secret(code)).rounds[0].answer,
    requestId = randomUUID(),
    first = await roomAction(code, ids[0], {
      action: "guess",
      word: answer,
      round: 0,
      requestId,
    }),
    retry = await roomAction(code, ids[0], {
      action: "guess",
      word: answer,
      round: 0,
      requestId,
    });
  assert.equal(retry.revision, first.revision);
  assert.equal(retry.current?.guesses.length, 1);
  assert.deepEqual(retry.current?.guesses, first.current?.guesses);
  assert.deepEqual(retry.current?.solved, [ids[0]]);
  assert.equal(retry.players.find((p) => p.id === ids[0])?.score, 1);
  const repeated = guesses.find((word) => word !== answer)!;
  await roomAction(code, ids[1], {
    action: "guess",
    word: repeated,
    round: 0,
  });
  await assert.rejects(
    roomAction(code, ids[1], {
      action: "guess",
      word: repeated,
      round: 0,
      requestId: randomUUID(),
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DUPLICATE_GUESS",
  );
  await assert.rejects(
    roomAction(code, ids[1], { action: "guess", word: "zzzzz", round: 0 }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_GUESS",
  );
});
test("a delayed retry still resolves after the round advanced", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const answer = (await secret(code)).rounds[0].answer,
    requestId = randomUUID();
  await roomAction(code, ids[0], {
    action: "guess",
    word: answer,
    round: 0,
    requestId,
  });
  await roomAction(code, ids[1], { action: "guess", word: answer, round: 0 });
  await roomAction(code, ids[0], { action: "next", round: 0 });
  const retry = await roomAction(code, ids[0], {
    action: "guess",
    word: answer,
    round: 0,
    requestId,
  });
  assert.equal(retry.round, 1);
  assert.equal(retry.current?.guesses.length, 0);
  assert.equal(retry.players.find((p) => p.id === ids[0])?.score, 1);
});
test("a full 16-player free-for-all accepts concurrent joins and solves without dropped points", async () => {
  const { code, ids } = await setup(16, "free");
  const lobby = await roomAction(code, ids[0]);
  assert.equal(lobby.players.length, 16);
  await roomAction(code, ids[0], { action: "start" });
  const answer = (await secret(code)).rounds[0].answer;
  await Promise.all(
    ids.map((id) =>
      roomAction(code, id, { action: "guess", word: answer, round: 0 }),
    ),
  );
  const result = await roomAction(code, ids[0]);
  assert.equal(result.current?.ended, true);
  assert.equal(
    result.players.reduce((sum, p) => sum + p.score, 0),
    16,
  );
});

test("room views never expose player IPs or ban lists", async () => {
  const host = randomUUID(),
    friend = randomUUID(),
    rival = randomUUID(),
    watcher = randomUUID();
  const room = await createRoom(host, {
    config: { mode: "free", players: 3, rounds: 1, seconds: 30 },
    name: "Host",
  });
  await roomAction(room.code, friend, {
    action: "join",
    name: "Friend",
    ip: "203.0.113.7",
  });
  await roomAction(room.code, rival, {
    action: "join",
    name: "Rival",
    ip: "198.51.100.9",
  });
  await roomAction(room.code, watcher, { action: "spectate", name: "Watcher" });
  await roomAction(room.code, host, { action: "ban", target: rival });
  const stored = await secret(room.code);
  assert.equal(stored.ips?.[friend], "203.0.113.7");
  assert.deepEqual(stored.bannedIps, ["198.51.100.9"]);
  for (const viewer of [host, friend, watcher]) {
    const view = await roomAction(room.code, viewer);
    const raw = JSON.stringify(view);
    assert.ok(!raw.includes("203.0.113.7"), "player IP leaked");
    assert.ok(!raw.includes("198.51.100.9"), "banned IP leaked");
    for (const field of ["ips", "bannedIps", "banned"])
      assert.ok(!(field in view), `${field} leaked`);
  }
});

test("ghost boards show rivals' colours but never their words", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const answer = (await secret(code)).rounds[0].answer;
  const miss = (guesses as string[]).find((w) => w !== answer)!;
  await roomAction(code, ids[1], { action: "guess", word: miss, round: 0 });
  const live = await roomAction(code, ids[0]);
  const ghost = live.current?.ghosts?.[ids[1]];
  assert.equal(ghost?.length, 1);
  assert.equal(ghost?.[0].marks.length, 5);
  assert.ok(!("word" in (ghost?.[0] ?? {})), "word sent mid-round");
  assert.ok(
    !(ids[0] in (live.current?.ghosts ?? {})),
    "own board is not a ghost",
  );
  assert.ok(!JSON.stringify(live).includes(`"${miss}"`), "rival word leaked");
  await roomAction(code, ids[0], { action: "guess", word: answer, round: 0 });
  await roomAction(code, ids[1], { action: "guess", word: answer, round: 0 });
  const ended = await roomAction(code, ids[0]);
  assert.equal(ended.current?.ended, true);
  const ghost2 = ended.current?.ghosts?.[ids[1]];
  assert.equal(ghost2?.length, 2);
  assert.ok(
    ghost2?.every((g) => !("word" in g)),
    "words sent after round end",
  );
  assert.ok(
    !JSON.stringify(ended.current?.ghosts).includes(miss),
    "rival word leaked after round end",
  );
});
