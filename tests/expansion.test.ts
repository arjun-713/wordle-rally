import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { begin, submitGuess, validateConfig } from "../lib/engine";
import { dailyAction } from "../lib/daily";
import { soloAction } from "../lib/solo";
import { createRoom, roomAction } from "./room-client";
import { getStats, recordPuzzle, parseStats } from "../lib/stats";
import { pools, dailyWords, dailyPuzzle } from "../lib/words";
import { read, compareAndSet } from "../lib/store";
import type { Room, SoloGame } from "../lib/types";
import accepted from "../data/guesses.json";
const wrongWords = (answer: string, count: number) =>
  accepted.filter((w) => w !== answer).slice(0, count);
const secretRoom = async (code: string): Promise<Room> =>
  JSON.parse((await read(`rally:room:${code}`))!);
const secretSolo = async (id: string): Promise<SoloGame> =>
  JSON.parse((await read(`rally:solo:${id}`))!);
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
test("difficulty pools are disjoint, accept valid words, and reserve the immutable daily calendar", () => {
  const daily = new Set(dailyWords),
    familiar = new Set(pools.familiar);
  assert.equal(daily.size, dailyWords.length);
  assert.equal(
    pools.mixed.length,
    pools.familiar.length + pools.challenging.length,
  );
  assert.ok(pools.challenging.every((w) => !familiar.has(w)));
  assert.ok(pools.mixed.every((w) => !daily.has(w) && accepted.includes(w)));
  assert.notEqual(dailyPuzzle(day(0)).answer, dailyPuzzle(day(1)).answer);
  assert.throws(() => dailyPuzzle(day(dailyWords.length)), /calendar/);
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
test("daily six-guess loss and concurrent solves record stats once", async () => {
  const id = randomUUID(),
    first = await dailyAction(id, { action: "start" }, day(0));
  const solved = await Promise.allSettled(
    [1, 2].map(() =>
      dailyAction(
        id,
        { action: "guess", gameId: first.id, word: dailyPuzzle(day(0)).answer },
        day(0),
      ),
    ),
  );
  assert.equal(solved.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await getStats(id)).daily.wins, 1);
  const second = await dailyAction(id, { action: "start" }, day(1));
  for (const word of wrongWords(dailyPuzzle(day(1)).answer, 6))
    await dailyAction(id, { action: "guess", gameId: second.id, word }, day(1));
  assert.equal(
    (await dailyAction(id, { action: "read" }, day(1))).status,
    "lost",
  );
  const stats = await getStats(id);
  assert.equal(stats.daily.played, 2);
  assert.equal(stats.daily.streak, 0);
});
test("daily streaks require consecutive UTC days and legacy word history is never repeated", async () => {
  const book = parseStats(null);
  recordPuzzle(book.daily, true, 1, "2026-10-25");
  recordPuzzle(book.daily, true, 3, "2026-10-26");
  assert.equal(book.daily.streak, 2);
  recordPuzzle(book.daily, true, 2, "2026-10-28");
  assert.equal(book.daily.streak, 1);
  assert.equal(book.daily.bestStreak, 2);
  recordPuzzle(book.daily, true, 2, "2026-10-28");
  assert.equal(book.daily.played, 3);
  const id = randomUUID();
  await compareAndSet([
    {
      key: `rally:history:${id}`,
      expected: null,
      value: JSON.stringify([dailyPuzzle(day(0)).answer]),
    },
  ]);
  await assert.rejects(
    dailyAction(id, { action: "start" }, day(0)),
    /earlier game history/,
  );
});
test("Unlimited difficulty applies to the next word and detailed stats survive reloads", async () => {
  const id = randomUUID(),
    first = (await soloAction(id, {
      action: "start",
      difficulty: "familiar",
    }))!;
  assert.ok(pools.familiar.includes((await secretSolo(id)).answer));
  assert.equal(
    (await soloAction(id, { action: "start", difficulty: "challenging" }))!.id,
    first.id,
  );
  const answer = (await secretSolo(id)).answer;
  await soloAction(id, { action: "guess", gameId: first.id, word: answer });
  await soloAction(id, {
    action: "next",
    gameId: first.id,
    difficulty: "challenging",
  });
  assert.ok(pools.challenging.includes((await secretSolo(id)).answer));
  const book = await getStats(id);
  assert.equal(book.unlimited.played, 1);
  assert.equal(book.unlimited.distribution[0], 1);
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
test("simultaneous daily and Unlimited completions preserve both sets of statistics", async () => {
  const id = randomUUID(),
    solo = (await soloAction(id, { action: "start" }))!,
    daily = await dailyAction(id, { action: "start" }, day(0));
  const answer = (await secretSolo(id)).answer;
  await Promise.all([
    soloAction(id, { action: "guess", gameId: solo.id, word: answer }),
    dailyAction(
      id,
      { action: "guess", gameId: daily.id, word: dailyPuzzle(day(0)).answer },
      day(0),
    ),
  ]);
  const book = await getStats(id);
  assert.equal(book.daily.wins, 1);
  assert.equal(book.unlimited.wins, 1);
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

test("later championship lobbies preserve original seats and reject replacement players in individual and team modes", async () => {
  for (const mode of ["duel", "teams"] as const) {
    const count = mode === "teams" ? 4 : 2;
    const ids = Array.from({ length: count }, () => randomUUID());
    const room = await createRoom(ids[0], {
      name: "Host",
      config: { mode, players: count, rounds: 1, seconds: 0, matches: 2 },
    });
    for (let i = 1; i < count; i++)
      await roomAction(room.code, ids[i], {
        action: "join",
        name: `Friend ${i}`,
      });
    await roomAction(room.code, ids[0], { action: "start", match: 0 });
    const answer = (await secretRoom(room.code)).rounds[0].answer;
    for (const id of ids)
      await roomAction(room.code, id, {
        action: "guess",
        match: 0,
        round: 0,
        word: answer,
      });
    await roomAction(room.code, ids[0], { action: "nextMatch", match: 0 });
    await roomAction(room.code, ids[1], { action: "leave" });
    const left = await roomAction(room.code, ids[0]);
    assert.equal(left.players.length, count);
    assert.deepEqual(
      left.players.map((p) => p.id),
      ids,
    );
    assert.equal(left.players[1].active, false);
    await assert.rejects(
      roomAction(room.code, randomUUID(), {
        action: "join",
        name: "Replacement",
      }),
      /roster is locked/,
    );
    await assert.rejects(
      roomAction(room.code, ids[0], { action: "start", match: 1 }),
      /Waiting for all/,
    );
    assert.equal((await roomAction(room.code, ids[0])).status, "lobby");
  }
});
