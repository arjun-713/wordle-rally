# Wordrally release verification

## Editorial Arcade redesign

The existing Next.js application is redesigned in place. Room routes, API contracts, Redis behavior, guarded mutations, answer evaluation, scoring, deadlines, history and persisted identity remain unchanged. The answer catalog expansion changes which words future random puzzles can select.

| Surface         | Question answered                                  | Primary action                                              |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Home            | Who am I playing with?                             | Create a room; Join with code                               |
| Setup / lobby   | What are the rules, and who joined?                | Share the actual invite; host starts                        |
| Solo / Daily    | What is my next guess?                             | Centred board and keyboard                                  |
| Multiplayer     | What is my next guess, and how is the round going? | Same board with scores, deadline and private attempt counts |
| Result          | What happened, and what next?                      | Retained board, actual points, Next / Rematch               |
| Statistics      | How have I played?                                 | Separate real records and guess distribution                |
| Settings / Help | What can I change or learn?                        | Native accessible dialog                                    |

Manrope, the supplied warm-paper palette, tactile tiles and a dark scorecard define the interface. The active game has no stats rail, storage notice or permanent letter legend. Help retains the legend. Difficulty changes apply to the next puzzle. Optional feedback and reduced-motion behavior remain supported.

Design Taste's app draw selected Editorial greeting (seed 912192959). One shell redraw replaced the tinted L-frame with open-plane; the explicit gameplay brief takes precedence over its generic sidebar/KPI pattern. No prototype HTML existed in the checkout, `/tmp` or Downloads, so implementation follows the written brief. Home's explicitly labelled preview is the only illustrative match; it has no networking logic.

## Verification

- **28 focused unit/service checks passed** on file storage. These replace 66 overlapping checks and retain duplicate-letter semantics, six-attempt behavior, Classic/6–1 bonus scoring, Daily, championships, stale requests, privacy, concurrent joins/solves, 16-player capacity, no-repeat history, shared rate limits, atomic storage, request bounds and transport recovery. A catalog contract checks the expansion and reserved Daily vocabulary.
- **7 browser journeys passed in one full run** against the local production build: room creation/deep-link joining, untimed duel with an exhausted player and rival solve, reconnect/resume, rounds/rematch, hardware/touch input, rejection/reduced motion, sixth-guess win, saved-loss recovery after a withheld response, unsaved-request retry, Daily exhaustion/resume, separate statistics, four-client team championship, three-client timed free-for-all, and API privacy/validation. Final modal/navigation focus changes also receive a targeted solo journey rerun.
- Actual screenshots were inspected at **1440×900, 1366×768, 390×844 and 320×700**, with an additional 2048×1152 centring check. Views include home, setup, lobby, gameplay, results, championship breakdown, statistics, Settings and Help. Keyboard bounds and horizontal overflow were measured. Room-code and invite-link clipboard contents were checked against the real generated code.
- TypeScript and the optimized production build passed. Thirteen client JavaScript chunks were scanned for answer-catalog prefixes, private history keys and the daily-secret marker; none leaked. No backend or API source files changed.
- Design source lint reports **0 FAIL**. Browser inspection reports **0 FAIL** after precise home allowances: the user-pinned cream palette, expressive home title, and the probe misclassifying separate preview-grid letters as a three-line headline. Solo's blank-space warnings count empty puzzle tiles as blank content. Modal shadows and clock zero-padding are intentional. No stock photos or decorative motion were added.

The broader historical Redis checks and read benchmarks remain in Git history; Redis optimization logic is unchanged in this release. The retained `test:redis` runner and manual `benchmark:reads` command are available without adding either to ordinary browser testing. This release's current unit run used file storage; its browser runs do not establish hosted latency or physical haptic support.

## Vocabulary and limits

The playable catalog grew from **1,272 to 14,877 answers (11.7x)**. After reserving 366 Daily words, **14,511** are available to random games. Familiar contains 500 frequent words; Challenging has 14,011; Random mix uses all 14,511. Selection already uses server-side `crypto.randomInt`; the larger pool reuses atomic no-repeat history with no new Redis reads. The expanded Wordle vocabulary includes uncommon, regional and inflected words. See [source notes](data/SOURCES.md) for pinned upstream sources and retained licenses.

All advertised modes are implemented: 1v1, 2v2, 2–16 free-for-all, and championships. There is no separate readiness, online heartbeat, countdown, account linking or theme/contrast preference API. The UI shows Joined rather than inventing Ready/Online. Reconnecting is a client transport state and explicit departure remains distinct.

Daily's existing calendar is unchanged and finite; it starts October 25, 2026 and must be extended before its 366 dates run out. Histories follow remembered browser identities; clearing browser identity or changing devices cannot be linked without accounts. None of these limitations are hidden behind simulated functionality.

## Production

The linked Vercel project is `wordle-rally` at [wordle-rally.vercel.app](https://wordle-rally.vercel.app). Production uses Node 22, Mumbai functions, the existing writable Redis credential pair and server-only Daily secret. Deployment is manual through Vercel CLI; `--no-wait` submits the deployment without monitoring build logs. Local validation is not a claim that a newly submitted hosted deployment is already ready.

Result-copying controls and their clipboard handlers have been removed from Solo, Daily and multiplayer. Room-code and invite-link copying remain available.
