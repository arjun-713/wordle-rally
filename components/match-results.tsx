"use client";
import type { MatchResult, PublicRoom, RoundResult } from "@/lib/types";
export function MatchBreakdown({
  rounds,
  label = "Round breakdown",
}: {
  rounds: RoundResult[];
  label?: string;
}) {
  return (
    <section className="round-breakdown">
      <h2>{label}</h2>
      {rounds.map((round, i) => (
        <details
          className="breakdown-round"
          key={`${i}:${round.answer}`}
          open={rounds.length === 1}
        >
          <summary>
            <span>
              Round {i + 1}
              <strong>{round.answer.toUpperCase()}</strong>
            </span>
            <span>{round.solved.length} solved</span>
          </summary>
          <table>
            <caption className="sr-only">
              Round {i + 1} results for {round.answer}
            </caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Guesses</th>
                <th scope="col">Time</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {round.players?.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    {p.name}
                    <small>
                      {p.solved
                        ? "Solved"
                        : p.guesses >= 6
                          ? "Out of guesses"
                          : "Unsolved"}
                    </small>
                  </th>
                  <td>{p.guesses}/6</td>
                  <td>
                    {p.elapsed === null
                      ? "—"
                      : `${(p.elapsed / 1000).toFixed(1)}s`}
                  </td>
                  <td>+{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </section>
  );
}
export function tournamentTotals(matches: MatchResult[]) {
  const totals = new Map<string, MatchResult["scores"][number]>();
  for (const match of matches)
    for (const p of match.scores) {
      const previous = totals.get(p.id);
      totals.set(p.id, { ...p, score: (previous?.score ?? 0) + p.score });
    }
  return [...totals.values()].sort((a, b) => b.score - a.score);
}
export function ChampionshipStandings({ room }: { room: PublicRoom }) {
  const totals = tournamentTotals(room.matches ?? []);
  const teams = [0, 1].map((team) =>
    totals.filter((p) => p.team === team).reduce((sum, p) => sum + p.score, 0),
  );
  return (
    <section className="championship-standings">
      <h2>Championship standings</h2>
      <p>
        {room.matches?.length ?? 0} of {room.config.matches} matches completed ·
        cumulative points
      </p>
      {room.config.mode === "teams" && (
        <div className="team-scoreboard compact">
          <div>
            Green<strong>{teams[0]}</strong>
          </div>
          <span>vs</span>
          <div>
            Gold<strong>{teams[1]}</strong>
          </div>
        </div>
      )}
      <ol>
        {totals.map((p) => (
          <li key={p.id}>
            <div>
              <strong>
                {p.name}
                {p.id === room.me && <small> (you)</small>}
              </strong>
              <span>
                {room.matches
                  ?.map(
                    (m) =>
                      `M${m.number}: ${m.scores.find((s) => s.id === p.id)?.score ?? 0}`,
                  )
                  .join(" · ")}
              </span>
            </div>
            <strong>
              {p.score}
              <small> pts</small>
            </strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
