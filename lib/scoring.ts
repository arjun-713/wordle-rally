import type { Config } from "./types";
export function pointsForGuess(
  config: Pick<Config, "scoring">,
  attempt: number,
): number {
  return config.scoring === "bonus" ? 7 - attempt : 1;
}
