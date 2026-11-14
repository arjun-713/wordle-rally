import type { PublicRoom } from "./types";

// Mutation replies update the acting player immediately. Polls are for rivals
// and host-controlled transitions, with a separate wake-up at timed deadlines.
export function roomPollDelay(
  room: PublicRoom | null,
  quietFor: number,
  serverNow: number,
  failures = 0,
): number | null {
  if (failures) return Math.min(12000, 2000 * 2 ** Math.min(failures - 1, 3));
  if (!room) return 5000;
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
    return quietFor >= 120000 ? 30000 : quietFor >= 30000 ? 15000 : 5000;
  }
  // Never slow down an active round: rivals' boards and hints should stay
  // fresh while everyone is typing. Only quiet lobbies back off.
  let delay = room.current?.ended
    ? 2500
    : room.status === "lobby" && quietFor >= 45000
      ? 15000
      : 5000;
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
