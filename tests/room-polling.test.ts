import assert from "node:assert/strict";
import test from "node:test";
import { POLL, roomPollDelay } from "../lib/room-polling";
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

test("poll failures retry within seconds instead of waiting long", () => {
  const active = room();
  assert.equal(roomPollDelay(active, 0, 1000, 1), 1000);
  assert.equal(roomPollDelay(active, 0, 1000, 2), 2000);
  assert.equal(roomPollDelay(active, 0, 1000, 3), 4000);
  assert.equal(roomPollDelay(active, 0, 1000, 9), POLL.retryMax);
});
test("an active round polls fast, then backs off as the room goes quiet", () => {
  assert.equal(roomPollDelay(room(), 0, 1000), POLL.live);
  assert.equal(roomPollDelay(room(), 45000, 1000), POLL.liveQuiet);
  assert.equal(roomPollDelay(room(), 180000, 1000), POLL.idle);
});
test("an ended round polls promptly and a quiet lobby backs off", () => {
  const ended = room({
    current: { ...room().current!, ended: true },
  });
  assert.equal(roomPollDelay(ended, 0, 1000), POLL.roundOver);
  const lobby = room({ status: "lobby", current: null });
  assert.equal(roomPollDelay(lobby, 0, 1000), POLL.lobby);
  assert.equal(roomPollDelay(lobby, 90000, 1000), POLL.lobbyQuiet);
  assert.equal(roomPollDelay(lobby, 400000, 1000), POLL.lobbyIdle);
});
test("the next deadline wakes polling and inactive players stop", () => {
  const timed = room({
    config: { mode: "duel", players: 2, rounds: 2, seconds: 30 },
    current: { ...room().current!, endsAt: 2000 },
  });
  assert.equal(roomPollDelay(timed, 0, 1000), 1150);
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
  assert.equal(roomPollDelay(null, 0, 1000), POLL.lobby);
  const finished = room({ status: "finished" });
  assert.equal(roomPollDelay(finished, 0, 1000), null, "host stops polling");
  assert.equal(
    roomPollDelay({ ...finished, me: "rival" }, 0, 1000),
    POLL.finished,
  );
});
