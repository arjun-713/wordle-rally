---
version: 1
slug: "app-unlimited-page-tsx"
primary_target: "app/unlimited/page.tsx"
related_targets: ["components/solo.tsx","components/word-play.tsx"]
---

# Solo Unlimited and untimed rooms

Mode: Operate. Extension of the established Word Rally world and shared playable board. The primary solo task is to complete a six-guess puzzle and continue to the next word without a timer or daily cap. No additional visual-world selection is needed: inherit DESIGN.md, the current game layout, semantic letter colors, keyboard behavior, and responsive density.

## Behavior

- Home exposes Play Wordle Unlimited, leading directly to /unlimited.
- Solo has six attempts, no timer, saved current puzzle, saved played/solved/streak statistics, and Next word after a solve or loss.
- Solo and rooms reserve answers against the same browser identity history. Available words remain finite; exhausted pools error instead of recycling.
- Room configuration adds No time limit. Both start and next-round transitions preserve untimed play; completed/exhausted participants still wait for rivals.
- The board and keyboard are shared by the solo and room interfaces. The primary action after finishing is Next word. Phone active play retains all six rows and all keyboard rows in one viewport.

## Validation

31 engine/storage tests pass with the file backend and with real Redis over HTTP, including concurrent room/solo starts. Browser coverage includes the previous multiplayer flows, untimed room creation/round advance, solo reload, validation, touch entry, wins/losses/streaks and next puzzles. Final captures are under .impeccable/review/ with unlimited- and no-limit- prefixes. Existing design tokens remain authoritative; a detector scan surfaced existing palette/type-ramp documentation advisories, not an instruction to redesign the inherited world.
