"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleHelp, LoaderCircle, Shuffle } from "lucide-react";
import type { Difficulty, PublicSoloGame } from "@/lib/types";
import { isGuessRejection } from "@/lib/client-api";
import { api, Modal, Rules } from "./shared";
import { TopNav } from "./navigation";
import { WordPlay } from "./word-play";
export default function SoloClient({ daily = false }: { daily?: boolean }) {
  const endpoint = daily ? "/api/daily" : "/api/solo";
  const [level, setLevel] = useState<Difficulty>("mixed");
  const [clock, setClock] = useState(Date.now());
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
  const finished = !!game && game.status !== "playing";
  return (
    <div className="app-shell play-shell">
      <TopNav
        settings={
          !daily && (
            <label className="setting-field">
              Next puzzle difficulty
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as Difficulty)}
              >
                <option value="familiar">Familiar</option>
                <option value="challenging">Challenging</option>
                <option value="mixed">Random mix</option>
              </select>
              <small>Applies to your next puzzle.</small>
            </label>
          )
        }
      />
      <main className="play-main">
        <div className="game-context">
          <div>
            <h1>{daily ? "Daily challenge" : "Unlimited"}</h1>
            {game && (
              <span className="context-meta">
                {daily
                  ? `#${game.number}`
                  : `Puzzle ${game.stats.played + (finished ? 0 : 1)}`}
              </span>
            )}
          </div>
          <div>
            <span className="guess-count">{game?.guesses.length ?? 0} / 6</span>
            <button
              className="icon-button"
              aria-label="How to play"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </div>
        {error && (
          <div className="game-error" role="alert">
            <span>{error}</span>
            <button onClick={() => void refresh()}>Retry</button>
            {daily && !game && <Link href="/unlimited">Play Unlimited</Link>}
          </div>
        )}
        {loading ? (
          <div className="game-loading" role="status">
            <LoaderCircle className="spinner" size={22} />
            <span>Loading puzzle…</span>
          </div>
        ) : game ? (
          <section className="game-stage" aria-label="Solo puzzle">
            <div className="game-status" role="status" aria-live="polite">
              {pendingGuess ? (
                checkingSaved ? (
                  "Checking saved result…"
                ) : (
                  "Checking your guess…"
                )
              ) : finished ? (
                game.status === "won" ? (
                  `Solved in ${game.guesses.length}/6`
                ) : (
                  "Out of guesses"
                )
              ) : (
                <span className="sr-only">
                  Find the five-letter word in six guesses.
                </span>
              )}
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
              showKeyboard={!finished}
              onGuess={(word) => action({ action: "guess", word })}
            />
            {finished && (
              <section className="result-panel" aria-label="Puzzle result">
                <div className="result-word">
                  <span>The word</span>
                  <h2>{game.answer?.toUpperCase()}</h2>
                </div>
                <div className="result-actions">
                  {!daily ? (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void action({ action: "next" })}
                    >
                      {busy ? "Picking a word…" : "Next word"}
                      <Shuffle size={18} />
                    </button>
                  ) : (
                    <Link href="/unlimited" className="button primary">
                      Play Unlimited
                      <ArrowRight size={18} />
                    </Link>
                  )}
                </div>
                {daily && game.resetsAt && (
                  <p className="result-detail">
                    Next daily in{" "}
                    {new Date(Math.max(0, game.resetsAt - clock))
                      .toISOString()
                      .slice(11, 19)}{" "}
                    · midnight UTC
                  </p>
                )}
              </section>
            )}
            {daily && !finished && (
              <details className="daily-details">
                <summary>About today’s puzzle</summary>
                <p>One shared word for {game.date}. Resets at midnight UTC.</p>
              </details>
            )}
          </section>
        ) : (
          !error && (
            <button className="button primary" onClick={() => void refresh()}>
              Start a puzzle
              <ArrowRight size={18} />
            </button>
          )
        )}
      </main>
      {help && (
        <Modal title="How to play" close={() => setHelp(false)}>
          <Rules />
        </Modal>
      )}
    </div>
  );
}
