"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleHelp, X } from "lucide-react";
import type { PublicRoom } from "@/lib/types";
import { WordPlay } from "./word-play";
import { MatchBreakdown } from "./match-results";
export function RacePlay({
  room,
  busy,
  blocked,
  network,
  onAction,
  onError,
  onHelp,
}: {
  room: PublicRoom;
  busy: boolean;
  blocked: boolean;
  network: boolean;
  onAction: (data: Record<string, unknown>) => Promise<PublicRoom | undefined>;
  onError: (message: string) => void;
  onHelp: () => void;
}) {
  const race = room.race!;
  const storageKey = `rally-race-word:${room.code}:${room.matchId}`;
  const [selected, setSelected] = useState(0);
  const navigatorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigatorRef.current;
    const button = nav?.querySelector<HTMLElement>("[aria-current=step]");
    if (!nav || !button) return;
    const frame = nav.getBoundingClientRect(),
      item = button.getBoundingClientRect();
    if (item.left < frame.left) nav.scrollLeft += item.left - frame.left;
    else if (item.right > frame.right)
      nav.scrollLeft += item.right - frame.right;
  }, [selected]);
  const [now, setNow] = useState(room.serverTime);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(storageKey));
      if (Number.isInteger(saved) && saved >= 0 && saved < race.words.length)
        setSelected(saved);
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    const offset = room.serverTime - Date.now();
    setNow(room.serverTime);
    if (room.status === "finished") return;
    const timer = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(timer);
  }, [room.serverTime, room.status]);
  const word = race.words[selected] ?? race.words[0];
  const own = race.standings.find((player) => player.id === room.me)!;
  const done = room.status === "finished";
  const closed = word.solved || word.exhausted;
  const elapsed =
    own.elapsed ??
    Math.max(0, (done ? (race.endedAt ?? now) : now) - race.startedAt);
  const time = (ms: number, precise = false) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${precise ? `.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}` : ""}`;
  const nextOpen = Array.from(
    { length: race.words.length },
    (_, offset) => (selected + offset + 1) % race.words.length,
  ).find((index) => !race.words[index].solved && !race.words[index].exhausted);
  // Mirrors the server's RACE_GRACE_MS: the race closes a minute after the
  // first complete run, so idle players cannot hold everyone else hostage.
  const firstFinish = race.standings.reduce<number | null>(
    (min, player) =>
      player.elapsed === null
        ? min
        : min === null
          ? player.elapsed
          : Math.min(min, player.elapsed),
    null,
  );
  const closesIn =
    !done && firstFinish !== null
      ? Math.max(0, race.startedAt + firstFinish + 60000 - now)
      : null;
  const advance = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);
  const leaders = race.standings.filter(
    (player) =>
      player.total !== null && player.total === race.standings[0].total,
  );
  function select(index: number) {
    setSelected(index);
    try {
      sessionStorage.setItem(storageKey, String(index));
    } catch {}
  }
  return (
    <section className="game-stage race-stage" aria-label="Fast Fingers race">
      <div className="game-context">
        <div>
          <h1>Fast Fingers</h1>
          <span className="context-meta">
            Word {selected + 1}/{race.words.length}
          </span>
        </div>
        <div>
          {!done && (
            <button
              className="text-button race-skip"
              disabled={nextOpen === undefined || nextOpen === selected}
              onClick={() => nextOpen !== undefined && select(nextOpen)}
            >
              {closed ? "Next word" : "Skip"}
              <ArrowRight size={16} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={onHelp}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </div>
      <div className="race-strip" aria-label="Your race progress">
        <strong>
          {own.points} <small>bonus pts</small>
        </strong>
        <span role="timer" aria-label="Race elapsed time">
          {time(elapsed, own.elapsed !== null)}
        </span>
        <span>
          {own.solved}/{race.words.length} solved
        </span>
      </div>
      <nav
        ref={navigatorRef}
        className="race-words"
        aria-label="Choose a race word"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            const buttons = Array.from(
              e.currentTarget.querySelectorAll("button"),
            );
            const focused = buttons.indexOf(e.target as HTMLButtonElement);
            const base = focused < 0 ? selected : focused;
            const index =
              (base + (e.key === "ArrowRight" ? 1 : race.words.length - 1)) %
              race.words.length;
            buttons[index]?.focus({ preventScroll: true });
            select(index);
          }
        }}
      >
        {race.words.map((item, index) => (
          <button
            key={index}
            aria-current={index === selected ? "step" : undefined}
            aria-label={`Word ${index + 1}, ${item.solved ? "solved" : item.exhausted ? "exhausted" : item.guesses.length ? "in progress" : "open"}`}
            className={`${item.solved ? "solved" : item.exhausted ? "exhausted" : ""}`}
            onClick={() => select(index)}
          >
            {index + 1}
            {item.solved ? (
              <Check size={13} />
            ) : item.exhausted ? (
              <X size={13} />
            ) : item.guesses.length > 0 ? (
              <span className="word-progress-dot" />
            ) : null}
          </button>
        ))}
      </nav>
      <div className="game-status" role="status" aria-live="polite">
        {busy ? (
          "Checking your guess…"
        ) : !done && own.elapsed !== null ? (
          `All words solved · race closes in ${Math.ceil((closesIn ?? 0) / 1000)}s`
        ) : closesIn !== null && !word.solved && !word.exhausted ? (
          `Someone finished · ${Math.ceil(closesIn / 1000)}s left to finish`
        ) : word.solved ? (
          `Solved in ${word.guesses.length}/6 · +${7 - word.guesses.length} points`
        ) : word.exhausted ? (
          "Word wasted · no points or speed bonus"
        ) : (
          <span className="sr-only">
            {word.guesses.length} of six guesses used. You can skip and return.
          </span>
        )}
      </div>
      <WordPlay
        key={`${room.matchId}:${selected}`}
        guesses={word.guesses}
        initialInput={
          word.guesses.some(
            (guess) => guess.word === drafts[selected]?.toLowerCase(),
          )
            ? ""
            : (drafts[selected] ?? "")
        }
        onDraftChange={(value) =>
          setDrafts((previous) =>
            previous[selected] === value
              ? previous
              : { ...previous, [selected]: value },
          )
        }
        playable={!done && !closed && !blocked}
        busy={busy}
        showKeyboard={!done && !closed}
        onError={onError}
        onGuess={async (value) => {
          const index = selected;
          const next = await onAction({
            action: "guess",
            matchId: room.matchId,
            match: room.match ?? 0,
            round: index,
            word: value,
          });
          const words = next?.race?.words;
          // Speed mode: after a solve or a wasted word, move on automatically
          // once the reveal has played, unless the player already switched.
          if (
            words?.[index] &&
            (words[index].solved || words[index].exhausted)
          ) {
            const open = Array.from(
              { length: words.length },
              (_, offset) => (index + offset + 1) % words.length,
            ).find((i) => !words[i].solved && !words[i].exhausted);
            if (open !== undefined) {
              clearTimeout(advance.current);
              advance.current = setTimeout(
                () =>
                  setSelected((current) => {
                    if (current !== index) return current;
                    try {
                      sessionStorage.setItem(storageKey, String(open));
                    } catch {}
                    return open;
                  }),
                1100,
              );
            }
          }
          return !!next;
        }}
      />
      {done && (
        <section className="race-results" aria-label="Race results">
          <h2>
            {leaders.length === 0
              ? "No completed runs"
              : leaders.length > 1
                ? "A shared win"
                : `${leaders[0].name} wins`}
          </h2>
          <p>
            Up to 50 points for guesses and 50 for speed. Only complete solves
            qualify.
          </p>
          <ol>
            {race.standings.map((player) => (
              <li key={player.id}>
                <div>
                  <strong>
                    {player.name}
                    {player.id === room.me ? " · you" : ""}
                  </strong>
                  <span>
                    {player.solved}/{race.words.length} solved · {player.points}{" "}
                    bonus pts
                    {player.elapsed !== null
                      ? ` · ${time(player.elapsed, true)}`
                      : " · incomplete"}
                  </span>
                  <small>
                    {player.elapsed !== null
                      ? `${player.pointsScore}/50 points + ${player.speedScore}/50 speed`
                      : "No finishing rank"}
                  </small>
                </div>
                <strong>
                  {player.total !== null ? `${player.total}` : "—"}
                  <small>{player.total !== null ? " / 100" : ""}</small>
                </strong>
              </li>
            ))}
          </ol>
          {room.host === room.me ? (
            <button
              className="button primary"
              disabled={busy || network}
              onClick={() => void onAction({ action: "replay" })}
            >
              Rematch
              <ArrowRight size={17} />
            </button>
          ) : (
            <span className="waiting-host">Waiting for the host.</span>
          )}
        </section>
      )}
      <details className="player-progress">
        <summary>
          Players
          <span>
            {race.standings.filter((p) => p.elapsed !== null).length}/
            {room.players.length} finished
          </span>
        </summary>
        <ol>
          {race.standings.map((player) => (
            <li key={player.id}>
              <span>{player.name}</span>
              <span>
                {player.solved}/{race.words.length} solved
              </span>
              <strong>
                {player.points} <small>pts</small>
              </strong>
            </li>
          ))}
        </ol>
      </details>
      <details className="match-details">
        <summary>How the 50/50 score works</summary>
        <div className="race-rules">
          <p>
            Each solve earns 6–1 bonus points for guesses 1–6. Skips stay open.
            Exhausted words earn zero and make the run ineligible for a
            finishing rank.
          </p>
          <p>
            Points score = 50 × your bonus points ÷ (6 × words). Speed score =
            50 × average finisher time ÷ (average finisher time + your time).
            Scores settle once the race ends; ties share the win.
          </p>
          {race.average !== null && (
            <p>Average complete run: {time(race.average, true)}.</p>
          )}
        </div>
      </details>
      {done && (
        <details className="match-details">
          <summary>Word breakdown</summary>
          <MatchBreakdown rounds={room.results} />
        </details>
      )}
    </section>
  );
}
