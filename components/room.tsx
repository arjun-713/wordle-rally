"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Infinity as InfinityIcon,
  Copy,
  Crown,
  Flag,
  Link2,
  LoaderCircle,
  LogOut,
  RotateCcw,
  Trophy,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { roomPollDelay } from "@/lib/room-polling";
import type { Player, PublicRoom, RoomSyncReply } from "@/lib/types";
import { MODES } from "@/lib/types";
import Link from "next/link";
import {
  MatchBreakdown,
  ChampionshipStandings,
  tournamentTotals,
} from "./match-results";
import { PreferencesButton } from "./preferences";
import { pointsForGuess } from "@/lib/scoring";
import { WordPlay } from "./word-play";
import { api, Logo, Modal, Rules, savedName, saveName } from "./shared";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function PlayerAvatar({
  player,
  index = 0,
}: {
  player: Player;
  index?: number;
}) {
  return (
    <span
      className={`avatar player-avatar tone-${index % 4}`}
      aria-hidden="true"
    >
      {player.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
export default function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [network, setNetwork] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [copied, setCopied] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const busyRef = useRef(false);
  const currentRef = useRef<PublicRoom | null>(null);
  const changedAt = useRef(Date.now());
  const clockOffset = useRef(0);
  const polling = useRef<{ pause: () => void; resume: () => void } | null>(
    null,
  );
  const apply = useCallback((next: PublicRoom) => {
    const prev = currentRef.current;
    if (prev && next.revision < prev.revision) return;
    if (
      prev &&
      (prev.round !== next.round ||
        (prev.status !== "lobby" && next.status === "lobby"))
    ) {
      setError("");
    }
    if (!prev || prev.revision !== next.revision)
      changedAt.current = Date.now();
    clockOffset.current = next.serverTime - Date.now();
    currentRef.current = next;
    setRoom(next);
    setOffset(next.serverTime - Date.now());
    setNetwork(false);
    setNeedsJoin(false);
  }, []);
  useEffect(() => {
    setName(savedName());
    let stopped = false,
      fatal = false,
      epoch = 0,
      failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    function pause() {
      epoch++;
      clearTimeout(timer);
      controller?.abort();
    }
    function schedule(delay?: number) {
      clearTimeout(timer);
      if (
        stopped ||
        fatal ||
        document.visibilityState === "hidden" ||
        busyRef.current
      )
        return;
      const wait =
        delay ??
        roomPollDelay(
          currentRef.current,
          Date.now() - changedAt.current,
          Date.now() + clockOffset.current,
          failures,
        );
      if (wait !== null) timer = setTimeout(poll, wait);
    }
    async function poll() {
      if (stopped || document.visibilityState === "hidden" || busyRef.current)
        return;
      const attempt = ++epoch;
      controller = new AbortController();
      const current = currentRef.current;
      try {
        const next = await api<RoomSyncReply>(
          `/api/rooms/${code}${current ? `?revision=${current.revision}` : ""}`,
          undefined,
          controller.signal,
        );
        if (stopped || attempt !== epoch) return;
        failures = 0;
        if ("unchanged" in next) {
          clockOffset.current = next.serverTime - Date.now();
          setOffset(clockOffset.current);
          setNetwork(false);
        } else apply(next);
      } catch (e) {
        if (stopped || attempt !== epoch) return;
        const err = e as Error & { status?: number };
        fatal = err.status === 403 || err.status === 404;
        failures++;
        if (err.status === 403) setNeedsJoin(true);
        else if (!currentRef.current) setError(err.message);
        else setNetwork(true);
      } finally {
        if (!stopped && attempt === epoch) {
          setLoading(false);
          schedule();
        }
      }
    }
    function wake() {
      pause();
      if (document.visibilityState === "visible") {
        fatal = false;
        failures = 0;
        schedule(0);
      }
    }
    const controls = {
      pause,
      resume: () => {
        fatal = false;
        failures = 0;
        schedule();
      },
    };
    polling.current = controls;
    void poll();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      pause();
      if (polling.current === controls) polling.current = null;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [code, apply]);
  useEffect(() => {
    if (!room || room.config.seconds === 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [room?.config.seconds]);
  async function action(data: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    polling.current?.pause();
    setBusy(true);
    setError("");
    try {
      const next = await api<PublicRoom>(`/api/rooms/${code}`, data);
      apply(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
      polling.current?.resume();
    }
  }
  const current = room?.current;
  const me = room?.players.find((p) => p.id === room.me);
  const host = room?.host === room?.me;
  const seconds = current
    ? Math.max(0, Math.ceil((current.endsAt - now - offset) / 1000))
    : 0;
  const solved = !!(room && current?.solved.includes(room.me));
  const exhausted = (current?.guesses.length ?? 0) >= 6;
  const playable = !!(
    room?.status === "playing" &&
    current &&
    !current.ended &&
    !solved &&
    !exhausted &&
    (room.config.seconds === 0 || seconds > 0) &&
    me?.active &&
    !network
  );
  async function copy(link = false) {
    const value = link ? `${location.origin}/room/${code}` : code;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(link ? "link" : "code");
      setTimeout(() => setCopied(""), 2500);
    } catch {
      setError("Clipboard unavailable. Select and copy the room code above.");
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    saveName(name);
    await action({ action: "join", name });
  }
  async function leave() {
    const next = await action({ action: "leave" });
    if (next) router.push("/");
  }
  const sorted = room
    ? [...room.players].sort((a, b) => b.score - a.score)
    : [];
  const teamScores = [0, 1].map(
    (t) =>
      room?.players
        .filter((p) => p.team === t)
        .reduce((a, p) => a + p.score, 0) ?? 0,
  );
  const championship = (room?.config.matches ?? 1) > 1;
  const blockedChampionship =
    championship &&
    (room?.match ?? 0) > 0 &&
    !!room?.players.some((p) => !p.active);
  const moreMatches = (room?.match ?? 0) + 1 < (room?.config.matches ?? 1);
  const championshipFinal =
    championship && !moreMatches && room?.status === "finished";
  const totals = tournamentTotals(room?.matches ?? []);
  const overallTeams = [0, 1].map((t) =>
    totals.filter((p) => p.team === t).reduce((sum, p) => sum + p.score, 0),
  );
  const overallTop = totals[0]?.score ?? 0;
  const overallWinners = totals.filter((p) => p.score === overallTop);
  const championText =
    room?.config.mode === "teams"
      ? overallTeams[0] === overallTeams[1]
        ? "A tied championship!"
        : `${overallTeams[0] > overallTeams[1] ? "Green" : "Gold"} team takes the title!`
      : overallTop === 0
        ? "A championship to settle next time."
        : overallWinners.length === 1
          ? `${overallWinners[0].name} takes the title!`
          : "A shared championship!";
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((p) => p.score === topScore);
  const winnerText =
    room?.config.mode === "teams"
      ? teamScores[0] === teamScores[1]
        ? "The teams are tied!"
        : `${teamScores[0] > teamScores[1] ? "Green" : "Gold"} team wins!`
      : winners.length === 1
        ? `${winners[0].name} wins!`
        : topScore === 0
          ? "A score to settle next time."
          : "A shared victory!";
  return (
    <div
      className={`site-shell room-shell ${room?.status === "playing" ? "room-playing" : ""}`}
    >
      <header className="header">
        <Logo />
        <div className="room-nav">
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
            className="text-button"
            aria-label="How to play"
            onClick={() => setShowRules(true)}
          >
            <CircleHelp size={17} />
            <span>How to play</span>
          </button>
          {room && (
            <button
              className="text-button leave-button"
              aria-label="Leave room"
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut size={17} />
              <span>Leave room</span>
            </button>
          )}
        </div>
      </header>
      <main className="room-main">
        {loading ? (
          <div className="room-loading" role="status">
            <LoaderCircle className="spinner" size={28} />
            <h1>Finding your rivals…</h1>
            <p>Opening room {code}.</p>
          </div>
        ) : !room ? (
          <section className="join-gate">
            <span className="join-emblem">
              <Users size={32} />
            </span>
            <h1>{needsJoin ? "You’re invited." : "Can’t open this room."}</h1>
            <p>
              {needsJoin ? (
                <>
                  A little friendly competition is waiting in room{" "}
                  <strong>{code}</strong>.
                </>
              ) : (
                error
              )}
            </p>
            {needsJoin ? (
              <form onSubmit={join}>
                <label>
                  Your player name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={20}
                    placeholder="e.g. Word wizard"
                    autoComplete="nickname"
                    required
                  />
                </label>
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <button className="button primary full" disabled={busy}>
                  {busy ? "Joining…" : "Join the room"}
                  <ArrowRight size={18} />
                </button>
              </form>
            ) : (
              <button
                className="button primary"
                onClick={() => router.push("/")}
              >
                Back to home
              </button>
            )}
          </section>
        ) : (
          <>
            <div className="room-title-row">
              <div>
                <h1>
                  {room.status === "lobby"
                    ? "The rivalry starts here."
                    : room.status === "finished"
                      ? "That’s a wrap."
                      : `Round ${room.round + 1}. Make it count.`}
                </h1>
                <span className="back-label">
                  {MODES[room.config.mode].label} <span>·</span>{" "}
                  {room.config.rounds} rounds <span>·</span>{" "}
                  {room.config.seconds === 0
                    ? "No time limit"
                    : `${room.config.seconds}s per round`}
                </span>
                <p className="room-config-extra">
                  {room.config.scoring === "bonus"
                    ? "Guess bonus · 6–1 points"
                    : "Classic · 1 point per solve"}{" "}
                  · {room.config.difficulty ?? "mixed"} words
                  {championship &&
                    ` · Championship match ${(room.match ?? 0) + 1} of ${room.config.matches}`}
                </p>
              </div>
              <button
                className="room-code"
                onClick={() => copy()}
                aria-label={`Copy room code ${code}`}
              >
                <span>ROOM CODE</span>
                <strong>{code}</strong>
                {copied === "code" ? <Check size={18} /> : <Copy size={17} />}
              </button>
            </div>
            {room.storage === "local" && (
              <p className="local-notice">
                Development room · saved on this server.
              </p>
            )}
            {network && (
              <div className="network-notice" role="status">
                <WifiOff size={17} /> Reconnecting to the room… Your guesses are
                saved. Typing resumes when connected.
              </div>
            )}
            {error && (
              <div className="room-error error-message" role="alert">
                {error}
                <button className="text-button" onClick={() => setError("")}>
                  Dismiss
                </button>
              </div>
            )}
            {room.status === "lobby" ? (
              <div className="lobby-layout">
                <section className="lobby-panel">
                  <div className="panel-heading">
                    <h2>Gather your word people.</h2>
                    <span>
                      {room.players.length} / {room.config.players} joined
                    </span>
                  </div>
                  <div className="player-slots">
                    {Array.from({ length: room.config.players }, (_, i) => {
                      const p = room.players[i];
                      return (
                        <div
                          className={`player-slot ${!p ? "empty-slot" : ""}`}
                          key={p?.id ?? i}
                        >
                          {p ? (
                            <>
                              <PlayerAvatar player={p} index={i} />
                              <div>
                                <strong>
                                  {p.name}{" "}
                                  {p.id === room.me && <small>(you)</small>}
                                </strong>
                                <span>
                                  {!p.active
                                    ? "Left championship"
                                    : room.config.mode === "teams"
                                      ? `${p.team === 0 ? "Green" : "Gold"} team`
                                      : p.id === room.host
                                        ? "Calling the shots"
                                        : "Ready for a rivalry"}
                                </span>
                              </div>
                              {p.id === room.host ? (
                                <span className="host-label">
                                  <Crown size={14} /> Host
                                </span>
                              ) : p.active ? (
                                <Check size={18} className="ready-check" />
                              ) : (
                                <LogOut
                                  size={18}
                                  aria-label="Player has left"
                                />
                              )}
                            </>
                          ) : (
                            <>
                              <span className="avatar empty-avatar">
                                <UserRound size={20} />
                              </span>
                              <div>
                                <strong>Open seat</strong>
                                <span>Waiting for a friend…</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {room.config.mode === "teams" && (
                    <div className="team-picker">
                      <span>Your team</span>
                      {[0, 1].map((t) => (
                        <button
                          key={t}
                          className={`button ${me?.team === t ? "primary" : "secondary"}`}
                          disabled={
                            busy || me?.team === t || (room.match ?? 0) > 0
                          }
                          onClick={() => action({ action: "team", team: t })}
                        >
                          {t === 0 ? "Green" : "Gold"}
                          {me?.team === t && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="lobby-bottom">
                    {blockedChampionship && (
                      <>
                        <Link href="/" className="text-button">
                          Back to home <ArrowRight size={17} />
                        </Link>
                        <p>
                          A player has left. Championships keep the original
                          group; return home to create a new room with different
                          players.
                        </p>
                      </>
                    )}
                    {host ? (
                      <>
                        {!blockedChampionship && (
                          <p>
                            {room.players.length === room.config.players
                              ? "Everyone’s here. Time to settle it."
                              : `Waiting for ${room.config.players - room.players.length} more ${room.config.players - room.players.length === 1 ? "friend" : "friends"} to join.`}
                          </p>
                        )}
                        <button
                          className="button primary"
                          disabled={
                            busy ||
                            network ||
                            room.players.length !== room.config.players ||
                            room.players.some((p) => !p.active)
                          }
                          onClick={() =>
                            action({ action: "start", match: room.match ?? 0 })
                          }
                        >
                          {busy ? "Starting…" : "Start the match"}
                          <Flag size={18} />
                        </button>
                      </>
                    ) : !blockedChampionship ? (
                      <p className="waiting-host">
                        <LoaderCircle size={17} className="spinner" /> Waiting
                        for{" "}
                        {room.players.find((p) => p.id === room.host)?.name ??
                          "the host"}{" "}
                        to start the match.
                      </p>
                    ) : null}
                  </div>
                </section>
                {blockedChampionship ? (
                  <aside className="match-recap">
                    <MatchBreakdown
                      rounds={room.matches?.at(-1)?.rounds ?? []}
                      label="Last completed match"
                    />
                  </aside>
                ) : (
                  <aside className="invite-panel">
                    <div className="invite-tiles" aria-hidden="true">
                      {"HELLO".split("").map((l, i) => (
                        <span
                          className={`tile ${i < 3 ? "correct" : "present"}`}
                          key={i}
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                    <h2>
                      Good rivals <br />
                      come in groups.
                    </h2>
                    <p>
                      Send the code to your friends.
                      <br />
                      They can join from any browser.
                    </p>
                    <div className="invite-code">{code}</div>
                    <button
                      className="button primary full"
                      onClick={() => copy(true)}
                    >
                      {copied === "link" ? (
                        <Check size={17} />
                      ) : (
                        <Link2 size={17} />
                      )}{" "}
                      {copied === "link"
                        ? "Invite link copied"
                        : "Copy invite link"}
                    </button>
                    <div className="lobby-rules">
                      <strong>The house rules</strong>
                      <p>
                        Same word for everyone.
                        <br />
                        Six guesses, your own board.
                        <br />
                        {room.config.scoring === "bonus"
                          ? "Solve in 1–6 guesses: 6, 5, 4, 3, 2, or 1 points."
                          : "Every solve is worth 1 point."}
                        <br />
                        No solve? No point.
                      </p>
                    </div>
                  </aside>
                )}
              </div>
            ) : room.status === "finished" ? (
              <div className="results-layout">
                <section className="results-panel">
                  <span className="result-trophy">
                    <Trophy size={42} />
                  </span>
                  <h2>{championshipFinal ? championText : winnerText}</h2>
                  <p>
                    {topScore === 0
                      ? "The words won this one. Ready for a rematch?"
                      : "The points are in. The bragging rights are yours."}
                  </p>
                  {room.config.mode === "teams" && (
                    <div className="team-scoreboard">
                      <div>
                        Green team<strong>{teamScores[0]}</strong>
                      </div>
                      <span>vs</span>
                      <div>
                        Gold team<strong>{teamScores[1]}</strong>
                      </div>
                    </div>
                  )}
                  {championship && (
                    <p className="match-result-label">
                      Match {(room.match ?? 0) + 1} of {room.config.matches}
                    </p>
                  )}
                  <Standings room={room} />
                  {championship && <ChampionshipStandings room={room} />}
                  <div className="result-actions">
                    {host && moreMatches ? (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          action({
                            action: "nextMatch",
                            match: room.match ?? 0,
                          })
                        }
                      >
                        Set up match {(room.match ?? 0) + 2}
                        <ArrowRight size={18} />
                      </button>
                    ) : host ? (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => action({ action: "replay" })}
                      >
                        <RotateCcw size={18} /> Set up a rematch
                      </button>
                    ) : (
                      <p>
                        {moreMatches
                          ? "Waiting for the host to set up the next championship match."
                          : "Waiting for the host to set up a rematch."}
                      </p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => setConfirmLeave(true)}
                    >
                      Leave room <ArrowRight size={16} />
                    </button>
                  </div>
                  <p className="no-repeat-note">
                    New match. Fresh words. Your word history stays remembered.
                  </p>
                </section>
                <aside className="match-recap">
                  <MatchBreakdown rounds={room.results} />
                  {championship &&
                    (room.matches ?? [])
                      .filter((m) => m.number !== (room.match ?? 0) + 1)
                      .map((m) => (
                        <details className="previous-match" key={m.number}>
                          <summary>Match {m.number} breakdown</summary>
                          <MatchBreakdown
                            rounds={m.rounds}
                            label={`Match ${m.number} rounds`}
                          />
                        </details>
                      ))}
                </aside>
              </div>
            ) : (
              <div className="game-layout">
                <section className="game-panel">
                  <div className="game-toolbar">
                    <span className="round-counter">
                      Round <strong>{room.round + 1}</strong> /{" "}
                      {room.config.rounds}
                    </span>
                    <span
                      role="timer"
                      className={`timer ${room.config.seconds !== 0 && seconds <= 15 && !current?.ended ? "urgent" : ""}`}
                      aria-label={
                        room.config.seconds === 0
                          ? "No time limit"
                          : `${seconds} seconds remaining`
                      }
                    >
                      {room.config.seconds === 0 ? (
                        <InfinityIcon size={18} />
                      ) : (
                        <Clock3 size={18} />
                      )}
                      {current?.ended
                        ? "Round over"
                        : room.config.seconds === 0
                          ? "No time limit"
                          : formatTime(seconds)}
                    </span>
                    <span className="attempt-count">
                      {current?.guesses.length ?? 0} / 6 guesses
                    </span>
                  </div>
                  <div
                    className="round-progress"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={room.config.rounds}
                    aria-valuenow={room.round + 1}
                    aria-label={`Round ${room.round + 1} of ${room.config.rounds}`}
                  >
                    {Array.from({ length: room.config.rounds }, (_, i) => (
                      <span
                        className={i <= room.round ? "filled" : ""}
                        key={i}
                      />
                    ))}
                  </div>
                  <div
                    className="board-status"
                    role="status"
                    aria-live="polite"
                  >
                    {current?.ended ? (
                      <>
                        <strong>
                          The word was{" "}
                          <span>{current.answer?.toUpperCase()}</span>.
                        </strong>
                        <span>
                          {current.solved.length
                            ? `${current.solved.length} ${current.solved.length === 1 ? "player solved" : "players solved"} it.`
                            : "No solves this round. No points awarded."}
                        </span>
                      </>
                    ) : solved ? (
                      <>
                        <strong>
                          You got it. +
                          {pointsForGuess(
                            room.config,
                            current?.guesses.length ?? 6,
                          )}{" "}
                          {pointsForGuess(
                            room.config,
                            current?.guesses.length ?? 6,
                          ) === 1
                            ? "point"
                            : "points"}
                          !
                        </strong>
                        <span>Your rivals are still playing.</span>
                      </>
                    ) : exhausted ? (
                      <>
                        <strong>Out of guesses. Still in the match.</strong>
                        <span>Watch the scores while your rivals finish.</span>
                      </>
                    ) : (
                      <>
                        <strong>Same word. Your six chances.</strong>
                        <span>
                          {room.config.mode === "teams"
                            ? "Your points count toward your team."
                            : room.config.seconds === 0
                              ? "Take your time. You have six guesses."
                              : "Find the five-letter word before time runs out."}
                        </span>
                      </>
                    )}
                  </div>
                  <WordPlay
                    key={`${room.match ?? 0}:${room.round}`}
                    guesses={current?.guesses ?? []}
                    playable={playable && !showRules && !confirmLeave}
                    busy={busy}
                    onError={setError}
                    onGuess={async (word) =>
                      !!(await action({
                        action: "guess",
                        matchId: room.matchId,
                        word,
                        round: room.round,
                        match: room.match ?? 0,
                      }))
                    }
                  />
                  {current?.ended && (
                    <div className="next-round">
                      {host ? (
                        <button
                          className="button primary"
                          disabled={busy || network}
                          onClick={() =>
                            action({
                              action: "next",
                              matchId: room.matchId,
                              round: room.round,
                              match: room.match ?? 0,
                            })
                          }
                        >
                          Start round {room.round + 2}
                          <ArrowRight size={18} />
                        </button>
                      ) : (
                        <p>Waiting for the host to start the next round.</p>
                      )}
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
                <aside className="standings-panel">
                  <div className="panel-heading">
                    <h2>
                      <Trophy size={18} /> The standings
                    </h2>
                    <span>Points</span>
                  </div>
                  {room.config.mode === "teams" && (
                    <div className="team-scoreboard compact">
                      <div>
                        Green<strong>{teamScores[0]}</strong>
                      </div>
                      <span>vs</span>
                      <div>
                        Gold<strong>{teamScores[1]}</strong>
                      </div>
                    </div>
                  )}
                  <Standings room={room} showProgress />
                  <div className="score-explainer">
                    <span className="small-trophy">
                      <Flag size={20} />
                    </span>
                    <strong>
                      {room.config.scoring === "bonus"
                        ? "Fewer guesses. More points."
                        : "A solve is a point."}
                    </strong>
                    <p>
                      {room.config.scoring === "bonus"
                        ? "Guesses 1–6 earn 6, 5, 4, 3, 2, or 1 points."
                        : "Used all six guesses? Sit tight."}
                      <br />
                      Your rivals can still finish.
                    </p>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="room-footer">
        <span>Keep your friends close. Your vowels closer.</span>
        <span>wordrally.</span>
      </footer>
      {showRules && (
        <Modal
          title="Six guesses. Make them count."
          close={() => setShowRules(false)}
        >
          <Rules />
        </Modal>
      )}
      {confirmLeave && (
        <Modal title="Leaving so soon?" close={() => setConfirmLeave(false)}>
          <p className="form-intro">
            {room?.status === "lobby"
              ? "Your seat will be available to someone else."
              : "Leaving ends your turns for this match. Your points stay on the scoreboard."}
            {host ? " Host controls will pass to the next player." : ""}
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setConfirmLeave(false)}
            >
              Stay in room
            </button>
            <button className="button primary" disabled={busy} onClick={leave}>
              Leave room
              <LogOut size={17} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Standings({
  room,
  showProgress = false,
}: {
  room: PublicRoom;
  showProgress?: boolean;
}) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <ol className="standings">
      {sorted.map((p, i) => {
        const solved = room.current?.solved.includes(p.id);
        const attempts = room.current?.attempts[p.id] ?? 0;
        return (
          <li className={p.id === room.me ? "is-me" : ""} key={p.id}>
            <span className="rank">
              {room.players.filter((other) => other.score > p.score).length + 1}
            </span>
            <PlayerAvatar
              player={p}
              index={room.players.findIndex((x) => x.id === p.id)}
            />
            <div className="standing-name">
              <strong>
                {p.name}
                {p.id === room.me && <small> you</small>}
              </strong>
              <span>
                {!p.active
                  ? "Left match"
                  : room.config.mode === "teams"
                    ? `${p.team === 0 ? "Green" : "Gold"} team`
                    : solved
                      ? "Solved!"
                      : attempts >= 6
                        ? "Out of guesses"
                        : showProgress
                          ? `${attempts} of 6 guesses`
                          : "Final score"}
              </span>
              {showProgress && (
                <div
                  className="guess-pips"
                  role="img"
                  aria-label={solved ? "Solved" : `${attempts} guesses used`}
                >
                  {Array.from({ length: 6 }, (_, j) => (
                    <i
                      key={j}
                      className={solved ? "solved" : j < attempts ? "used" : ""}
                    />
                  ))}
                </div>
              )}
            </div>
            <strong
              className={`standing-score ${solved && showProgress ? "scored" : ""}`}
            >
              {p.score}
            </strong>
          </li>
        );
      })}
    </ol>
  );
}
