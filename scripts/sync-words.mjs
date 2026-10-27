import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const sources = [
  [
    "dictionary",
    "dwyl/english-words",
    "master",
    "words_alpha.txt",
    "LICENSE.md",
  ],
  ["wordle", "tabatkins/wordle-list", "main", "words", "LICENSE"],
  [
    "frequency",
    "first20hours/google-10000-english",
    "master",
    "google-10000-english-no-swears.txt",
    "LICENSE.md",
  ],
];
await mkdir("data/licenses", { recursive: true });
const data = {},
  manifest = [];
for (const [name, repo, branch, file, license] of sources) {
  const ref = await fetch(
    `https://api.github.com/repos/${repo}/commits/${branch}`,
  ).then((r) => r.json());
  if (!ref.sha) throw new Error(`Cannot pin ${repo}`);
  const base = `https://raw.githubusercontent.com/${repo}/${ref.sha}/`;
  const response = await fetch(base + file);
  if (!response.ok) throw new Error(`Cannot download ${file}`);
  const text = await response.text();
  data[name] = [
    ...new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => /^[a-z]+$/.test(w)),
    ),
  ];
  const licenseResponse = await fetch(base + license);
  if (!licenseResponse.ok) throw new Error(`Missing license ${repo}`);
  await writeFile(`data/licenses/${name}.txt`, await licenseResponse.text());
  manifest.push({
    name,
    repo,
    revision: ref.sha,
    url: base + file,
    count: data[name].length,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
}
// Curated original Wordle answers, pinned to a gist revision.
const answerSource = {
  name: "answers",
  repo: "gist:cfreshman/a03ef2cba789d8cf00c08f767e0fad7b",
  revision: "",
  file: "wordle-answers-alphabetical.txt",
};
{
  const gist = await fetch(
    "https://api.github.com/gists/a03ef2cba789d8cf00c08f767e0fad7b",
  ).then((r) => r.json());
  answerSource.revision = gist.history?.[0]?.version;
  if (!answerSource.revision) throw new Error("Cannot pin answer gist");
  const url = `https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/${answerSource.revision}/${answerSource.file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Cannot download curated answers");
  const text = await response.text();
  data.answers = [
    ...new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => /^[a-z]{5}$/.test(w)),
    ),
  ];
  manifest.push({
    name: answerSource.name,
    repo: answerSource.repo,
    revision: answerSource.revision,
    url,
    count: data.answers.length,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
}
const valid = new Set(
  [...data.dictionary, ...data.wordle].filter((w) => w.length === 5),
);
// Familiar = curated answers in the frequency list (by rank); Challenging = the rest.
const curated = new Set(data.answers.filter((w) => valid.has(w)));
const familiar = data.frequency.filter((w) => curated.has(w));
const familiarSet = new Set(familiar);
const challenging = [...curated].filter((w) => !familiarSet.has(w)).sort();
const answerCount = familiar.length + challenging.length;
const minimumAnswers = 2000;
if (answerCount < minimumAnswers)
  throw new Error(`Curated answers require at least ${minimumAnswers} words.`);
await writeFile("data/dictionary.txt.gz", gzipSync(data.dictionary.join("\n")));
await writeFile("data/guesses.json", JSON.stringify([...valid].sort()));
await writeFile(
  "data/answers.json",
  JSON.stringify({ familiar, challenging }),
);
await writeFile(
  "data/manifest.json",
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      sources: manifest,
      guesses: valid.size,
      answers: answerCount,
      answerPolicy: {
        minimum: minimumAnswers,
        familiar: familiar.length,
        challenging: challenging.length,
        source:
          "Curated original Wordle answers; Familiar words also appear in the frequency list.",
      },
    },
    null,
    2,
  ),
);
console.log(
  `${data.dictionary.length} dictionary entries; ${valid.size} five-letter guesses; ${answerCount} playable answers`,
);
