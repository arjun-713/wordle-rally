import guesses from "@/data/guesses.json";
import { requireGame } from "./engine";

const valid = new Set(guesses);

// Reject impossible guesses before spending Redis commands. Membership,
// duplicate guesses, deadlines and scoring still belong to the game engine.
export function validateGuessInput(input: Record<string, unknown>) {
  if (input.action !== "guess") return;
  requireGame(
    typeof input.word === "string" && /^[a-z]{5}$/i.test(input.word),
    "Enter a five-letter word.",
    400,
    "INVALID_GUESS",
  );
  requireGame(
    valid.has(input.word.toLowerCase()),
    "That word is not in our dictionary.",
    400,
    "INVALID_GUESS",
  );
}
