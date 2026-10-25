import type { StatsBook, PerformanceStats } from "./types";
import { read } from "./store";
export const statsKey = (id: string) => `rally:stats:${id}`;
const empty = (): PerformanceStats => ({
  played: 0,
  wins: 0,
  streak: 0,
  bestStreak: 0,
  guesses: 0,
  distribution: [0, 0, 0, 0, 0, 0],
});
export function parseStats(raw: string | null): StatsBook {
  return raw
    ? JSON.parse(raw)
    : {
        unlimited: empty(),
        daily: empty(),
        multiplayer: empty(),
        matchesPlayed: 0,
        matchesWon: 0,
        points: 0,
      };
}
export async function getStats(id: string): Promise<StatsBook> {
  const book = parseStats(await read(statsKey(id)));
  if (
    book.daily.lastDay &&
    Date.parse(new Date().toISOString().slice(0, 10)) -
      Date.parse(book.daily.lastDay) >
      86400000
  )
    book.daily.streak = 0;
  return book;
}
export function recordPuzzle(
  stats: PerformanceStats,
  won: boolean,
  attempts: number,
  date?: string,
) {
  if (date && stats.lastDay === date) return;
  const consecutive =
    !date ||
    (!!stats.lastDay &&
      Date.parse(date) - Date.parse(stats.lastDay) === 86400000);
  stats.played++;
  if (won) {
    stats.wins++;
    stats.guesses += attempts;
    stats.distribution[attempts - 1]++;
    stats.streak = consecutive ? stats.streak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  } else stats.streak = 0;
  if (date) stats.lastDay = date;
}
