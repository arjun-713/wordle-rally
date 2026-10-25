import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRoom, roomAction } from "./room-client";
import { compareAndSet, read } from "../lib/store";
import type { Room } from "../lib/types";
import guesses from "../data/guesses.json";
const config = { mode: "duel", players: 2, rounds: 2, seconds: 30 };
test("No time limit survives start and the next-round transition", async () => {
  const id = randomUUID(),
    friend = randomUUID();
  const r = await createRoom(id, {
    name: "Host",
    config: { ...config, seconds: 0 },
  });
  await roomAction(r.code, friend, { action: "join", name: "Friend" });
  let view = await roomAction(r.code, id, { action: "start" });
  assert.equal(view.current?.endsAt, 0);
  assert.equal(view.current?.ended, false);
  const answer = (await secret(r.code)).rounds[0].answer;
  await Promise.all(
    [id, friend].map((player) =>
      roomAction(r.code, player, { action: "guess", word: answer, round: 0 }),
    ),
  );
  view = await roomAction(r.code, id, { action: "next", round: 0 });
  assert.equal(view.current?.endsAt, 0);
  assert.equal(view.current?.ended, false);
});
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
test("only members see room state and only host controls the match", async () => {
  const { code, ids } = await setup();
  await assert.rejects(roomAction(code, randomUUID()), /Join this room/);
  await assert.rejects(
    roomAction(code, ids[1], { action: "start" }),
    /Only the host/,
  );
});
test("answer and opponents guesses stay private during a round", async () => {
  const { code, ids } = await setup();
  const start = await roomAction(code, ids[0], { action: "start" });
  assert.equal(start.current?.answer, undefined);
  assert.equal("rounds" in start, false);
  assert.equal(start.results.length, 0);
  const r = await secret(code);
  await roomAction(code, ids[1], {
    action: "guess",
    word: r.rounds[0].answer,
    round: 0,
  });
  const view = await roomAction(code, ids[0]);
  assert.equal(view.current?.guesses.length, 0);
  assert.equal(view.current?.attempts[ids[1]], 1);
  assert.equal(view.current?.solved.includes(ids[1]), true);
  assert.equal(view.current?.answer, undefined);
});
test("simultaneous solves preserve both scores exactly once", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const r = await secret(code);
  await Promise.all(
    ids.map((id) =>
      roomAction(code, id, {
        action: "guess",
        word: r.rounds[0].answer,
        round: 0,
      }),
    ),
  );
  const view = await roomAction(code, ids[0]);
  assert.deepEqual(
    view.players.map((p) => p.score),
    [1, 1],
  );
  assert.equal(view.current?.ended, true);
  assert.equal(view.current?.answer, r.rounds[0].answer);
});
test("duplicate simultaneous guesses consume one attempt", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const r = await secret(code),
    word = guesses.find((w) => w !== r.rounds[0].answer)!;
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      roomAction(code, ids[0], { action: "guess", word, round: 0 }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await secret(code)).rounds[0].guesses[ids[0]].length, 1);
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
test("all participants histories reserve the full match and rematches exclude them", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const words = (await secret(code)).rounds.map((r) => r.answer);
  assert.equal(new Set(words).size, 2);
  for (const id of ids) {
    const history = JSON.parse((await read(`rally:history:${id}`))!);
    for (const word of words) assert.ok(history.includes(word));
  }
  const next = await createRoom(ids[1], { config, name: "New host" });
  await roomAction(next.code, ids[0], { action: "join", name: "Old host" });
  await roomAction(next.code, ids[1], { action: "start" });
  assert.ok(
    (await secret(next.code)).rounds.every((r) => !words.includes(r.answer)),
  );
});
test("simultaneous starts in different rooms cannot repeat a remembered player’s words", async () => {
  const id = randomUUID();
  const rooms = await Promise.all(
    [1, 2].map(() =>
      createRoom(id, { config: { ...config, rounds: 20 }, name: "Host" }),
    ),
  );
  for (const r of rooms)
    await roomAction(r.code, randomUUID(), { action: "join", name: "Guest" });
  await Promise.all(
    rooms.map((r) => roomAction(r.code, id, { action: "start" })),
  );
  const first = (await secret(rooms[0].code)).rounds.map((r) => r.answer),
    second = (await secret(rooms[1].code)).rounds.map((r) => r.answer);
  assert.ok(first.every((w) => !second.includes(w)));
});
test("2v2 balances teams, prevents overflow, and sums independent points", async () => {
  const { code, ids } = await setup(4, "teams");
  const lobby = await roomAction(code, ids[0]);
  assert.equal(lobby.players.filter((p) => p.team === 0).length, 2);
  const onGold = lobby.players.find((p) => p.team === 1)!;
  await assert.rejects(
    roomAction(code, onGold.id, { action: "team", team: 0 }),
    /full/,
  );
  await roomAction(code, ids[0], { action: "start" });
  const r = await secret(code);
  await Promise.all(
    ids.map((id) =>
      roomAction(code, id, {
        action: "guess",
        word: r.rounds[0].answer,
        round: 0,
      }),
    ),
  );
  const result = await roomAction(code, ids[0]);
  assert.deepEqual(
    [0, 1].map((t) =>
      result.players
        .filter((p) => p.team === t)
        .reduce((s, p) => s + p.score, 0),
    ),
    [2, 2],
  );
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
test("rematch clears the score, preserves history, and returns to lobby", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  for (let round = 0; round < 2; round++) {
    const r = await secret(code);
    await Promise.all(
      ids.map((id) =>
        roomAction(code, id, {
          action: "guess",
          word: r.rounds[round].answer,
          round,
        }),
      ),
    );
    if (round === 0)
      await roomAction(code, ids[0], { action: "next", round: 0 });
  }
  assert.equal((await roomAction(code, ids[0])).status, "finished");
  const replay = await roomAction(code, ids[0], { action: "replay" });
  assert.equal(replay.status, "lobby");
  assert.equal(replay.current, null);
  assert.deepEqual(
    replay.players.map((p) => p.score),
    [0, 0],
  );
  assert.equal(JSON.parse((await read(`rally:history:${ids[0]}`))!).length, 2);
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
