"use client";
import { MODES, type Config, type Mode } from "@/lib/types";

export const defaultConfig: Config = {
  mode: "duel",
  players: 4,
  rounds: 5,
  seconds: 90,
  scoring: "classic",
  difficulty: "mixed",
  matches: 1,
  autoAdvance: false,
};

// The form keeps the player's picks (e.g. a free-for-all seat count) while
// they flip between modes; this applies each mode's fixed rules on save.
export function finalConfig(draft: Config): Config {
  const race = draft.mode === "race";
  return {
    mode: draft.mode,
    players:
      draft.mode === "duel" ? 2 : draft.mode === "teams" ? 4 : draft.players,
    rounds: draft.rounds,
    // Fast Fingers runs on an elapsed race clock with bonus scoring.
    seconds: race ? 0 : draft.seconds,
    scoring: race ? "bonus" : (draft.scoring ?? "classic"),
    difficulty: draft.difficulty ?? "mixed",
    matches: race ? 1 : (draft.matches ?? 1),
    autoAdvance: race ? false : !!draft.autoAdvance,
  };
}

export function sameConfig(a: Config, b: Config) {
  const x = finalConfig(a),
    y = finalConfig(b);
  return (Object.keys(x) as (keyof Config)[]).every((key) => x[key] === y[key]);
}

export function RoomConfigFields({
  value,
  onChange,
  minPlayers = 2,
}: {
  value: Config;
  onChange: (value: Config) => void;
  /** Seats can't drop below the players already in the room. */
  minPlayers?: number;
}) {
  const shown = finalConfig(value),
    race = value.mode === "race";
  function patch(next: Partial<Config>) {
    onChange({ ...value, ...next });
  }
  return (
    <>
      <fieldset>
        <legend>Mode</legend>
        <div className="segmented">
          {(Object.keys(MODES) as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={value.mode === key}
              onClick={() => patch({ mode: key })}
            >
              {MODES[key].label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Players
          <select
            value={shown.players}
            disabled={value.mode === "duel" || value.mode === "teams"}
            onChange={(event) => patch({ players: Number(event.target.value) })}
          >
            {Array.from({ length: 15 }, (_, index) => (
              <option
                key={index}
                value={index + 2}
                disabled={index + 2 < minPlayers}
              >
                {index + 2}
              </option>
            ))}
          </select>
        </label>
        <label>
          {race ? "Words" : "Rounds"}
          <select
            value={value.rounds}
            onChange={(event) => patch({ rounds: Number(event.target.value) })}
          >
            {Array.from({ length: 20 }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          Timer
          <select
            value={shown.seconds}
            disabled={race}
            onChange={(event) => patch({ seconds: Number(event.target.value) })}
          >
            {[0, 30, 60, 90, 120, 180, 300].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0
                  ? race
                    ? "Race clock"
                    : "None"
                  : seconds < 120
                    ? `${seconds} sec`
                    : `${seconds / 60} min`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scoring
          <select
            value={shown.scoring}
            disabled={race}
            onChange={(event) =>
              patch({ scoring: event.target.value as Config["scoring"] })
            }
          >
            <option value="classic">Classic · 1 pt</option>
            <option value="bonus">Bonus · 6–1 pts</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          Difficulty
          <select
            value={shown.difficulty}
            onChange={(event) =>
              patch({ difficulty: event.target.value as Config["difficulty"] })
            }
          >
            <option value="familiar">Familiar</option>
            <option value="challenging">Challenging</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label>
          Format
          <select
            value={(shown.matches ?? 1) > 1 ? "championship" : "single"}
            disabled={race}
            onChange={(event) =>
              patch({ matches: event.target.value === "single" ? 1 : 3 })
            }
          >
            <option value="single">One match</option>
            <option value="championship">Championship</option>
          </select>
        </label>
      </div>
      {race ? (
        <p className="form-note">
          Same words for everyone, any order. Score is half points, half speed.
        </p>
      ) : (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={!!value.autoAdvance}
            onChange={(event) => patch({ autoAdvance: event.target.checked })}
          />
          Auto-advance rounds
        </label>
      )}
      {(shown.matches ?? 1) > 1 && (
        <label>
          Matches
          <select
            value={shown.matches}
            onChange={(event) => patch({ matches: Number(event.target.value) })}
          >
            {Array.from({ length: 9 }, (_, index) => (
              <option key={index} value={index + 2}>
                {index + 2}
              </option>
            ))}
          </select>
          <small>Points carry over between matches.</small>
        </label>
      )}
    </>
  );
}
