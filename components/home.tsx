"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Flag,
  Hash,
  MoveUpRight,
  Plus,
  Swords,
  Trophy,
  UserRound,
  Users,
  Zap,
  Asterisk,
  Infinity as InfinityIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODES, type Config, type Mode, type PublicRoom } from "@/lib/types";
import { PreferencesButton } from "./preferences";
import { api, Footer, Logo, Modal, Rules, savedName, saveName } from "./shared";

const previewRows = [
  { word: "CRANE", marks: ["absent", "absent", "absent", "absent", "correct"] },
  {
    word: "SPITE",
    marks: ["correct", "absent", "correct", "absent", "correct"],
  },
  {
    word: "SMILE",
    marks: ["correct", "correct", "correct", "correct", "correct"],
  },
];
export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("free");
  const [panel, setPanel] = useState<
    "create" | "join" | "rules" | "name" | null
  >(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [players, setPlayers] = useState(4);
  const [rounds, setRounds] = useState(5);
  const [seconds, setSeconds] = useState(90);
  const [scoring, setScoring] = useState<"classic" | "bonus">("classic");
  const [difficulty, setDifficulty] = useState<
    "familiar" | "challenging" | "mixed"
  >("mixed");
  const [matches, setMatches] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setName(savedName());
  }, []);
  const open = (next: typeof panel) => {
    setError("");
    setPanel(next);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Choose a player name to enter the room.");
      return;
    }
    if (panel === "name") {
      saveName(name);
      setPanel(null);
      return;
    }
    setBusy(true);
    try {
      saveName(name);
      const config: Config = {
        mode,
        players: mode === "duel" ? 2 : mode === "teams" ? 4 : players,
        rounds,
        seconds,
        scoring,
        difficulty,
        matches,
      };
      const room =
        panel === "create"
          ? await api<PublicRoom>("/api/rooms", { name, config })
          : await api<PublicRoom>(`/api/rooms/${code.toUpperCase()}`, {
              action: "join",
              name,
            });
      router.push(`/room/${room.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="site-shell">
      <header className="header">
        <Logo />
        <nav aria-label="Main navigation">
          <PreferencesButton />
          <Link
            href="/stats"
            className="text-button"
            aria-label="Personal statistics"
          >
            <Trophy size={17} />
            <span>Stats</span>
          </Link>
          <button
            className="text-button how-button"
            onClick={() => open("rules")}
          >
            <CircleHelp size={17} /> How to play
          </button>
          <button
            className="profile-button"
            aria-label={name || "Set your name"}
            onClick={() => open("name")}
          >
            <span className="avatar small">
              <UserRound size={17} />
            </span>
            <span>{name || "Set your name"}</span>
          </button>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Good words.
              <br />
              Great{" "}
              <span className="rivals">
                rivals
                <svg viewBox="0 0 300 20" aria-hidden="true">
                  <path d="M4 13Q145 -3 293 10M45 18Q170 9 265 15" />
                </svg>
              </span>
              .
            </h1>
            <p className="hero-description">
              The word game you know.
              <br />
              The friends you want to beat.
            </p>
            <p className="hero-detail">
              Same word. Six guesses. Race your friends through
              <br className="desktop-break" /> round after round of friendly
              competition.
            </p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => open("create")}>
                <Plus size={20} /> Create a room <ArrowRight size={19} />
              </button>
              <button className="button secondary" onClick={() => open("join")}>
                <Hash size={18} /> Join a room
              </button>
            </div>
            <div className="solo-entries">
              <Link className="solo-entry" href="/daily">
                <Flag size={18} /> Play today’s challenge{" "}
                <ArrowRight size={15} />
              </Link>
              <Link className="solo-entry" href="/unlimited">
                <InfinityIcon size={18} /> Play Wordle Unlimited{" "}
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="quick-facts">
              <span>
                <Check size={14} /> No account needed
              </span>
              <span>
                <Users size={14} /> 2–16 friends
              </span>
            </div>
          </div>
          <div
            className="hero-art"
            role="img"
            aria-label="Illustrative match preview: a player solves SMILE in three guesses"
          >
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="rival-slip">
              <span className="avatar ochre">
                <UserRound size={18} />
              </span>
              <div>
                <strong>Your rival</strong>
                <span>Still thinking…</span>
              </div>
              <span className="thinking-dots">•••</span>
            </div>
            <div className="preview-board">
              <div className="preview-top">
                <span>
                  <span className="live-dot" /> A little friendly competition
                </span>
                <small>PREVIEW</small>
              </div>
              <div className="preview-info">
                <span>
                  ROUND <strong>03 / 05</strong>
                </span>
                <span>
                  <Clock3 size={14} /> 00:42
                </span>
              </div>
              <div className="preview-grid">
                {previewRows.map((row, r) => (
                  <div className="tile-row" key={row.word}>
                    {row.word.split("").map((letter, c) => (
                      <span
                        className={`tile ${row.marks[c]} ${r === 2 ? "winning-tile" : ""}`}
                        style={{ "--cell": c } as React.CSSProperties}
                        key={c}
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                ))}
                <div className="tile-row ghost-row">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span className="tile" key={i} />
                  ))}
                </div>
              </div>
              <div className="preview-win">
                <span className="win-check">
                  <Check size={18} />
                </span>
                <span>That’s the word!</span>
                <strong>+1 point</strong>
              </div>
              <div className="preview-player">
                <span className="avatar">
                  <UserRound size={18} />
                </span>
                <span>You, probably</span>
                <span className="mini-points">
                  3 <span>pts</span>
                </span>
              </div>
            </div>
            <div className="score-ticket">
              <span className="trophy-circle">
                <Trophy size={24} />
              </span>
              <div>
                <strong>Nice one.</strong>
                <span>Let the bragging begin.</span>
              </div>
              <Asterisk className="ticket-star" size={28} aria-hidden="true" />
            </div>
            <div className="art-caption">
              <MoveUpRight size={30} />
              <span>
                Same Wordle energy.
                <br />A lot more rivalry.
              </span>
            </div>
          </div>
        </section>
        <section className="mode-section" aria-labelledby="modes-title">
          <div className="section-heading">
            <h2 id="modes-title">Pick your kind of rivalry.</h2>
            <p>One-on-one or the whole group chat.</p>
          </div>
          <div className="mode-grid">
            {(Object.keys(MODES) as Mode[]).map((m, i) => (
              <button
                className={`mode-option ${mode === m ? "selected" : ""}`}
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
              >
                <span
                  className={`mode-illustration mode-${m}`}
                  aria-hidden="true"
                >
                  {m === "duel" ? (
                    <>
                      <span className="letter-piece">U</span>
                      <Swords size={24} />
                      <span className="letter-piece ochre-piece">R</span>
                    </>
                  ) : m === "teams" ? (
                    <>
                      <span className="double-pieces">
                        <i>U</i>
                        <i>S</i>
                      </span>
                      <span className="versus">vs</span>
                      <span className="double-pieces yellow">
                        <i>U</i>
                        <i>S</i>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="letter-piece">U</span>
                      <span className="versus">vs</span>
                      <span className="crowd-pieces">
                        <i>A</i>
                        <i>L</i>
                        <i>L</i>
                      </span>
                    </>
                  )}
                </span>
                <span className="mode-option-copy">
                  <strong>
                    {MODES[m].title}
                    <small>{MODES[m].label}</small>
                  </strong>
                  <span>{MODES[m].description}</span>
                </span>
                <span className="selection-dot">
                  {mode === m && <Check size={13} />}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="how-strip" aria-label="How a match works">
          <div className="how-intro">
            <span className="strip-mark">
              <Flag size={25} />
            </span>
            <h2>
              A room. A code.
              <br />A score to settle.
            </h2>
          </div>
          <div>
            <strong>Make it your match</strong>
            <p>Choose your players, rounds, and time limit.</p>
          </div>
          <ChevronRight className="strip-arrow" size={18} />
          <div>
            <strong>Rally your friends</strong>
            <p>Share the room code. Get everyone in.</p>
          </div>
          <ChevronRight className="strip-arrow" size={18} />
          <div>
            <strong>Let the words fly</strong>
            <p>Solve the word. Most points wins.</p>
          </div>
        </section>
      </main>
      <Footer />
      {panel && (
        <Modal
          title={
            panel === "rules"
              ? "Six guesses. Make them count."
              : panel === "create"
                ? "Make it your match."
                : panel === "join"
                  ? "Find your rivals."
                  : "What should we call you?"
          }
          close={() => !busy && setPanel(null)}
          wide={panel === "create"}
        >
          {panel === "rules" ? (
            <Rules />
          ) : (
            <form onSubmit={submit} className="setup-form">
              <p className="form-intro">
                {panel === "create"
                  ? "Set the rules. We’ll get you a room code."
                  : panel === "join"
                    ? "Your friends are one room code away."
                    : "Your name is remembered on this browser."}
              </p>
              <label>
                Your player name
                <input
                  autoComplete="nickname"
                  maxLength={20}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Word wizard"
                  required
                />
              </label>
              {panel === "join" && (
                <label>
                  Room code
                  <input
                    className="code-input"
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value
                          .replace(/[^a-zA-Z2-9]/g, "")
                          .toUpperCase(),
                      )
                    }
                    minLength={6}
                    maxLength={6}
                    placeholder="ABC123"
                    required
                    autoComplete="off"
                  />
                </label>
              )}
              {panel === "create" && (
                <>
                  <fieldset>
                    <legend>Game mode</legend>
                    <div className="segmented">
                      {(Object.keys(MODES) as Mode[]).map((m) => (
                        <button
                          type="button"
                          className={mode === m ? "active" : ""}
                          onClick={() => setMode(m)}
                          key={m}
                          aria-pressed={mode === m}
                        >
                          {MODES[m].label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="form-grid">
                    <label>
                      Number of players
                      <select
                        value={
                          mode === "duel" ? 2 : mode === "teams" ? 4 : players
                        }
                        disabled={mode !== "free"}
                        onChange={(e) => setPlayers(Number(e.target.value))}
                      >
                        {Array.from({ length: 15 }, (_, i) => (
                          <option value={i + 2} key={i}>
                            {i + 2} players
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Number of rounds
                      <select
                        value={rounds}
                        onChange={(e) => setRounds(Number(e.target.value))}
                      >
                        {Array.from({ length: 20 }, (_, i) => (
                          <option value={i + 1} key={i}>
                            {i + 1} {i === 0 ? "round" : "rounds"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Time per round
                    <select
                      value={seconds}
                      onChange={(e) => setSeconds(Number(e.target.value))}
                    >
                      {[0, 30, 60, 90, 120, 180, 300].map((s) => (
                        <option value={s} key={s}>
                          {s === 0
                            ? "No time limit"
                            : s < 60
                              ? `${s} seconds`
                              : `${s / 60} ${s === 60 ? "minute" : "minutes"}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    <label>
                      Scoring
                      <select
                        value={scoring}
                        onChange={(e) =>
                          setScoring(e.target.value as typeof scoring)
                        }
                      >
                        <option value="classic">
                          Classic · 1 point per solve
                        </option>
                        <option value="bonus">
                          Guess bonus · 6 to 1 points
                        </option>
                      </select>
                    </label>
                    <label>
                      Word difficulty
                      <select
                        value={difficulty}
                        onChange={(e) =>
                          setDifficulty(e.target.value as typeof difficulty)
                        }
                      >
                        <option value="familiar">Familiar</option>
                        <option value="challenging">Challenging</option>
                        <option value="mixed">Mixed</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Match format
                    <select
                      value={matches === 1 ? "single" : "championship"}
                      onChange={(e) =>
                        setMatches(e.target.value === "single" ? 1 : 3)
                      }
                    >
                      <option value="single">Single match</option>
                      <option value="championship">
                        Championship tournament
                      </option>
                    </select>
                  </label>
                  {matches > 1 && (
                    <label>
                      Number of matches
                      <select
                        value={matches}
                        onChange={(e) => setMatches(Number(e.target.value))}
                      >
                        {Array.from({ length: 9 }, (_, i) => (
                          <option key={i} value={i + 2}>
                            {i + 2} matches
                          </option>
                        ))}
                      </select>
                      <small>
                        {rounds} rounds per match. Points add up across all{" "}
                        {matches} matches. Ties share the title.
                      </small>
                    </label>
                  )}
                  <div className="form-note">
                    <Zap size={16} />
                    <span>
                      {scoring === "bonus"
                        ? "Solve in guesses 1–6 to earn 6, 5, 4, 3, 2, or 1 points."
                        : "Six guesses each. Every solver earns 1 point."}
                      {mode === "teams" && " Team points are added together."}
                    </span>
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Opening your room…"
                  : panel === "create"
                    ? "Create room"
                    : panel === "join"
                      ? "Join room"
                      : "Save player name"}
                {!busy && <ArrowRight size={18} />}
              </button>
              <span className="privacy-note">
                No sign-up. Just your name and a little competitive spirit.
              </span>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
