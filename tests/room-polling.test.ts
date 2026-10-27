import assert from "node:assert/strict";
import test from "node:test";
import { roomPollDelay } from "../lib/room-polling";
import type { PublicRoom } from "../lib/types";

function room(over: Partial<PublicRoom> = {}): PublicRoom {
  return {
    code: "ABCDEF",
    host: "a",
    me: "a",
    config: { mode: "duel", players: 2, rounds: 3, seconds: 0 },
    players: [
      { id: "a", name: "A", team: 0, score: 0, active: true },
      { id: "b", name: "B", team: 1, score: 0, active: true },
    ],
    status: "playing",
    round: 0,
    createdAt: 0,
    revision: 1,
    serverTime: 0,
    storage: "local",
    current: {
      guesses: [],
      solved: [],
      attempts: {},
      endsAt: 0,
      ended: false,
      ghosts: {},
    },
    results: [],
    ...over,
  };
}

test("live rooms refresh promptly, recover quickly and relax only when idle", () => {
  assert.equal(roomPollDelay(room(), 0, 0), 750);
  assert.equal(roomPollDelay(room(), 119000, 0), 750);
  assert.equal(roomPollDelay(room(), 120000, 0), 3000);
  const timed = room({
    config: { mode: "duel", players: 2, rounds: 3, seconds: 60 },
    current: { ...room().current!, endsAt: 1000 },
  });
  assert.equal(roomPollDelay(timed, 0, 0), 750);
  assert.equal(roomPollDelay(timed, 0, 900), 250);
  const ended = room({ current: { ...room().current!, ended: true } });
  assert.equal(roomPollDelay(ended, 0, 0), 750);
  assert.equal(
    roomPollDelay(room({ status: "lobby", current: null }), 0, 0),
    1000,
  );
  assert.equal(roomPollDelay(room(), 0, 0, 1), 1000);
  assert.equal(roomPollDelay(room(), 0, 0, 8), 8000);
  assert.equal(
    roomPollDelay(room({ config: { ...room().config, mode: "race" } }), 0, 0),
    750,
  );
});
