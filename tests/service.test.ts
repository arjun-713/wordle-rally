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
test("rivals see ghost marks during a round but never letters until it ends", async () => {
  const { code, ids } = await setup();
  await roomAction(code, ids[0], { action: "start" });
  const answer = (await secret(code)).rounds[0].answer;
  const probe = guesses.find((w) => w !== answer)!;
  await roomAction(code, ids[1], { action: "guess", word: probe, round: 0 });
  const live = await roomAction(code, ids[0]);
  const rival = live.current?.ghosts?.[ids[1]];
  assert.equal(rival?.length, 1);
  assert.equal(rival[0].marks.length, 5);
  assert.equal(rival[0].word, undefined);
  assert.equal(live.current?.ghosts?.[ids[0]], undefined);
  const payload = JSON.stringify(live);
  assert.equal(payload.includes(`"${probe}"`), false);
  assert.equal(payload.includes(`"${answer}"`), false);
  await expire(code);
  const ended = await roomAction(code, ids[0]);
  assert.equal(ended.current?.ended, true);
  assert.equal(ended.current?.ghosts?.[ids[1]]?.[0].word, probe);
});
