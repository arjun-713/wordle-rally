# Word Rally

A private, round-based word game for friends, built with Next.js 16, React 19, and TypeScript. Create a room, share its six-character code, and play on separate phones or browsers.

## Run locally

Requires Node.js 22.x (also pinned for Vercel).

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Development uses a persistent file store in `.data/` when Redis is absent. Separate browser profiles have separate player identities; tabs in the same profile share a player. To test with friends on your network, open the development machine's LAN IP and port 3000 on their devices. All players must use the same hostname when reconnecting because browser identity is scoped to that hostname.

## Wordle Unlimited

Choose **Play Wordle Unlimited** on the home page, or open `/unlimited`, to play solo with six guesses, no timer, and no daily cap. Finish a puzzle and choose **Next word** to continue. The current puzzle, games played, solves, current streak, and best streak are saved for the remembered browser identity. Refreshing resumes the same puzzle. Solo answers and multiplayer answers share the same history and are reserved atomically, so a solo word will not reappear in a later room. The finite answer pool is never silently recycled; if it is exhausted, an expanded dictionary is required.

## Deploy on Vercel

1. Import this directory as a Next.js project.
2. Create an Upstash Redis database through Vercel Marketplace or Upstash. Choose a region near the Vercel functions and your players.
3. Set the server-only variables in the Vercel project:

   ```dotenv
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-rest-token
   RALLY_DAILY_SECRET=your-64-character-random-hex-secret
   ```

4. Generate the daily secret once with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and save it as a sensitive environment variable. Keep it stable: changing it changes the daily ordering.
5. Verify `npm test`, `npm run test:e2e`, and `npm run build`, then deploy using `vercel deploy --prod`. `vercel.json` places functions in Mumbai (`bom1`) beside the Redis region and disables automatic Git deployments so publishing happens through the tested CLI workflow. No WebSocket process, background worker, scheduled job, or writable production filesystem is required.

Production refuses to create rooms without Redis. Do not set `ALLOW_LOCAL_STORE` on Vercel. That flag exists only to test the production build on your own machine:

```bash
npm run build
ALLOW_LOCAL_STORE=true npm start
```

The local store is a development convenience, not a substitute for shared production persistence. Production provisioning and verification are recorded in `RELEASE.md`. Keep credentials in Vercel; `.env*`, `.vercel/`, runtime state, and QA captures are excluded from version control and deployment uploads.

## Rules

| Mode     | Players   | Scoring                                   |
| -------- | --------- | ----------------------------------------- |
| 1 vs 1   | Exactly 2 | Classic: 1 point; Guess bonus: 6–1 points |
| 2 vs 2   | Exactly 4 | Individual points add to the team's total |
| 1 vs all | 2–16      | Free-for-all with the chosen scoring rule |

- The host chooses 1–20 rounds and **No time limit**, or a 30, 60, 90, 120, 180, or 300 second limit. The API represents no time limit as `seconds: 0` and `endsAt: 0`.
- Every player gets the same answer, an independent board, and six valid guesses.
- Invalid dictionary entries and repeated guesses do not consume attempts.
- A player who solves or exhausts their attempts waits while everyone else continues.
- Rounds end when all active players finish, or a timed round's server deadline passes. A solve on or after that deadline is rejected. Untimed rounds stay playable until all active players solve or exhaust their attempts.
- No solve means no point. Equal final scores are shared wins. **Classic** awards 1 point per solve. **Guess bonus** awards 6, 5, 4, 3, 2, or 1 points for solving in guesses 1 through 6; solve time is recorded for the breakdown and is not a scoring tiebreaker.
- The host starts the match and each subsequent round, and can return everyone to the lobby for a rematch.
- Lobby seats fill to the configured count before starting. Team members can change between available team seats before the first match; championship teams then stay fixed.
- Joining after a match starts is disabled. An existing active participant can reload and reconnect.
- Explicitly leaving transfers host controls to the next active player. Closing the host's tab does not transfer controls automatically; the host can reopen the room to continue.
- Rooms expire 24 hours after their last state-changing action.

