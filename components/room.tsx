"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Copy,
  Crown,
  Link2,
  LoaderCircle,
  LogOut,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { roomPollDelay } from "@/lib/room-polling";
import {
  ApiError,
  isDuplicateGuess,
  isGuessRejection,
  isRetryableActionError,
  newRequestId,
} from "@/lib/client-api";
import type { Player, PublicRoom, RoomSyncReply } from "@/lib/types";
import { MODES } from "@/lib/types";
import { pointsForGuess } from "@/lib/scoring";
import {
  MatchBreakdown,
  ChampionshipStandings,
  tournamentTotals,
} from "./match-results";
import { WordPlay } from "./word-play";
import { TopNav } from "./navigation";
import { api, Modal, Rules, savedName, saveName } from "./shared";
const ACTION_TIMEOUT_MS = 8000;
const GUESS_TIMEOUT_MS = 6000;
const ACTION_RETRY_DELAYS = [250, 750, 1500];
const GUESS_RETRY_DELAYS = [250, 750, 1500, 3000, 5000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// A lost reply may still have been committed. These helpers read the durable
// room state so a retry can adopt the saved result instead of resubmitting.
function hasGuess(
  room: PublicRoom,
  word: string,
  round: number,
  attemptsBefore: number,
) {
  if (room.round === round && room.current) {
    if (room.current.guesses.some((guess) => guess.word === word)) return true;
    return (
      room.current.guesses.length > attemptsBefore &&
      room.current.guesses.at(-1)?.word === word
    );
  }
  const result = room.results[round];
  const player = result?.players.find((entry) => entry.id === room.me);
  return !!player && player.guesses > attemptsBefore;
}
function stateMoved(
  room: PublicRoom,
  round: number,
  matchId?: string,
  match = 0,
) {
  return (
    room.round !== round ||
    room.matchId !== matchId ||
    (room.match ?? 0) !== match
  );
}
function actionApplied(room: PublicRoom, data: Record<string, unknown>) {
  switch (data.action) {
    case "join":
      return room.players.some(
        (player) => player.id === room.me && player.active,
      );
    case "start":
      return room.status !== "lobby";
    case "next":
      return room.status === "finished" || room.round > Number(data.round);
    case "nextMatch":
      return (room.match ?? 0) > Number(data.match ?? 0);
    case "replay":
      return room.status === "lobby" && (room.match ?? 0) === 0;
    case "team":
      return (
        room.players.find((player) => player.id === room.me)?.team === data.team
      );
    case "kick":
    case "kickout":
    case "remove":
    case "ban":
      return !room.players.some(
        (player) => player.id === String(data.target) && player.active,
      );
    case "voteban":
    case "voteBan":
    case "vote_ban":
    case "vote-ban":
      return (
        !room.players.some(
          (player) => player.id === String(data.target) && player.active,
        ) || !!room.banVotes?.[String(data.target)]?.includes(room.me)
      );
    case "leave":
      return !room.players.some(
        (player) => player.id === room.me && player.active,
      );
    default:
      return false;
  }
}
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
  const [recovering, setRecovering] = useState(false);
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
  const polling = useRef<{
    pause: () => void;
    resume: () => void;
    sync: () => void;
  } | null>(null);
  const apply = useCallback((next: PublicRoom) => {
    const prev = currentRef.current;
    if (prev && next.revision < prev.revision) return;
    if (
      prev &&
      (prev.round !== next.round ||
        (prev.status !== "lobby" && next.status === "lobby"))
    ) {
      setError("");
      setCopied("");
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
        // One missed poll is normal on mobile networks. Keep the board open
        // and only warn once repeated attempts have failed.
        else if (failures >= 2) setNetwork(true);
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
      sync: wake,
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
    if (!room || room.status !== "playing" || room.current?.ended) return;
    // Timed rounds tick for the visible clock. Untimed rounds only need the
    // clock while the round-start countdown is running, otherwise a stale
    // `now` freezes the countdown and keeps the board locked forever.
    const countdownEnds = (room.current?.startedAt ?? 0) + 3000;
    const countdownRunning =
      room.config.seconds === 0 &&
      Date.now() + clockOffset.current < countdownEnds;
    if (room.config.seconds === 0 && !countdownRunning) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (
        room.config.seconds === 0 &&
        Date.now() + clockOffset.current >= countdownEnds
      )
        clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [
    room?.config.seconds,
    room?.status,
    room?.current?.ended,
    room?.current?.startedAt,
  ]);
  const freshRoom = useCallback(async () => {
    const next = await api<PublicRoom>(
      `/api/rooms/${code}?fresh=1`,
      undefined,
      undefined,
      ACTION_TIMEOUT_MS,
    );
    apply(next);
    return currentRef.current ?? next;
  }, [code, apply]);
  async function sendGuess(data: Record<string, unknown>) {
    const word = String(data.word),
      round = Number(data.round),
      attemptsBefore = currentRef.current?.current?.guesses.length ?? 0,
      matchId = currentRef.current?.matchId,
      match = currentRef.current?.match ?? 0,
      // Every attempt for this word reuses the ID, so a reply lost after the
      // server committed returns the saved board instead of a duplicate error.
      requestId = newRequestId();
    for (let attempt = 0; ; attempt++) {
      try {
        const next = await api<PublicRoom>(
          `/api/rooms/${code}`,
          { ...data, matchId, match, requestId },
          undefined,
          GUESS_TIMEOUT_MS,
        );
        apply(next);
        setRecovering(false);
        return next;
      } catch (error) {
        if (isGuessRejection(error) && !isDuplicateGuess(error)) throw error;
        setRecovering(true);
        const fresh = await freshRoom().catch(() => null);
        if (fresh) {
          if (hasGuess(fresh, word, round, attemptsBefore)) {
            setRecovering(false);
            return fresh;
          }
          // The round or match advanced while this guess was in flight. The
          // board moved on, so adopt it rather than replaying a stale guess.
          if (
            stateMoved(fresh, round, matchId, match) ||
            fresh.current?.ended
          ) {
            setRecovering(false);
            return fresh;
          }
        }
        const definitive =
          isDuplicateGuess(error) ||
          (error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500);
        if (definitive || attempt >= GUESS_RETRY_DELAYS.length) {
          setRecovering(false);
          throw error;
        }
        await wait(GUESS_RETRY_DELAYS[attempt]);
      }
    }
  }
  async function sendAction(data: Record<string, unknown>) {
    for (let attempt = 0; ; attempt++) {
      try {
        const next = await api<PublicRoom>(
          `/api/rooms/${code}`,
          data,
          undefined,
          ACTION_TIMEOUT_MS,
        );
        apply(next);
        return next;
      } catch (error) {
        // Confirm whether the action committed even when its reply was lost.
        const fresh = await freshRoom().catch(() => null);
        if (fresh && actionApplied(fresh, data)) return fresh;
        if (
          data.action === "leave" &&
          error instanceof ApiError &&
          error.status === 403
        )
          return currentRef.current ?? undefined;
        if (
          !isRetryableActionError(error) ||
          attempt >= ACTION_RETRY_DELAYS.length
        )
          throw error;
        setRecovering(true);
        await wait(ACTION_RETRY_DELAYS[attempt]);
      }
    }
  }
  async function action(data: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    polling.current?.pause();
    setBusy(true);
    setError("");
    setRecovering(false);
    try {
      return data.action === "guess"
        ? await sendGuess(data)
        : await sendAction(data);
    } catch (e) {
      if (data.action === "guess" && isGuessRejection(e)) throw e;
      setError((e as Error).message);
    } finally {
      setRecovering(false);
      busyRef.current = false;
      setBusy(false);
      polling.current?.resume();
    }
  }
  const current = room?.current;
  const me = room?.players.find((p) => p.id === room.me);
  const spectator = !!room?.spectators?.some((s) => s.id === room.me);
  const host = room?.host === room?.me;
  const seconds = current
    ? Math.max(0, Math.ceil((current.endsAt - now - offset) / 1000))
    : 0;
  const countdown =
    current?.startedAt && room?.status === "playing"
      ? Math.max(
          0,
          Math.ceil((current.startedAt + 3000 - (now + offset)) / 1000),
        )
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
    me?.active
  );
  async function copy(link = false) {
    const invite = room?.inviteToken ?? code;
    const value = link ? `${location.origin}/room/${invite}` : code;
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
        ? "No points awarded"
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
          ? "No points awarded"
          : "A shared victory!";
  const rival = room?.players.find((player) => player.id !== room.me);
  const fieldLeader = sorted.find((player) => player.id !== room?.me);
  const roundDone = !!current?.ended || room?.status === "finished";
  const earned =
    room && solved
      ? pointsForGuess(room.config, current?.guesses.length ?? 0)
      : 0;
  return (
    <div
      className={`app-shell ${room?.status !== "lobby" && room ? "play-shell" : "room-shell"}`}
    >
      <TopNav>
        {room && (
          <button
            className="icon-button leave-control"
            aria-label="Leave room"
            title="Leave room"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut size={18} />
          </button>
        )}
      </TopNav>
      <main
        className={
          room?.status === "lobby" || !room
            ? "room-main"
            : "play-main multiplayer-main"
        }
      >
        {loading ? (
          <div className="game-loading" role="status">
            <LoaderCircle className="spinner" size={22} />
            <h1>Opening room</h1>
            <span>{code}</span>
          </div>
        ) : !room ? (
          <section className="join-gate">
            <h1>{needsJoin ? "Join the room" : "Room unavailable"}</h1>
            <p>{needsJoin ? `Room ${code}` : error}</p>
            {needsJoin && (
              <form onSubmit={join} className="setup-form">
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
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
                <button className="button primary" disabled={busy}>
                  {busy ? "Joining…" : "Join room"}
                  <ArrowRight size={18} />
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void action({
                      action: "spectate",
                      ...(name ? { name } : {}),
                      match: 0,
                    })
                  }
                >
                  Spectate instead
                </button>
              </form>
            )}
            <Link href="/" className="text-button">
              Choose a mode
            </Link>
          </section>
        ) : !me?.active ? (
          <section className="join-gate">
            <h1>You left this match</h1>
            <p>Room {room.code}</p>
            <Link href="/" className="button primary">
              Choose a mode
              <ArrowRight size={18} />
            </Link>
          </section>
        ) : (
          <>
            {error && (
              <div className="game-error" role="alert">
                {error}
              </div>
            )}
            {recovering ? (
              <div className="game-error reconnecting" role="status">
                <span>
                  Connection is slow — retrying your action automatically…
                </span>
              </div>
            ) : network ? (
              <div className="game-error reconnecting" role="status">
                <span>
                  Connection interrupted — retrying automatically. Your board is
                  saved.
                </span>
                <button onClick={() => polling.current?.sync()}>
                  Retry connection
                </button>
              </div>
            ) : null}
            {room.status === "lobby" ? (
              <section className="lobby" aria-label="Room lobby">
                <div className="lobby-title">
                  <h1>
                    {(room.match ?? 0) > 0
                      ? `Match ${(room.match ?? 0) + 1} lobby`
                      : "Your room is open"}
                  </h1>
                  <span>{MODES[room.config.mode].label}</span>
                </div>
                <div className="lobby-code">
                  <span>Room code</span>
                  <button
                    className="code-copy"
                    onClick={() => void copy()}
                    aria-label={`Copy room code ${room.code}`}
                  >
                    {room.code}
                    <Copy size={22} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void copy(true)}
                  >
                    <Link2 size={17} />
                    {copied === "link" ? "Link copied" : "Copy invite link"}
                  </button>
                  <span className="sr-only" role="status">
                    {copied === "code" ? "Room code copied" : ""}
                  </span>
                </div>
                <div className="lobby-rules">
                  <span>{room.config.rounds} rounds</span>
                  <span>
                    {room.config.seconds === 0
                      ? "No time limit"
                      : `${room.config.seconds}s / round`}
                  </span>
                  <span>
                    {room.config.scoring === "bonus"
                      ? "6–1 bonus points"
                      : "1 point / solve"}
                  </span>
                  <span>{room.config.difficulty ?? "mixed"} words</span>
                  {championship && <span>{room.config.matches} matches</span>}
                </div>
                <div className="lobby-roster-heading">
                  <h2>Players</h2>
                  <span>
                    {room.players.filter((player) => player.active).length} /{" "}
                    {room.config.players} joined
                  </span>
                </div>
                <ul className="lobby-roster">
                  {Array.from({ length: room.config.players }, (_, index) => {
                    const player = room.players[index];
                    return (
                      <li key={player?.id ?? `seat-${index}`}>
                        {player ? (
                          <>
                            <PlayerAvatar player={player} />
                            <div>
                              <strong>
                                {player.name}
                                {player.id === room.me && <small> · you</small>}
                              </strong>
                              <span>
                                {!player.active
                                  ? "Left championship"
                                  : room.config.mode === "teams"
                                    ? `${player.team === 0 ? "Green" : "Gold"} team`
                                    : "Joined"}
                              </span>
                            </div>
                            {player.id === room.host && (
                              <span className="host-label">
                                <Crown size={15} />
                                Host
                              </span>
                            )}
                            {player.id !== room.me &&
                              player.id !== room.host && (
                                <span className="player-actions">
                                  {host && (
                                    <>
                                      <button
                                        className="text-button"
                                        disabled={busy || network}
                                        onClick={() =>
                                          void action({
                                            action: "kick",
                                            target: player.id,
                                            match: room.match ?? 0,
                                          })
                                        }
                                      >
                                        Kick
                                      </button>
                                      <button
                                        className="text-button"
                                        disabled={busy || network}
                                        onClick={() =>
                                          void action({
                                            action: "ban",
                                            target: player.id,
                                            match: room.match ?? 0,
                                          })
                                        }
                                      >
                                        Ban
                                      </button>
                                    </>
                                  )}
                                  <button
                                    className="text-button"
                                    disabled={busy || network}
                                    onClick={() =>
                                      void action({
                                        action: "voteban",
                                        target: player.id,
                                        match: room.match ?? 0,
                                      })
                                    }
                                  >
                                    Vote ban
                                    {room.banVotes?.[player.id]?.length
                                      ? ` (${room.banVotes[player.id].length})`
                                      : ""}
                                  </button>
                                </span>
                              )}
                          </>
                        ) : (
                          <>
                            <span className="avatar empty-avatar">
                              <UserRound size={18} />
                            </span>
                            <span className="empty-seat">Open seat</span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {room.config.mode === "teams" && me && (
                  <div className="team-picker">
                    <span>Your team</span>
                    <div className="segmented">
                      {[0, 1].map((team) => (
                        <button
                          key={team}
                          aria-pressed={me.team === team}
                          disabled={
                            busy || me.team === team || (room.match ?? 0) > 0
                          }
                          onClick={() => void action({ action: "team", team })}
                        >
                          {team === 0 ? "Green" : "Gold"}
                          {me.team === team && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="lobby-start">
                  {blockedChampionship ? (
                    <>
                      <p>
                        A player left. Championships keep the original roster.
                      </p>
                      <Link href="/" className="button primary">
                        Create a new room
                        <ArrowRight size={18} />
                      </Link>
                    </>
                  ) : host ? (
                    <>
                      <button
                        className="button primary"
                        disabled={
                          busy ||
                          room.players.length !== room.config.players ||
                          room.players.some((player) => !player.active)
                        }
                        onClick={() =>
                          void action({
                            action: "start",
                            match: room.match ?? 0,
                          })
                        }
                      >
                        {busy ? "Starting…" : "Start the match"}
                        <ArrowRight size={18} />
                      </button>
                      {room.players.length < room.config.players && (
                        <p>
                          Waiting for{" "}
                          {room.config.players - room.players.length} more to
                          join.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="waiting-host">
                      Waiting for{" "}
                      {room.players.find((player) => player.id === room.host)
                        ?.name ?? "the host"}{" "}
                      to start.
                    </p>
                  )}
                </div>
                {championship && room.matches?.length ? (
                  <details className="match-details">
                    <summary>Tournament standings</summary>
                    <ChampionshipStandings room={room} />
                  </details>
                ) : null}
              </section>
            ) : (
              <section className="game-stage" aria-label="Multiplayer round">
                <div className="game-context">
                  <div>
                    <h1>{MODES[room.config.mode].label}</h1>
                    {spectator && (
                      <span className="context-meta">Spectating</span>
                    )}
                    {championship && (
                      <span className="context-meta">
                        Match {(room.match ?? 0) + 1}/{room.config.matches}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="connection-quality">
                      {network ? "Poor connection" : "Connected"}
                    </span>
                    <button
                      className="text-button compact-room-code"
                      onClick={() => void copy(true)}
                      aria-label="Copy invite link"
                    >
                      {room.code}
                      <Link2 size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="How to play"
                      onClick={() => setShowRules(true)}
                    >
                      <CircleHelp size={19} />
                    </button>
                  </div>
                </div>
                <div className="match-scoreboard" aria-label="Match scores">
                  <div>
                    <span>
                      {room.config.mode === "teams" ? "Green team" : "You"}
                    </span>
                    <strong>
                      {room.config.mode === "teams" ? teamScores[0] : me.score}
                      <small> pts</small>
                    </strong>
                  </div>
                  <div className="match-clock">
                    <strong
                      role="timer"
                      aria-label={
                        roundDone
                          ? "Round complete"
                          : room.config.seconds === 0
                            ? "No time limit"
                            : "Time remaining"
                      }
                    >
                      {room.status === "finished"
                        ? "Final"
                        : current?.ended
                          ? "Complete"
                          : room.config.seconds === 0
                            ? "∞"
                            : formatTime(seconds)}
                    </strong>
                    <span>
                      Round {room.round + 1}/{room.config.rounds}
                    </span>
                  </div>
                  <div>
                    <span>
                      {room.config.mode === "teams"
                        ? "Gold team"
                        : room.config.mode === "duel"
                          ? (rival?.name ?? "Rival")
                          : (fieldLeader?.name ?? "Rival")}
                    </span>
                    <strong>
                      {room.config.mode === "teams"
                        ? teamScores[1]
                        : room.config.mode === "duel"
                          ? (rival?.score ?? 0)
                          : (fieldLeader?.score ?? 0)}
                      <small> pts</small>
                    </strong>
                  </div>
                </div>
                <div
                  className="round-progress"
                  role="region"
                  tabIndex={0}
                  aria-label="Round progress"
                >
                  {room.players.map((player) => (
                    <span key={player.id}>
                      <strong>
                        {player.id === room.me ? "You" : player.name}
                      </strong>
                      <span>
                        {!player.active
                          ? "Left"
                          : current?.solved.includes(player.id)
                            ? "Solved"
                            : `${current?.attempts[player.id] ?? 0}/6`}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="game-status" role="status" aria-live="polite">
                  {room.status === "finished" ? (
                    championshipFinal ? (
                      championText
                    ) : (
                      winnerText
                    )
                  ) : current?.ended ? (
                    "Round complete"
                  ) : solved ? (
                    `Solved in ${current?.guesses.length}/6 · +${earned} ${earned === 1 ? "point" : "points"}`
                  ) : exhausted ? (
                    "Out of guesses · others are still playing"
                  ) : room.config.seconds !== 0 && seconds === 0 ? (
                    "Time’s up · checking results…"
                  ) : busy ? (
                    "Checking your guess…"
                  ) : (
                    <span className="sr-only">Your turn. Six guesses.</span>
                  )}
                </div>
                {room.status === "playing" && !current?.ended && (
                  <button
                    className="text-button"
                    disabled={busy || network}
                    onClick={() =>
                      void action({
                        action: "voteSkip",
                        match: room.match ?? 0,
                        matchId: room.matchId,
                      })
                    }
                  >
                    Vote to skip round
                    {current?.skipVotes?.length
                      ? ` (${current.skipVotes.length})`
                      : ""}
                  </button>
                )}
                {current?.firstSolve && (
                  <p className="first-solve">
                    First solve:{" "}
                    {room.players.find((p) => p.id === current.firstSolve)
                      ?.name ?? "a player"}
                  </p>
                )}
                {countdown > 0 && (
                  <div className="round-countdown" role="status">
                    Round starts in {countdown}
                  </div>
                )}
                <WordPlay
                  key={`${room.match ?? 0}:${room.round}`}
                  guesses={current?.guesses ?? []}
                  playable={playable && !showRules && !confirmLeave}
                  busy={busy}
                  showKeyboard={!roundDone}
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
                {roundDone && (
                  <section className="result-panel" aria-label="Round result">
                    <div className="result-word">
                      <span>The word</span>
                      <h2>{current?.answer?.toUpperCase()}</h2>
                      <span>
                        {solved ? `+${earned} points` : "No points this round"}
                      </span>
                    </div>
                    <div className="result-actions">
                      {host ? (
                        room.status !== "finished" ? (
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() =>
                              void action({
                                action: "next",
                                round: room.round,
                                match: room.match ?? 0,
                                matchId: room.matchId,
                              })
                            }
                          >
                            Next round
                            <ArrowRight size={18} />
                          </button>
                        ) : championship && moreMatches ? (
                          <button
                            className="button primary"
                            disabled={
                              busy ||
                              room.players.some((player) => !player.active)
                            }
                            onClick={() =>
                              void action({
                                action: "nextMatch",
                                match: room.match ?? 0,
                              })
                            }
                          >
                            Start match {(room.match ?? 0) + 2}
                            <ArrowRight size={18} />
                          </button>
                        ) : (
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => void action({ action: "replay" })}
                          >
                            Rematch
                            <ArrowRight size={18} />
                          </button>
                        )
                      ) : (
                        <span className="waiting-host">
                          Waiting for the host.
                        </span>
                      )}
                      <button
                        className="button secondary"
                        onClick={() => {
                          const canvas = document.createElement("canvas");
                          canvas.width = 640;
                          canvas.height = 360;
                          const ctx = canvas.getContext("2d");
                          if (!ctx) return;
                          ctx.fillStyle = "#F6F3E9";
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          ctx.fillStyle = "#17211D";
                          ctx.font = "bold 28px sans-serif";
                          ctx.fillText("Word Rally", 24, 42);
                          ctx.font = "16px sans-serif";
                          ctx.fillText(
                            `Room ${room.code} · Round ${room.round + 1}/${room.config.rounds}`,
                            24,
                            70,
                          );
                          let y = 110;
                          for (const player of sorted) {
                            ctx.fillText(
                              `${player.name}: ${player.score} pts`,
                              24,
                              y,
                            );
                            y += 26;
                          }
                          ctx.fillText(
                            room.status === "finished"
                              ? "Match complete"
                              : "Round complete",
                            24,
                            y + 10,
                          );
                          const link = document.createElement("a");
                          link.download = `word-rally-${room.code}.png`;
                          link.href = canvas.toDataURL("image/png");
                          link.click();
                        }}
                      >
                        Share result
                      </button>
                    </div>
                  </section>
                )}
                <details className="player-progress">
                  <summary>
                    Players{" "}
                    <span>
                      {current?.solved.length ?? 0}/{room.players.length} solved
                    </span>
                  </summary>
                  <ol>
                    {sorted.map((player) => (
                      <li key={player.id}>
                        <span className="progress-name">
                          {player.name}
                          {player.id === room.me && <small> · you</small>}
                        </span>
                        {player.id !== room.me &&
                          player.id !== room.host &&
                          player.active && (
                            <span className="player-actions">
                              {host && (
                                <>
                                  <button
                                    className="text-button"
                                    disabled={busy || network}
                                    onClick={() =>
                                      void action({
                                        action: "kick",
                                        target: player.id,
                                        match: room.match ?? 0,
                                        matchId: room.matchId,
                                      })
                                    }
                                  >
                                    Kick
                                  </button>
                                  <button
                                    className="text-button"
                                    disabled={busy || network}
                                    onClick={() =>
                                      void action({
                                        action: "ban",
                                        target: player.id,
                                        match: room.match ?? 0,
                                        matchId: room.matchId,
                                      })
                                    }
                                  >
                                    Ban
                                  </button>
                                </>
                              )}
                              <button
                                className="text-button"
                                disabled={busy || network}
                                onClick={() =>
                                  void action({
                                    action: "voteban",
                                    target: player.id,
                                    match: room.match ?? 0,
                                    matchId: room.matchId,
                                  })
                                }
                              >
                                Vote ban
                                {room.banVotes?.[player.id]?.length
                                  ? ` (${room.banVotes[player.id].length})`
                                  : ""}
                              </button>
                            </span>
                          )}
                        <span>
                          {!player.active
                            ? "Left match"
                            : current?.solved.includes(player.id)
                              ? "Solved"
                              : (current?.attempts[player.id] ?? 0) >= 6
                                ? "Out of guesses"
                                : `${current?.attempts[player.id] ?? 0}/6 guesses`}
                        </span>
                        <strong>
                          {player.score} <small>pts</small>
                        </strong>
                      </li>
                    ))}
                  </ol>
                </details>
                {roundDone && (
                  <details className="match-details">
                    <summary>
                      {championship
                        ? "Match & tournament breakdown"
                        : "Match breakdown"}
                    </summary>
                    <MatchBreakdown rounds={room.results} />
                    {championship && <ChampionshipStandings room={room} />}
                  </details>
                )}
              </section>
            )}
          </>
        )}
      </main>
      {showRules && (
        <Modal title="How to play" close={() => setShowRules(false)}>
          <Rules />
        </Modal>
      )}
      {confirmLeave && (
        <Modal title="Leave this room?" close={() => setConfirmLeave(false)}>
          <p>Your current turn ends when you leave.</p>
          <div className="result-actions">
            <button
              className="button secondary"
              onClick={() => setConfirmLeave(false)}
            >
              Keep playing
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void leave()}
            >
              Leave room
              <LogOut size={17} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
