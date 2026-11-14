import assert from "node:assert/strict";
import test from "node:test";
import {
  MONTHLY_COMMANDS,
  TYPICAL_GAME,
  worstCaseCommands,
} from "../lib/redis-budget";

// Guardrail: polling changes must keep the worst month on the free tier.
test("500 four-player games plus 10 six-player games fit the free Redis tier", () => {
  const four = worstCaseCommands(),
    six = worstCaseCommands({ ...TYPICAL_GAME, players: 6 });
  assert.ok(four <= 1000, `a 4-player game costs ${four} commands`);
  assert.ok(
    four * 500 + six * 10 <= MONTHLY_COMMANDS,
    `worst month costs ${four * 500 + six * 10} commands`,
  );
  assert.ok(four * 200 + six * 10 <= MONTHLY_COMMANDS * 0.5);
});
