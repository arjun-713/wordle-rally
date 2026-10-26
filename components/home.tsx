"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CircleHelp, Hash, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODES, type Config, type Mode, type PublicRoom } from "@/lib/types";
import { api, Modal, Rules, savedName, saveName } from "./shared";
import { TopNav } from "./navigation";

const preview = [
  {
    word: "PLAYS",
    marks: ["absent", "present", "present", "present", "absent"],
  },
  {
    word: "PARTY",
    marks: ["absent", "correct", "present", "absent", "correct"],
  },
  {
    word: "RALLY",
    marks: ["correct", "correct", "correct", "correct", "correct"],
  },
];
export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("duel");
  const [panel, setPanel] = useState<"create" | "join" | "rules" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [players, setPlayers] = useState(4),
    [rounds, setRounds] = useState(5),
    [seconds, setSeconds] = useState(90);
  const [scoring, setScoring] = useState<"classic" | "bonus">("classic");
  const [difficulty, setDifficulty] = useState<
    "familiar" | "challenging" | "mixed"
  >("mixed");
  const [matches, setMatches] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setName(savedName());
  }, []);
  function open(next: typeof panel) {
    setError("");
    setPanel(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!name.trim()) {
      setError("Enter your player name.");
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
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell home-shell">
      <TopNav
        home
        settings={
          <label className="setting-field">
            Player name
            <input
              autoComplete="nickname"
              maxLength={20}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                saveName(event.target.value);
              }}
            />
          </label>
        }
      />
      <main className="home-hub">
        <section className="hub-copy" aria-labelledby="home-title">
          <h1 id="home-title">
            Your word.
            <br />
            Against theirs.
          </h1>
          <p>Six guesses. One word. A round with your friends.</p>
          <div className="hub-actions">
            <button className="button primary" onClick={() => open("create")}>
              <Plus size={19} />
              Create a room
              <ArrowRight size={19} />
            </button>
            <button className="button secondary" onClick={() => open("join")}>
              <Hash size={18} />
              Join with code
            </button>
          </div>
          <div className="hub-solo">
            <Link href="/unlimited" aria-label="Play Wordle Unlimited">
              Play solo
              <ArrowUpRight size={17} />
            </Link>
            <Link href="/daily">
              Daily challenge
              <ArrowUpRight size={17} />
            </Link>
            <button onClick={() => open("rules")}>
              <CircleHelp size={17} />
              How to play
            </button>
          </div>
          <p className="hub-formats">1v1 · 2v2 · Free-for-all</p>
        </section>
        <section
          className="match-preview"
          aria-label="Illustrative match preview"
          data-ui
        >
          <div className="preview-heading">
            <h2>Match preview</h2>
            <span>Round 2 / 5</span>
          </div>
          <div className="preview-score">
            <span>
              You
              <strong>
                3 <small>pts</small>
              </strong>
            </span>
            <span className="preview-clock">01:28</span>
            <span>
              Rival
              <strong>
                2 <small>pts</small>
              </strong>
            </span>
          </div>
          <div
            className="preview-grid"
            aria-label="Example board, RALLY solved in three guesses"
          >
            {Array.from({ length: 6 }, (_, row) => (
              <div className="tile-row" key={row}>
                {Array.from({ length: 5 }, (_, col) => (
                  <span
                    key={col}
                    className={`tile ${preview[row]?.marks[col] ?? ""}`}
                  >
                    {preview[row]?.word[col] ?? ""}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="preview-footer">
            <span>Same word. Your own six guesses.</span>
            <Link href="/unlimited" aria-label="Start a solo puzzle">
              <ArrowUpRight size={22} />
            </Link>
          </div>
        </section>
      </main>
      {panel && (
        <Modal
          title={
            panel === "rules"
              ? "How to play"
              : panel === "create"
                ? "Create a room"
                : "Join a room"
          }
          close={() => !busy && setPanel(null)}
          wide={panel === "create"}
        >
          {panel === "rules" ? (
            <Rules />
          ) : (
            <form onSubmit={submit} className="setup-form">
              <label>
                Your player name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={20}
                  autoComplete="nickname"
                  required
                />
              </label>
              {panel === "join" ? (
                <label>
                  Room code
                  <input
                    className="code-input"
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value
                          .replace(/[^a-zA-Z2-9]/g, "")
                          .toUpperCase(),
                      )
                    }
                    minLength={6}
                    maxLength={6}
                    autoComplete="off"
                    placeholder="Six-character code"
                    required
                  />
                </label>
              ) : (
                <>
                  <fieldset>
                    <legend>Game mode</legend>
                    <div className="segmented">
                      {(Object.keys(MODES) as Mode[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={mode === key}
                          onClick={() => setMode(key)}
                        >
                          {MODES[key].label}
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
                        onChange={(event) =>
                          setPlayers(Number(event.target.value))
                        }
                      >
                        {Array.from({ length: 15 }, (_, index) => (
                          <option key={index} value={index + 2}>
                            {index + 2} players
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Number of rounds
                      <select
                        value={rounds}
                        onChange={(event) =>
                          setRounds(Number(event.target.value))
                        }
                      >
                        {Array.from({ length: 20 }, (_, index) => (
                          <option key={index} value={index + 1}>
                            {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      Time per round
                      <select
                        value={seconds}
                        onChange={(event) =>
                          setSeconds(Number(event.target.value))
                        }
                      >
                        {[0, 30, 60, 90, 120, 180, 300].map((value) => (
                          <option key={value} value={value}>
                            {value === 0 ? "No time limit" : `${value} seconds`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Scoring
                      <select
                        value={scoring}
                        onChange={(event) =>
                          setScoring(event.target.value as typeof scoring)
                        }
                      >
                        <option value="classic">Classic · 1 point</option>
                        <option value="bonus">Guess bonus · 6–1 points</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      Word difficulty
                      <select
                        value={difficulty}
                        onChange={(event) =>
                          setDifficulty(event.target.value as typeof difficulty)
                        }
                      >
                        <option value="familiar">Familiar</option>
                        <option value="challenging">Challenging</option>
                        <option value="mixed">Random mix</option>
                      </select>
                    </label>
                    <label>
                      Match format
                      <select
                        value={matches === 1 ? "single" : "championship"}
                        onChange={(event) =>
                          setMatches(event.target.value === "single" ? 1 : 3)
                        }
                      >
                        <option value="single">Single match</option>
                        <option value="championship">Championship</option>
                      </select>
                    </label>
                  </div>
                  {matches > 1 && (
                    <label>
                      Number of matches
                      <select
                        value={matches}
                        onChange={(event) =>
                          setMatches(Number(event.target.value))
                        }
                      >
                        {Array.from({ length: 9 }, (_, index) => (
                          <option key={index} value={index + 2}>
                            {index + 2}
                          </option>
                        ))}
                      </select>
                      <small>
                        Points carry across matches. Tied leaders share the
                        title.
                      </small>
                    </label>
                  )}
                </>
              )}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Opening room…"
                  : panel === "create"
                    ? "Create room"
                    : "Join room"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
