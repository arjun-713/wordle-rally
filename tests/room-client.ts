import { roomAction as performAction } from "../lib/service";
import { read } from "../lib/store";
export { createRoom } from "../lib/service";
// Simulate a client carrying the match ID received with its room snapshot.
// Explicit stale IDs are preserved for regressions; no game rules are duplicated.
export async function roomAction(
  code: string,
  id: string,
  input: Record<string, unknown> = { action: "read" },
) {
  if (
    ["guess", "next"].includes(String(input.action)) &&
    !("matchId" in input)
  ) {
    const raw = await read(`rally:room:${code}`);
    input = { ...input, matchId: raw ? JSON.parse(raw).matchId : undefined };
  }
  return performAction(code, id, input);
}
