import { POLL } from "./room-polling";

// Upstash's free tier allows 500K commands a month. The app is tuned for about
// 200 four-player games a month, with 500 as the worst case, so a 4-player
// game should stay under ~1,000 commands even when no reads are shared.
export const MONTHLY_COMMANDS = 500_000;

export type GameShape = {
  players: number;
  rounds: number;
  lobbySeconds: number; // time from room creation to start
  lobbyFullSeconds: number; // part of that with every seat filled
  roundSeconds: number; // average time a round is live
  betweenRoundsSeconds: number; // results showing, waiting for "Next round"
  guessesPerRound: number; // per player
  chatMessages: number; // whole room, whole game
};

export const TYPICAL_GAME: GameShape = {
  players: 4,
  rounds: 5,
  lobbySeconds: 120,
  lobbyFullSeconds: 30,
  roundSeconds: 90,
  betweenRoundsSeconds: 10,
  guessesPerRound: 4,
  chatMessages: 30,
};

// Worst-case Redis commands for one game: every poll is its own read (no
// sharing between players on the same server instance), rooms stay busy so
// polling never slows down for quiet, and every guess pays a rate-limit
// booking share. Real games use less because polls are shared.
export function worstCaseCommands(game: GameShape = TYPICAL_GAME): number {
  // While seats are filling, polls never slow below POLL.lobby in the worst
  // case; once full they run at POLL.lobbyReady until the host starts.
  const filling = Math.max(0, game.lobbySeconds - game.lobbyFullSeconds);
  const lobbyPolls =
    filling / (POLL.lobby / 1000) +
    game.lobbyFullSeconds / (POLL.lobbyReady / 1000);
  const roundPolls =
    game.rounds *
    (game.roundSeconds / (POLL.live / 1000) +
      game.betweenRoundsSeconds / (POLL.roundOver / 1000));
  const polls = game.players * (lobbyPolls + roundPolls);
  // A guess is one write (the room copy is reused); rate limits book 10 at a time.
  const guesses = game.players * game.rounds * game.guessesPerRound * 1.1;
  // A chat message is one room write; no extra reads (it rides on polls).
  const chat = game.chatMessages * 1.1;
  // Creating, joining (read + write each) and starting (history read + write).
  const setup = 2 + game.players * 2 + 3;
  return Math.ceil(polls + guesses + chat + setup);
}
