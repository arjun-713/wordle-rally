import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import accepted from "../data/guesses.json";
import answers from "../data/answers.json";
import { dailyAction } from "../lib/daily";
import { begin, selectWords, submitGuess, validateConfig } from "../lib/engine";
import { getStats } from "../lib/stats";
import { read } from "../lib/store";
import type { Room } from "../lib/types";
import { dailyPuzzle, dailyWords, pools } from "../lib/words";
import { createRoom, roomAction } from "./room-client";
const wrongWords = (answer: string, count: number) =>
  accepted.filter((w) => w !== answer).slice(0, count);
const secretRoom = async (code: string): Promise<Room> =>
  JSON.parse((await read(`rally:room:${code}`))!);
const day = (n: number) => Date.parse("2026-10-25T12:00:00Z") + n * 86400000;

test("Guess bonus awards exactly 6, 5, 4, 3, 2, 1 points and never scores twice", () => {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const room: Room = {
      code: "ABCDEF",
      host: "a",
      config: {
        mode: "duel",
        players: 2,
        rounds: 1,
        seconds: 0,
        scoring: "bonus",
      },
      players: ["a", "b"].map((id) => ({
        id,
        name: id,
        team: 0,
        active: true,
        score: 0,
      })),
      rounds: [],
      round: 0,
      status: "lobby",
      createdAt: 1,
      revision: 0,
    };
    begin(room, ["apple"], 1000);
    for (const word of [...wrongWords("apple", attempt - 1), "apple"])
      submitGuess(room, room.players[0], word, 0, new Set(accepted), 2000);
    assert.equal(room.players[0].score, 7 - attempt);
    assert.throws(() =>
      submitGuess(room, room.players[0], "apple", 0, new Set(accepted), 2001),
    );
    assert.equal(room.players[0].score, 7 - attempt);
  }
  for (const patch of [
    { scoring: "speed" },
    { difficulty: "fake" },
    { matches: 0 },
    { matches: 11 },
    { matches: 1.5 },
  ])
    assert.throws(() =>
      validateConfig({
        mode: "duel",
        players: 2,
        rounds: 1,
        seconds: 0,
        ...patch,
      }),
    );
});
test("daily is shared, private until completion, resumes, and allows only one attempt each UTC day", async () => {
  const id = randomUUID(),
    friend = randomUUID(),
    puzzle = dailyPuzzle(day(0));
  const [a, same] = await Promise.all([
    dailyAction(id, { action: "start" }, day(0)),
    dailyAction(id, { action: "start" }, day(0)),
  ]);
  assert.equal(a.id, same.id);
  assert.equal(a.answer, undefined);
  const b = await dailyAction(friend, { action: "start" }, day(0));
  assert.equal(a.id, b.id);
  await dailyAction(
    id,
    { action: "guess", gameId: a.id, word: wrongWords(puzzle.answer, 1)[0] },
    day(0),
  );
  assert.equal(
    (await dailyAction(id, { action: "read" }, day(0))).guesses.length,
    1,
  );
  await assert.rejects(
    dailyAction(id, { action: "guess", gameId: a.id, word: "zzzzz" }, day(0)),
    /dictionary/,
  );
  const result = await dailyAction(
    id,
    { action: "guess", gameId: a.id, word: puzzle.answer },
    day(0),
  );
  assert.equal(result.answer, puzzle.answer);
  assert.equal(result.status, "won");
  assert.equal(
    (await dailyAction(id, { action: "start" }, day(0))).status,
    "won",
  );
  await assert.rejects(
    dailyAction(
      id,
      { action: "guess", gameId: a.id, word: puzzle.answer },
      day(0),
    ),
    /finished/,
  );
  await assert.rejects(
    dailyAction(id, { action: "next" }, day(0)),
    /one puzzle/,
  );
  await dailyAction(id, { action: "start" }, day(1));
  await assert.rejects(
    dailyAction(
      id,
      { action: "guess", gameId: a.id, word: puzzle.answer },
      day(1),
    ),
    /new day/,
  );
  const stats = await getStats(id);
  assert.equal(stats.daily.played, 1);
  assert.equal(stats.daily.wins, 1);
  assert.equal(stats.daily.distribution[1], 1);
});
test("championship archives each match, preserves totals and word history, and rejects stale match requests", async () => {
  const host = randomUUID(),
    friend = randomUUID();
  let room = await createRoom(host, {
    name: "Host",
    config: {
      mode: "duel",
      players: 2,
      rounds: 1,
      seconds: 0,
      matches: 2,
      difficulty: "familiar",
      scoring: "bonus",
    },
  });
  await roomAction(room.code, friend, { action: "join", name: "Friend" });
  const answers: string[] = [];
  for (let match = 0; match < 2; match++) {
    await roomAction(room.code, host, { action: "start", match });
    const answer = (await secretRoom(room.code)).rounds[0].answer;
    answers.push(answer);
    assert.ok(pools.familiar.includes(answer));
    if (match)
      await assert.rejects(
        roomAction(room.code, host, {
          action: "guess",
          match: 0,
          round: 0,
          word: answer,
        }),
        /another match/,
      );
    for (const [id, attempt] of [
      [host, match ? 3 : 1],
      [friend, match ? 1 : 6],
    ] as const)
      for (const word of [...wrongWords(answer, attempt - 1), answer])
        room = await roomAction(room.code, id, {
          action: "guess",
          match,
          round: 0,
          word,
        });
    assert.equal(room.status, "finished");
    assert.equal(room.matches!.length, match + 1);
    const details = room.results[0].players;
    assert.equal(details[0].points, match ? 4 : 6);
    assert.equal(details[1].points, match ? 6 : 1);
    assert.ok(details.every((p) => p.elapsed !== null && p.elapsed >= 0));
    await roomAction(room.code, host);
    await roomAction(room.code, friend);
    if (!match) {
      await assert.rejects(
        roomAction(room.code, host, { action: "replay" }),
        /Finish the championship/,
      );
      await assert.rejects(
        roomAction(room.code, friend, { action: "nextMatch", match }),
        /Only the host/,
      );
      room = await roomAction(room.code, host, { action: "nextMatch", match });
      assert.equal(room.status, "lobby");
      assert.equal(room.players[0].score, 0);
      await assert.rejects(
        roomAction(room.code, host, { action: "nextMatch", match }),
        /after a match/,
      );
    }
  }
  assert.equal(new Set(answers).size, 2);
  const scores = room.matches!.map((m) => m.scores[0].score);
  assert.deepEqual(scores, [6, 4]);
  const stats = await getStats(host);
  assert.equal(stats.matchesPlayed, 2);
  assert.equal(stats.matchesWon, 1);
  assert.equal(stats.points, 10);
  assert.equal(stats.multiplayer.played, 2);
  const replay = await roomAction(room.code, host, { action: "replay" });
  assert.equal(replay.matches!.length, 0);
  assert.equal(replay.match, 0);
});

