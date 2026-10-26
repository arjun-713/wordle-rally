"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Infinity as InfinityIcon,
  LoaderCircle,
  Trophy,
  Users,
  CalendarDays,
  BarChart3,
  Share2,
} from "lucide-react";
import { PreferencesButton } from "./preferences";
import type { StatsBook, Difficulty, PublicSoloGame } from "@/lib/types";
import { api, Logo, Modal } from "./shared";
import { WordPlay } from "./word-play";
import { isGuessRejection } from "@/lib/client-api";

export default function SoloClient({ daily = false }: { daily?: boolean }) {
  const endpoint = daily ? "/api/daily" : "/api/solo";
  const [level, setLevel] = useState<Difficulty>("mixed");
  const [book, setBook] = useState<StatsBook | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [shared, setShared] = useState(false);
  const currentId = useRef("");
  const [game, setGame] = useState<PublicSoloGame | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingGuess, setPendingGuess] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [help, setHelp] = useState(false);
  const sending = useRef(false);
  const latest = useRef(-1);
  const apply = useCallback(
    (next: PublicSoloGame) => {
      if (daily && currentId.current !== next.id) {
        if (currentId.current > next.id) return;
        latest.current = -1;
      }
      if (next.revision < latest.current) return;
      latest.current = next.revision;
      currentId.current = next.id;
      setGame(next);
    },
    [daily],
  );
  const refresh = useCallback(async () => {
    try {
      apply(await api<PublicSoloGame>(endpoint, { action: "start" }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apply, endpoint]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible" || sending.current) return;
      void api<PublicSoloGame | null>(endpoint)
        .then((next) => {
          if (next) apply(next);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [apply, endpoint]);
  useEffect(() => {
    if (daily && game)
      void api<StatsBook>("/api/stats")
        .then(setBook)
        .catch(() => {});
  }, [daily, game?.status, game?.id]);
  useEffect(() => {
    if (game?.difficulty) setLevel(game.difficulty);
  }, [game?.id]);
  useEffect(() => {
    if (!daily) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [daily]);
  const lastReset = useRef("");
  useEffect(() => {
    const today = new Date(clock).toISOString().slice(0, 10);
    if (
      daily &&
      game?.date &&
      today !== game.date &&
      today !== lastReset.current
    ) {
      lastReset.current = today;
      void refresh();
    }
  }, [clock, daily, game?.date, refresh]);
  async function share() {
    if (!game) return;
    const squares = { correct: "🟩", present: "🟨", absent: "⬜" };
    const text = `Word Rally Daily #${game.number} · ${game.date}\n${game.status === "won" ? game.guesses.length : "X"}/6\n${game.guesses.map((g) => g.marks.map((m) => squares[m]).join("")).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch {
      setError(
        "Clipboard unavailable. You can share a screenshot of your board.",
      );
    }
  }
  async function action(input: Record<string, unknown>) {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setPendingGuess(input.action === "guess");
    setError("");
    try {
      apply(
        await api<PublicSoloGame>(endpoint, {
          ...input,
          difficulty: level,
          gameId: game?.id,
        }),
      );
      return true;
    } catch (e) {
      if (input.action === "guess" && isGuessRejection(e)) throw e;
      if (
        input.action === "guess" ||
        (e as Error & { status?: number }).status === 409
      ) {
        setCheckingSaved(true);
        try {
          const current = await api<PublicSoloGame | null>(endpoint);
          if (current) {
            apply(current);
            if (
              input.action === "guess" &&
              current.id === game?.id &&
              current.guesses.length > game.guesses.length &&
              current.guesses.some((guess) => guess.word === input.word)
            ) {
              setError("");
              return true;
            }
          }
        } catch {
          /* Keep the recoverable error and existing puzzle. */
        }
      }
      setError((e as Error).message);
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
      setPendingGuess(false);
      setCheckingSaved(false);
    }
  }
  const finished = game && game.status !== "playing";
  return (
    <div className="site-shell room-shell room-playing solo-shell">
      <header className="header">
        <Logo />
        <nav className="room-nav" aria-label="Solo navigation">
          <PreferencesButton />
          <Link
            href="/stats"
            className="text-button"
            aria-label="Personal statistics"
          >
            <BarChart3 size={18} />
            <span>Stats</span>
          </Link>
          <Link href="/" className="text-button" aria-label="Play with friends">
            <Users size={17} />
            <span>Play with friends</span>
          </Link>
          <button
            className="text-button"
            aria-label="How to play"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
            <span>How to play</span>
          </button>
        </nav>
      </header>
      <main className="room-main">
        <div className="room-title-row">
          <div>
            <h1>{daily ? "The daily challenge" : "Wordle Unlimited"}</h1>
            <p className="back-label">
              {daily
                ? "One word. Everyone gets the same six chances."
                : "A fresh word whenever you’re ready."}
            </p>
          </div>
          <span className="solo-time">
            {daily ? <CalendarDays size={20} /> : <InfinityIcon size={20} />}
            {daily ? "Resets at 00:00 UTC" : "No time limit"}
          </span>
        </div>
        {loading ? (
          <div className="room-loading" role="status">
            <LoaderCircle className="spinner" size={28} />
            <p>Picking your next word…</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="room-error error-message" role="alert">
                <span>{error}</span>
                {daily && !game && (
                  <Link href="/unlimited" className="text-button">
                    Play Unlimited <ArrowRight size={16} />
                  </Link>
                )}
                <button className="text-button" onClick={() => void refresh()}>
                  Refresh game
                </button>
              </div>
            )}
            {game ? (
              <div className="game-layout solo-layout">
                <section className="game-panel" aria-label="Solo puzzle">
                  <div className="game-toolbar">
                    <span className="round-counter">
                      {daily ? "Daily" : "Puzzle"}{" "}
                      <strong>
                        {daily
                          ? `#${game.number}`
                          : game.stats.played +
                            (game.status === "playing" ? 1 : 0)}
                      </strong>
                    </span>
                    <span className="timer solo-timer">
                      {daily ? (
                        <CalendarDays size={19} />
                      ) : (
                        <InfinityIcon size={19} />
                      )}
                      <span>{daily ? game.date : "At your own pace"}</span>
                    </span>
                    <span className="attempt-count">
                      {game.guesses.length} / 6 guesses
                    </span>
                  </div>
                  <div
                    className="board-status solo-status"
                    role="status"
                    aria-live="polite"
                  >
                    <strong>
                      {pendingGuess
                        ? checkingSaved
                          ? "Checking your saved result…"
                          : "Checking your guess…"
                        : game.status === "won"
                          ? "That’s the word. Nice one!"
                          : game.status === "lost"
                            ? "A tricky one. Try another?"
                            : "Just you and five letters."}
                    </strong>
                    <span>
                      {finished ? (
                        <>
                          The word was{" "}
                          <strong className="solo-answer">
                            {game.answer?.toUpperCase()}
                          </strong>
                          .
                        </>
                      ) : (
                        "Six guesses. No clock. Find your word."
                      )}
                    </span>
                  </div>
                  <WordPlay
                    key={game.id}
                    guesses={game.guesses}
                    playable={
                      game.status === "playing" &&
                      !help &&
                      (!daily || clock < (game.resetsAt ?? Infinity))
                    }
                    busy={busy}
                    onError={setError}
                    onGuess={(word) => action({ action: "guess", word })}
                  />
                  {finished && daily && (
                    <div className="solo-next daily-next">
                      <button
                        className="button primary"
                        onClick={() => void share()}
                      >
                        <Share2 size={18} />
                        {shared ? "Result copied" : "Share result"}
                      </button>
                      <Link href="/unlimited" className="text-button">
                        Keep playing Unlimited <ArrowRight size={16} />
                      </Link>
                    </div>
                  )}
                  {finished && !daily && (
                    <div className="solo-next">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void action({ action: "next" })}
                      >
                        {busy ? "Picking a word…" : "Next word"}
                        <ArrowRight size={18} />
                      </button>
                      <span>Your next puzzle is one click away.</span>
                    </div>
                  )}
                  <div className="board-legend">
                    <span>
                      <i className="correct" />
                      Right place
                    </span>
                    <span>
                      <i className="present" />
                      Wrong place
                    </span>
                    <span>
                      <i className="absent" />
                      Not in word
                    </span>
                  </div>
                </section>
                <aside className="solo-sidebar">
                  <h2>
                    <Trophy size={21} />{" "}
                    {daily ? "Your daily run" : "Your word run"}
                  </h2>
                  <dl className="solo-stats">
                    <div>
                      <dt>Games played</dt>
                      <dd>
                        {daily ? (book?.daily.played ?? 0) : game.stats.played}
                      </dd>
                    </div>
                    <div>
                      <dt>Words solved</dt>
                      <dd>
                        {daily ? (book?.daily.wins ?? 0) : game.stats.wins}
                      </dd>
                    </div>
                    <div>
                      <dt>Current streak</dt>
                      <dd>
                        {daily ? (book?.daily.streak ?? 0) : game.stats.streak}
                      </dd>
                    </div>
                    <div>
                      <dt>Best streak</dt>
                      <dd>
                        {daily
                          ? (book?.daily.bestStreak ?? 0)
                          : game.stats.bestStreak}
                      </dd>
                    </div>
                  </dl>
                  {daily ? (
                    <div className="daily-reset">
                      <strong>Next challenge in</strong>
                      <span>
                        {game.resetsAt
                          ? new Date(Math.max(0, game.resetsAt - clock))
                              .toISOString()
                              .slice(11, 19)
                          : "—"}
                      </span>
                      <small>
                        A new word at midnight UTC. Missed days reset your daily
                        streak.
                      </small>
                    </div>
                  ) : (
                    <label className="difficulty-picker">
                      Next word difficulty
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value as Difficulty)}
                      >
                        <option value="familiar">Familiar</option>
                        <option value="challenging">Challenging</option>
                        <option value="mixed">Mixed</option>
                      </select>
                      <small>
                        Current puzzle: {game.difficulty ?? "mixed"}. Changes
                        apply to your next word.
                      </small>
                    </label>
                  )}
                  <Link href="/stats" className="text-button stats-entry">
                    See your personal stats <BarChart3 size={17} />
                  </Link>
                  <div className="solo-note">
                    <Check size={18} />
                    <div>
                      <strong>Pick up where you left off.</strong>
                      <p>
                        Your puzzle and stats are saved for this browser. Daily
                        words are reserved from new room and Unlimited games.
                      </p>
                    </div>
                  </div>
                  <Link href="/" className="text-button solo-friends">
                    Bring your friends next time <ArrowRight size={16} />
                  </Link>
                </aside>
              </div>
            ) : (
              !error && (
                <button
                  className="button primary"
                  onClick={() => void refresh()}
                >
                  Start a puzzle
                  <ArrowRight size={18} />
                </button>
              )
            )}
          </>
        )}
      </main>
      <footer className="room-footer">
        <span>Five letters. A little time for yourself.</span>
        <span>wordrally.</span>
      </footer>
      {help && (
        <Modal title="Six guesses. Your own pace." close={() => setHelp(false)}>
          <div className="rules">
            <p>
              Find the five-letter word in six guesses. Green means the right
              letter in the right place. Gold means the letter belongs somewhere
              else. Gray means it is absent.
            </p>
            <p>
              {daily ? (
                "There is no timer. Finish today’s puzzle, share your result without the answer, and return tomorrow. Unlimited is available between challenges."
              ) : (
                <>
                  There is no timer or daily puzzle limit. After a solve or six
                  guesses, choose <strong>Next word</strong> to keep playing.
                </>
              )}
            </p>
            <p>
              Your current puzzle, wins, and streak are saved for this browser.
              {daily
                ? "Today’s puzzle is the same for everyone and resets at midnight UTC. You have one six-guess attempt per day. Daily answers are reserved from new random games."
                : "Fresh words are selected from the available answer pool, excluding"}
              {!daily && (
                <>
                  your solo and multiplayer history. If the pool runs out, it
                  will ask for an expanded dictionary rather than silently
                  repeat answers.
                </>
              )}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
