import type { Player, Room, RaceStanding } from "./types";
import { evaluateGuess, requireGame } from "./engine";
const rounded = (value: number) => Math.round(value * 10) / 10;
export const resolvedWord = (room: Room, index: number, id: string) =>
  room.rounds[index].solved.includes(id) ||
  (room.rounds[index].guesses[id]?.length ?? 0) >= 6;
export function raceStandings(room: Room): {
  standings: RaceStanding[];
  average: number | null;
} {
  const finishers = room.players.filter(
    (p) =>
      room.rounds.length > 0 &&
      room.rounds.every((r) => r.solved.includes(p.id)) &&
      room.race?.finishedAt[p.id] !== undefined,
  );
  const times = finishers.map((p) =>
    Math.max(1, room.race!.finishedAt[p.id] - room.race!.startedAt),
  );
  const average = times.length
    ? times.reduce((sum, time) => sum + time, 0) / times.length
    : null;
  const standings = room.players
    .map((player) => {
      const solved = room.rounds.filter((r) =>
        r.solved.includes(player.id),
      ).length;
      const finished = finishers.some((p) => p.id === player.id);
      const elapsed = finished
        ? Math.max(1, room.race!.finishedAt[player.id] - room.race!.startedAt)
        : null;
      const pointsScore = rounded(
        (50 * player.score) / (6 * room.config.rounds),
      );
      const speedScore =
        elapsed !== null && average !== null
          ? rounded((50 * average) / (average + elapsed))
          : 0;
      return {
        id: player.id,
        name: player.name,
        points: player.score,
        solved,
        resolved:
          room.rounds.length > 0 &&
          room.rounds.every((_, index) => resolvedWord(room, index, player.id)),
        elapsed,
        pointsScore,
        speedScore,
        total: elapsed !== null ? rounded(pointsScore + speedScore) : null,
      };
    })
    .sort(
      (a, b) =>
        (b.total ?? -1) - (a.total ?? -1) ||
        b.points - a.points ||
        a.name.localeCompare(b.name),
    );
  return { standings, average };
}
// Once someone completes every word, the rest get a bounded window to finish.
// Without it, one idle player who never leaves would hold the race open forever.
export const RACE_GRACE_MS = 60000;
export function raceDeadline(room: Room): number | null {
  const finishes = Object.values(room.race?.finishedAt ?? {});
  return finishes.length ? Math.min(...finishes) + RACE_GRACE_MS : null;
}
export function settleRace(room: Room, now = Date.now()) {
  if (room.status !== "playing" || !room.race) return;
  const active = room.players.filter((player) => player.active);
  const deadline = raceDeadline(room);
  if (
    (deadline !== null && now >= deadline) ||
    active.every((player) =>
      room.rounds.every((_, index) => resolvedWord(room, index, player.id)),
    )
  ) {
    room.status = "finished";
    room.race.endedAt = deadline !== null && now >= deadline ? deadline : now;
    room.rounds.forEach((round) => {
      round.ended = true;
    });
  }
}
export function submitRaceGuess(
  room: Room,
  player: Player,
  word: string,
  index: number,
  valid: Set<string>,
  now: number,
) {
  settleRace(room, now);
  requireGame(room.status === "playing" && room.race, "This race has ended.");
  requireGame(player.active, "You have left this race.");
  requireGame(
    Number.isInteger(index) && index >= 0 && index < room.rounds.length,
    "Choose a word in this race.",
  );
  const round = room.rounds[index];
  requireGame(
    !round.solved.includes(player.id),
    "You already solved this word.",
  );
  const guesses = (round.guesses[player.id] ??= []);
  requireGame(
    guesses.length < 6,
    "This word is exhausted. It earns no points.",
  );
  guesses.push(evaluateGuess(guesses, word, round.answer, valid));
  if (word === round.answer) {
    round.solved.push(player.id);
    player.score += 7 - guesses.length;
    (round.solvedAt ??= {})[player.id] = now;
  }
  if (room.rounds.every((r) => r.solved.includes(player.id)))
    room.race.finishedAt[player.id] = now;
  settleRace(room, now);
}
