# Word Rally release verification

The release audit exercises separate browser identities in duels, teams, free-for-all, championships, Daily and Unlimited. Additional playtests choose words by filtering the candidate dictionary using acknowledged letter feedback, including a player exhausting all six attempts while rivals continue, phone touch input, and multi-round scoring.

## Issues fixed before first publication

- Daily initially fetched a new puzzle and statistics concurrently. A delayed first puzzle request reproduced the missing identity-cookie race. Stats now wait until puzzle initialization establishes the cookie.
- Oversized chunked requests were buffered completely before rejection. The body reader now cancels after crossing 4,096 bytes.
- A previous match's delayed guess could target round zero of a rematch. Each match now has a unique ID, required for guesses and round advancement.
- The repository's public daily word order predicted future answers. Production uses a server-only stable secret to permute the reserved pool; the secret is stored as a sensitive Vercel environment variable.

## Checks

Release run: **48 rule/service tests passed** on both the file backend and real Redis; **15 browser flows passed in one full run**; TypeScript and production build passed; `npm audit --omit=dev` reported **0 vulnerabilities**. All 16 production client JavaScript files were scanned for server answer-array, history-key, and daily-secret markers; none were found.

- Game rules, privacy, CAS concurrency, no-repeat histories, scoring, tournaments, and streaming request bounds.
- Browser reloads, two-player rooms, four-player team totals, free-for-all, exhausted attempts, old-response races, host authorization, blocked rosters, shared daily progress, and saved statistics.
- Sensitive-path probes for `.env.local`, `.git/config`, `.data/state.json`, and answer JSON files. API responses must exclude raw identity cookies, active answers, future answers, and opponents' guess words.
- Automated accessibility and responsive checks, production compilation, and dependency audit.

## Production setup

Vercel project: `wordle-rally`, linked to `arjun-713/wordle-rally`. Node 22.x and Mumbai functions are pinned. Publishing is manual via Vercel CLI; Git pushes do not automatically publish. Upstash `wordle-rally-redis` is connected to Production on the Free plan; Mumbai and eviction off were selected during setup. The application accepts the native `KV_REST_API_URL` / `KV_REST_API_TOKEN` credentials provisioned by that integration, as well as explicit `UPSTASH_REDIS_*` credentials. Credential pairs are never mixed and read-only tokens are not used for writes. Four configuration regressions verify those rules. The daily scheduling secret is configured in Vercel; no secrets are committed.

Local QA cannot establish hosted latency or physical haptic support. A successful deployment must additionally pass live multiplayer persistence and secure-cookie checks before being reported as ready for friends.
