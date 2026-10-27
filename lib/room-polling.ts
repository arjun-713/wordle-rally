import type { PublicRoom } from "./types";

// Mutation replies update the acting player immediately. Polls are for rivals
// and host-controlled transitions, with a separate wake-up at timed deadlines.
export function roomPollDelay(
  room: PublicRoom | null,
  quietFor: number,
  serverNow: number,
  failures = 0,
): number | null {
  if (failures) return Math.min(8000, 1000 * 2 ** Math.min(failures - 1, 3));
  if (!room) return 1000;
  const me = room.players.find((p) => p.id === room.me);
  if (!me?.active) return null;
  if (
    room.status === "lobby" &&
    (room.match ?? 0) > 0 &&
    room.players.some((p) => !p.active)
  )
    return null;
  if (room.status === "finished") {
    if (room.host === room.me) return null;
    return quietFor >= 120000 ? 5000 : 1000;
  }
  const liveRound =
    room.status === "playing" && !!room.current && !room.current.ended;
  let delay = room.current?.ended ? 750 : quietFor >= 120000 ? 3000 : 1000;
  // Ghost boards show rivals' rows, so a live round polls faster until it has
  // been quiet for two minutes (rivals likely idle or away).
  if (liveRound) delay = quietFor >= 120000 ? 3000 : 750;
  // Fast Fingers closes a minute after the first complete run; wake right
  // after that cutoff so results appear without waiting out a slow poll.
  const firstFinish = room.race?.standings.reduce<number | null>(
    (min, p) =>
      p.elapsed === null ? min : Math.min(min ?? p.elapsed, p.elapsed),
    null,
  );
  if (room.status === "playing" && room.race && firstFinish != null)
    delay = Math.min(
      delay,
      Math.max(
        150,
        room.race.startedAt + firstFinish + 60000 - serverNow + 150,
      ),
    );
  if (
    room.status === "playing" &&
    room.config.seconds !== 0 &&
    room.current &&
    !room.current.ended
  )
    delay = Math.min(
      delay,
      Math.max(150, room.current.endsAt - serverNow + 150),
    );
  return delay;
}
