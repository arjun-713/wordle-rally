import type { PublicRoom } from "./types";

// Polling is the main Redis cost (the free tier allows 500K commands a month),
// so each delay balances freshness against that budget. A player's own actions
// update their screen from the mutation reply; polls only bring in rivals'
// progress and host-driven changes. `quietFor` is how long the room has gone
// without a new revision, so idle rooms slow down and busy ones stay snappy.
export const POLL = {
  live: 2500, // a round or race with recent activity
  liveQuiet: 3500, // no changes for 30s
  idle: 8000, // no changes for 2 minutes: players likely away
  roundOver: 2000, // waiting for the host or auto-advance
  lobby: 3000,
  lobbyQuiet: 8000,
  lobbyIdle: 15000,
  finished: 5000,
  finishedIdle: 15000,
  retryMax: 4000,
} as const;

export function roomPollDelay(
  room: PublicRoom | null,
  quietFor: number,
  serverNow: number,
  failures = 0,
): number | null {
  // After a failed poll retry soon: 1s, 2s, then every 4s. Coming back online
  // also triggers an immediate poll.
  if (failures)
    return Math.min(POLL.retryMax, 1000 * 2 ** Math.min(failures - 1, 3));
  if (!room) return POLL.lobby;
  const me = room.players.find((p) => p.id === room.me);
  const watching = room.spectators?.some((s) => s.id === room.me);
  if (!me?.active && !watching) return null;
  if (
    room.status === "lobby" &&
    (room.match ?? 0) > 0 &&
    room.players.some((p) => !p.active)
  )
    return null;
  if (room.status === "finished") {
    if (room.host === room.me) return null;
    return quietFor >= 120000 ? POLL.finishedIdle : POLL.finished;
  }
  if (room.status === "lobby")
    return quietFor >= 300000
      ? POLL.lobbyIdle
      : quietFor >= 60000
        ? POLL.lobbyQuiet
        : POLL.lobby;
  if (room.current?.ended && !room.race) return POLL.roundOver;
  let delay: number =
    quietFor >= 120000
      ? POLL.idle
      : quietFor >= 30000
        ? POLL.liveQuiet
        : POLL.live;
  // Wake right after a timed round's deadline so results appear promptly.
  if (room.config.seconds !== 0 && room.current && !room.current.ended)
    delay = Math.min(
      delay,
      Math.max(150, room.current.endsAt - serverNow + 150),
    );
  // Fast Fingers closes a minute after the first complete run.
  const firstFinish = room.race?.standings.reduce<number | null>(
    (min, p) =>
      p.elapsed === null ? min : Math.min(min ?? p.elapsed, p.elapsed),
    null,
  );
  if (room.race && firstFinish != null)
    delay = Math.min(
      delay,
      Math.max(
        150,
        room.race.startedAt + firstFinish + 60000 - serverNow + 150,
      ),
    );
  return delay;
}
