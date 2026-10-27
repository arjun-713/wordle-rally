# Wordrally — Editorial Arcade

The board is the product. Home is an expressive play hub; active rounds use a quiet, centred board with compact match context. No permanent stats rail, browser-storage notices, marketing sections or simulated production players.

## Tokens

| Role                    | Value     |
| ----------------------- | --------- |
| Canvas                  | `#F6F3E9` |
| Ink                     | `#17211D` |
| Deep                    | `#111A16` |
| Paper                   | `#FFFDF6` |
| Lime action / brand     | `#D8EE81` |
| Coral supporting accent | `#EE8063` |
| Correct                 | `#4E805B` |
| Present                 | `#BC9449` |
| Absent                  | `#78817B` |
| Lines                   | `#DCDED2` |
| Muted text              | `#586159` |
| Error ink               | `#8B3927` |
| Absent-key text         | `#080E0A` |
| Unused key              | `#E5E6DC` |
| Control border          | `#879180` |

Lime is a brand/action colour, never correct-letter feedback. Tile text uses ink or paper according to measured contrast. A dark bottom edge gives the flat tiles tactile depth; panels remain flat. Radius: tiles 4px, controls 6px, preview/dialog 10px. Spacing: 4/8/12/16/24/32/48px.

## Type

Use the existing locally hosted Manrope variable face throughout, with system sans fallbacks. Tight, heavy wordmark and home headline; ordinary clear sans for all game letters and labels. No Fredoka, ornamental lettering or tracked micro-labels. Body 14–16px; buttons 13–15px; game titles 18–24px; tile letters 25–30px; score/time 18–24px with tabular figures. Home headline may be 44–80px, never over two lines.

## Frame and hierarchy

One centred app frame (maximum 1200px), equal 16–40px gutters. Home uses a two-column split, stacking actions above its explicitly labelled preview on phones. No long landing narrative. Game screens use a single column: top navigation, compact mode/round context, board status, 5×6 grid and keyboard. The letter legend lives in Help only. Center the game group vertically in the viewport; let short screens grow naturally. Scores are one narrow strip, player progress shows counts in a compact keyboard-focusable scrolling strip, with expandable details, without revealing letters. Real results appear after finishing, with the board retained. Statistics stay on /stats.

Solo tiles are 62px at 1440×900 and about 61px at 1366×768; multiplayer uses smaller height-aware tiles to leave space for its match strip. At 320×700 and 390×844 the grid and keyboard fit the viewport where browser chrome permits. Key heights are at least 44px; widths flex to keep all ten letters in one row. Respect safe-area padding. No fixed-height clipping.

## Interaction and motion

Hardware and virtual input share the existing WordPlay state. Input focus is indicated on the current row. Modal/text-input focus never causes global gameplay keystrokes. No auto-scroll on virtual key presses. Tile entry 120ms, acknowledgement flip 340ms with a short stagger, invalid-row wiggle 240ms. Only acknowledged guesses change evaluations or scores. Reduced motion retains state/outline/announcements with no travel.

Native dialogs retain focus trapping, Escape, backdrop dismissal and return focus. Visible, ink-colour focus rings. Dictionary rejections stay on the row, preserve the word and do not display an alert panel. Network failures show a compact retry error; a 12-second request deadline and saved-puzzle reconciliation prevent a permanently locked final guess.

## Product truth

Supported: duel, 2v2, 2–16 free-for-all; classic/bonus; 1–20 rounds; optional timers; three difficulty pools with 14,877 answers (14,511 available to random games after reserving Daily); championships; Daily; Unlimited; persisted names/history/stats; sound and supported-device haptics.
Not implemented: live online presence, player-ready acknowledgements, countdown, accounts, theme/contrast settings, spectators or team chat. Joined players are labelled Joined. Only the host starts/advances rooms. Prototype-like data is confined to the labelled homepage illustration.

## Fast Fingers

Reuse the play shell. A compact progress/elapsed strip and horizontally scrolling numbered word selector sit above the board. Solved words use a check, wasted words use a cross, current words use ink; labels also announce state. Skip/Next and keyboard arrows navigate locally. Submitted guesses and local drafts remain attached to their word. Final results show both 50-point contributions, precise completion time, and incomplete runs without a rank. Scoring explanation stays collapsed. The shared two-by-two mode picker is used for creation and host lobby edits. No permanent statistics rail or result-copy action.
