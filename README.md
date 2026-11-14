# Word Rally

Play at **[wordle-rally.vercel.app](https://wordle-rally.vercel.app)**.

## How to play

1. Choose **Create a room**, enter your player name, and select the game mode, player count, rounds, difficulty, and scoring. Pick a round timer or **No time limit**.
2. Share the room code or invite link. Friends can enter the code through **Join with code**.
3. Once everyone has joined, the host starts the match. Each player gets six attempts to solve the same five-letter word per round.
4. Use the tile feedback: **green** means the correct letter in the correct position, **gold** means the letter belongs elsewhere, and **gray** means it is absent.
5. Solving earns points. **Classic** awards one point per solve. **Guess bonus** awards 6, 5, 4, 3, 2, or 1 point according to the attempt that solves the word. Unsolved words earn zero points. Using all six attempts ends your turn while the others keep playing.
6. The host advances rounds. After the match, compare scores and the round breakdown, then set up a rematch.

## Game modes

| Mode                 | How it works                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 vs 1**           | Challenge a friend across the configured rounds.                                                                                                                                                                                                                |
| **2 vs 2**           | Four players compete in two teams. Each player has their own board; teammates’ points add to the team total.                                                                                                                                                    |
| **1 vs all**         | A free-for-all for 2–16 players. Everyone competes for their own score.                                                                                                                                                                                         |
| **Fast Fingers**     | Everyone races through the same set of words for 2–16 players. Skip a word and come back to it; each solve earns 6–1 points. The final score out of 100 is half points and half speed, and the race closes 60 seconds after the first player solves every word. |
| **Championship**     | The same players or teams play several matches, with points carried into tournament standings. The host advances between matches; tied leaders share the title.                                                                                                 |
| **Daily challenge**  | Play one shared puzzle per day, with six guesses and saved progress.                                                                                                                                                                                            |
| **Wordle Unlimited** | Play solo at your own pace and start another puzzle whenever you finish.                                                                                                                                                                                        |

## Hosting on the free Redis tier

Rooms live in Upstash Redis, whose free tier allows 500,000 commands a month. The app is tuned for about 200 four-player games a month, with 500 as the worst case.

- **Guesses** cost about one command. A server instance starts a guess from its latest copy of the room, and the write only lands if that copy is still current. If it isn't, Redis returns the current room in the same reply, so retries need no extra read.
- **Polls** read Redis directly with a 2-second timeout. Players polling the same room on one server instance share a single read, reused for 1.5 seconds (`RALLY_ROOM_REUSE_MS`).
- **Poll timing** follows the game: every 2.7s in a live round (4s after 30 quiet seconds, 8s after 2 idle minutes) and every 2s between rounds. Lobbies poll every 4s, then 10s and 20s. Hidden tabs stop polling. Values are in `lib/room-polling.ts`.

| Month                                  | Worst case (no shared reads) | Share of free tier |
| -------------------------------------- | ---------------------------- | ------------------ |
| 1 four-player game (5 rounds, ~10 min) | ~950 commands                | —                  |
| 200 four-player + 10 six-player games  | ~205,000                     | ~41%               |
| 500 four-player + 10 six-player games  | ~490,000                     | ~98%               |

Real games use less, because players on the same server instance share reads. The model is in `lib/redis-budget.ts`, and `tests/redis-budget.test.ts` fails if a change pushes the worst month over the limit.
