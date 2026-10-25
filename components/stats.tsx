"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Trophy } from "lucide-react";
import type { StatsBook } from "@/lib/types";
import { api, Logo } from "./shared";
import { PreferencesButton } from "./preferences";
const labels = {
  unlimited: "Unlimited",
  daily: "Daily challenge",
  multiplayer: "Multiplayer",
};
export default function StatsClient() {
  const [book, setBook] = useState<StatsBook | null>(null),
    [error, setError] = useState(""),
    [mode, setMode] = useState<keyof typeof labels>("unlimited");
  async function load() {
    setError("");
    try {
      setBook(await api<StatsBook>("/api/stats"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const stats = book?.[mode],
    maximum = Math.max(1, ...(stats?.distribution ?? []));
  return (
    <div className="site-shell room-shell stats-shell">
      <header className="header">
        <Logo />
        <nav aria-label="Statistics navigation">
          <PreferencesButton />
          <Link href="/" className="text-button">
            Back to play <ArrowRight size={17} />
          </Link>
        </nav>
      </header>
      <main className="room-main stats-main">
        <div className="room-title-row">
          <div>
            <h1>Your word story.</h1>
            <p className="back-label">Every solve adds a little more.</p>
          </div>
          <Trophy size={30} className="stats-trophy" />
        </div>
        <div className="stats-tabs" role="group" aria-label="Statistics mode">
          {Object.entries(labels).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={mode === key}
              onClick={() => setMode(key as keyof typeof labels)}
            >
              {label}
            </button>
          ))}
        </div>
        {error ? (
          <div className="error-message" role="alert">
            {error}
            <button className="text-button" onClick={() => void load()}>
              Retry loading stats
            </button>
          </div>
        ) : !book ? (
          <div className="room-loading" role="status">
            <LoaderCircle className="spinner" />
            <p>Opening your scorebook…</p>
          </div>
        ) : (
          stats && (
            <>
              <div className="stats-overview">
                <dl>
                  {[
                    ["Puzzles played", stats.played],
                    [
                      "Win rate",
                      `${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%`,
                    ],
                    ["Current streak", stats.streak],
                    ["Best streak", stats.bestStreak],
                    [
                      "Average guesses",
                      stats.wins
                        ? (stats.guesses / stats.wins).toFixed(1)
                        : "—",
                    ],
                    ["Words solved", stats.wins],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="stats-details">
                <section className="distribution-panel">
                  <h2>Where your solves land.</h2>
                  <p>Successful puzzles, grouped by guesses used.</p>
                  <ol className="guess-distribution">
                    {stats.distribution.map((count, i) => (
                      <li
                        key={i}
                        aria-label={`${i + 1} guesses: ${count} solves`}
                      >
                        <span>{i + 1}</span>
                        <div>
                          <span
                            style={{ transform: `scaleX(${count / maximum})` }}
                          />
                          <strong>{count}</strong>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {!stats.played && (
                    <p className="stats-empty">
                      Your first puzzle starts the story.
                    </p>
                  )}
                </section>
                <aside className="stats-notes">
                  <h2>{labels[mode]}</h2>
                  {mode === "multiplayer" ? (
                    <>
                      <dl className="solo-stats">
                        <div>
                          <dt>Matches played</dt>
                          <dd>{book.matchesPlayed}</dd>
                        </div>
                        <div>
                          <dt>Matches won</dt>
                          <dd>{book.matchesWon}</dd>
                        </div>
                        <div>
                          <dt>Points earned</dt>
                          <dd>{book.points}</dd>
                        </div>
                      </dl>
                      <p>
                        Round stats are recorded when the round ends.
                        Positive-score ties count as shared match wins.
                      </p>
                    </>
                  ) : (
                    <p>
                      {mode === "daily"
                        ? "Daily streaks count consecutive UTC days solved. A loss or missed day breaks the run."
                        : "Your streak counts consecutive Unlimited puzzles solved. Six incorrect guesses reset it."}
                    </p>
                  )}
                  <Link
                    href={
                      mode === "daily"
                        ? "/daily"
                        : mode === "unlimited"
                          ? "/unlimited"
                          : "/"
                    }
                    className="button primary"
                  >
                    {mode === "daily"
                      ? "Play today’s word"
                      : mode === "unlimited"
                        ? "Play Unlimited"
                        : "Play with friends"}
                    <ArrowRight size={18} />
                  </Link>
                  <p className="stats-persistence">
                    Stats stay with this browser’s identity. Detailed records
                    start with this update; earlier Unlimited totals remain on
                    your game page.
                  </p>
                </aside>
              </div>
            </>
          )
        )}
      </main>
      <footer className="room-footer">
        <span>Five letters. Progress worth keeping.</span>
        <span>wordrally.</span>
      </footer>
    </div>
  );
}
