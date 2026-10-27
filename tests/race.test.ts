import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRoom, roomAction } from "./room-client";
import { read } from "../lib/store";
import { getStats } from "../lib/stats";
import type { Room } from "../lib/types";
import words from "../data/guesses.json";

test("Fast Fingers preserves independent words, excludes wasted runs, combines points/time and rematches safely", async (t) => {
  let now = Date.now();
  const started = now;
  t.mock.method(Date, "now", () => now);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const room = await createRoom(ids[0], {
    name: "Host",
    config: {
      mode: "race",
      players: 3,
      rounds: 2,
      seconds: 0,
      scoring: "bonus",
    },
  });
  for (const [i, id] of ids.slice(1).entries())
    await roomAction(room.code, id, { action: "join", name: `Friend ${i}` });
  const initial = await roomAction(room.code, ids[0], { action: "start" });
  const raw: Room = JSON.parse((await read(`rally:room:${room.code}`))!);
  const [a, b] = raw.rounds.map((round) => round.answer);
  const submit = (player: number, word: string, round: number) =>
    roomAction(room.code, ids[player], { action: "guess", word, round });
  now = started + 10000;
  await submit(1, b, 1); // Skip the first word without spending an attempt.
  const privateView = await roomAction(room.code, ids[0]);
  assert.ok(
    privateView.race!.words.every(
      (word) => word.guesses.length === 0 && word.answer === undefined,
    ),
  );
  assert.equal(
    privateView.race!.standings.find((p) => p.id === ids[1])!.solved,
    1,
  );
  now = started + 12000;
  await submit(
    0,
    words.find((word) => word !== a)!,
    0,
  );
  await submit(0, a, 0);
  now = started + 14000;
  await submit(0, b, 1);
  now = started + 20000;
  await submit(1, a, 0);
  for (const word of words.filter((word) => word !== a).slice(0, 6))
    await submit(2, word, 0);
  now = started + 30000;
  const final = await submit(2, b, 1);
  assert.equal(final.status, "finished");
  assert.equal(final.race!.endedAt, now);
  now += 1000;
  assert.equal(
    (await roomAction(room.code, ids[0])).race!.endedAt,
    final.race!.endedAt,
  );
  assert.equal(final.race!.average, 17000);
  assert.equal(final.race!.standings[0].id, ids[0]);
  assert.deepEqual(
    final.race!.standings.map((p) => [
      p.points,
      p.pointsScore,
      p.speedScore,
      p.total,
    ]),
    [
      [11, 45.8, 27.4, 73.2],
      [12, 50, 23, 73],
      [6, 25, 0, null],
    ],
  );
  assert.equal((await getStats(ids[0])).matchesWon, 1);
  assert.equal((await getStats(ids[2])).matchesWon, 0);
  const lobby = await roomAction(room.code, ids[0], { action: "replay" });
  assert.equal(lobby.race, undefined);
  await roomAction(room.code, ids[0], { action: "start" });
  await assert.rejects(
    roomAction(room.code, ids[0], {
      action: "guess",
      word: a,
      round: 0,
      matchId: initial.matchId,
    }),
    /match has changed/,
  );
  assert.ok(
    (JSON.parse((await read(`rally:room:${room.code}`))!) as Room).rounds.every(
      (round) => ![a, b].includes(round.answer),
    ),
  );
});

test("only the host can edit an initial lobby, without losing joined seats, even after others join", async () => {
  const host = randomUUID(),
    guest = randomUUID();
  const room = await createRoom(host, {
    name: "Host",
    config: { mode: "free", players: 4, rounds: 5, seconds: 60 },
  });
  const joined = await roomAction(room.code, guest, {
    action: "join",
    name: "Friend",
  });
  const config = {
    mode: "race",
    players: 3,
    rounds: 2,
    seconds: 0,
    scoring: "bonus",
  };
  await assert.rejects(
    roomAction(room.code, guest, {
      action: "configure",
      config,
      revision: joined.revision,
    }),
    /Only the host/,
  );
  // A join that happened while settings were open must not block the host's save.
  const edited = await roomAction(room.code, host, {
    action: "configure",
    config,
    revision: room.revision,
  });
  assert.equal(edited.code, room.code);
  assert.deepEqual(
    edited.players.map((p) => p.name),
    ["Host", "Friend"],
  );
  assert.equal(edited.config.mode, "race");
  await roomAction(room.code, randomUUID(), { action: "join", name: "Third" });
  const latest = await roomAction(room.code, host);
  await assert.rejects(
    roomAction(room.code, host, {
      action: "configure",
      config: { ...config, players: 2 },
      revision: latest.revision,
    }),
    /enough seats/,
  );
  await roomAction(room.code, host, { action: "start" });
  await assert.rejects(
    roomAction(room.code, host, {
      action: "configure",
      config,
      revision: latest.revision,
    }),
    /locked/,
  );
});

test("Fast Fingers closes a minute after the first complete run so idle players cannot stall it", async (t) => {
  let now = Date.now();
  const started = now;
  t.mock.method(Date, "now", () => now);
  const ids = [randomUUID(), randomUUID()];
  const room = await createRoom(ids[0], {
    name: "Host",
    config: { mode: "race", players: 2, rounds: 1, seconds: 0 },
  });
  await roomAction(room.code, ids[1], { action: "join", name: "Idle" });
  await roomAction(room.code, ids[0], { action: "start" });
  const raw: Room = JSON.parse((await read(`rally:room:${room.code}`))!);
  now = started + 5000;
  const solved = await roomAction(room.code, ids[0], {
    action: "guess",
    word: raw.rounds[0].answer,
    round: 0,
  });
  assert.equal(solved.status, "playing");
  now = started + 5000 + 59000;
  assert.equal((await roomAction(room.code, ids[1])).status, "playing");
  now = started + 5000 + 61000;
  const closed = await roomAction(room.code, ids[1]);
  assert.equal(closed.status, "finished");
  assert.equal(closed.race!.endedAt, started + 5000 + 60000);
  assert.equal(closed.race!.standings[0].id, ids[0]);
  assert.equal(closed.race!.standings[1].total, null);
});
