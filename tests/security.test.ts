import test from "node:test";
import assert from "node:assert/strict";
import { body } from "../lib/http";

test("oversized streaming requests are stopped before buffering the entire body", async () => {
  let chunks = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks++;
      controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
      if (chunks === 32) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/api/rooms", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(body(request), /too large/);
  assert.ok(chunks < 10, `Read ${chunks} chunks before rejecting`);
  assert.ok(cancelled);
});

import { randomUUID } from "node:crypto";
import { createRoom, roomAction } from "../lib/service";
import { dailyPuzzle, dailyWords } from "../lib/words";
import { read } from "../lib/store";
import type { Room } from "../lib/types";

test("a new rematch rejects stale guesses and round advances from an earlier match", async () => {
  const id = randomUUID(),
    friend = randomUUID();
  const room = await createRoom(id, {
    name: "Host",
    config: { mode: "duel", players: 2, rounds: 2, seconds: 0 },
  });
  await roomAction(room.code, friend, { action: "join", name: "Friend" });
  let current = await roomAction(room.code, id, { action: "start" });
  const oldId = current.matchId;
  assert.equal(typeof oldId, "string");
  for (let round = 0; round < 2; round++) {
    const state: Room = JSON.parse((await read(`rally:room:${room.code}`))!);
    for (const player of [id, friend])
      current = await roomAction(room.code, player, {
        action: "guess",
        matchId: oldId,
        round,
        word: state.rounds[round].answer,
      });
    if (!round)
      await roomAction(room.code, id, {
        action: "next",
        matchId: oldId,
        round,
      });
  }
  await roomAction(room.code, id, { action: "replay" });
  current = await roomAction(room.code, id, { action: "start" });
  assert.notEqual(current.matchId, oldId);
  for (const action of ["guess", "next"])
    await assert.rejects(
      roomAction(room.code, id, {
        action,
        matchId: oldId,
        round: 0,
        word: "crane",
      }),
      /match has changed/,
    );
  await assert.rejects(
    roomAction(room.code, id, { action: "guess", round: 0, word: "crane" }),
    /match has changed/,
  );
  assert.equal((await roomAction(room.code, id)).current!.guesses.length, 0);
});

test("daily order is stable and non-repeating but cannot be inferred from the public calendar", () => {
  const now = Date.parse("2026-10-25T12:00:00Z"),
    secret = "a1".repeat(32);
  const schedule = dailyWords.map(
    (_, index) => dailyPuzzle(now + index * 86400000, secret).answer,
  );
  assert.equal(new Set(schedule).size, dailyWords.length);
  assert.notDeepEqual(schedule, dailyWords);
  assert.equal(dailyPuzzle(now, secret).answer, schedule[0]);
  assert.notDeepEqual(
    dailyWords.map(
      (_, index) => dailyPuzzle(now + index * 86400000, "b2".repeat(32)).answer,
    ),
    schedule,
  );
  assert.throws(() => dailyPuzzle(now, "invalid"), /secret/);
  // Restore the ordinary unseeded local schedule for this process.
  dailyPuzzle(now, undefined);
});