## Word sources and non-repetition

The checked-in snapshot contains **370,105 alphabetic dictionary entries**, **20,148 accepted five-letter guesses**, and **1,272 familiar candidate answers**. A dictionary containing lakhs of words does not contain lakhs of fair five-letter Wordle answers. All lengths are retained as the compressed source dictionary, while only five-letter words participate in this game.

- [dwyl/english-words](https://github.com/dwyl/english-words): the large dictionary, under the Unlicense.
- [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list): additional accepted five-letter guesses, under MIT.
- [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english): common-word frequency list, under the upstream license. The no-swear list is intersected with accepted guesses, with an additional answer exclusion list.

Exact revisions, source URLs, SHA-256 checksums, and counts are in [`data/manifest.json`](data/manifest.json). License notices are in `data/licenses/`. Fonts are self-hosted Fredoka and Manrope under their included SIL Open Font Licenses. The user-suggested Kaggle dataset was inspected, but this implementation uses directly downloadable, licensed sources instead.

At match start, the server excludes the union of all participants' histories, randomly selects unique answers with `crypto.randomInt`, and reserves the entire match for every participant **in the same atomic transaction** as starting the room. Concurrent starts in different rooms containing the same player cannot choose overlapping answers. Reserving unused future rounds is intentional: an abandoned match cannot expose a future repeat.

An opaque HttpOnly cookie remembers a browser identity for up to five years. Redis stores that identity's word history without an expiry; names are kept in localStorage. Returning two days later uses the same history. Clearing cookies, switching devices or browser profiles, or Redis data loss creates a new identity; cross-device history requires an account system. Clearing localStorage alone only removes the saved name. When a group's remaining answer pool is too small, the host gets an explicit error; the server never silently recycles used answers. `npm run words:sync` regenerates the word snapshots and pins current upstream revisions. Review answer-pool additions before distributing a refreshed snapshot; frequency filtering is not human editorial review of every word.

## Daily challenge, difficulty, and statistics

`/daily` offers the same puzzle to everyone, changing at **00:00 UTC**. Progress survives refreshes and multiple tabs; each browser identity has one six-guess attempt per day. Completed results can be copied as a spoiler-free colored grid. Daily streaks require consecutive UTC days solved. There is no public global leaderboard or account requirement.

Familiar answers come from the more frequent half of the existing candidate list; Challenging answers come from its lower-frequency half, and Mixed combines both. These are frequency-based categories, not an editorial guarantee of difficulty. The full 20,148-word guess dictionary works in every mode. Unlimited’s difficulty selector applies after the current puzzle finishes.

To protect both future daily puzzles and personal non-repetition, **366 answers are reserved in `data/daily-calendar.json`**, leaving **906 random answers** (500 Familiar and 406 Challenging). The reserved daily pool is public, but production uses a stable, server-secret HMAC permutation to keep its dated answer order private. Local development uses the original order unless `RALLY_DAILY_SECRET` is set. The daily schedule starts **2026-10-25**, ends **2027-10-25**, and never wraps. Expand the answer corpus before **2027-10-26**. Do not change or append to the existing secret-shuffled pool: doing so would reorder assigned days. Add a separately versioned calendar segment with new words and a later start date; retain the original segment and secret. Never move words already available in random pools into a future daily segment. If the schedule is exhausted, Daily reports an explicit availability error while random modes remain playable. Identities from older versions may already have seen a newly reserved daily word; that day is blocked for those identities to preserve their no-repeat history.

`/stats` separates Unlimited, Daily, and Multiplayer records: completed puzzles, wins, solve rate, current/best streak, average guesses on successful puzzles, and guess distribution. Multiplayer also records match wins and earned points. Round stats commit atomically when a round ends, including deadline settlement. Detailed statistics start with this update; historical Unlimited totals remain on the Unlimited screen because earlier games did not retain guess distributions. All records follow the browser identity cookie, with the same cross-device limitations as word history.

## Championships and round breakdowns

Select **Championship tournament** in room creation and choose **2–10 matches**, each with the configured **1–20 rounds**. The same group plays each match; the host advances between matches through the lobby. Individual scores reset for each match, and championship standings sum their archived scores. In 2v2, the fixed teams’ points are summed. Ties share the title. A departing player prevents advancing that championship. Later lobbies retain the departed original seat and reject replacement identities; create a new room for a changed group. Every participant sees the blocked state and can still read the last completed match breakdown.

The match result screen includes expandable round breakdowns with player names, solved/unsolved status, guesses used, solve time from the round start, and points awarded. Prior championship matches stay available until the room expires. Solve times are informational; ties use points only. Starting a rematch clears the current result archives while keeping personal stats and word history.

## Sound, haptics, and motion

Settings on every main surface let players opt into short synthesized sounds and supported-device vibration. Both default to off, preferences persist in localStorage, and no audio assets or tracking service are needed. Browser/device vibration support varies; automated tests exercise the optional API path but cannot verify physical feedback. Accepted guesses reveal once and a winning row has a short tile celebration. Device reduced-motion preferences remove spatial effects. Saved boards do not replay their reveals after reload.

## Architecture and capacity

```
Browser → Next.js route handlers → Upstash Redis REST API
                   ↓
          server-only game engine + word lists
```

Rooms use optimistic compare-and-set updates backed by one Redis Lua script. Room state, all participating word histories, scores, round transitions, and completed statistics are committed atomically. Daily and Unlimited use the same transaction mechanism, so simultaneous games do not lose profile updates. Conflicts retry with jitter and a bounded limit. The development file store uses a filesystem lock and atomic rename to implement the same contract. No game state is stored in a serverless process's memory.

The client updates its own board after each acknowledged guess and polls for competitors' status about once per second during play (2.5 seconds in lobbies and results). Hidden tabs stop polling. Each read is one Redis GET unless a deadline transition needs persistence. Guess mutations use the shared rate limiter plus an atomic room update. Answers and other players' guess words remain server-side until the round ends. There is no client-side answer list in the game bundle.

This design supports horizontal function scaling, but **does not promise zero latency or unlimited users**. Sixteen concurrent players are covered by automated local tests. Hosted Redis throughput, Vercel concurrency and billing limits, region placement, cold starts, and network latency still need deployment-specific load testing. For large deployments, replace polling with a managed fan-out service to reduce read amplification. A full 16-player room polling every second creates roughly 16 reads/second, before mutations; budget Redis commands accordingly.

Same-origin mutation checks, HttpOnly random identity cookies, per-identity mutation limits, bounded streaming request bodies, server-side validation, membership checks, and host authorization are included. Guess and round-advance requests carry the current match ID, so delayed requests cannot spill into a rematch. First-time Daily play establishes its identity cookie before loading personal statistics. The answer pools and daily secret remain server-side. Rate limits are an abuse guard for private friend rooms, not comprehensive DDoS protection or account-based identity verification.

## Verification

```bash
npm test                 # game rules, privacy, concurrency, history, 16-player room
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e         # starts the built app on port 3100 with isolated local state
```

The same rule and concurrency suite can exercise real Redis Lua transactions through a local REST bridge:

```bash
docker run --rm -d --name word-rally-redis-qa -p 127.0.0.1:6389:6379 redis:7-alpine
npm run test:redis
docker stop word-rally-redis-qa
```

This checks Redis execution and the HTTP adapter locally; it does not validate a hosted Upstash account or Vercel network latency.

If Google Chrome is already installed, use `PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome npm run test:e2e` instead of downloading Chromium. The browser suite uses `.data/e2e`, runs two separate browser identities through the full match and rematch flow, checks team totals, validates API errors and origin protection, and verifies responsive layout and Escape behavior. Browser tests read answers directly from the isolated local test store; this inspection is not exposed through an application endpoint. To run that suite, leave hosted Redis variables unset because it intentionally uses the isolated local store.

The visual direction and tokens live in [`DESIGN.md`](DESIGN.md); product decisions live in [`PRODUCT.md`](PRODUCT.md). Visual QA captures are kept locally under `.impeccable/review/`.
