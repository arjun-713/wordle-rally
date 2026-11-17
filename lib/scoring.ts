import type { Config } from "./types";
export function pointsForGuess(
  config: Pick<Config, "scoring">,
  attempt: number,
): number {
  return config.scoring === "bonus" ? 7 - attempt : 1;
}

// Removing a player by vote needs 80% of the other active players (rounded
// up): 7 players means 5 of the other 6. Votes from players who have left
// don't count. Shared by the server and the vote meter so they always agree.
export const KICK_SHARE = 0.8;
export function kickVoteTally(
  players: { id: string; active: boolean }[],
  voters: string[],
  targetId: string,
) {
  const eligible = players.filter((p) => p.active && p.id !== targetId);
  const counted = voters.filter((v) => eligible.some((p) => p.id === v));
  return {
    votes: counted.length,
    needed: Math.max(1, Math.ceil(eligible.length * KICK_SHARE)),
  };
}
