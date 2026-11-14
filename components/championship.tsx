"use client";
import { Trophy } from "lucide-react";
import type { MatchResult, PublicRoom } from "@/lib/types";
import { tournamentTotals } from "./match-results";
import { PlayerAvatar, teamName } from "./room-players";

type Score = { id: string; name: string; team: number; score: number };
type Side = { key: string; name: string; tone: string; members: string[] };
type State = "done" | "live" | "next" | "later";

const listNames = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`
    : (names[0] ?? "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Two sides in duel and team modes: the two players, or Green and Gold.
function sidesOf(room: PublicRoom): Side[] | null {
  if (room.config.mode === "teams")
    return [0, 1].map((team) => ({
      key: `team-${team}`,
      name: teamName(team),
      tone: `team-${team}`,
      members: room.players.filter((p) => p.team === team).map((p) => p.name),
    }));
  if (room.config.mode === "duel" && room.players.length === 2)
    return room.players.map((p, i) => ({
      key: p.id,
      name: p.name,
      tone: `tone-${i}`,
      members: [p.name],
    }));
  return null;
}
function sideScore(room: PublicRoom, side: Side, scores: Score[]) {
  if (side.key.startsWith("team-")) {
    const team = Number(side.key.slice(5));
    return scores
      .filter((s) => s.team === team)
      .reduce((sum, s) => sum + s.score, 0);
  }
  return scores.find((s) => s.id === side.key)?.score ?? 0;
}
// Index of the winning side, -1 for a draw.
function sideWinner(points: number[]) {
  return points[0] === points[1] ? -1 : points[0] > points[1] ? 0 : 1;
}
function topScorers(scores: Score[]) {
  const top = Math.max(0, ...scores.map((s) => s.score));
  return {
    top,
    names: top > 0 ? scores.filter((s) => s.score === top) : [],
  };
}

export function seriesState(room: PublicRoom) {
  const total = room.config.matches ?? 1;
  const results = room.matches ?? [];
  const current = room.match ?? 0;
  const over = room.status === "finished" && current + 1 >= total;
  const upNext =
    room.status === "lobby"
      ? current
      : room.status === "finished" && !over
        ? current + 1
        : -1;
  const state = (i: number): State =>
    results.some((m) => m.number === i + 1)
      ? "done"
      : room.status === "playing" && i === current
        ? "live"
        : i === upNext
          ? "next"
          : "later";
  return { total, results, current, over, state };
}

// Who leads the series, in the app's terse voice.
function leadText(room: PublicRoom, results: MatchResult[], over: boolean) {
  if (!results.length) return "No matches played yet";
  const sides = sidesOf(room);
  const totals = tournamentTotals(results);
  let leader: string | null, margin: number;
  if (sides) {
    const points = sides.map((side) => sideScore(room, side, totals));
    const w = sideWinner(points);
    leader = w < 0 ? null : sides[w].name;
    margin = Math.abs(points[0] - points[1]);
  } else {
    leader =
      totals.length > 1 && totals[0].score === totals[1].score
        ? null
        : (totals[0]?.name ?? null);
    margin = (totals[0]?.score ?? 0) - (totals[1]?.score ?? 0);
  }
  if (!leader) return "Level on points";
  return `${leader} ${over ? "wins" : "leads"} by ${plural(margin, "pt")}`;
}

export function seriesLabel(room: PublicRoom) {
  const { total, current, over } = seriesState(room);
  return over ? `${total} matches` : `Match ${current + 1}/${total}`;
}

export function ChampionshipTrack({
  room,
  headless = false,
}: {
  room: PublicRoom;
  headless?: boolean;
}) {
  const { total, results, current, over, state } = seriesState(room);
  const sides = sidesOf(room);
  const totals = tournamentTotals(results);
  const sidePoints = sides?.map((side) => sideScore(room, side, totals));
  const sideWins = sides
    ? [0, 1].map(
        (i) =>
          results.filter(
            (m) =>
              sideWinner(
                sides.map((side) => sideScore(room, side, m.scores)),
              ) === i,
          ).length,
      )
    : [];
  const freeWins = (id: string) =>
    results.filter((m) => topScorers(m.scores).names.some((s) => s.id === id))
      .length;
  const lead = sidePoints ? sideWinner(sidePoints) : -1;
  const live = room.players.map(({ id, name, team, score }) => ({
    id,
    name,
    team,
    score,
  }));
  const rounds = room.config.rounds;

  return (
    <section
      className={`champ ${total <= 5 ? "champ-fits" : ""}`}
      aria-label="Championship"
    >
      <header className="champ-head">
        <div>
          {!headless && (
            <span className="champ-kicker">
              <Trophy size={14} aria-hidden="true" />
              Championship
            </span>
          )}
          <h2>
            {over
              ? "Series complete"
              : room.status === "finished"
                ? `${current + 1} of ${total} played`
                : `Match ${current + 1} of ${total}`}
          </h2>
        </div>
        <p>{leadText(room, results, over)}</p>
      </header>
      {sides && sidePoints ? (
        <div className="champ-score" role="group" aria-label="Series points">
          {sides.map((side, i) => (
            <div
              key={side.key}
              className={`champ-side side-${i} ${side.tone} ${lead === i ? "leading" : ""}`}
            >
              <span className="champ-side-name">
                {side.name}
                {room.config.mode === "teams" && (
                  <small>{side.members.join(" · ")}</small>
                )}
              </span>
              <strong>{sidePoints[i]}</strong>
              <small>{plural(sideWins[i], "win")}</small>
            </div>
          ))}
          <span className="champ-vs" aria-hidden="true">
            pts
          </span>
        </div>
      ) : (
        <ol className="champ-top" aria-label="Series top three">
          {(totals.length ? totals : live).slice(0, 3).map((p, i) => (
            <li key={p.id}>
              <span className="champ-place">
                {totals.length
                  ? 1 + totals.filter((t) => t.score > p.score).length
                  : i + 1}
              </span>
              <strong>
                {p.name}
                {p.id === room.me && <small> (you)</small>}
              </strong>
              <span>
                {totals.length ? plural(p.score, "pt") : "—"}
                {totals.length ? ` · ${plural(freeWins(p.id), "win")}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      <ol className="champ-track" aria-label="Matches">
        {Array.from({ length: total }, (_, i) => {
          const s = state(i);
          const result = results.find((m) => m.number === i + 1);
          const scores = result?.scores ?? (s === "live" ? live : null);
          return (
            <li
              key={i}
              className={`champ-match is-${s}`}
              aria-current={s === "live" || s === "next" ? "step" : undefined}
            >
              <span className="champ-node" aria-hidden="true">
                {i + 1}
              </span>
              <div className="champ-card">
                <div className="champ-card-head">
                  <span>Match {i + 1}</span>
                  {s === "live" ? (
                    <span className="champ-tag live">
                      <span className="champ-pulse" aria-hidden="true" />
                      Live · Round {room.round + 1}/{rounds}
                    </span>
                  ) : s === "next" ? (
                    <span className="champ-tag next">Up next</span>
                  ) : s === "done" ? (
                    <span className="champ-tag done">Final</span>
                  ) : null}
                </div>
                {sides ? (
                  scores ? (
                    <SideLine
                      room={room}
                      sides={sides}
                      scores={scores}
                      done={s === "done"}
                    />
                  ) : (
                    <p className="champ-line">
                      <span>{sides[0].name}</span>
                      <span className="champ-vs-word">vs</span>
                      <span>{sides[1].name}</span>
                    </p>
                  )
                ) : scores ? (
                  <FreeLine scores={scores} done={s === "done"} />
                ) : (
                  <p className="champ-line champ-roster">
                    <span className="champ-stack" aria-hidden="true">
                      {room.players.slice(0, 4).map((p, k) => (
                        <PlayerAvatar key={p.id} player={p} index={k} />
                      ))}
                    </span>
                    {plural(room.players.length, "player")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SideLine({
  room,
  sides,
  scores,
  done,
}: {
  room: PublicRoom;
  sides: Side[];
  scores: Score[];
  done: boolean;
}) {
  const points = sides.map((side) => sideScore(room, side, scores));
  const w = sideWinner(points);
  return (
    <>
      <p
        className={`champ-line champ-result ${done && w >= 0 ? "decided" : ""}`}
      >
        <span className={w === 0 ? "win" : ""}>{sides[0].name}</span>
        <strong>
          {points[0]}
          <span aria-hidden="true">–</span>
          <span className="sr-only"> to </span>
          {points[1]}
        </strong>
        <span className={w === 1 ? "win" : ""}>{sides[1].name}</span>
      </p>
      <p className="champ-note">
        {done
          ? w < 0
            ? "Draw"
            : `${sides[w].name} won`
          : w < 0
            ? "Level"
            : `${sides[w].name} ahead`}
      </p>
    </>
  );
}

function FreeLine({ scores, done }: { scores: Score[]; done: boolean }) {
  const { top, names } = topScorers(scores);
  if (done)
    return (
      <>
        <p className="champ-line">
          {names.length ? (
            <span className="win">
              {listNames(names.map((n) => n.name))} · {plural(top, "pt")}
            </span>
          ) : (
            <span>No points</span>
          )}
        </p>
        <p className="champ-note">
          {names.length > 1
            ? "Shared win"
            : names.length
              ? "Winner"
              : "No winner"}
        </p>
      </>
    );
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return (
    <>
      <p className="champ-line">
        {names.length === 1 ? (
          <span className="win">
            {names[0].name} leads · {plural(top, "pt")}
          </span>
        ) : (
          <span>{names.length ? "Tied at the top" : "No points yet"}</span>
        )}
      </p>
      <p className="champ-note">
        {sorted
          .slice(0, 3)
          .map((s) => `${s.name} ${s.score}`)
          .join(" · ")}
      </p>
    </>
  );
}
