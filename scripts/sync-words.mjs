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
const valid = new Set(
  [...data.dictionary, ...data.wordle].filter((w) => w.length === 5),
);
// Familiar frequency-ranked words only; remove proper names, abbreviations, and unsuitable answers.
const blocked = new Set(
  "jesus christ islam hindu bible satan penis pussy bitch fucks nudes naked porno boobs booty sperm slave lynch negro niger dildo raped rapes rapist allah jihad jihad iraqi china japan india texas miami paris tokyo korea spain wales peter david james smith jones brown white black kevin laura steve henry julie scott clark roger marie susan sarah linux yahoo gmail intel adobe honda nokia canon epson admin login email https fonts htmls mysql proxy cache bytes ascii".split(
    " ",
  ),
);
const answers = data.frequency.filter(
  (w) => w.length === 5 && valid.has(w) && !blocked.has(w),
);
await writeFile("data/dictionary.txt.gz", gzipSync(data.dictionary.join("\n")));
await writeFile("data/guesses.json", JSON.stringify([...valid].sort()));
await writeFile("data/answers.json", JSON.stringify(answers));
await writeFile(
  "data/manifest.json",
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      sources: manifest,
      guesses: valid.size,
      answers: answers.length,
    },
    null,
    2,
  ),
);
console.log(
  `${data.dictionary.length} dictionary entries; ${valid.size} five-letter guesses; ${answers.length} familiar answers`,
);
