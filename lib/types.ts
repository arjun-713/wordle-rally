export type Difficulty = "familiar" | "challenging" | "mixed";
export type Scoring = "classic" | "bonus";
export type Mode = "duel" | "teams" | "free" | "race";
export type Mark = "correct" | "present" | "absent";
export type Config = {
  mode: Mode;
  players: number;
  rounds: number;
  seconds: number; // 0 means no time limit.
  scoring?: Scoring;
  difficulty?: Difficulty;
  matches?: number; // More than one creates a championship.
  autoAdvance?: boolean;
};
export type Guess = { word: string; marks: Mark[] };
export type GhostRow = { marks: Mark[] };
export type SoloStats = {
  played: number;
  wins: number;
  streak: number;
  bestStreak: number;
};
export type SoloGame = {
  id: string;
  answer: string;
  guesses: Guess[];
  status: "playing" | "won" | "lost";
  stats: SoloStats;
  revision: number;
  difficulty?: Difficulty;
  date?: string;
  number?: number;
  resetsAt?: number;
};
export type PublicSoloGame = Omit<SoloGame, "answer"> & { answer?: string };
export type Player = {
  id: string;
  name: string;
  team: number;
  score: number;
  active: boolean;
};
export type Round = {
  answer: string;
  guesses: Record<string, Guess[]>;
  solved: string[];
  endsAt: number;
  ended: boolean;
  startedAt?: number;
  solvedAt?: Record<string, number>;
  recorded?: boolean;
  // Last committed guess request per player. A retried request with the same
  // ID returns the saved board instead of consuming another attempt.
  guessRequests?: Record<string, string>;
  firstSolve?: string;
  skipVotes?: string[];
};
export type RoundResult = {
  answer: string;
  solved: string[];
  players: {
    id: string;
    name: string;
    guesses: number;
    points: number;
    solved: boolean;
    elapsed: number | null;
  }[];
};
export type MatchResult = {
  number: number;
  scores: { id: string; name: string; team: number; score: number }[];
  rounds: RoundResult[];
};
export type RaceStanding = {
  id: string;
  name: string;
  points: number;
  solved: number;
  resolved: boolean;
  elapsed: number | null;
  pointsScore: number;
  speedScore: number;
  total: number | null;
};
// Per-word state for a player's Fast Fingers run, without letters.
export type RaceWordState = "open" | "started" | "solved" | "wasted";
export type PublicRace = {
  startedAt: number;
  endedAt?: number;
  average: number | null;
  words: {
    guesses: Guess[];
    solved: boolean;
    exhausted: boolean;
    answer?: string;
  }[];
  standings: RaceStanding[];
  progress: Record<string, RaceWordState[]>;
};
export type Room = {
  race?: {
    startedAt: number;
    finishedAt: Record<string, number>;
    endedAt?: number;
  };
  matchId?: string;
  match?: number;
  matches?: MatchResult[];
  code: string;
  host: string;
  config: Config;
  players: Player[];
  status: "lobby" | "playing" | "finished";
  rounds: Round[];
  round: number;
  createdAt: number;
  revision: number;
  banned?: string[];
  banVotes?: Record<string, string[]>;
  inviteToken?: string;
  ips?: Record<string, string>;
  bannedIps?: string[];
  spectators?: { id: string; name: string }[];
};
export type PublicRoom = Omit<
  Room,
  "rounds" | "race" | "ips" | "bannedIps" | "banned"
> & {
  race?: PublicRace;
  me: string;
  serverTime: number;
  storage: "local" | "redis";
  current: {
    guesses: Guess[];
    solved: string[];
    attempts: Record<string, number>;
    endsAt: number;
    ended: boolean;
    startedAt?: number;
    firstSolve?: string;
    skipVotes?: string[];
    answer?: string;
    // Other players' rows this round, as colour marks only.
    ghosts?: Record<string, GhostRow[]>;
  } | null;
  results: RoundResult[];
};
export const MODES: Record<
  Mode,
  { title: string; label: string; description: string }
> = {
  duel: {
    title: "The duel",
    label: "1 vs 1",
    description: "One friend. One very personal rivalry.",
  },
  teams: {
    title: "Team battle",
    label: "2 vs 2",
    description: "Two on a side. Every solve helps your team.",
  },
  free: {
    title: "Free-for-all",
    label: "1 vs all",
    description: "The whole group. Every player for themselves.",
  },
  race: {
    title: "Fast Fingers",
    label: "Fast Fingers",
    description:
      "Solve the set. Skip and return. Points and speed split 50/50.",
  },
};

export type PerformanceStats = {
  played: number;
  wins: number;
  streak: number;
  bestStreak: number;
  guesses: number;
  distribution: number[];
  lastDay?: string;
};
export type StatsBook = {
  unlimited: PerformanceStats;
  daily: PerformanceStats;
  multiplayer: PerformanceStats;
  matchesPlayed: number;
  matchesWon: number;
  points: number;
};

export type RoomSyncReply =
  PublicRoom | { unchanged: true; revision: number; serverTime: number };
