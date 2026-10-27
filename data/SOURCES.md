# Word catalog

Pinned source revisions, hashes and counts are in [manifest.json](manifest.json); attribution and licenses are in [licenses](licenses).

- [dwyl/english-words](https://github.com/dwyl/english-words): 370,105 source entries, archived in `dictionary.txt.gz` under the Unlicense. The accepted-guess dictionary combines its five-letter entries with the Wordle list: 20,148 distinct guesses.
- [Tab Atkins's wordle-list](https://github.com/tabatkins/wordle-list): MIT-licensed five-letter Wordle vocabulary, used only for accepted guesses.
- [cfreshman's Wordle answers gist](https://gist.github.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b): the 2,315 curated original Wordle answers, pinned to a gist revision. These are everyday words; the gist states no license.
- [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english): frequency ranks split the curated answers into Familiar and Challenging. See its retained license.

`answers.json` holds `{ familiar, challenging }`: 817 Familiar answers that also appear in the frequency list (ordered by rank) and 1,498 Challenging answers (alphabetical). Every answer is an accepted guess.

Daily's immutable 366-word calendar is reserved from random games. This leaves 2,085 words for multiplayer and Unlimited: 587 Familiar, 1,498 Challenging, and all 2,085 in Random mix. No-repeat history prefers unused words and recycles used ones once a pool is exhausted.

Run `npm run words:sync` to refresh pinned upstream inputs and regenerate the dictionary and answer catalog. It refuses to create fewer than 2,000 answers and never rewrites the daily calendar.
