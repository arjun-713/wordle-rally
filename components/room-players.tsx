"use client";
import type { ReactNode } from "react";
import { Ban, Crown, Ellipsis, Trophy, UserX, Vote } from "lucide-react";
import type {
  GhostRow,
  RaceWordState,
  Mark,
  MatchResult,
  Player,
  PublicRoom,
  RoundResult,
} from "@/lib/types";
import { Modal } from "./shared";

const markLabel: Record<Mark, string> = {
  correct: "correct",
  present: "wrong position",
  absent: "absent",
};
export const teamName = (team: number) => (team === 0 ? "Green" : "Gold");

export function PlayerAvatar({
  player,
  index = 0,
}: {
  player: Pick<Player, "name">;
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

// A player's board as colours only — letters are never shown.
export function GhostBoard({
  name,
  rows,
  solved,
  out,
  left = false,
}: {
  name: string;
  rows: GhostRow[];
  solved: boolean;
  out: boolean;
  left?: boolean;
}) {
  const state = left ? "left" : solved ? "solved" : out ? "out" : "live";
  return (
    <figure
      className={`ghost-board ghost-${state}`}
      aria-label={`${name}: ${rows.length} of 6 guesses`}
    >
      <div className="ghost-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, row) => {
          const guess = rows[row];
          return (
            <div className="ghost-row" key={row}>
              {Array.from({ length: 5 }, (_, col) => (
                <span
                  key={col}
                  className={`ghost-tile ${guess?.marks[col] ?? ""}`}
                  title={guess ? markLabel[guess.marks[col]] : undefined}
                />
              ))}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

// Mirrors the server: a majority of the other active players removes a player.
export function kickVotes(room: PublicRoom, targetId: string) {
  const voters = room.banVotes?.[targetId] ?? [];
  const eligible = room.players.filter(
    (p) => p.active && p.id !== targetId,
  ).length;
  return {
    votes: voters.length,
    needed: Math.floor(eligible / 2) + 1,
    mine: voters.includes(room.me),
  };
}

// Competition ranking: tied scores share a place (1, 1, 3).
function ranks<T extends { score: number }>(sorted: T[]) {
  return sorted.map(
    (entry) => sorted.findIndex((other) => other.score === entry.score) + 1,
  );
}

export function canManage(room: PublicRoom, player: Player) {
  const viewer = room.players.find((p) => p.id === room.me);
  return (
    !!viewer?.active &&
    player.active &&
    player.id !== room.me &&
    player.id !== room.host
  );
}

function playerStatus(room: PublicRoom, player: Player) {
  const current = room.current;
  if (!player.active) return "Left";
  if (room.status === "lobby")
    return room.config.mode === "teams"
      ? `${teamName(player.team)} team`
      : "Joined";
  const attempts = current?.attempts[player.id] ?? 0;
  if (current?.solved.includes(player.id)) return `Solved in ${attempts}`;
  if (attempts >= 6) return "Out of guesses";
  if (current?.ended) return "Unsolved";
  return attempts ? `Guess ${attempts}/6` : "Thinking…";
}

// A Fast Fingers run as one square per word: colours only, no letters.
export function RaceProgress({
  name,
  states,
}: {
  name: string;
  states: RaceWordState[];
}) {
  const solved = states.filter((state) => state === "solved").length;
  return (
    <span
      className="race-progress"
      role="img"
      aria-label={`${name}: ${solved} of ${states.length} words solved`}
    >
      {states.map((state, i) => (
        <span key={i} className={`race-dot ${state}`} />
      ))}
    </span>
  );
}

const clock = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function Standings({
  room,
  onManage,
}: {
  room: PublicRoom;
  onManage: (player: Player) => void;
}) {
  const current = room.current;
  const race = room.race;
  const raceSolved = (id: string) =>
    race?.progress[id]?.filter((state) => state === "solved").length ?? 0;
  // During a race, rank by words solved, then bonus points.
  const sorted = [...room.players].sort((a, b) =>
    race
      ? raceSolved(b.id) - raceSolved(a.id) || b.score - a.score
      : b.score - a.score,
  );
  const places = race
    ? sorted.map(
        (p) =>
          sorted.findIndex(
            (o) => raceSolved(o.id) === raceSolved(p.id) && o.score === p.score,
          ) + 1,
      )
    : ranks(sorted);
  const finished = race
    ? race.standings.filter((p) => p.elapsed !== null).length
    : 0;
  const teams = [0, 1].map((team) =>
    room.players
      .filter((p) => p.team === team)
      .reduce((sum, p) => sum + p.score, 0),
  );
  const solvedCount = current?.solved.length ?? 0;
  return (
    <aside className="standings" aria-label="Players and scores">
      <div className="standings-head">
        <h2>Standings</h2>
        <span>
          {race
            ? `${finished}/${room.players.filter((p) => p.active).length} finished`
            : `${solvedCount}/${room.players.filter((p) => p.active).length} solved`}
        </span>
      </div>
      {room.config.mode === "teams" && (
        <div className="standings-teams" aria-label="Team scores">
          {[0, 1].map((team) => (
            <div
              key={team}
              className={`team-total team-${team} ${teams[team] > teams[1 - team] ? "leading" : ""}`}
            >
              <span>{teamName(team)}</span>
              <strong>{teams[team]}</strong>
            </div>
          ))}
        </div>
      )}
      <ol className="standings-list" tabIndex={0} aria-label="Player standings">
        {sorted.map((player, index) => {
          const me = player.id === room.me;
          const rows: GhostRow[] = me
            ? (current?.guesses ?? []).map((g) => ({ marks: g.marks }))
            : (current?.ghosts?.[player.id] ?? []);
          const attempts = current?.attempts[player.id] ?? 0;
          const standing = race?.standings.find((p) => p.id === player.id);
          const won = race
            ? standing?.elapsed != null
            : !!current?.solved.includes(player.id);
          const vote = kickVotes(room, player.id);
          const manageable = canManage(room, player);
          return (
            <li
              key={player.id}
              className={[
                "standing",
                me && "is-me",
                won && "is-solved",
                !player.active && "is-left",
                places[index] === 1 && player.score > 0 && "is-leader",
                room.config.mode === "teams" && `team-${player.team}`,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className="standing-rank"
                aria-label={`Place ${places[index]}`}
              >
                {places[index]}
              </span>
              <PlayerAvatar
                player={player}
                index={room.players.indexOf(player)}
              />
              <span className="standing-name">
                <span>{me ? "You" : player.name}</span>
                {player.id === room.host && (
                  <Crown size={13} aria-label="Host" />
                )}
              </span>
              <span className="standing-status">
                {vote.votes > 0 && player.active ? (
                  <button
                    className="kick-chip"
                    onClick={() => onManage(player)}
                    disabled={!manageable}
                  >
                    Kick vote {vote.votes}/{vote.needed}
                  </button>
                ) : race && player.active ? (
                  standing?.elapsed != null ? (
                    `Finished · ${clock(standing.elapsed)}`
                  ) : (
                    `${raceSolved(player.id)}/${race.words.length} solved`
                  )
                ) : (
                  playerStatus(room, player)
                )}
              </span>
              {race ? (
                <RaceProgress
                  name={me ? "Your run" : `${player.name}'s run`}
                  states={race.progress[player.id] ?? []}
                />
              ) : (
                <GhostBoard
                  name={me ? "Your board" : `${player.name}'s board`}
                  rows={rows}
                  solved={won}
                  out={!won && attempts >= 6}
                  left={!player.active}
                />
              )}
              <strong className="standing-score">
                {player.score}
                <small>pts</small>
              </strong>
              {manageable ? (
                <button
                  className="icon-button standing-menu"
                  aria-label={`Manage ${player.name}`}
                  onClick={() => onManage(player)}
                >
                  <Ellipsis size={18} />
                </button>
              ) : (
                <span className="standing-menu" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function ManagePlayer({
  room,
  player,
  busy,
  close,
  act,
}: {
  room: PublicRoom;
  player: Player;
  busy: boolean;
  close: () => void;
  act: (action: "kick" | "ban" | "voteban") => void;
}) {
  const host = room.host === room.me;
  const lobby = room.status === "lobby" && (room.match ?? 0) === 0;
  const vote = kickVotes(room, player.id);
  return (
    <Modal title={player.name} close={close}>
      <div className="manage-player">
        {host ? (
          <>
            <button
              className="manage-option"
              disabled={busy}
              onClick={() => act("kick")}
            >
              <UserX size={20} />
              <span>
                <strong>Kick {player.name}</strong>
                <small>
                  {lobby
                    ? "Removes them from the room. They can rejoin with the code."
                    : "Takes them out of this match. Their points stay in the results."}
                </small>
              </span>
            </button>
            <button
              className="manage-option danger"
              disabled={busy}
              onClick={() => act("ban")}
            >
              <Ban size={20} />
              <span>
                <strong>Ban {player.name}</strong>
                <small>
                  Removes them and blocks them from rejoining this room.
                </small>
              </span>
            </button>
          </>
        ) : (
          <>
            <div className="vote-meter" aria-label="Kick votes">
              <div>
                <strong>
                  {vote.votes} of {vote.needed}
                </strong>{" "}
                votes to kick
              </div>
              <div className="vote-track" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, (vote.votes / vote.needed) * 100)}%`,
                  }}
                />
              </div>
              <small>
                A majority of the other players removes {player.name}. Players
                removed by vote can’t rejoin this room.
              </small>
            </div>
            <button
              className="button primary"
              disabled={busy || vote.mine}
              onClick={() => act("voteban")}
            >
              <Vote size={18} />
              {vote.mine
                ? "You voted to kick"
                : vote.votes
                  ? "Add your vote"
                  : "Nominate to kick"}
            </button>
          </>
        )}
        <button className="button secondary" onClick={close}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

type Row = {
  id: string;
  name: string;
  team: number;
  score: number;
  solves: number;
  rounds: number;
  avg: number | null;
  fastest: number | null;
};
function leaderboardRows(
  scores: { id: string; name: string; team: number; score: number }[],
  rounds: RoundResult[],
): Row[] {
  return scores
    .map((p) => {
      const entries = rounds
        .map((r) => r.players.find((e) => e.id === p.id))
        .filter((e) => !!e);
      const wins = entries.filter((e) => e.solved);
      const times = wins
        .map((e) => e.elapsed)
        .filter((t): t is number => t !== null);
      return {
        ...p,
        solves: wins.length,
        rounds: rounds.length,
        avg: wins.length
          ? wins.reduce((sum, e) => sum + e.guesses, 0) / wins.length
          : null,
        fastest: times.length ? Math.min(...times) : null,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.solves - a.solves || (a.avg ?? 7) - (b.avg ?? 7),
    );
}

export function FinalLeaderboard({
  room,
  title,
  championship,
  matches,
  children,
}: {
  room: PublicRoom;
  title: string;
  championship: boolean;
  matches: MatchResult[];
  children: ReactNode;
}) {
  const scores = championship
    ? (() => {
        const totals = new Map<string, Row>();
        for (const m of matches)
          for (const s of m.scores) {
            const prev = totals.get(s.id);
            totals.set(s.id, {
              ...s,
              score: (prev?.score ?? 0) + s.score,
            } as Row);
          }
        return [...totals.values()];
      })()
    : room.players;
  const rounds = championship ? matches.flatMap((m) => m.rounds) : room.results;
  const rows = leaderboardRows(scores, rounds);
  const places = ranks(rows);
  const teams = [0, 1].map((team) =>
    rows.filter((r) => r.team === team).reduce((sum, r) => sum + r.score, 0),
  );
  const mine = rows.findIndex((r) => r.id === room.me);
  const podium = [1, 0, 2]
    .map((i) => rows[i] && { row: rows[i], place: places[i] })
    .filter((entry) => !!entry);
  const lastWord = room.current?.answer;
  return (
    <section className="final-board" aria-labelledby="final-title">
      <header className="final-head">
        <Trophy size={28} aria-hidden="true" />
        <span>{championship ? "Championship complete" : "Match complete"}</span>
        <h2 id="final-title">{title}</h2>
        {mine >= 0 && (
          <p>
            You finished{" "}
            <strong>{places[mine] === 1 ? "first" : `#${places[mine]}`}</strong>{" "}
            with {rows[mine].score}{" "}
            {rows[mine].score === 1 ? "point" : "points"}
            {lastWord && (
              <>
                {" "}
                · last word <strong>{lastWord.toUpperCase()}</strong>
              </>
            )}
          </p>
        )}
      </header>
      {room.config.mode === "teams" && (
        <div className="final-teams">
          {[0, 1].map((team) => (
            <div
              key={team}
              className={`team-total team-${team} ${teams[team] > teams[1 - team] ? "leading" : ""}`}
            >
              <span>{teamName(team)} team</span>
              <strong>{teams[team]}</strong>
            </div>
          ))}
        </div>
      )}
      {rows.length > 1 && (
        <ol className="podium" aria-label="Podium">
          {podium.map(({ row, place }) => (
            <li
              key={row.id}
              className={`podium-step place-${Math.min(place, 3)} ${row.id === room.me ? "is-me" : ""}`}
            >
              <PlayerAvatar
                player={row}
                index={room.players.findIndex((p) => p.id === row.id)}
              />
              <strong>{row.id === room.me ? "You" : row.name}</strong>
              <span className="podium-score">{row.score} pts</span>
              <span className="podium-block" aria-label={`Place ${place}`}>
                {place === 1 ? <Crown size={22} /> : place}
              </span>
            </li>
          ))}
        </ol>
      )}
      <ol className="leaderboard" aria-label="Final leaderboard">
        {rows.map((row, i) => (
          <li key={row.id} className={row.id === room.me ? "is-me" : ""}>
            <span className="leaderboard-rank">{places[i]}</span>
            <PlayerAvatar
              player={row}
              index={room.players.findIndex((p) => p.id === row.id)}
            />
            <span className="leaderboard-name">
              <strong>
                {row.name}
                {row.id === room.me && <small> · you</small>}
              </strong>
              <span>
                {row.solves}/{row.rounds} solved
                {row.avg !== null && ` · ${row.avg.toFixed(1)} avg guesses`}
                {row.fastest !== null &&
                  ` · fastest ${(row.fastest / 1000).toFixed(1)}s`}
                {room.config.mode === "teams" && ` · ${teamName(row.team)}`}
              </span>
            </span>
            <strong className="leaderboard-score">
              {row.score}
              <small>pts</small>
            </strong>
          </li>
        ))}
      </ol>
      <div className="result-actions">{children}</div>
    </section>
  );
}
