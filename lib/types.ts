export type Difficulty = "familiar" | "challenging" | "mixed";
export type Scoring = "classic" | "bonus";
export type Mode = "duel" | "teams" | "free";
export type Mark = "correct" | "present" | "absent";
export type Config = {
  mode: Mode;
  players: number;
  rounds: number;
  seconds: number; // 0 means no time limit.
  scoring?: Scoring;
  difficulty?: Difficulty;
  matches?: number; // More than one creates a championship.
};
export type Guess = { word: string; marks: Mark[] };
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
export type Room = {
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
};
export type PublicRoom = Omit<Room, "rounds"> & {
  me: string;
  serverTime: number;
  storage: "local" | "redis";
  current: {
    guesses: Guess[];
    solved: string[];
    attempts: Record<string, number>;
    endsAt: number;
    ended: boolean;
    answer?: string;
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
