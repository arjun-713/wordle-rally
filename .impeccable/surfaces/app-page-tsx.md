---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["components/home.tsx","components/room.tsx","app/room/[code]/page.tsx"]
---

# Word Rally landing and private match flow

Landing mode: Persuade. Room mode: Operate. Friends need to create or join a room, understand the six-guess race, and finish a timed match. The user confirmed code-first execution, one point for every solver, team sums, and free-for-all as 1 vs all.

## Direction contract

THESIS: Friends meet at a tabletop word arena. A real word-board demonstration introduces the game before room creation.

OWN-WORLD: Chalk-white canvas, forest actions and correct letters, mustard misplaced letters, rounded display lettering, and precise square tiles. Operative screens inherit the same quiet palette.

STORY: Understand six guesses, choose rivals, create or join a private room, complete timed rounds, and compare points.

FIRST VIEWPORT: A large invitation sits left; a layered, angled word-board preview sits right. Create and join are directly below the invitation. On phones, the invitation and actions lead. During play, timer, six rows, and touch keyboard fit together at 390 by 844.

FORM: Tabletop word arena, candidate 5 of the grounded directions; seed:9df595ff26b49b3b. The signature interaction is a dealt board entrance and a single staggered tile reveal for acknowledged guesses.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints and evidence

No fabricated player activity or latency claims. The hero is labeled Preview. Browser names and identity persist locally; production room state and histories require Redis. The full round and rematch flow is tested with separate browser identities. No approved image comp or external quality-bar card was produced for this code-first build.
