import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { CHAT_LIMIT, CHAT_MAX_LENGTH } from "../lib/service";
import { createRoom, roomAction } from "./room-client";

async function room(players = 2) {
  const ids = Array.from({ length: players }, () => randomUUID());
  const created = await createRoom(ids[0], {
    name: "Host",
    config: { mode: "free", players, rounds: 1, seconds: 0 },
  });
  for (const [i, id] of ids.slice(1).entries())
    await roomAction(created.code, id, { action: "join", name: `P${i + 1}` });
  return { code: created.code, ids };
}

test("players and spectators chat; everyone in the room sees it", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { code, ids } = await room();
  await roomAction(code, ids[0], { action: "chat", text: "  hi\nall  " });
  const watcher = randomUUID();
  await roomAction(code, watcher, { action: "spectate", name: "Viewer" });
  now += 1000;
  const view = await roomAction(code, watcher, {
    action: "chat",
    text: "good luck",
  });
  assert.deepEqual(
    view.chat?.map((m) => [m.name, m.text, !!m.spectator]),
    [
      ["Host", "hi all", false],
      ["Viewer", "good luck", true],
    ],
  );
  const other = await roomAction(code, ids[1]);
  assert.equal(other.chat?.length, 2);
  await assert.rejects(
    roomAction(code, randomUUID(), { action: "chat", text: "spam" }),
    /Join this room/,
  );
});

test("chat rejects empty, long and too-fast messages, and ignores a resend", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { code, ids } = await room();
  await assert.rejects(
    roomAction(code, ids[0], { action: "chat", text: "   " }),
    /Type a message/,
  );
  await assert.rejects(
    roomAction(code, ids[0], {
      action: "chat",
      text: "x".repeat(CHAT_MAX_LENGTH + 1),
    }),
    /under/,
  );
  const requestId = randomUUID();
  await roomAction(code, ids[0], { action: "chat", text: "one", requestId });
  // A lost reply resent with the same ID doesn't post twice or hit the limit.
  const resent = await roomAction(code, ids[0], {
    action: "chat",
    text: "one",
    requestId,
  });
  assert.equal(resent.chat?.length, 1);
  await assert.rejects(
    roomAction(code, ids[0], { action: "chat", text: "two" }),
    /Slow down/,
  );
  now += 800;
  await roomAction(code, ids[0], { action: "chat", text: "two" });
});

test("chat keeps only the most recent messages", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { code, ids } = await room();
  for (let i = 0; i < CHAT_LIMIT + 5; i++) {
    now += 1000;
    await roomAction(code, ids[i % 2], { action: "chat", text: `m${i}` });
  }
  const view = await roomAction(code, ids[0]);
  assert.equal(view.chat?.length, CHAT_LIMIT);
  assert.equal(view.chat?.[0].text, "m5");
  assert.equal(view.chat?.at(-1)?.text, `m${CHAT_LIMIT + 4}`);
});
