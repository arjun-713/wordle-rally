import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
async function capture(page: Page, name: string, width = 1440, height = 1050) {
  await mkdir(".impeccable/review", { recursive: true });
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `.impeccable/review/feature-${name}.png`,
    fullPage: !(await page.locator("dialog[open]").count()),
  });
}

import type { Room, PublicRoom } from "../lib/types";
import type { PublicSoloGame, SoloGame } from "../lib/types";
import acceptedGuesses from "../data/guesses.json";
import AxeBuilder from "@axe-core/playwright";
const hostName = "Word Wizard";
async function soloSecret(gameId: string): Promise<SoloGame> {
  const records: Record<string, { value: string }> = JSON.parse(
    await readFile(".data/e2e/state.json", "utf8"),
  );
  for (const [key, record] of Object.entries(records))
    if (key.startsWith("rally:solo:")) {
      const game = JSON.parse(record.value);
      if (game.id === gameId) return game;
    }
  throw new Error("Solo test game missing");
}
test("Wordle Unlimited saves progress, accepts touch guesses, tracks streaks, and keeps fresh words coming", async ({
  page,
}) => {
  async function nextWord(): Promise<PublicSoloGame> {
    const acknowledged = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/solo" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Next word", exact: true }).click();
    const response = await acknowledged;
    expect(response.ok()).toBe(true);
    return response.json();
  }
  await page.goto("/");
  await page.getByRole("link", { name: "Play Wordle Unlimited" }).click();
  await expect(
    page.getByRole("heading", { name: "Wordle Unlimited", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Your word board" }),
  ).toBeVisible();
  await expect(page.getByLabel("Type your five-letter guess")).toBeVisible();
  let game: PublicSoloGame = await (await page.request.get("/api/solo")).json();
  expect(game.answer).toBeUndefined();
  const original = await soloSecret(game.id),
    wrong = original.answer === "crane" ? "spite" : "crane";
  await page.getByLabel("Type your five-letter guess").fill(wrong);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByRole("row", {
      name: `Guess 1: ${wrong.toUpperCase()}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("row", {
      name: `Guess 1: ${wrong.toUpperCase()}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Type your five-letter guess").fill("zzzzz");
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(page.locator(".guess-feedback")).toContainText("dictionary");
  expect(
    (await (await page.request.get("/api/solo")).json()).guesses,
  ).toHaveLength(1);
  await page.getByLabel("Type your five-letter guess").fill(original.answer);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByText("That’s the word. Nice one!", { exact: true }),
  ).toBeVisible();
  game = await nextWord();
  const second = await soloSecret(game.id);
  expect(second.answer).not.toBe(original.answer);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".keyboard")
      .evaluate((e) => e.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const letter of second.answer.toUpperCase())
    await page.getByRole("button", { name: letter, exact: true }).click();
  await page.getByRole("button", { name: "ENTER", exact: true }).click();
  await expect(
    page.getByText("That’s the word. Nice one!", { exact: true }),
  ).toBeVisible();
  game = await nextWord();
  await page.setViewportSize({ width: 1440, height: 1050 });
  const third = await soloSecret(game.id);
  expect([original.answer, second.answer]).not.toContain(third.answer);
  let attempt = 0;
  for (const word of acceptedGuesses
    .filter((w) => w !== third.answer)
    .slice(0, 6)) {
    await page.getByLabel("Type your five-letter guess").fill(word);
    await page
      .getByRole("button", { name: "Submit guess", exact: true })
      .click();
    attempt++;
    await expect(
      page.getByRole("row", {
        name: `Guess ${attempt}: ${word.toUpperCase()}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("A tricky one. Try another?", { exact: true }),
  ).toBeVisible();
  game = await (await page.request.get("/api/solo")).json();
  expect(game.stats).toEqual({ played: 3, wins: 2, streak: 0, bestStreak: 2 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await nextWord();
  await expect(
    page.getByText("Just you and five letters.", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("No time limit is selectable and an untimed room remains playable until both players finish", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your player name").fill("Untimed Host");
  await page.getByRole("button", { name: "1 vs 1", exact: true }).click();
  await page.getByLabel("Time per round").selectOption("0");
  await page.getByLabel("Number of rounds").selectOption("2");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The rivalry starts here." }),
  ).toBeVisible();
  const code = page.url().split("/").pop()!;
  const guestContext = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/room/${code}`);
  await guest.getByLabel("Your player name").fill("Untimed Friend");
  await guest
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start the match", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Start the match", exact: true })
    .click();
  await expect(
    page.getByRole("timer", { name: "No time limit" }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  const view: PublicRoom = await (
    await page.request.get(`/api/rooms/${code}`)
  ).json();
  expect(view.current?.endsAt).toBe(0);
  expect(view.current?.ended).toBe(false);
  const answer = (await secret(code)).rounds[0].answer;
  await page.getByLabel("Type your five-letter guess").fill(answer);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByText("You got it. +1 point!", { exact: true }),
  ).toBeVisible();
  await expect(guest.getByLabel("Type your five-letter guess")).toBeVisible();
  await guest.getByLabel("Type your five-letter guess").fill(answer);
  await guest
    .getByRole("button", { name: "Submit guess", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start round 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start round 2", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Round 2. Make it count." }),
  ).toBeVisible();
  await expect(
    page.getByRole("timer", { name: "No time limit" }),
  ).toBeVisible();
  await guestContext.close();
});
test("landing page and room configuration pass automated accessibility checks", async ({
  page,
}) => {
  await page.goto("/");
  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
async function secret(code: string): Promise<Room> {
  const state = JSON.parse(await readFile(".data/e2e/state.json", "utf8"));
  return JSON.parse(state[`rally:room:${code}`].value);
}

async function prepareFinalSoloGuess(page: Page) {
  const game: PublicSoloGame = await (
    await page.request.post("/api/solo", {
      data: { action: "start" },
    })
  ).json();
  const fixture = await soloSecret(game.id);
  const wrong = [
    "ouija",
    "ample",
    "racer",
    "races",
    "raves",
    "rates",
    "sloth",
  ].filter((word) => word !== fixture.answer);
  for (const word of wrong.slice(0, 5)) {
    const response = await page.request.post("/api/solo", {
      data: { action: "guess", gameId: game.id, word },
    });
    expect(response.ok()).toBe(true);
  }
  await page.goto("/unlimited");
  await expect(page.getByText("5 / 6 guesses", { exact: true })).toBeVisible();
  return { game, answer: fixture.answer, wrong: wrong[5] };
}

test("Unlimited recovers the saved loss when the sixth-guess response stalls", async ({
  page,
}) => {
  const fixture = await prepareFinalSoloGuess(page);
  let committed!: () => void, release!: () => void;
  const saved = new Promise<void>((resolve) => {
    committed = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let guessPosts = 0;
  await page.route("**/api/solo", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "guess"
    ) {
      guessPosts++;
      const response = await route.fetch();
      committed();
      await held;
      await route.fulfill({ response }).catch(() => {});
    } else await route.continue();
  });
  try {
    await page.clock.install();
    await page.getByLabel("Type your five-letter guess").fill(fixture.wrong);
    await page
      .getByRole("button", { name: "Submit guess", exact: true })
      .click();
    await saved;
    await expect(
      page.getByRole("button", { name: "Submit guess", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Checking your guess…", { exact: true }),
    ).toBeVisible();
    await capture(page, "sixth-pending-mobile", 390, 844);
    await page.clock.fastForward(12001);
    await expect(
      page.getByText("A tricky one. Try another?", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".solo-answer")).toHaveText(
      fixture.answer.toUpperCase(),
    );
    await expect(
      page.getByRole("button", { name: "Next word", exact: true }),
    ).toBeEnabled();
    expect(guessPosts).toBe(1);
    const game: PublicSoloGame = await (
      await page.request.get("/api/solo")
    ).json();
    expect(game.guesses).toHaveLength(6);
    expect(game.status).toBe("lost");
    expect(game.stats.played).toBe(1);
    await capture(page, "sixth-lost-desktop", 1440, 1050);
  } finally {
    release();
  }
});

test("dictionary rejection wiggles only the current row and keeps the word editable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/unlimited");
  const input = page.getByLabel("Type your five-letter guess");
  await expect(input).toBeVisible();
  await input.fill("ZZZZZ");
  await input.press("Enter");
  const rejected = page.locator(".tile-row.rejected-row");
  await expect(rejected).toHaveCount(1);
  expect(await rejected.evaluate((row) => row.getAnimations().length)).toBe(1);
  expect(
    await page
      .locator(".word-board")
      .evaluate((board) => board.getAnimations().length),
  ).toBe(0);
  await expect(rejected).toHaveText("ZZZZZ");
  await expect(rejected.locator(".tile").first()).toHaveCSS(
    "border-top-color",
    "rgb(135, 66, 38)",
  );
  await expect(page.locator('.room-error[role="alert"]')).toHaveCount(0);
  await expect(input).toHaveValue("ZZZZZ");
  await expect(input).toBeEnabled();
  await expect(input).toBeFocused();
  await expect(page.getByText("0 / 6 guesses", { exact: true })).toBeVisible();
  await capture(page, "dictionary-rejected-desktop");
  await capture(page, "dictionary-rejected-wide", 1920, 1080);
  await capture(page, "dictionary-rejected-mobile", 390, 844);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await input.fill("CRANE");
  await expect(rejected).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await input.fill("ZZZZZ");
  await input.press("Enter");
  await expect(page.locator(".tile-row.rejected-row")).toHaveCount(1);
  expect(
    await page
      .locator(".word-board")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
});
test("a correct sixth guess wins and opens the next Unlimited puzzle", async ({
  page,
}) => {
  const fixture = await prepareFinalSoloGuess(page);
  await page.getByLabel("Type your five-letter guess").fill(fixture.answer);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByText("That’s the word. Nice one!", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("6 / 6 guesses", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await expect(page.getByLabel("Type your five-letter guess")).toBeEnabled();
  await expect(page.getByText("0 / 6 guesses", { exact: true })).toBeVisible();
});
test("an unsaved final guess stays editable after a network failure and can be retried once", async ({
  page,
}) => {
  const fixture = await prepareFinalSoloGuess(page);
  const unavailable = async (route: import("@playwright/test").Route) => {
    await route.abort("internetdisconnected");
  };
  await page.route("**/api/solo", unavailable);
  const input = page.getByLabel("Type your five-letter guess");
  await input.fill(fixture.wrong);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(page.locator('.room-error[role="alert"]')).toContainText(
    "connection",
  );
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue(fixture.wrong.toUpperCase());
  await expect(page.getByText("5 / 6 guesses", { exact: true })).toBeVisible();
  await page.unroute("**/api/solo", unavailable);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByText("A tricky one. Try another?", { exact: true }),
  ).toBeVisible();
  const game: PublicSoloGame = await (
    await page.request.get("/api/solo")
  ).json();
  expect(game.guesses).toHaveLength(6);
  expect(game.stats.played).toBe(1);
});
test("friends create, join, play two rounds, see results, and set up a fresh rematch", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your player name").fill(hostName);
  await page.getByRole("button", { name: "1 vs 1", exact: true }).click();
  await page.getByLabel("Number of rounds").selectOption("2");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The rivalry starts here." }),
  ).toBeVisible();
  const code = page.url().split("/").pop()!;
  await expect(
    page.getByRole("button", { name: "Start the match", exact: true }),
  ).toBeDisabled();
  const guestContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/room/${code}`);
  await guest.getByLabel("Your player name").fill("Maya");
  await guest
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "The rivalry starts here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start the match", exact: true }),
  ).toBeEnabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Start the match", exact: true })
    .click();
  for (let round = 0; round < 2; round++) {
    await expect(
      page.getByRole("heading", { name: `Round ${round + 1}. Make it count.` }),
    ).toBeVisible();
    await expect(
      guest.getByRole("heading", {
        name: `Round ${round + 1}. Make it count.`,
      }),
    ).toBeVisible();
    const answer = (await secret(code)).rounds[round].answer;
    if (round === 0)
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    await page.getByLabel("Type your five-letter guess").fill(answer);
    await page
      .getByRole("button", { name: "Submit guess", exact: true })
      .click();
    await expect(
      page.getByText("You got it. +1 point!", { exact: true }),
    ).toBeVisible();
    // Exercise the touch keyboard separately from the native text field.
    for (const letter of answer.toUpperCase())
      await guest.getByRole("button", { name: letter, exact: true }).click();
    await guest.getByRole("button", { name: "ENTER", exact: true }).click();
    if (round === 0) {
      await expect(
        page.getByRole("button", { name: "Start round 2", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Start round 2", exact: true })
        .click();
    }
  }
  await expect(
    page.getByRole("heading", { name: "That’s a wrap." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A shared victory!" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const result = await page.request.get(`/api/rooms/${code}`);
  const state: PublicRoom = await result.json();
  expect(state.players.map((p) => p.score)).toEqual([2, 2]);
  const used = state.results.map((r) => r.answer);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A shared victory!" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Set up a rematch", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The rivalry starts here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start the match", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Round 1. Make it count." }),
  ).toBeVisible();
  expect(
    (await secret(code)).rounds.every((r) => !used.includes(r.answer)),
  ).toBe(true);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: hostName, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await guestContext.close();
});
test("API validates room configuration, membership, JSON and request origin", async ({
  request,
}) => {
  const wrongOrigin = await request.post("/api/rooms", {
    headers: { Origin: "https://unrelated.example" },
    data: {
      name: "Host",
      config: { mode: "duel", players: 2, rounds: 1, seconds: 30 },
    },
  });
  expect(wrongOrigin.status()).toBe(403);
  const invalid = await request.post("/api/rooms", {
    data: {
      name: "Host",
      config: { mode: "duel", players: 16, rounds: 1, seconds: 30 },
    },
  });
  expect(invalid.status()).toBe(400);
  const malformed = await request.post("/api/rooms", {
    data: "not json",
    headers: { "Content-Type": "application/json" },
  });
  expect(malformed.status()).toBe(400);
  const missing = await request.get("/api/rooms/ZZZZZZ");
  expect(missing.status()).toBe(404);
});
test("2v2 shows summed team scores after four independent solves", async ({
  browser,
  page,
}) => {
  const contexts: BrowserContext[] = [];
  const created = await page.request.post("/api/rooms", {
    data: {
      name: "Team Host",
      config: { mode: "teams", players: 4, rounds: 1, seconds: 90 },
    },
  });
  expect(created.ok()).toBe(true);
  const room: PublicRoom = await created.json();
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    contexts.push(context);
    const response = await context.request.post(`/api/rooms/${room.code}`, {
      data: { action: "join", name: `Teammate ${i}` },
    });
    expect(response.ok()).toBe(true);
  }
  await page.goto(`/room/${room.code}`);
  await page
    .getByRole("button", { name: "Start the match", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Round 1. Make it count." }),
  ).toBeVisible();
  const answer = (await secret(room.code)).rounds[0].answer;
  await Promise.all(
    [page.request, ...contexts.map((c) => c.request)].map(async (request) => {
      const response = await request.post(`/api/rooms/${room.code}`, {
        data: {
          action: "guess",
          word: answer,
          round: 0,
          matchId: (await secret(room.code)).matchId,
        },
      });
      expect(response.ok()).toBe(true);
    }),
  );
  await expect(
    page.getByRole("heading", { name: "The teams are tied!" }),
  ).toBeVisible();
  const view: PublicRoom = await (
    await page.request.get(`/api/rooms/${room.code}`)
  ).json();
  expect(
    [0, 1].map((t) =>
      view.players.filter((p) => p.team === t).reduce((s, p) => s + p.score, 0),
    ),
  ).toEqual([2, 2]);
  await Promise.all(contexts.map((c) => c.close()));
});
test("layout reflows at mobile, desktop and wide widths, and dialogs support Escape", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [390, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Create a room", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("daily challenge resumes, shares without spoilers, saves stats, and offers optional feedback", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", {
      value: (pattern: unknown) => {
        (window as unknown as { vibrations: unknown[] }).vibrations ??= [];
        (window as unknown as { vibrations: unknown[] }).vibrations.push(
          pattern,
        );
        return true;
      },
    });
  });
  await page.goto("/");
  await capture(page, "home-desktop");
  await capture(page, "home-mobile", 390, 844);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("link", { name: "Play today’s challenge" }).click();
  await expect(
    page.getByRole("heading", { name: "The daily challenge", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Your word board" }),
  ).toBeVisible();
  let daily: PublicSoloGame = await (
    await page.request.get("/api/daily")
  ).json();
  expect(daily.answer).toBeUndefined();
  const state = JSON.parse(await readFile(".data/e2e/state.json", "utf8"));
  const raw: SoloGame = Object.entries(state)
    .map(([key, record]) =>
      key.startsWith("rally:daily:")
        ? JSON.parse((record as { value: string }).value)
        : null,
    )
    .find((g) => g?.id === daily.id);
  const friend = await browser.newContext({ baseURL: "http://localhost:3100" });
  const sameDay = await (await friend.request.get("/api/daily")).json();
  expect(sameDay.id).toBe(daily.id);
  expect(sameDay.answer).toBeUndefined();
  await friend.close();
  await page
    .getByRole("button", { name: "Game settings", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Sound effects", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Haptic feedback", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "Sound effects", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Haptic feedback", exact: true })
    .check();
  await capture(page, "settings-desktop");
  await capture(page, "settings-mobile", 390, 844);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Try win feedback" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { vibrations: unknown[] }).vibrations.length,
    ),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  const wrong = raw.answer === "crane" ? "spite" : "crane";
  await page.getByLabel("Type your five-letter guess").fill(wrong);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByRole("row", {
      name: `Guess 1: ${wrong.toUpperCase()}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("row", {
      name: `Guess 1: ${wrong.toUpperCase()}`,
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator(".tile.revealed").count()).toBe(0);
  await page
    .getByRole("button", { name: "Game settings", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Sound effects", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await capture(page, "daily-desktop");
  await capture(page, "daily-mobile", 390, 844);
  expect(
    await page
      .locator(".keyboard")
      .evaluate((e) => e.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(844);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel("Type your five-letter guess").fill(raw.answer);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Share result", exact: true }),
  ).toBeVisible();
  await capture(page, "daily-won-desktop");
  await capture(page, "daily-won-mobile", 390, 844);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Share result", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Word Rally Daily");
  expect(copied).toContain("2/6");
  expect(copied.toLowerCase()).not.toContain(raw.answer);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Share result", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next word", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("link", { name: "Personal statistics", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Daily challenge", exact: true })
    .click();
  await expect(
    page.getByLabel("2 guesses: 1 solves", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await capture(page, "stats-desktop");
  await capture(page, "stats-wide", 1920, 1080);
  await capture(page, "stats-mobile", 390, 844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("championship room config, bonus points, round ledger, and cumulative standings work across matches", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your player name").fill("Rally Host");
  await page.getByRole("button", { name: "1 vs 1", exact: true }).click();
  await page.getByLabel("Number of rounds").selectOption("1");
  await page.getByLabel("Time per round").selectOption("0");
  await page.getByLabel("Scoring").selectOption("bonus");
  await page.getByLabel("Word difficulty").selectOption("challenging");
  await page.getByLabel("Match format").selectOption("championship");
  await page.getByLabel("Number of matches").selectOption("2");
  await capture(page, "championship-config-mobile", 390, 844);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The rivalry starts here." }),
  ).toBeVisible();
  const code = page.url().split("/").pop()!;
  const friend = await browser.newContext({ baseURL: "http://localhost:3100" });
  expect(
    (
      await friend.request.post(`/api/rooms/${code}`, {
        data: { action: "join", name: "Long Named Rival" },
      })
    ).ok(),
  ).toBe(true);
  for (let match = 0; match < 2; match++) {
    await expect(
      page.getByRole("button", { name: "Start the match", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Start the match", exact: true })
      .click();
    await expect(page.getByLabel("Type your five-letter guess")).toBeVisible();
    const answer = (await secret(code)).rounds[0].answer;
    await page.getByLabel("Type your five-letter guess").fill(answer);
    await page
      .getByRole("button", { name: "Submit guess", exact: true })
      .click();
    await expect(
      page.getByText("You got it. +6 points!", { exact: true }),
    ).toBeVisible();
    const wrong = answer === "crane" ? "spite" : "crane";
    await friend.request.post(`/api/rooms/${code}`, {
      data: {
        action: "guess",
        match,
        round: 0,
        word: wrong,
        matchId: (await secret(code)).matchId,
      },
    });
    await friend.request.post(`/api/rooms/${code}`, {
      data: {
        action: "guess",
        match,
        round: 0,
        word: answer,
        matchId: (await secret(code)).matchId,
      },
    });
    await expect(
      page.getByRole("heading", {
        name: "Championship standings",
        exact: true,
      }),
    ).toBeVisible();
    const table = page.locator(".breakdown-round table").first();
    await expect(table).toContainText("Rally Host");
    await expect(table).toContainText("+6");
    await expect(table).toContainText("+5");
    if (!match)
      await page
        .getByRole("button", { name: "Set up match 2", exact: true })
        .click();
  }
  await expect(
    page.getByRole("heading", {
      name: "Rally Host takes the title!",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".championship-standings")).toContainText(
    "M1: 6 · M2: 6",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await capture(page, "championship-desktop");
  await capture(page, "championship-mobile", 390, 844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Match 1 breakdown", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Match 1 rounds", exact: true }),
  ).toBeVisible();
  await friend.close();
});

test("later championship lobby keeps a departed seat and offers clear recovery", async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  const created: PublicRoom = await (
    await page.request.post("/api/rooms", {
      data: {
        name: "Original Host",
        config: { mode: "duel", players: 2, rounds: 1, seconds: 0, matches: 2 },
      },
    })
  ).json();
  await context.request.post(`/api/rooms/${created.code}`, {
    data: { action: "join", name: "Original Rival" },
  });
  await page.request.post(`/api/rooms/${created.code}`, {
    data: { action: "start", match: 0 },
  });
  const answer = (await secret(created.code)).rounds[0].answer;
  for (const request of [page.request, context.request])
    await request.post(`/api/rooms/${created.code}`, {
      data: {
        action: "guess",
        match: 0,
        round: 0,
        word: answer,
        matchId: (await secret(created.code)).matchId,
      },
    });
  await page.request.post(`/api/rooms/${created.code}`, {
    data: { action: "nextMatch", match: 0 },
  });
  await context.request.post(`/api/rooms/${created.code}`, {
    data: { action: "leave" },
  });
  const replacement = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  const response = await replacement.request.post(
    `/api/rooms/${created.code}`,
    { data: { action: "join", name: "Replacement" } },
  );
  expect(response.status()).toBe(403);
  expect((await response.json()).error).toContain("roster is locked");
  await page.goto(`/room/${created.code}`);
  await expect(
    page.getByText("Left championship", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start the match", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Championships keep the original group/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to home", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy invite link", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Last completed match", exact: true }),
  ).toBeVisible();
  const guest = await context.newPage();
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto(`/room/${created.code}`);
  await expect(
    guest.getByText(/Championships keep the original group/),
  ).toBeVisible();
  await expect(guest.locator(".waiting-host")).toHaveCount(0);
  await expect(
    guest.getByRole("button", { name: "Copy invite link", exact: true }),
  ).toHaveCount(0);
  await capture(guest, "championship-roster-guest-mobile", 390, 844);
  await capture(page, "championship-roster-desktop");
  await capture(page, "championship-roster-mobile", 390, 844);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await replacement.close();
  await context.close();
});

test("a delayed old Unlimited sync cannot replace the next puzzle", async ({
  page,
}) => {
  await page.goto("/unlimited");
  await expect(page.getByLabel("Type your five-letter guess")).toBeVisible();
  const initial: PublicSoloGame = await (
    await page.request.get("/api/solo")
  ).json();
  const answer = (await soloSecret(initial.id)).answer;
  await page.getByLabel("Type your five-letter guess").fill(answer);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next word", exact: true }),
  ).toBeVisible();
  const old = await (await page.request.get("/api/solo")).json();
  let release!: () => void, pending!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    pending = resolve;
  });
  await page.route("**/api/solo", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    pending();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(old),
    });
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await ready;
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await expect(page.getByLabel("Type your five-letter guess")).toBeVisible();
  const synced = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/solo") &&
      response.request().method() === "GET",
  );
  release();
  await (await synced).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".round-counter")).toContainText("Puzzle 2");
  await expect(
    page.getByRole("button", { name: "Next word", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/solo");
});

test("first-time daily play establishes identity before requesting stats", async ({
  page,
}) => {
  let cookie: string | undefined;
  let observed!: () => void;
  const statsRequested = new Promise<void>((resolve) => {
    observed = resolve;
  });
  await page.route("**/api/stats", async (route) => {
    if (cookie === undefined) {
      cookie = route.request().headers()["cookie"] ?? "";
      observed();
    }
    await route.continue();
  });
  await page.route("**/api/daily", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto("/daily");
  await expect(
    page.getByRole("table", { name: "Your word board" }),
  ).toBeVisible();
  await statsRequested;
  expect(cookie).toMatch(/rally-player=[a-f0-9]{64}/);
});

import candidateAnswers from "../data/answers.json";
import { markGuess } from "../lib/engine";
async function playByFeedback(page: Page, code: string, touch = false) {
  let candidates = [...candidateAnswers];
  for (let attempt = 0; attempt < 6; attempt++) {
    const view: PublicRoom = await (
      await page.request.get(`/api/rooms/${code}`)
    ).json();
    const guesses = view.current!.guesses;
    if (view.current!.solved.includes(view.me) || guesses.length === 6) return;
    candidates = candidates.filter((answer) =>
      guesses.every(
        (guess) => markGuess(guess.word, answer).join() === guess.marks.join(),
      ),
    );
    expect(candidates.length).toBeGreaterThan(0);
    const frequencies = new Map<string, number>();
    for (const candidate of candidates)
      for (const letter of new Set(candidate))
        frequencies.set(letter, (frequencies.get(letter) ?? 0) + 1);
    const score = (word: string) =>
      [...new Set(word)].reduce(
        (sum, letter) => sum + (frequencies.get(letter) ?? 0),
        0,
      );
    const word = guesses.length
      ? candidates.sort((a, b) => score(b) - score(a))[0]
      : "crane";
    const acknowledgement = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/rooms/${code}`) &&
        response.request().method() === "POST",
    );
    if (touch) {
      for (const letter of word.toUpperCase())
        await page
          .getByRole("button", { name: new RegExp(`^${letter}(?:,.*)?$`) })
          .click();
      await page.getByRole("button", { name: "ENTER", exact: true }).click();
    } else {
      await page.getByLabel("Type your five-letter guess").fill(word);
      await page
        .getByRole("button", { name: "Submit guess", exact: true })
        .click();
    }
    const acknowledged = await acknowledgement;
    expect(acknowledged.ok()).toBe(true);
    const next: PublicRoom = await acknowledged.json();
    expect(next.current!.guesses).toHaveLength(guesses.length + 1);
  }
}
for (const mode of ["teams", "free"] as const)
  test(`play ${mode} using letter feedback, including an exhausted player and touch entry`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    const count = mode === "teams" ? 4 : 3,
      rounds = mode === "teams" ? 1 : 2;
    const otherContexts: BrowserContext[] = [],
      players: Page[] = [page];
    const created: PublicRoom = await (
      await page.request.post("/api/rooms", {
        data: {
          name: "Playtest Host",
          config: {
            mode,
            players: count,
            rounds,
            seconds: 0,
            scoring: mode === "teams" ? "bonus" : "classic",
            difficulty: "mixed",
          },
        },
      })
    ).json();
    for (let i = 1; i < count; i++) {
      const context = await browser.newContext({
        baseURL: "http://localhost:3100",
        viewport:
          i === 1 ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      });
      otherContexts.push(context);
      const guest = await context.newPage();
      players.push(guest);
      await guest.goto(`/room/${created.code}`);
      await guest.getByLabel("Your player name").fill(`Playtest Rival ${i}`);
      await guest
        .getByRole("button", { name: "Join the room", exact: true })
        .click();
    }
    await page.goto(`/room/${created.code}`);
    await expect(
      page.getByRole("button", { name: "Start the match", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Start the match", exact: true })
      .click();
    const totals: Record<string, number> = {};
    for (let round = 0; round < rounds; round++) {
      for (const player of players)
        await expect(
          player.getByRole("table", { name: "Your word board" }),
        ).toBeVisible();
      if (!round) {
        for (const word of acceptedGuesses
          .filter((w) => !candidateAnswers.includes(w))
          .slice(0, 6)) {
          const acknowledgement = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/api/rooms/${created.code}`) &&
              response.request().method() === "POST",
          );
          await page.getByLabel("Type your five-letter guess").fill(word);
          await page
            .getByRole("button", { name: "Submit guess", exact: true })
            .click();
          expect((await acknowledgement).ok()).toBe(true);
        }
        await expect(
          page.getByText("Out of guesses. Still in the match.", {
            exact: true,
          }),
        ).toBeVisible();
        expect(
          (await (await page.request.get(`/api/rooms/${created.code}`)).json())
            .current.ended,
        ).toBe(false);
      }
      for (let i = round ? 0 : 1; i < count; i++)
        await playByFeedback(players[i], created.code, i === 1);
      const final: PublicRoom = await (
        await page.request.get(`/api/rooms/${created.code}`)
      ).json();
      expect(final.current!.ended).toBe(true);
      for (const player of players) {
        const own: PublicRoom = await (
          await player.request.get(`/api/rooms/${created.code}`)
        ).json();
        totals[own.me] =
          (totals[own.me] ?? 0) +
          (own.current!.solved.includes(own.me)
            ? mode === "teams"
              ? 7 - own.current!.guesses.length
              : 1
            : 0);
      }
      expect(final.players.map((p) => p.score)).toEqual(
        final.players.map((p) => totals[p.id]),
      );
      if (round < rounds - 1) {
        await expect(
          page.getByRole("button", {
            name: `Start round ${round + 2}`,
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", {
            name: `Start round ${round + 2}`,
            exact: true,
          })
          .click();
      }
    }
    await expect(
      page.getByRole("heading", { name: "That’s a wrap.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Round breakdown", exact: true }),
    ).toBeVisible();
    for (const player of players)
      expect(
        await player.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await Promise.all(otherContexts.map((context) => context.close()));
  });

test("room APIs and static routes do not disclose cookies, opponents guesses, or future answers", async ({
  page,
  browser,
}) => {
  const friend = await browser.newContext({ baseURL: "http://localhost:3100" }),
    outsider = await browser.newContext({ baseURL: "http://localhost:3100" });
  const room: PublicRoom = await (
    await page.request.post("/api/rooms", {
      data: {
        name: "Privacy Host",
        config: { mode: "duel", players: 2, rounds: 3, seconds: 0 },
      },
    })
  ).json();
  await friend.request.post(`/api/rooms/${room.code}`, {
    data: { action: "join", name: "Privacy Rival" },
  });
  const started: PublicRoom = await (
    await page.request.post(`/api/rooms/${room.code}`, {
      data: { action: "start" },
    })
  ).json();
  const privateState = await secret(room.code),
    answer = privateState.rounds[0].answer;
  expect(started.current!.answer).toBeUndefined();
  expect(started.results).toHaveLength(0);
  expect(started).not.toHaveProperty("rounds");
  const wrong = answer === "crane" ? "spite" : "crane";
  await friend.request.post(`/api/rooms/${room.code}`, {
    data: {
      action: "guess",
      round: 0,
      matchId: started.matchId,
      word: wrong,
      score: 999,
      id: started.me,
    },
  });
  const response = await page.request.get(`/api/rooms/${room.code}`),
    view: PublicRoom = await response.json();
  expect(response.headers()["cache-control"]).toContain("no-store");
  const unchanged = await page.request.get(
    `/api/rooms/${room.code}?revision=${view.revision}`,
  );
  expect(unchanged.headers()["cache-control"]).toContain("no-store");
  expect(await unchanged.json()).toEqual({
    unchanged: true,
    revision: view.revision,
    serverTime: expect.any(Number),
  });
  expect(
    (await page.request.get(`/api/rooms/${room.code}?revision=-1`)).status(),
  ).toBe(400);
  expect(
    (
      await outsider.request.get(
        `/api/rooms/${room.code}?revision=${view.revision}`,
      )
    ).status(),
  ).toBe(403);
  expect(view.current!.guesses).toHaveLength(0);
  expect(view.players.every((p) => p.score === 0)).toBe(true);
  for (const r of privateState.rounds)
    expect(JSON.stringify(view)).not.toContain(`"${r.answer}"`);
  const token = (await page.context().cookies()).find(
    (c) => c.name === "rally-player",
  )!.value;
  expect(JSON.stringify(view)).not.toContain(token);
  expect((await outsider.request.get(`/api/rooms/${room.code}`)).status()).toBe(
    403,
  );
  expect(
    (
      await outsider.request.post(`/api/rooms/${room.code}`, {
        data: {
          action: "guess",
          round: 0,
          matchId: started.matchId,
          word: answer,
          id: started.me,
        },
      })
    ).status(),
  ).toBe(403);
  for (const route of [
    "/.env.local",
    "/.git/config",
    "/.data/state.json",
    "/data/answers.json",
    "/data/daily-calendar.json",
  ])
    expect((await page.request.get(route)).status()).toBe(404);
  const stale = await page.request.post(`/api/rooms/${room.code}`, {
    data: { action: "guess", round: 0, word: wrong, matchId: "stale-match" },
  });
  expect(stale.status()).toBe(409);
  await friend.close();
  await outsider.close();
});

test("room sync avoids redundant reads, pauses hidden tabs and finished hosts, and still detects rematches", async ({
  page,
  browser,
}) => {
  const friend = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const room: PublicRoom = await (
      await page.request.post("/api/rooms", {
        data: {
          name: "Efficient Host",
          config: { mode: "duel", players: 2, rounds: 1, seconds: 0 },
        },
      })
    ).json();
    await friend.request.post(`/api/rooms/${room.code}`, {
      data: { action: "join", name: "Efficient Rival" },
    });
    const started: PublicRoom = await (
      await page.request.post(`/api/rooms/${room.code}`, {
        data: { action: "start" },
      })
    ).json();
    let reads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        request.url().includes(`/api/rooms/${room.code}`)
      )
        reads++;
    });
    await page.goto(`/room/${room.code}`);
    await expect(page.getByLabel("Type your five-letter guess")).toBeVisible();
    const initialReads = reads;
    await page.waitForTimeout(2200);
    expect(reads).toBe(initialReads);
    const answer = (await secret(room.code)).rounds[0].answer;
    await page.getByLabel("Type your five-letter guess").fill(answer);
    await page
      .getByRole("button", { name: "Submit guess", exact: true })
      .click();
    await expect(
      page.getByText("You got it. +1 point!", { exact: true }),
    ).toBeVisible();
    const acknowledgedReads = reads;
    await page.waitForTimeout(500);
    expect(reads).toBe(acknowledgedReads);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(5500);
    expect(reads).toBe(acknowledgedReads);
    await friend.request.post(`/api/rooms/${room.code}`, {
      data: {
        action: "guess",
        round: 0,
        matchId: started.matchId,
        word: answer,
      },
    });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(
      page.getByRole("button", { name: "Set up a rematch", exact: true }),
    ).toBeVisible();
    const finishedReads = reads;
    await page.clock.install();
    await page.clock.fastForward(120000);
    expect(reads).toBe(finishedReads);
    const guest = await friend.newPage();
    await guest.goto(`/room/${room.code}`);
    await expect(
      guest.getByRole("heading", { name: "Round breakdown", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Set up a rematch", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "The rivalry starts here." }),
    ).toBeVisible();
    await expect(
      guest.getByRole("heading", { name: "The rivalry starts here." }),
    ).toBeVisible();
  } finally {
    await friend.close();
  }
});
