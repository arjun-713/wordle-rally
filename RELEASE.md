# Wordrally release verification

## Editorial Arcade redesign

The existing Next.js application is redesigned in place. Existing room routes, guarded mutations, letter evaluation, classic scoring, deadlines, history and persisted identity are preserved. Fast Fingers, lobby editing and the latency improvements below extend the implementation. The answer catalog expansion changes which words future random puzzles can select.

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

- **33 focused unit/service checks passed**, including a full run against real Redis. These replace 66 overlapping checks and retain duplicate-letter semantics, six-attempt behavior, Classic/6–1 bonus scoring, Daily, championships, stale requests, privacy, concurrent joins/solves, 16-player capacity, no-repeat history, shared rate limits, atomic storage, request bounds and transport recovery. A catalog contract checks the expansion and reserved Daily vocabulary.
- **8 browser journeys passed in one full run** against the local production build: room creation/deep-link joining, untimed duel with an exhausted player and rival solve, reconnect/resume, rounds/rematch, hardware/touch input, rejection/reduced motion, sixth-guess win, saved-loss recovery after a withheld response, unsaved-request retry, Daily exhaustion/resume, separate statistics, four-client team championship, three-client timed free-for-all, API privacy/validation, and a three-client Fast Fingers race with lobby edits. Targeted keyboard, saved-response recovery and Fast Fingers runs cover the final refinements.
- Actual screenshots were inspected at **1440×900, 1366×768, 390×844 and 320×700**, with an additional 2048×1152 centring check. Views include home, setup, lobby, gameplay, results, championship breakdown, statistics, Settings and Help. Keyboard bounds and horizontal overflow were measured. Room-code and invite-link clipboard contents were checked against the real generated code.
- TypeScript and the optimized production build passed. Client JavaScript chunks were scanned for private answer-catalog prefixes, history keys and the daily-secret marker; none leaked. The public accepted-guess dictionary is deliberately available to client validation.
- Design source lint reports **0 FAIL**. Browser inspection reports **0 FAIL** after precise home allowances: the user-pinned cream palette, expressive home title, and the probe misclassifying separate preview-grid letters as a three-line headline. Solo's blank-space warnings count empty puzzle tiles as blank content. Modal shadows and clock zero-padding are intentional. No stock photos or decorative motion were added.

The retained `test:redis` runner and manual `benchmark:reads` / `benchmark:guesses` commands use isolated test storage. Ordinary browser testing stays at eight journeys; new backend tests cover independent race progress, wasted runs, scoring, lobby authorization, stale optimistic state, shared reservation caps and saved-response confirmation. Local runs do not establish hosted latency or physical haptic support.

## Vocabulary and limits

Random answers come from the **2,315 curated original Wordle answers**, replacing the earlier 14,877-word list that included obscure, regional and name-like words. After reserving 366 Daily words, **2,085** are available to random games: Familiar has 587 frequency-ranked everyday words, Challenging has 1,498, and Random mix uses all 2,085. Selection uses server-side `crypto.randomInt`; no-repeat history prefers unused words and falls back to previously used ones when a pool is exhausted. See [source notes](data/SOURCES.md) for pinned upstream sources and retained licenses.

All advertised modes are implemented: 1v1, 2v2, 2–16 free-for-all, championships, and Fast Fingers. There is no separate readiness, online heartbeat, countdown, account linking or theme/contrast preference API. The UI shows Joined rather than inventing Ready/Online. Reconnecting is a client transport state and explicit departure remains distinct.

Daily's existing calendar is unchanged and finite; it starts October 25, 2026 and must be extended before its 366 dates run out. Histories follow remembered browser identities; clearing browser identity or changing devices cannot be linked without accounts. None of these limitations are hidden behind simulated functionality.

## Production

