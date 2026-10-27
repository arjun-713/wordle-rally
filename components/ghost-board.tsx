import type { Mark } from "@/lib/types";

export type GhostRow = { marks: Mark[]; word?: string };

const markLabel: Record<Mark, string> = {
  correct: "correct",
  present: "wrong position",
  absent: "absent",
};

// A rival's board without letters: colours only while the round is live, words
// once the server reveals them after the round ends.
export function GhostBoard({
  name,
  rows,
  solved,
  out,
  left = false,
  variant = "mini",
}: {
  name: string;
  rows: GhostRow[];
  solved: boolean;
  out: boolean;
  left?: boolean;
  variant?: "mini" | "duel";
}) {
  const status = left
    ? "Left"
    : solved
      ? "Solved"
      : out
        ? "Out"
        : `${rows.length}/6`;
  const state = left ? "left" : solved ? "solved" : out ? "out" : "live";
  const revealed = rows.some((row) => row.word);
  const words = revealed
    ? `; guesses ${rows.map((row) => row.word?.toUpperCase()).join(", ")}`
    : "";
  return (
    <figure
      className={`ghost-board ghost-${variant} ghost-${state} ${revealed ? "ghost-revealed" : ""}`}
      aria-label={`${name}: ${state === "live" ? `${rows.length} of 6 guesses` : status.toLowerCase()}${words}`}
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
                >
                  {guess?.word?.[col]?.toUpperCase() ?? ""}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <figcaption>
        <strong>{name}</strong>
        <span>{status}</span>
      </figcaption>
    </figure>
  );
}
