# Word Rally

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router and TypeScript. Deploy to Vercel serverless, with shared Redis state.

## Users

Friends hosting private competitive word games through a shareable room code.

## Product Purpose

Create a room, invite friends, and play timed rounds of five-letter word guessing.

## Capabilities and Constraints

- Configurable mode, player count, rounds, and time limit.
- Rooms can use No time limit while retaining six attempts per player and normal round completion rules.
- Solo Wordle Unlimited at `/unlimited` has no timer or daily cap. Current puzzle, completed games, solves, and streaks persist for the browser; solo and multiplayer use the same non-repeating answer history. The finite answer pool is never silently recycled.
- 1v1, 2v2 with summed individual points, and free-for-all (1 vs all).
- Six attempts per player. Every solver earns one point in Classic, or 6–1 points with Guess bonus. Exhausting attempts does not end other players' turns. No solve means no point.
- Host starts and advances rounds. Names persist in the browser.
- Answers do not repeat within a match or across matches for remembered browser identities. Browser data removal and different devices cannot be linked without accounts.
- The 370,105-entry source dictionary supplies 20,148 accepted five-letter guesses. The playable answer catalog is 14,877 words, expanded 11.7x from 1,272. Random games exclude the 366 assigned Daily words. Familiar retains 500 frequent words; Challenging covers the rest; Random mix draws from the full non-daily pool with server-side cryptographic selection and existing no-repeat history.
- Code-first visual build, confirmed by user. No fabricated latency or capacity claims.

## Open Decisions

The product is branded Wordrally. Initial capacity limit is 16 players per room; actual deployment capacity needs measured load testing.

## Competition and Solo Extensions

- Hosts choose Classic scoring or Guess bonus: solves in guesses 1–6 earn 6, 5, 4, 3, 2, or 1 points; unsolved rounds earn zero.
- Familiar, Challenging, and Random mix pools combine frequency-ranked vocabulary and the filtered Wordle list; the accepted guess dictionary is unchanged. Unlimited difficulty changes apply to the next puzzle.
- Championships use 2–10 matches in the same room with fixed teams after the first match. Cumulative points decide the title; ties are shared. Each match retains its round breakdown.
- Post-match breakdowns show each player’s solve status, guesses used, solve time, and points for every round.
- The daily challenge at `/daily` is one shared UTC puzzle per day, with saved progress, one six-guess attempt, consecutive-day streaks, and spoiler-free result copying.
- Daily words are reserved from new random games. The checked-in non-repeating calendar starts October 25, 2026 and must be extended before its 366 assigned words run out; it never wraps. Legacy identities that already saw today’s word are offered Unlimited instead of a repeat.
- Personal statistics at `/stats` show completed puzzle counts, solve rate, streaks, average guesses on wins, six-bin guess distributions, multiplayer points, and match results. Statistics live on the dedicated stats screen; active games have no metrics rail.
- Sound and haptics are optional, off by default, and saved in the browser. Haptics depend on browser/device support. Motion follows reduced-motion settings and acknowledged guesses do not replay reveals on reload.
- No spectators, private team discussion, account system, or installable app support are included.

## Frontend contract

Editorial Arcade: warm paper, ink, lime actions, tactile tiles and Manrope. Home is a compact play hub; gameplay is a vertically centred board and keyboard with no permanent legend, sidebar or storage notices. Help contains the colour legend. Create/Join are native dialogs; invites and route deep links remain real. Multiplayer shows scores, server deadlines and private attempt counts, with results and breakdowns after completion.

The backend implements every advertised game format. It does not implement online presence, separate player readiness, countdowns, account linking or theme/contrast preferences; the UI does not invent those states. Network failures show reconnecting separately from an explicit departure.
