import assert from "node:assert/strict";
import test from "node:test";
import { begin, markGuess, submitGuess, validateConfig } from "../lib/engine";
import type { Room } from "../lib/types";
const now = 100000;
function room(): Room {
  return {
    code: "ABCDEF",
    host: "a",
    config: { mode: "duel", players: 2, rounds: 2, seconds: 60 },
    players: ["a", "b"].map((id) => ({
      id,
      name: id,
      team: 0,
      score: 0,
      active: true,
    })),
    status: "lobby",
    rounds: [],
    round: 0,
    createdAt: now,
    revision: 0,
  };
}
const valid = new Set([
  "apple",
  "allee",
  "crane",
  "spite",
  "smile",
  "arise",
  "mount",
  "round",
  "chest",
  "blown",
]);
test("exact-position letters consume counts before misplaced duplicates", () => {
  assert.deepEqual(markGuess("allee", "apple"), [
    "correct",
    "present",
    "absent",
    "absent",
    "correct",
  ]);
  assert.deepEqual(markGuess("sassy", "glass"), [
    "present",
    "present",
    "absent",
    "correct",
    "absent",
  ]);
  assert.deepEqual(markGuess("apple", "apple"), Array(5).fill("correct"));
});
test("config validates mode-specific counts and bounded values", () => {
  assert.deepEqual(
    validateConfig({ mode: "duel", players: 2, rounds: 20, seconds: 300 }),
    { mode: "duel", players: 2, rounds: 20, seconds: 300 },
  );
  for (const config of [
    { mode: "duel", players: 3, rounds: 5, seconds: 60 },
    { mode: "teams", players: 3, rounds: 5, seconds: 60 },
    { mode: "free", players: 17, rounds: 5, seconds: 60 },
    { mode: "free", players: 2, rounds: 0, seconds: 60 },
    { mode: "free", players: 2, rounds: 5, seconds: -1 },
    null,
  ])
    assert.throws(() => validateConfig(config));
});
test("one exhausted player does not end another player’s turn", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  for (const w of ["crane", "spite", "smile", "arise", "mount", "round"])
    submitGuess(r, r.players[0], w, 0, valid, now + 100);
  assert.equal(r.rounds[0].ended, false);
  assert.throws(() =>
    submitGuess(r, r.players[0], "apple", 0, valid, now + 200),
  );
  submitGuess(r, r.players[1], "apple", 0, valid, now + 300);
  assert.equal(r.players[1].score, 1);
  assert.equal(r.players[0].score, 0);
  assert.equal(r.rounds[0].ended, true);
});
test("invalid or duplicate words do not consume a guess", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  assert.throws(() => submitGuess(r, r.players[0], "zzzzz", 0, valid, now));
  submitGuess(r, r.players[0], "crane", 0, valid, now);
  assert.throws(() => submitGuess(r, r.players[0], "crane", 0, valid, now));
  assert.equal(r.rounds[0].guesses.a.length, 1);
});
