import test from "node:test";
import assert from "node:assert/strict";
import {
  begin,
  cleanName,
  markGuess,
  selectWords,
  settle,
  submitGuess,
  validateConfig,
} from "../lib/engine";
import type { Room } from "../lib/types";
test("untimed rounds ignore elapsed time and end when all players finish", () => {
  const r = room();
  r.config.seconds = 0;
  validateConfig(r.config);
  begin(r, ["apple", "smile"], now);
  assert.equal(r.rounds[0].endsAt, 0);
  settle(r, now + 86400000);
  assert.equal(r.rounds[0].ended, false);
  submitGuess(r, r.players[0], "apple", 0, valid, now + 86400000);
  assert.equal(r.rounds[0].ended, false);
  submitGuess(r, r.players[1], "apple", 0, valid, now + 86400001);
  assert.equal(r.rounds[0].ended, true);
});
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
test("names are trimmed, bounded, and reject control characters", () => {
  assert.equal(cleanName("  Word   Wizard  "), "Word Wizard");
  for (const name of ["", null, "x".repeat(21), "bad\u0000name"])
    assert.throws(() => cleanName(name));
});
test("selection excludes all histories and never duplicates an answer", () => {
  const selected = selectWords(
    ["apple", "crane", "smile", "round"],
    new Set(["apple"]),
    3,
  );
  assert.equal(new Set(selected).size, 3);
  assert.ok(!selected.includes("apple"));
  assert.throws(() => selectWords(["apple"], new Set(["apple"]), 1));
});
test("the match cannot start with missing players", () => {
  const r = room();
  r.players.pop();
  assert.throws(() => begin(r, ["apple", "smile"], now));
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
test("every solver gets exactly one point and a solve does not stop rivals", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  submitGuess(r, r.players[0], "apple", 0, valid, now + 1);
  assert.equal(r.rounds[0].ended, false);
  assert.throws(() => submitGuess(r, r.players[0], "apple", 0, valid, now + 2));
  submitGuess(r, r.players[1], "apple", 0, valid, now + 3);
  assert.deepEqual(
    r.players.map((p) => p.score),
    [1, 1],
  );
  assert.equal(r.rounds[0].ended, true);
});
test("timeout awards no points and rejects late guesses", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  settle(r, now + 60000);
  assert.equal(r.rounds[0].ended, true);
  assert.deepEqual(
    r.players.map((p) => p.score),
    [0, 0],
  );
  assert.throws(() =>
    submitGuess(r, r.players[0], "apple", 0, valid, now + 60001),
  );
});
test("invalid or duplicate words do not consume a guess", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  assert.throws(() => submitGuess(r, r.players[0], "zzzzz", 0, valid, now));
  submitGuess(r, r.players[0], "crane", 0, valid, now);
  assert.throws(() => submitGuess(r, r.players[0], "crane", 0, valid, now));
  assert.equal(r.rounds[0].guesses.a.length, 1);
});
test("a stale guess cannot spill into a new round", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  r.round = 1;
  r.rounds[1].endsAt = now + 60000;
  assert.throws(() => submitGuess(r, r.players[0], "smile", 0, valid, now));
  assert.equal(r.players[0].score, 0);
});
test("the final timed-out round finishes a match", () => {
  const r = room();
  begin(r, ["apple", "smile"], now);
  r.round = 1;
  r.rounds[1].endsAt = now + 100;
  settle(r, now + 100);
  assert.equal(r.status, "finished");
});
