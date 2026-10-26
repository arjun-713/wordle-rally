"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { StatsBook } from "@/lib/types";
import { api } from "./shared";
import { TopNav } from "./navigation";
const labels = {
  unlimited: "Unlimited",
  daily: "Daily",
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
    } catch (error) {
      setError((error as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const stats = book?.[mode],
    maximum = Math.max(1, ...(stats?.distribution ?? []));
  return (
    <div className="app-shell">
      <TopNav />
      <main className="stats-main">
        <div className="page-heading">
          <h1>Statistics</h1>
          <Link
            href={
              mode === "daily"
                ? "/daily"
                : mode === "unlimited"
                  ? "/unlimited"
                  : "/"
            }
            className="text-button"
          >
            {mode === "multiplayer"
              ? "Play with friends"
              : `Play ${labels[mode]}`}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div
          className="segmented stats-tabs"
          role="group"
          aria-label="Statistics mode"
        >
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
          <div className="game-error" role="alert">
            {error}
            <button onClick={() => void load()}>Retry</button>
          </div>
        ) : !book || !stats ? (
          <div className="game-loading" role="status">
            <LoaderCircle className="spinner" size={22} />
            Loading statistics…
          </div>
        ) : (
          <>
            <dl className="stats-metrics">
              {[
                ["Played", stats.played],
                [
                  "Win rate",
                  `${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%`,
                ],
                ["Current streak", stats.streak],
                ["Best streak", stats.bestStreak],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <section className="distribution-panel">
              <div className="distribution-title">
                <h2>Guess distribution</h2>
                <span>
                  {stats.wins} solved ·{" "}
                  {stats.wins
                    ? `${(stats.guesses / stats.wins).toFixed(1)} avg`
                    : "No average yet"}
                </span>
              </div>
              <ol className="guess-distribution">
                {stats.distribution.map((count, index) => (
                  <li
                    key={index}
                    aria-label={`${index + 1} guesses: ${count} solves`}
                  >
                    <span>{index + 1}</span>
                    <div>
                      <span
                        style={{ transform: `scaleX(${count / maximum})` }}
                      />
                      <strong>{count}</strong>
                    </div>
                  </li>
                ))}
              </ol>
              {stats.played === 0 && (
                <p className="stats-empty">
                  Finish a puzzle to start your record.
                </p>
              )}
            </section>
            {mode === "multiplayer" && (
              <dl className="match-totals">
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
            )}
            {mode === "daily" && (
              <p className="stats-note">
                Daily streaks count consecutive UTC days solved.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
