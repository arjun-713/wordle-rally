import { randomInt, randomUUID } from "node:crypto";
import { pools } from "./words";
import { parseStats, recordPuzzle, statsKey } from "./stats";
import guesses from "@/data/guesses.json";
import type { PublicRoom, Room, RoundResult, StatsBook } from "./types";
import {
  begin,
  cleanName,
  GameError,
  requireGame,
  selectWords,
  settle,
  submitGuess,
  validateConfig,
  pointsForGuess,
} from "./engine";
import { compareAndSet, read, storageMode } from "./store";
const valid = new Set(guesses);
const roomKey = (code: string) => `rally:room:${code}`;
const historyKey = (id: string) => `rally:history:${id}`;
const TTL = 60 * 60 * 24;
export function publicRoom(
  room: Room,
  me: string,
  now = Date.now(),
): PublicRoom {
  const current = room.rounds[room.round];
  const { rounds, ...rest } = room;
  return {
    ...rest,
    me,
    serverTime: now,
    storage: storageMode(),
    current: current
      ? {
          guesses: current.guesses[me] ?? [],
          solved: current.solved,
          attempts: Object.fromEntries(
            room.players.map((p) => [p.id, current.guesses[p.id]?.length ?? 0]),
          ),
          endsAt: current.endsAt,
          ended: current.ended,
          ...(current.ended ? { answer: current.answer } : {}),
        }
      : null,
    results: rounds.filter((r) => r.ended).map((r) => roundResult(room, r)),
  };
}
export async function createRoom(
  id: string,
  input: Record<string, unknown>,
): Promise<PublicRoom> {
  const config = validateConfig(input.config),
    name = cleanName(input.name);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 10; i++) {
    const code = Array.from(
      { length: 6 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
    const room: Room = {
      code,
      config,
      host: id,
      players: [{ id, name, team: 0, score: 0, active: true }],
      status: "lobby",
      round: 0,
      rounds: [],
      createdAt: Date.now(),
      revision: 0,
    };
    if (
      await compareAndSet([
        {
          key: roomKey(code),
          expected: null,
          value: JSON.stringify(room),
          ttl: TTL,
        },
      ])
    )
      return publicRoom(room, id);
  }
  throw new GameError("Could not create a room. Please try again.", 503);
}
export async function roomAction(
  code: string,
  id: string,
  input: Record<string, unknown> = { action: "read" },
): Promise<PublicRoom> {
  requireGame(
    /^[A-Z2-9]{6}$/.test(code),
    "Enter a valid six-character room code.",
  );
  for (let retry = 0; retry < 12; retry++) {
    const key = roomKey(code),
      original = await read(key);
    requireGame(
      original,
      "Room not found. Check the code or ask your host to create a new room.",
      404,
    );
    const room: Room = JSON.parse(original);
    const before = JSON.stringify(room),
      now = Date.now();
    if (!room.matchId && room.status !== "lobby") room.matchId = randomUUID();
    const action = input.action;
    requireGame(
      typeof action === "string" &&
        [
          "read",
          "join",
          "start",
          "guess",
          "next",
          "leave",
          "team",
          "replay",
          "nextMatch",
        ].includes(action),
      "Unknown room action.",
    );
    let player = room.players.find((p) => p.id === id);
    if (action === "join") {
      const name = cleanName(input.name);
      if (player) {
        requireGame(
          player.active,
          "You have left this match. Join a new room.",
        );
        player.name = name;
      } else {
        requireGame(
          room.status === "lobby",
          "This match has already started. Join the next one.",
        );
        requireGame(
          (room.match ?? 0) === 0,
          "This championship’s roster is locked. Create a new room to play with a different group.",
          403,
        );
        requireGame(
          room.players.length < room.config.players,
          "This room is full.",
        );
        const team =
          room.players.filter((p) => p.team === 0).length <=
          room.players.filter((p) => p.team === 1).length
            ? 0
            : 1;
        player = { id, name, team, score: 0, active: true };
        room.players.push(player);
      }
    }
    requireGame(player, "Join this room before opening the match.", 403);
    if (
      (room.config.matches ?? 1) > 1 &&
      ["guess", "next", "start"].includes(String(action))
    )
      requireGame(
        input.match === (room.match ?? 0),
        "This championship has moved to another match. Refresh to continue.",
        409,
      );
    if (["guess", "next"].includes(String(action)))
      requireGame(
        !!room.matchId && input.matchId === room.matchId,
        "This match has changed. Refresh before playing again.",
        409,
      );
    settle(room, now);
    const extra: { key: string; expected: string | null; value: string }[] = [];
    const books = new Map<string, { raw: string | null; book: StatsBook }>();
    const bookFor = async (playerId: string) => {
      let entry = books.get(playerId);
      if (!entry) {
        const raw = await read(statsKey(playerId));
        entry = { raw, book: parseStats(raw) };
        books.set(playerId, entry);
      }
      return entry.book;
    };
    const recordFinished = async () => {
      if (room.rounds.some((r) => r.ended && !r.recorded))
        await Promise.all(room.players.map((p) => bookFor(p.id)));
      for (const r of room.rounds) {
        if (!r.ended || r.recorded) continue;
        for (const p of room.players) {
          const book = await bookFor(p.id),
            won = r.solved.includes(p.id),
            attempts = r.guesses[p.id]?.length ?? 0;
          recordPuzzle(book.multiplayer, won, attempts);
          if (won) book.points += pointsForGuess(room.config, attempts);
        }
        r.recorded = true;
      }
      if (
        room.status === "finished" &&
        !(room.matches ?? []).some((m) => m.number === (room.match ?? 0) + 1)
      ) {
        const teamTotals = [0, 1].map((team) =>
          room.players
            .filter((p) => p.team === team)
            .reduce((sum, p) => sum + p.score, 0),
        );
        const top = Math.max(...room.players.map((p) => p.score));
        for (const p of room.players) {
          const book = await bookFor(p.id);
          book.matchesPlayed++;
          if (
            room.config.mode === "teams"
              ? teamTotals[p.team] > 0 &&
                teamTotals[p.team] === Math.max(...teamTotals)
              : p.score > 0 && p.score === top
          )
            book.matchesWon++;
        }
        (room.matches ??= []).push({
          number: (room.match ?? 0) + 1,
          scores: room.players.map(({ id, name, team, score }) => ({
            id,
            name,
            team,
            score,
          })),
          rounds: room.rounds
            .filter((r) => r.ended)
            .map((r) => roundResult(room, r)),
        });
      }
    };
    await recordFinished();
    if (action === "start") {
      requireGame(room.host === id, "Only the host can start the match.", 403);
      requireGame(room.status === "lobby", "This match has already started.");
      if (room.config.mode === "teams")
        requireGame(
          room.players.filter((p) => p.team === 0).length === 2 &&
            room.players.filter((p) => p.team === 1).length === 2,
          "Each team needs exactly two players.",
        );
      const histories = await Promise.all(
        room.players.map(async (p) => ({
          key: historyKey(p.id),
          raw: await read(historyKey(p.id)),
        })),
      );
      const excluded = new Set<string>(
        histories.flatMap((h) =>
          h.raw ? (JSON.parse(h.raw) as string[]) : [],
        ),
      );
      const words = selectWords(
        pools[room.config.difficulty ?? "mixed"],
        excluded,
        room.config.rounds,
      );
      begin(room, words, now);
      for (const h of histories)
        extra.push({
          key: h.key,
          expected: h.raw,
          value: JSON.stringify([
            ...new Set([
              ...(h.raw ? (JSON.parse(h.raw) as string[]) : []),
              ...words,
            ]),
          ]),
        });
    } else if (action === "guess") {
      requireGame(typeof input.word === "string", "Enter a five-letter word.");
      submitGuess(
        room,
        player,
        input.word.toLowerCase(),
        Number(input.round),
        valid,
        now,
      );
    } else if (action === "next") {
      requireGame(room.host === id, "Only the host can advance rounds.", 403);
      requireGame(
        room.status === "playing" && room.rounds[room.round].ended,
        "Wait for this round to finish.",
      );
      requireGame(
        input.round === room.round,
        "The next round has already started.",
      );
      room.round++;
      room.rounds[room.round].startedAt = now;
      room.rounds[room.round].endsAt =
        room.config.seconds === 0 ? 0 : now + room.config.seconds * 1000;
    } else if (action === "team") {
      requireGame(
        room.status === "lobby" && room.config.mode === "teams",
        "Teams can only change in a team lobby.",
      );
      requireGame(
        (room.match ?? 0) === 0,
        "Teams stay fixed throughout a championship.",
      );
      requireGame(input.team === 0 || input.team === 1, "Choose a valid team.");
      requireGame(
        room.players.filter((p) => p.id !== id && p.team === input.team)
          .length < 2,
        "That team is full.",
      );
      player.team = input.team;
    } else if (action === "leave") {
      if (room.status === "lobby" && (room.match ?? 0) === 0)
        room.players = room.players.filter((p) => p.id !== id);
      else player.active = false;
      if (room.host === id)
        room.host = room.players.find((p) => p.active && p.id !== id)?.id ?? "";
      settle(room, now);
    } else if (action === "nextMatch") {
      requireGame(
        room.host === id && room.status === "finished",
        "Only the host can advance the championship after a match.",
        403,
      );
      requireGame(
        input.match === (room.match ?? 0),
        "The next match has already been set up.",
        409,
      );
      requireGame(
        (room.match ?? 0) + 1 < (room.config.matches ?? 1),
        "This championship is complete.",
      );
      requireGame(
        room.players.every((p) => p.active),
        "A player has left. Set up a new championship with a full group.",
      );
      room.match = (room.match ?? 0) + 1;
      room.players = room.players.map((p) => ({ ...p, score: 0 }));
      room.status = "lobby";
      room.round = 0;
      room.rounds = [];
    } else if (action === "replay") {
      requireGame(
        room.host === id && room.status === "finished",
        "Only the host can set up a rematch after the final round.",
        403,
      );
      requireGame(
        (room.config.matches ?? 1) <= (room.match ?? 0) + 1,
        "Finish the championship before setting up a rematch.",
      );
      room.match = 0;
      room.matches = [];
      room.players = room.players
        .filter((p) => p.active)
        .map((p) => ({ ...p, score: 0 }));
      room.status = "lobby";
      room.round = 0;
      room.rounds = [];
    }
    await recordFinished();
    for (const [playerId, { raw, book }] of books)
      extra.push({
        key: statsKey(playerId),
        expected: raw,
        value: JSON.stringify(book),
      });
    if (JSON.stringify(room) === before) return publicRoom(room, id, now);
    room.revision++;
    if (
      await compareAndSet([
        { key, expected: original, value: JSON.stringify(room), ttl: TTL },
        ...extra,
      ])
    )
      return publicRoom(room, id, now);
    await new Promise((r) => setTimeout(r, randomInt(5, 25)));
  }
  throw new GameError(
    "The room is busy. Your action was not saved; please retry.",
    409,
  );
}

function roundResult(room: Room, r: Room["rounds"][number]): RoundResult {
  return {
    answer: r.answer,
    solved: r.solved,
    players: room.players.map((p) => {
      const won = r.solved.includes(p.id),
        attempts = r.guesses[p.id]?.length ?? 0;
      return {
        id: p.id,
        name: p.name,
        guesses: attempts,
        solved: won,
        points: won ? pointsForGuess(room.config, attempts) : 0,
        elapsed:
          won && r.startedAt && r.solvedAt?.[p.id]
            ? Math.max(0, r.solvedAt[p.id] - r.startedAt)
            : null,
      };
    }),
  };
}