test("2v2 championship locks teams between matches and preserves summed bonus scores", async () => {
  const ids = Array.from({ length: 4 }, () => randomUUID());
  let room = await createRoom(ids[0], {
    name: "Host",
    config: {
      mode: "teams",
      players: 4,
      rounds: 1,
      seconds: 0,
      scoring: "bonus",
      matches: 2,
    },
  });
  for (let i = 1; i < 4; i++)
    await roomAction(room.code, ids[i], {
      action: "join",
      name: `Friend ${i}`,
    });
  await roomAction(room.code, ids[0], { action: "start", match: 0 });
  const answer = (await secretRoom(room.code)).rounds[0].answer;
  for (let i = 0; i < 4; i++)
    for (const word of [...wrongWords(answer, i), answer])
      room = await roomAction(room.code, ids[i], {
        action: "guess",
        match: 0,
        round: 0,
        word,
      });
  const scores = room.matches![0].scores;
  assert.equal(
    scores.filter((p) => p.team === 0).reduce((sum, p) => sum + p.score, 0),
    10,
  );
  assert.equal(
    scores.filter((p) => p.team === 1).reduce((sum, p) => sum + p.score, 0),
    8,
  );
  await roomAction(room.code, ids[0], { action: "nextMatch", match: 0 });
  await assert.rejects(
    roomAction(room.code, ids[0], { action: "team", team: 1 }),
    /stay fixed/,
  );
  assert.equal((await getStats(ids[0])).matchesWon, 1);
  assert.equal((await getStats(ids[2])).matchesWon, 1);
  assert.equal((await getStats(ids[1])).matchesWon, 0);
});

// Catalog invariants protect the curated answer list without depending on a particular random answer.
test("curated randomized pools contain valid distinct Wordle answers and no reserved daily answers", () => {
  const valid = new Set(accepted),
    reserved = new Set(dailyWords),
    all = [...answers.familiar, ...answers.challenging];
  assert.ok(all.length >= 2000);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((word) => /^[a-z]{5}$/.test(word) && valid.has(word)));
  assert.ok(pools.mixed.every((word) => !reserved.has(word)));
  assert.ok(pools.familiar.length > 0 && pools.challenging.length > 0);
  assert.equal(
    pools.familiar.length + pools.challenging.length,
    pools.mixed.length,
  );
  const familiar = new Set(pools.familiar);
  assert.ok(pools.challenging.every((word) => !familiar.has(word)));
  for (const name of ["jason", "tampa", "egypt", "zoeal", "zokor"])
    assert.ok(!all.includes(name), name);
  const excluded = new Set(pools.mixed.slice(0, -20));
  const selected = selectWords(pools.mixed, excluded, 20);
  assert.equal(new Set(selected).size, 20);
  assert.ok(selected.every((word) => !excluded.has(word)));
});

test("selectWords falls back to used words once history covers the pool", () => {
  const pool = ["apple", "brave", "crane", "dough", "eagle"];
  const excluded = new Set(["apple", "brave", "crane", "dough"]);
  const selected = selectWords(pool, excluded, 3);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected).size, 3);
  assert.ok(selected.includes("eagle"));
  const exhausted = selectWords(pool, new Set(pool), 5);
  assert.deepEqual([...exhausted].sort(), [...pool].sort());
  assert.throws(() => selectWords(pool, new Set(), 6));
});
