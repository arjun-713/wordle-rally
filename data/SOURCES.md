# Word catalog

Pinned source revisions, hashes and counts are in [manifest.json](manifest.json); attribution and licenses are in [licenses](licenses).

- [dwyl/english-words](https://github.com/dwyl/english-words): 370,105 source entries, archived in `dictionary.txt.gz` under the Unlicense. The accepted-guess dictionary combines its five-letter entries with the Wordle list: 20,148 distinct guesses.
- [Tab Atkins's wordle-list](https://github.com/tabatkins/wordle-list): MIT-licensed five-letter Wordle vocabulary supplies the expanded answer catalog. This vocabulary includes uncommon, regional and inflected forms, rather than only original Wordle solutions.
- [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english): frequency ordering keeps familiar vocabulary first. See its retained license.

The answer list contains 14,877 distinct words, up from 1,272 (11.7x). Every answer is an accepted five-letter guess. The generator excludes a maintained list of unsuitable answers, names and abbreviations; this is an automated vocabulary filter, not a claim of individual editorial review of every word.

Daily's immutable 366-word calendar is reserved from random games. This leaves 14,511 words for multiplayer and Unlimited: 500 Familiar words, 14,011 Challenging words, and the full 14,511 in Random mix. All random modes use the existing server-side `crypto.randomInt` selection and atomic browser-identity history; they do not add Redis reads. Current puzzles and assigned daily answers are retained.

Run `npm run words:sync` to refresh pinned upstream inputs and regenerate the dictionary and answer catalog. It refuses to create fewer than 12,720 answers (10x the original catalog). It never rewrites the daily calendar.
