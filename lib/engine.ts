import { pointsForGuess } from "./scoring";
import { randomInt, randomUUID } from "node:crypto";
import type { Config, Guess, Mark, Player, Room } from "./types";

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireGame(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new GameError(message, status);
}
export function validateConfig(input: unknown): Config {
  const c = input as Config | undefined;
  requireGame(
    c && ["duel", "teams", "free"].includes(c.mode),
    "Choose a valid game mode.",
  );
  requireGame(
    Number.isInteger(c.players) && c.players >= 2 && c.players <= 16,
    "Choose between 2 and 16 players.",
  );
  requireGame(
    c.mode !== "duel" || c.players === 2,
    "Duels need exactly 2 players.",
  );
  requireGame(
    c.mode !== "teams" || c.players === 4,
    "Team battles need exactly 4 players.",
  );
  requireGame(
    Number.isInteger(c.rounds) && c.rounds >= 1 && c.rounds <= 20,
    "Choose between 1 and 20 rounds.",
  );
  requireGame(
    [0, 30, 60, 90, 120, 180, 300].includes(c.seconds),
    "Choose a supported time limit.",
  );
  requireGame(
    c.scoring === undefined || ["classic", "bonus"].includes(c.scoring),
    "Choose a valid scoring mode.",
  );
  requireGame(
    c.difficulty === undefined ||
      ["familiar", "challenging", "mixed"].includes(c.difficulty),
    "Choose a valid difficulty.",
  );
  requireGame(
    c.matches === undefined ||
      (Number.isInteger(c.matches) && c.matches >= 1 && c.matches <= 10),
    "Choose between 1 and 10 matches.",
  );
  return {
    ...(c.scoring ? { scoring: c.scoring } : {}),
    ...(c.difficulty ? { difficulty: c.difficulty } : {}),
    ...(c.matches ? { matches: c.matches } : {}),
    mode: c.mode,
    players: c.players,
    rounds: c.rounds,
    seconds: c.seconds,
  };
}
export function cleanName(value: unknown): string {
  requireGame(typeof value === "string", "Enter your player name.");
  const name = value.trim().replace(/\s+/g, " ");
  requireGame(
    name.length >= 1 && name.length <= 20 && !/[\x00-\x1f\x7f]/.test(name),
    "Use a name between 1 and 20 characters.",
  );
  return name;
}
export function markGuess(word: string, answer: string): Mark[] {
  const marks: Mark[] = Array(5).fill("absent");
  const remaining = answer.split("");
  for (let i = 0; i < 5; i++)
    if (word[i] === answer[i]) {
      marks[i] = "correct";
      remaining[i] = "";
    }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === "correct") continue;
    const index = remaining.indexOf(word[i]);
    if (index !== -1) {
      marks[i] = "present";
      remaining[index] = "";
    }
  }
  return marks;
}
export function selectWords(
  pool: string[],
  excluded: Set<string>,
  count: number,
): string[] {
  const available = pool.filter((w) => !excluded.has(w));
  requireGame(
    available.length >= count,
    "This group has used the available answer pool. Try fewer rounds or expand the curated dictionary.",
  );
  for (let i = 0; i < count; i++) {
    const j = randomInt(i, available.length);
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}
export function settle(room: Room, now: number): void {
  if (room.status !== "playing") return;
  const round = room.rounds[room.round];
  if (round.ended) return;
  if (
    (room.config.seconds !== 0 && now >= round.endsAt) ||
    room.players.every(
      (p) =>
        !p.active ||
        round.solved.includes(p.id) ||
        (round.guesses[p.id]?.length ?? 0) >= 6,
    )
  ) {
    round.ended = true;
    if (room.round === room.config.rounds - 1) room.status = "finished";
  }
}
export function begin(room: Room, words: string[], now: number): void {
  requireGame(room.status === "lobby", "This match has already started.");
  requireGame(
    room.players.length === room.config.players &&
      room.players.every((p) => p.active),
    `Waiting for all ${room.config.players} players to join.`,
  );
  room.matchId = randomUUID();
  room.rounds = words.map((answer) => ({
    answer,
    guesses: {},
    solved: [],
    endsAt: 0,
    ended: false,
    startedAt: 0,
    solvedAt: {},
  }));
  room.round = 0;
  room.status = "playing";
  room.rounds[0].startedAt = now;
  room.rounds[0].endsAt =
    room.config.seconds === 0 ? 0 : now + room.config.seconds * 1000;
}
export function submitGuess(
  room: Room,
  player: Player,
  word: string,
  roundIndex: number,
  valid: Set<string>,
  now: number,
): Guess {
  settle(room, now);
  requireGame(
    room.status === "playing" &&
      room.round === roundIndex &&
      !room.rounds[room.round].ended,
    "This round has ended. Wait for the next round.",
  );
  const round = room.rounds[room.round];
  requireGame(player.active, "You have left this match.");
  requireGame(
    !round.solved.includes(player.id),
    "You already solved this round.",
  );
  const guesses = (round.guesses[player.id] ??= []);
  requireGame(
    guesses.length < 6,
    "You have used all six guesses. Other players can still finish.",
  );
  const guess = evaluateGuess(guesses, word, round.answer, valid);
  guesses.push(guess);
  if (word === round.answer) {
    round.solved.push(player.id);
    player.score += pointsForGuess(room.config, guesses.length);
    (round.solvedAt ??= {})[player.id] = now;
  }
  settle(room, now);
  return guess;
}

export function evaluateGuess(
  guesses: Guess[],
  word: string,
  answer: string,
  valid: Set<string>,
): Guess {
  requireGame(
    /^[a-z]{5}$/.test(word) && valid.has(word),
    "That word is not in the dictionary. Try another five-letter word.",
  );
  requireGame(
    !guesses.some((g) => g.word === word),
    "You already tried that word.",
  );
  return { word, marks: markGuess(word, answer) };
}

export { pointsForGuess } from "./scoring";