The linked Vercel project is `wordle-rally` at [wordle-rally.vercel.app](https://wordle-rally.vercel.app). Production uses Node 22, Mumbai functions, the existing writable Redis credential pair and server-only Daily secret. Deployment is manual through Vercel CLI; `--no-wait` submits the deployment without monitoring build logs. Local validation is not a claim that a newly submitted hosted deployment is already ready.

Result-copying controls and their clipboard handlers have been removed from Solo, Daily and multiplayer. Room-code and invite-link copying remain available.

## Fast Fingers and lobby configuration

Fast Fingers supports 2–16 players and 1–20 shared words, with independent navigation and saved per-word guesses. Skipping is local, spends no attempt and needs no network request. Draft input survives switching words. Exhausting a word wastes it: zero word points, no speed contribution and no finishing rank. The race ends when everyone remaining has solved or exhausted all words. Complete runs retain their finish time even if the player then leaves.

The final score has two bounded 50-point contributions: `50 × bonus / (6 × words)` and `50 × average completion time / (average completion time + personal completion time)`. Only players who solve every word enter that average and receive a total. Contributions are rounded to one decimal and added; equal totals share the win. Timestamps are server-authoritative. The interface shows precise finish times and the formula in a collapsed explanation.

The host can edit the initial lobby using the same configuration controls as creation. Updates preserve the room code and joined players; reducing capacity below occupied seats, stale revisions, unauthorized edits and changes after start are rejected. Later championship lobbies remain locked. Fast Fingers itself is a single race with an elapsed clock, rather than a timed-round championship.

## Guess latency

Production sampling before the changes measured six ordinary/terminal solo guesses at 90–276ms (the initial Start request took 385ms). This did not reproduce every reported stall. Source inspection found a periodic extra blocking rate-reservation call after four booked requests, and a redundant game-state read before every compare-and-set.

- A bounded, private, 30-second mutation snapshot (2MiB total, 128KiB per entry) supplies a starting state for guesses. Every accepted result still passes the exact original state through atomic Redis CAS. Stale snapshots reload immediately; apparent validation failures are checked against fresh state. Read-only requests never trust this snapshot.
- Low remaining rate credits are prefetched after the HTTP response using Next.js `after`. Existing shared per-minute caps remain enforced; failed prefetch never grants permission.
- Dictionary, length and repeated-word feedback is immediate in the browser, with the same checks repeated on the server. The answer and evaluations remain server-private/authoritative.
- A slow guess starts checking saved state after 450ms and repeats the read if it raced the commit, with one confirmation read in flight at a time. It acknowledges only the matching puzzle/match/word with an increased saved guess count and ignores unrelated snapshots. Room confirmations use an uncached member-checked read. The per-attempt client deadline is five seconds; a failed mutation is reconciled before one safe retry.
- `Server-Timing` reports application, limiter, snapshot/state, commit and Redis durations/counts without names, keys, answers or credentials.

`npm run benchmark:guesses` used a real isolated Redis server with **40ms injected per Redis HTTP call**, five ordinary guesses and one final solve per variant, and 150ms typing gaps. Ordinary guesses had these measured means:

| Mode | Baseline | Optimized | Blocking Redis HTTP calls |
| ---- | -------: | --------: | ------------------------- |
| Solo |    126ms |      80ms | 2–3 → 1                   |
| Duel |    107ms |      67ms | 2–3 → 1                   |

The baseline's fourth guess needed three blocking calls; optimized ordinary guesses needed one each. Completion statistics can add a read, and cold/missing/stale snapshots use the safe fresh-state path. These are controlled local measurements, not a production latency guarantee or a claim of zero network latency. `RALLY_DISABLE_MUTATION_CACHE=true` and `RALLY_DISABLE_RATE_PREFETCH=true` independently restore those baseline behaviors for diagnosis.

### Concurrent-room responsiveness

Gameplay responsiveness now takes priority over minimizing the monthly Redis command count. Active rounds refresh every 750ms, lobbies and recent completed matches every second, and ended rounds every 750ms. Idle and failed connections back off modestly; hidden tabs still pause. The shared room-read reuse window is 100ms instead of one second, and late reads cannot replace a newer locally committed snapshot.

Room transactions run in arrival order within each function instance, with independent queues for independent rooms. Redis still atomically verifies every write across instances. A rejected CAS returns the current first record in the same response, allowing immediate re-evaluation without an extra GET. Up to 64 attempts fit within a 4.5-second retry budget, rather than failing after twelve competing attempts. Guess timestamps use server arrival time before the local queue; response clock timestamps use the actual response time. No client can provide a finish time or evaluated marks.

Redis HTTP calls time out after 1.2 seconds by default. A read still pending after 200ms gets one backup request; the first successful answer wins and the other is cancelled. Writes are never duplicated at this layer. Client confirmation starts at 450ms and continues every 400ms after the previous read completes, preventing an early read from missing a later saved guess indefinitely. Background room reads have a 2.5-second per-attempt deadline.

A controlled real-Redis reproduction injected **80ms per storage HTTP call** and submitted sixteen guesses simultaneously to one room:

| Variant                                                            | Saved guesses | Storage HTTP calls, including final read | Burst duration |
| ------------------------------------------------------------------ | ------------: | ---------------------------------------: | -------------: |
| Before                                                             |       14 / 16 |                                      199 |        2,705ms |
| Coordinated room updates                                           |       16 / 16 |                                       17 |        1,517ms |
| Coordination disabled to exercise cross-instance conflict handling |       16 / 16 |                                      137 |        1,991ms |

These are local measurements with artificial transport delay, not hosted latency guarantees. Twenty-two focused transport, recovery, polling and atomic-state checks passed against isolated Redis, including simultaneous wrong guesses and solves by sixteen players in both free-for-all and Fast Fingers. `RALLY_DISABLE_MUTATION_QUEUE=true` disables only local coordination for diagnosis; the CAS safeguards remain active.
