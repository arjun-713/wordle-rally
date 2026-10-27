import { mutateGame } from "./mutation-cache";
import { randomUUID } from "node:crypto";
import { difficulty, pools } from "./words";
import { parseStats, recordPuzzle, statsKey } from "./stats";
import guesses from "@/data/guesses.json";
import { evaluateGuess, requireGame, selectWords } from "./engine";
import { read, compareAndSet } from "./store";
import type { SoloGame, PublicSoloGame } from "./types";
const valid = new Set(guesses);
// Bound the no-repeat history so it does not grow forever; older words recycle.
const HISTORY_LIMIT = 600;
function publicSolo(game: SoloGame): PublicSoloGame {
  const { answer, ...rest } = game;
  return { ...rest, ...(game.status !== "playing" ? { answer } : {}) };
}
export async function soloAction(
  id: string,
  input: Record<string, unknown> = { action: "read" },
): Promise<PublicSoloGame | null> {
  const key = `rally:solo:${id}`,
    historyKey = `rally:history:${id}`;
  requireGame(
    ["read", "start", "next", "guess"].includes(String(input.action)),
    "Unknown solo action.",
  );
  return mutateGame<PublicSoloGame | null>({
    key,
    optimistic: input.action === "guess",
    load: () => read(key),
    busyMessage: "Your puzzle is busy in another tab. Refresh and try again.",
    attempt: async (original, conflict) => {
      let game: SoloGame | null = original ? JSON.parse(original) : null;
      if (input.action === "read") return game ? publicSolo(game) : null;
      if (input.action === "start" && game) return publicSolo(game);
      const writes: { key: string; expected: string | null; value: string }[] =
        [];
      if (input.action === "start" || input.action === "next") {
        if (input.action === "next") {
          requireGame(
            game && game.id === input.gameId,
            "This puzzle changed in another tab. Refresh to continue.",
            409,
          );
          requireGame(
            game.status !== "playing",
            "Finish this puzzle before starting the next word.",
          );
        }
        const history = await read(historyKey);
        const used: string[] = history ? JSON.parse(history) : [];
        const level = difficulty(
          input.difficulty ?? game?.difficulty ?? "mixed",
        );
        const [answer] = selectWords(pools[level], new Set(used), 1);
        game = {
          id: randomUUID(),
          difficulty: level,
          answer,
          guesses: [],
          status: "playing",
          stats: game?.stats ?? {
            played: 0,
            wins: 0,
            streak: 0,
            bestStreak: 0,
          },
          revision: (game?.revision ?? -1) + 1,
        };
        writes.push({
          key: historyKey,
          expected: history,
          value: JSON.stringify(
            [...new Set([...used.filter((w) => w !== answer), answer])].slice(
              -HISTORY_LIMIT,
            ),
          ),
        });
      } else {
        requireGame(
          game && game.id === input.gameId,
          "This puzzle changed in another tab. Refresh to continue.",
          409,
        );
        requireGame(
          game.status === "playing",
          "This puzzle is over. Choose Next word to keep playing.",
        );
        requireGame(
          typeof input.word === "string",
          "Enter a five-letter word.",
        );
        game.guesses.push(
          evaluateGuess(
            game.guesses,
            input.word.toLowerCase(),
            game.answer,
            valid,
          ),
        );
        if (input.word.toLowerCase() === game.answer) game.status = "won";
        else if (game.guesses.length === 6) game.status = "lost";
        if (game.status !== "playing") {
          const rawStats = await read(statsKey(id));
          const book = parseStats(rawStats);
          recordPuzzle(
            book.unlimited,
            game.status === "won",
            game.guesses.length,
          );
          writes.push({
            key: statsKey(id),
            expected: rawStats,
            value: JSON.stringify(book),
          });
          game.stats.played++;
          if (game.status === "won") {
            game.stats.wins++;
            game.stats.streak++;
            game.stats.bestStreak = Math.max(
              game.stats.bestStreak,
              game.stats.streak,
            );
          } else game.stats.streak = 0;
        }
        game.revision++;
      }
      writes.unshift({ key, expected: original, value: JSON.stringify(game) });
      if (await compareAndSet(writes, conflict)) return publicSolo(game);
    },
  });
}
