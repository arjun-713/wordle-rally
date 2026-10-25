import { randomInt } from "node:crypto";
import guesses from "@/data/guesses.json";
import { evaluateGuess, GameError, requireGame } from "./engine";
import { dailyPuzzle } from "./words";
import { compareAndSet, read } from "./store";
import { parseStats, recordPuzzle, statsKey } from "./stats";
import type { SoloGame, PublicSoloGame } from "./types";
const valid = new Set(guesses);
export async function dailyAction(
  id: string,
  input: Record<string, unknown> = { action: "start" },
  now = Date.now(),
): Promise<PublicSoloGame> {
  requireGame(
    ["read", "start", "guess"].includes(String(input.action)),
    "The daily challenge allows one puzzle each day.",
  );
  const puzzle = dailyPuzzle(now),
    key = `rally:daily:${id}:${puzzle.date}`,
    historyKey = `rally:history:${id}`;
  for (let retry = 0; retry < 12; retry++) {
    const original = await read(key);
    let game: SoloGame | null = original ? JSON.parse(original) : null;
    const writes: { key: string; expected: string | null; value: string }[] =
      [];
    if (!game) {
      requireGame(
        input.action !== "guess",
        "A new day has started. Refresh for today’s puzzle.",
        409,
      );
      const history = await read(historyKey),
        used: string[] = history ? JSON.parse(history) : [];
      // Older installations did not reserve daily words. Preserve their no-repeat promise.
      requireGame(
        !used.includes(puzzle.answer),
        "Today’s word is already in your earlier game history. Come back tomorrow for a fresh daily, or play Unlimited.",
        409,
      );
      game = {
        id: `daily:${puzzle.date}`,
        ...puzzle,
        guesses: [],
        status: "playing",
        revision: 0,
        stats: { played: 0, wins: 0, streak: 0, bestStreak: 0 },
      };
      writes.push({
        key: historyKey,
        expected: history,
        value: JSON.stringify([...used, puzzle.answer]),
      });
    } else if (input.action === "guess") {
      requireGame(
        input.gameId === game.id,
        "A new day has started. Refresh for today’s puzzle.",
        409,
      );
      requireGame(
        game.status === "playing",
        "You’ve finished today’s challenge. Come back tomorrow.",
      );
      requireGame(typeof input.word === "string", "Enter a five-letter word.");
      const word = input.word.toLowerCase();
      game.guesses.push(evaluateGuess(game.guesses, word, game.answer, valid));
      if (word === game.answer) game.status = "won";
      else if (game.guesses.length === 6) game.status = "lost";
      if (game.status !== "playing") {
        const raw = await read(statsKey(id)),
          book = parseStats(raw);
        recordPuzzle(
          book.daily,
          game.status === "won",
          game.guesses.length,
          puzzle.date,
        );
        writes.push({
          key: statsKey(id),
          expected: raw,
          value: JSON.stringify(book),
        });
      }
      game.revision++;
    }
    if (!original || input.action === "guess") {
      writes.unshift({ key, expected: original, value: JSON.stringify(game) });
      if (!(await compareAndSet(writes))) {
        await new Promise((r) => setTimeout(r, randomInt(5, 25)));
        continue;
      }
    }
    const { answer, ...publicGame } = game;
    return { ...publicGame, ...(game.status !== "playing" ? { answer } : {}) };
  }
  throw new GameError(
    "Your daily puzzle is busy in another tab. Refresh and try again.",
    409,
  );
}
