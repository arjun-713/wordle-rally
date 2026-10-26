import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import guesses from "../data/guesses.json";
import { soloAction } from "../lib/solo";
import { read } from "../lib/store";
import type { Room, SoloGame } from "../lib/types";
import { createRoom, roomAction } from "./room-client";
async function secret(id: string): Promise<SoloGame> {
  return JSON.parse((await read(`rally:solo:${id}`))!);
}
test("wins, losses, streaks and Next word persist without repeating answers", async () => {
  const id = randomUUID(),
    used = new Set<string>();
  let current = (await soloAction(id, { action: "start" }))!;
  for (let i = 0; i < 3; i++) {
    const game = await secret(id);
    assert.ok(!used.has(game.answer));
    used.add(game.answer);
    const words =
      i === 2
        ? guesses.filter((w) => w !== game.answer).slice(0, 6)
        : [game.answer];
    for (const word of words)
      current = (await soloAction(id, {
        action: "guess",
        gameId: game.id,
        word,
      }))!;
    assert.equal(current.status, i === 2 ? "lost" : "won");
    assert.equal(current.answer, game.answer);
    await assert.rejects(
      soloAction(id, { action: "guess", gameId: game.id, word: game.answer }),
      /over/,
    );
    if (i < 2)
      current = (await soloAction(id, { action: "next", gameId: game.id }))!;
  }
  assert.deepEqual(current.stats, {
    played: 3,
    wins: 2,
    streak: 0,
    bestStreak: 2,
  });
  current = (await soloAction(id, { action: "next", gameId: current.id }))!;
  assert.equal(current.guesses.length, 0);
  assert.equal(current.answer, undefined);
  assert.ok(!used.has((await secret(id)).answer));
});
test("invalid, duplicate and stale solo guesses do not consume attempts or double score", async () => {
  const id = randomUUID(),
    game = (await soloAction(id, { action: "start" }))!,
    answer = (await secret(id)).answer;
  await assert.rejects(
    soloAction(id, { action: "guess", gameId: game.id, word: "zzzzz" }),
    /dictionary/,
  );
  await assert.rejects(
    soloAction(id, { action: "next", gameId: game.id }),
    /Finish/,
  );
  const solved = await Promise.allSettled(
    [1, 2].map(() =>
      soloAction(id, { action: "guess", gameId: game.id, word: answer }),
    ),
  );
  assert.equal(solved.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await secret(id)).stats.wins, 1);
  await soloAction(id, { action: "next", gameId: game.id });
  await assert.rejects(
    soloAction(id, { action: "guess", gameId: game.id, word: answer }),
    /changed/,
  );
  assert.equal((await secret(id)).guesses.length, 0);
});
test("solo and multiplayer starts share one atomic no-repeat history", async () => {
  const id = randomUUID(),
    friend = randomUUID();
  const room = await createRoom(id, {
    name: "Host",
    config: { mode: "duel", players: 2, rounds: 20, seconds: 0 },
  });
  await roomAction(room.code, friend, { action: "join", name: "Friend" });
  await Promise.all([
    soloAction(id, { action: "start" }),
    roomAction(room.code, id, { action: "start" }),
  ]);
  const solo = await secret(id),
    multiplayer: Room = JSON.parse((await read(`rally:room:${room.code}`))!);
  assert.ok(multiplayer.rounds.every((r) => r.answer !== solo.answer));
  assert.equal(JSON.parse((await read(`rally:history:${id}`))!).length, 21);
});
