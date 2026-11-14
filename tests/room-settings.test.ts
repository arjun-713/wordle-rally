import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Config } from "../lib/types";
import { createRoom, roomAction } from "./room-client";

const duel: Config = { mode: "duel", players: 2, rounds: 3, seconds: 60 };

async function lobby(config: Config = duel) {
  const host = randomUUID();
  const room = await createRoom(host, { config, name: "Host" });
  return { code: room.code, host };
}

test("only the host can change room settings", async () => {
  const { code, host } = await lobby();
  const guest = randomUUID();
  await roomAction(code, guest, { action: "join", name: "Guest" });
  await assert.rejects(
    roomAction(code, guest, {
      action: "configure",
      config: { ...duel, rounds: 7 },
    }),
    { status: 403 },
  );
  const view = await roomAction(code, host, {
    action: "configure",
    config: { ...duel, rounds: 7, scoring: "bonus", autoAdvance: true },
  });
  assert.equal(view.config.rounds, 7);
  assert.equal(view.config.scoring, "bonus");
  assert.equal(view.config.autoAdvance, true);
});

test("settings are locked once the match starts", async () => {
  const { code, host } = await lobby();
  await roomAction(code, randomUUID(), { action: "join", name: "Guest" });
  await roomAction(code, host, { action: "start" });
  await assert.rejects(
    roomAction(code, host, {
      action: "configure",
      config: { ...duel, rounds: 7 },
    }),
    { status: 409, message: "Settings are locked once the game starts" },
  );
});

test("seats cannot drop below the players who have joined", async () => {
  const { code, host } = await lobby({ ...duel, mode: "free", players: 4 });
  await roomAction(code, randomUUID(), { action: "join", name: "A" });
  await roomAction(code, randomUUID(), { action: "join", name: "B" });
  await assert.rejects(
    roomAction(code, host, {
      action: "configure",
      config: { ...duel, mode: "free", players: 2 },
    }),
    /3 players have joined/,
  );
  // A duel cannot hold three players either.
  await assert.rejects(
    roomAction(code, host, { action: "configure", config: duel }),
    /3 players have joined/,
  );
  const view = await roomAction(code, host, {
    action: "configure",
    config: { ...duel, mode: "free", players: 3 },
  });
  assert.equal(view.config.players, 3);
});

test("switching to teams splits the joined players across both teams", async () => {
  const { code, host } = await lobby({ ...duel, mode: "free", players: 4 });
  for (const name of ["A", "B", "C"])
    await roomAction(code, randomUUID(), { action: "join", name });
  const view = await roomAction(code, host, {
    action: "configure",
    config: { ...duel, mode: "teams", players: 4 },
  });
  assert.deepEqual(
    view.players.map((p) => p.team),
    [0, 1, 0, 1],
  );
});

test("a join while the host is editing does not block the save", async () => {
  const { code, host } = await lobby({ ...duel, mode: "free", players: 4 });
  const opened = await roomAction(code, host);
  await roomAction(code, randomUUID(), { action: "join", name: "Late" });
  const view = await roomAction(code, host, {
    action: "configure",
    config: { ...duel, mode: "free", players: 5 },
    revision: opened.revision,
  });
  assert.equal(view.config.players, 5);
  assert.equal(view.players.length, 2);
});

test("raising the seats lets another player into a full room", async () => {
  const { code, host } = await lobby();
  await roomAction(code, randomUUID(), { action: "join", name: "Guest" });
  const extra = randomUUID();
  await assert.rejects(
    roomAction(code, extra, { action: "join", name: "Extra" }),
    /full/,
  );
  await roomAction(code, host, {
    action: "configure",
    config: { ...duel, mode: "free", players: 3 },
  });
  const view = await roomAction(code, extra, { action: "join", name: "Extra" });
  assert.equal(view.players.length, 3);
});

test("Fast Fingers settings are validated on save", async () => {
  const { code, host } = await lobby();
  await assert.rejects(
    roomAction(code, host, {
      action: "configure",
      config: { mode: "race", players: 2, rounds: 3, seconds: 60 },
    }),
    /race clock/,
  );
  const view = await roomAction(code, host, {
    action: "configure",
    config: { mode: "race", players: 2, rounds: 3, seconds: 0 },
  });
  assert.equal(view.config.mode, "race");
  assert.equal(view.config.scoring, "bonus");
});
