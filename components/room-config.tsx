"use client";
import { MODES, type Config, type Mode } from "@/lib/types";
export function RoomConfigFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Config;
  onChange: (value: Config) => void;
  disabled?: boolean;
}) {
  const race = value.mode === "race";
  function patch(next: Partial<Config>) {
    onChange({ ...value, ...next });
  }
  function mode(mode: Mode) {
    patch({
      mode,
      players: mode === "duel" ? 2 : mode === "teams" ? 4 : value.players,
      seconds: mode === "race" ? 0 : race ? 90 : value.seconds,
      scoring: mode === "race" ? "bonus" : value.scoring,
      matches: mode === "race" ? 1 : value.matches,
    });
  }
  return (
    <fieldset disabled={disabled} className="room-config-fields">
      <legend className="sr-only">Room settings</legend>
      <fieldset>
        <legend>Game mode</legend>
        <div className="segmented mode-options">
          {(["duel", "teams", "free", "race"] as Mode[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={value.mode === key}
              onClick={() => mode(key)}
            >
              {MODES[key].label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Number of players
          <select
            value={value.players}
            disabled={value.mode === "duel" || value.mode === "teams"}
            onChange={(e) => patch({ players: Number(e.target.value) })}
          >
            {Array.from({ length: 15 }, (_, i) => (
              <option key={i} value={i + 2}>
                {i + 2} players
              </option>
            ))}
          </select>
        </label>
        <label>
          {race ? "Number of words" : "Number of rounds"}
          <select
            value={value.rounds}
            onChange={(e) => patch({ rounds: Number(e.target.value) })}
          >
            {Array.from({ length: 20 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!race && (
        <div className="form-grid">
          <label>
            Time per round
            <select
              value={value.seconds}
              onChange={(e) => patch({ seconds: Number(e.target.value) })}
            >
              {[0, 30, 60, 90, 120, 180, 300].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds === 0 ? "No time limit" : `${seconds} seconds`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scoring
            <select
              value={value.scoring ?? "classic"}
              onChange={(e) =>
                patch({ scoring: e.target.value as Config["scoring"] })
              }
            >
              <option value="classic">Classic · 1 point</option>
              <option value="bonus">Guess bonus · 6–1 points</option>
            </select>
          </label>
        </div>
      )}
      <div className="form-grid">
        <label>
          Word difficulty
          <select
            value={value.difficulty ?? "mixed"}
            onChange={(e) =>
              patch({ difficulty: e.target.value as Config["difficulty"] })
            }
          >
            <option value="familiar">Familiar</option>
            <option value="challenging">Challenging</option>
            <option value="mixed">Random mix</option>
          </select>
        </label>
        {!race && (
          <label>
            Match format
            <select
              value={(value.matches ?? 1) === 1 ? "single" : "championship"}
              onChange={(e) =>
                patch({ matches: e.target.value === "single" ? 1 : 3 })
              }
            >
              <option value="single">Single match</option>
              <option value="championship">Championship</option>
            </select>
          </label>
        )}
      </div>
      {!race && (value.matches ?? 1) > 1 && (
        <label>
          Number of matches
          <select
            value={value.matches}
            onChange={(e) => patch({ matches: Number(e.target.value) })}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i} value={i + 2}>
                {i + 2}
              </option>
            ))}
          </select>
        </label>
      )}
      {race && (
        <p className="config-note">
          6–1 points per word. Final score: 50% points, 50% speed. Skip words
          and return before finishing.
        </p>
      )}
    </fieldset>
  );
}
