"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Crown, Share2, Trophy, X } from "lucide-react";
import type { Player, PublicRoom } from "@/lib/types";
import { WordPlay } from "./word-play";
import { MatchBreakdown } from "./match-results";
import { PlayerAvatar, Standings } from "./room-players";

// Mirrors the server's RACE_GRACE_MS: the race closes a minute after the first
// complete run, so idle players cannot hold everyone else hostage.
const GRACE_MS = 60000;
const time = (ms: number, precise = false) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${
    precise ? `.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}` : ""
  }`;

export function RacePlay({
  room,
  busy,
  network,
  blocked,
  onAction,
  onError,
  onManage,
  onShare,
}: {
  room: PublicRoom;
  busy: boolean;
  network: boolean;
  blocked: boolean;
  onAction: (data: Record<string, unknown>) => Promise<PublicRoom | undefined>;
  onError: (message: string) => void;
  onManage: (player: Player) => void;
  onShare: () => void;
}) {
  const race = room.race!;
  const storageKey = `rally-race-word:${room.code}:${room.matchId}`;
  const [selected, setSelected] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [now, setNow] = useState(room.serverTime);
  const navigatorRef = useRef<HTMLElement>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const spectator = !!room.spectators?.some((s) => s.id === room.me);
  const me = room.players.find((p) => p.id === room.me);
  const done = room.status === "finished";

  useEffect(() => () => clearTimeout(advance.current), []);
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(storageKey));
      if (Number.isInteger(saved) && saved >= 0 && saved < race.words.length)
        setSelected(saved);
    } catch {}
  }, [storageKey, race.words.length]);
  useEffect(() => {
    const offset = room.serverTime - Date.now();
    setNow(room.serverTime);
    if (done) return;
    const timer = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(timer);
  }, [room.serverTime, done]);
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

  function select(index: number) {
    setSelected(index);
    try {
      sessionStorage.setItem(storageKey, String(index));
    } catch {}
  }
  const openAfter = (words: PublicRoom["race"] & {}, from: number) =>
    Array.from(
      { length: words.words.length },
      (_, offset) => (from + offset + 1) % words.words.length,
    ).find((i) => !words.words[i].solved && !words.words[i].exhausted);

  if (done)
    return (
      <RaceResults
        room={room}
        busy={busy}
        network={network}
        onAction={onAction}
        onShare={onShare}
      />
    );

  const word = race.words[selected] ?? race.words[0];
  const own = race.standings.find((p) => p.id === room.me);
  const closed = word.solved || word.exhausted;
  const elapsed = own?.elapsed ?? Math.max(0, now - race.startedAt);
  const nextOpen = openAfter(race, selected);
  const firstFinish = race.standings.reduce<number | null>(
    (min, p) =>
      p.elapsed === null
        ? min
        : min === null
          ? p.elapsed
          : Math.min(min, p.elapsed),
    null,
  );
  const closesIn =
    firstFinish !== null
      ? Math.max(0, race.startedAt + firstFinish + GRACE_MS - now)
      : null;
  const countdown = Math.max(
    0,
    Math.ceil((race.startedAt + 3000 - now) / 1000),
  );

  return (
    <div className="match-layout race-layout">
      <div className="play-column">
        <div className="round-bar race-bar">
          <span className="round-label">
            <strong>{own?.points ?? 0}</strong> bonus pts
          </span>
          <strong
            className={`match-clock ${closesIn !== null && closesIn <= 15000 ? "urgent" : ""}`}
            role="timer"
            aria-label="Race elapsed time"
          >
            {time(elapsed, own?.elapsed != null)}
          </strong>
          <span className="round-label race-solved">
            <strong>{own?.solved ?? 0}</strong>/{race.words.length} solved
          </span>
        </div>
        <div className="race-nav-row">
          <nav
            ref={navigatorRef}
            className="race-words"
            aria-label="Choose a race word"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
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
            }}
          >
            {race.words.map((item, index) => (
              <button
                key={index}
                aria-current={index === selected ? "step" : undefined}
                aria-label={`Word ${index + 1}, ${item.solved ? "solved" : item.exhausted ? "wasted" : item.guesses.length ? "in progress" : "open"}`}
                className={
                  item.solved ? "solved" : item.exhausted ? "exhausted" : ""
                }
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
          {!spectator && (
            <button
              className="button secondary race-skip"
              disabled={nextOpen === undefined || nextOpen === selected}
              onClick={() => nextOpen !== undefined && select(nextOpen)}
            >
              {closed ? "Next" : "Skip"}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="game-status" role="status" aria-live="polite">
          {spectator
            ? "You’re watching this race"
            : busy
              ? "Checking your guess…"
              : own?.elapsed != null
                ? `All words solved in ${time(own.elapsed, true)} · race closes in ${Math.ceil((closesIn ?? 0) / 1000)}s`
                : closesIn !== null && !closed
                  ? `Someone finished · ${Math.ceil(closesIn / 1000)}s left`
                  : word.solved
                    ? `Word ${selected + 1} solved in ${word.guesses.length}/6 · +${7 - word.guesses.length} points`
                    : word.exhausted
                      ? "Word wasted · no points, and no finishing time"
                      : `Word ${selected + 1} of ${race.words.length} · skip and come back any time`}
        </div>
        {countdown > 0 && (
          <div className="round-countdown" role="status">
            Race starts in {countdown}
          </div>
        )}
        <WordPlay
          key={`${room.matchId}:${selected}`}
          guesses={word.guesses}
          initialInput={
            word.guesses.some((g) => g.word === drafts[selected]?.toLowerCase())
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
          playable={
            !closed && !blocked && countdown === 0 && !spectator && !!me?.active
          }
          busy={busy}
          showKeyboard={!closed && !spectator}
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
            const words = next?.race;
            // After a solve or a wasted word, move on once the reveal has
            // played, unless the player already switched words.
            if (
              words?.words[index] &&
              (words.words[index].solved || words.words[index].exhausted)
            ) {
              const open = openAfter(words, index);
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
        {closed && nextOpen === undefined && own?.elapsed == null && (
          <p className="waiting-host">
            No open words left. The race ends when everyone is done.
          </p>
        )}
        <details className="match-details">
          <summary>How the 50/50 score works</summary>
          <RaceRules average={race.average} />
        </details>
      </div>
      <Standings room={room} onManage={onManage} />
    </div>
  );
}

function RaceRules({ average }: { average: number | null }) {
  return (
    <div className="race-rules">
      <p>
        Each solve earns 6–1 bonus points for guesses 1–6. Skipped words stay
        open. A wasted word (six misses) earns nothing and means you can’t post
        a finishing time.
      </p>
      <p>
        Final score out of 100: up to 50 for points (your bonus points ÷ the
        maximum) and up to 50 for speed (compared with the average finishing
        time). Only players who solve every word get a total. The race closes 60
        seconds after the first player finishes.
      </p>
      {average !== null && (
        <p>Average finishing time: {time(average, true)}.</p>
      )}
    </div>
  );
}

function RaceResults({
  room,
  busy,
  network,
  onAction,
  onShare,
}: {
  room: PublicRoom;
  busy: boolean;
  network: boolean;
  onAction: (data: Record<string, unknown>) => Promise<PublicRoom | undefined>;
  onShare: () => void;
}) {
  const race = room.race!;
  const rows = race.standings;
  const places = rows.map((row) =>
    row.total === null
      ? null
      : rows.findIndex((other) => other.total === row.total) + 1,
  );
  const leaders = rows.filter(
    (row) => row.total !== null && row.total === rows[0].total,
  );
  const mine = rows.findIndex((row) => row.id === room.me);
  const podium = [1, 0, 2]
    .map(
      (i) =>
        rows[i] && places[i] !== null && { row: rows[i], place: places[i]! },
    )
    .filter((entry) => !!entry);
  const avatarIndex = (id: string) =>
    room.players.findIndex((p) => p.id === id);
  return (
    <>
      <section className="final-board" aria-labelledby="race-title">
        <header className="final-head">
          <Trophy size={28} aria-hidden="true" />
          <span>Fast Fingers complete</span>
          <h2 id="race-title">
            {leaders.length === 0
              ? "Nobody finished the set"
              : leaders.length > 1
                ? "A shared win!"
                : `${leaders[0].id === room.me ? "You win" : `${leaders[0].name} wins`}!`}
          </h2>
          {mine >= 0 && (
            <p>
              {places[mine] !== null ? (
                <>
                  You finished{" "}
                  <strong>
                    {places[mine] === 1 ? "first" : `#${places[mine]}`}
                  </strong>{" "}
                  with <strong>{rows[mine].total}</strong>/100 in{" "}
                  {time(rows[mine].elapsed ?? 0, true)}
                </>
              ) : (
                <>
                  You solved {rows[mine].solved}/{race.words.length} words, so
                  your run has no finishing rank
                </>
              )}
            </p>
          )}
        </header>
        {podium.length > 1 && (
          <ol className="podium" aria-label="Podium">
            {podium.map(({ row, place }) => (
              <li
                key={row.id}
                className={`podium-step place-${Math.min(place, 3)} ${row.id === room.me ? "is-me" : ""}`}
              >
                <PlayerAvatar player={row} index={avatarIndex(row.id)} />
                <strong>{row.id === room.me ? "You" : row.name}</strong>
                <span className="podium-score">{row.total}/100</span>
                <span className="podium-block" aria-label={`Place ${place}`}>
                  {place === 1 ? <Crown size={22} /> : place}
                </span>
              </li>
            ))}
          </ol>
        )}
        <ol className="leaderboard" aria-label="Race leaderboard">
          {rows.map((row, i) => (
            <li key={row.id} className={row.id === room.me ? "is-me" : ""}>
              <span className="leaderboard-rank">{places[i] ?? "—"}</span>
              <PlayerAvatar player={row} index={avatarIndex(row.id)} />
              <span className="leaderboard-name">
                <strong>
                  {row.name}
                  {row.id === room.me && <small> · you</small>}
                </strong>
                <span>
                  {row.solved}/{race.words.length} solved · {row.points} bonus
                  pts
                  {row.elapsed !== null
                    ? ` · ${time(row.elapsed, true)}`
                    : " · incomplete"}
                </span>
                {row.total !== null && (
                  <span>
                    {row.pointsScore} points + {row.speedScore} speed
                  </span>
                )}
              </span>
              <strong className="leaderboard-score">
                {row.total ?? "—"}
                <small>{row.total !== null ? "/ 100" : "no rank"}</small>
              </strong>
            </li>
          ))}
        </ol>
        <div className="result-actions">
          {room.host === room.me ? (
            <button
              className="button primary"
              disabled={busy || network}
              onClick={() => void onAction({ action: "replay" })}
            >
              Race again
              <ArrowRight size={18} />
            </button>
          ) : (
            <span className="waiting-host">
              Waiting for the host to start another race.
            </span>
          )}
          <button className="button secondary" onClick={onShare}>
            <Share2 size={17} />
            Share result
          </button>
        </div>
      </section>
      <details className="match-details">
        <summary>Word-by-word breakdown</summary>
        <MatchBreakdown rounds={room.results} label="Word breakdown" />
      </details>
      <details className="match-details">
        <summary>How the 50/50 score works</summary>
        <RaceRules average={race.average} />
      </details>
    </>
  );
}
