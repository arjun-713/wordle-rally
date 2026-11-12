import assert from "node:assert/strict";
import test from "node:test";
import { roomPollDelay } from "../lib/room-polling";
import type { PublicRoom } from "../lib/types";

function room(overrides: Partial<PublicRoom> = {}): PublicRoom {
  return {
    code: "ABCDEF",
    host: "host",
    me: "host",
    matchId: "match",
    match: 0,
    config: { mode: "duel", players: 2, rounds: 2, seconds: 0 },
    players: [
      { id: "host", name: "Host", team: 0, score: 0, active: true },
      { id: "rival", name: "Rival", team: 1, score: 0, active: true },
    ],
    status: "playing",
    round: 0,
    createdAt: 0,
    revision: 1,
    serverTime: 1000,
    storage: "local",
    current: {
      guesses: [],
      solved: [],
      attempts: { host: 0, rival: 0 },
      endsAt: 0,
      ended: false,
    },
    results: [],
    ...overrides,
  };
}

test("poll failures back off quickly and cap below the request timeout", () => {
  const active = room();
  assert.equal(roomPollDelay(active, 0, 1000, 1), 2000);
  assert.equal(roomPollDelay(active, 0, 1000, 2), 4000);
  assert.equal(roomPollDelay(active, 0, 1000, 3), 8000);
  assert.equal(roomPollDelay(active, 0, 1000, 4), 12000);
  assert.equal(roomPollDelay(active, 0, 1000, 9), 12000);
});
test("an active round keeps polling fast instead of backing off", () => {
  assert.equal(roomPollDelay(room(), 0, 1000), 5000);
  assert.equal(roomPollDelay(room(), 90000, 1000), 5000);
  assert.equal(roomPollDelay(room({ round: 1 }), 60000, 1000), 5000);
});
test("an ended round polls sooner and a quiet lobby backs off", () => {
  assert.equal(
    roomPollDelay(
      room({ current: { ...room().current!, ended: true } }),
      0,
      1000,
    ),
    2500,
  );
  assert.equal(
    roomPollDelay(room({ status: "lobby", current: null }), 60000, 1000),
    15000,
  );
  assert.equal(
    roomPollDelay(room({ status: "lobby", current: null }), 0, 1000),
    5000,
  );
});
test("the next deadline wakes polling and inactive players stop", () => {
  const timed = room({
    config: { mode: "duel", players: 2, rounds: 2, seconds: 30 },
    current: { ...room().current!, endsAt: 3000 },
  });
  assert.equal(roomPollDelay(timed, 0, 1000), 2150);
  assert.equal(
    roomPollDelay(
      room({
        players: [
          { id: "host", name: "Host", team: 0, score: 0, active: false },
        ],
      }),
      0,
      1000,
    ),
    null,
  );
  assert.equal(roomPollDelay(null, 0, 1000), 5000);
});
