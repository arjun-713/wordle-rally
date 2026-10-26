import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { PublicRoom, PublicSoloGame } from "../lib/types";
import {
  finalSolo,
  friends,
  guess,
  roomAction,
  roomSecret,
  screenshot,
  shortenRound,
  soloSecret,
  start,
  wrongWords,
} from "./browser-helpers";

async function accessible(page: import("@playwright/test").Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

test("play hub, real room creation, invites, independent turns and rematch", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [320, 700],
  ])
    await screenshot(page, `home-${width}`, width, height);
  await accessible(page);
  const create = page.getByRole("button", {
    name: "Create a room",
    exact: true,
  });
  await create.click();
  const dialog = page.getByRole("dialog", {
    name: "Create a room",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Your player name").fill("Arjun");
  await dialog.getByLabel("Number of rounds").selectOption("2");
  await dialog.getByLabel("Time per round").selectOption("0");
  await screenshot(page, "create-small", 320, 700);
  await accessible(page);
  await dialog
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  await expect(
    page.getByRole("button", { name: "Start the match" }),
  ).toBeDisabled();
  await screenshot(page, "lobby-mobile", 390, 844);
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await guest.goto(`/room/${code}`);
    await guest.getByLabel("Your player name").fill("Maya");
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Start the match" }),
    ).toBeEnabled();
    await screenshot(page, "lobby-desktop");
    await page.getByRole("button", { name: "Start the match" }).click();
    await expect(
      guest.getByRole("table", { name: "Your word board" }),
    ).toBeVisible();
    const answer = (await roomSecret(code)).rounds[0].answer;
    expect(
      (await (await guest.request.get(`/api/rooms/${code}`)).json()).current
        .answer,
    ).toBeUndefined();
    for (const word of wrongWords(answer)) await guess(page, word);
    await expect(page.locator(".game-status")).toContainText(
      "others are still playing",
    );
    await expect(guest.getByLabel("Type your five-letter guess")).toBeEnabled();
    await guess(guest, answer);
    await expect(
      page.getByRole("button", { name: "Next round" }),
    ).toBeVisible();
    expect(
      (await (await page.request.get(`/api/rooms/${code}`)).json()).players.map(
        (p: any) => p.score,
      ),
    ).toEqual([0, 1]);
    await page.getByRole("button", { name: "Next round" }).click();
    await expect(guest.locator(".match-clock")).toContainText("Round 2/2");
    await context.setOffline(true);
    await guest.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(
      guest.getByRole("button", { name: "Retry connection" }),
    ).toBeVisible({ timeout: 16000 });
    await context.setOffline(false);
    await expect(guest.getByLabel("Type your five-letter guess")).toBeEnabled();
    const next = (await roomSecret(code)).rounds[1].answer;
    expect(next).not.toBe(answer);
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
      [320, 700],
    ]) {
      await screenshot(page, `duel-${width}`, width, height);
      expect(
        await page
          .locator(".keyboard")
          .evaluate((el) => el.getBoundingClientRect().bottom),
      ).toBeLessThanOrEqual(height);
    }
    await Promise.all([guess(page, next), guess(guest, next)]);
    await expect(
      page.getByRole("button", { name: "Rematch", exact: true }),
    ).toBeVisible();
    await screenshot(page, "match-result-mobile", 390, 844);
    await page.getByRole("button", { name: "Rematch", exact: true }).click();
    await expect(guest.getByLabel("Room lobby")).toBeVisible();
    expect(
      (await (await page.request.get(`/api/rooms/${code}`)).json()).players.map(
        (p: any) => p.score,
      ),
    ).toEqual([0, 0]);
  } finally {
    await context.close();
  }
});

test("Unlimited keyboard input, row rejection, modal isolation, sixth-guess win and next puzzle", async ({
  page,
}) => {
  const { answer, game } = await finalSolo(page);
  const input = page.getByLabel("Type your five-letter guess");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await input.fill("ZZZZZ");
  await input.press("Enter");
  await expect(page.locator(".rejected-row")).toHaveCount(1);
  await expect(input).toHaveValue("ZZZZZ");
  await expect(page.locator(".guess-count")).toHaveText("5 / 6");
  await expect(page.locator(".game-error")).toHaveCount(0);
  await input.fill("");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await input.fill("ZZZZZ");
  await input.press("Enter");
  expect(
    await page
      .locator(".word-board")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await input.fill("");
  const help = page.getByRole("button", { name: "How to play" });
  await help.click();
  await page.keyboard.type("CRANE");
  await expect(page.getByRole("dialog", { name: "How to play" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await expect(input).toHaveValue("");
  await page.keyboard.type(answer.slice(0, 4));
  await page.keyboard.press("Backspace");
  await page.keyboard.type(answer.slice(3));
  await expect(input).toHaveValue(answer.toUpperCase());
  await page.keyboard.press("Enter");
  await expect(page.locator(".game-status")).toHaveText("Solved in 6/6");
  await expect(page.locator(".result-word h2")).toHaveText(
    answer.toUpperCase(),
  );
  await screenshot(page, "solo-win");
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await expect(page.locator(".guess-count")).toHaveText("0 / 6");
  const next: PublicSoloGame = await (
    await page.request.get("/api/solo")
  ).json();
  expect(next.id).not.toBe(game.id);
  expect((await soloSecret(next.id)).answer).not.toBe(answer);
  await page.reload();
  await expect(page.locator(".guess-count")).toHaveText("0 / 6");
  await page.getByRole("button", { name: "Game settings" }).click();
  await page.getByLabel("Next puzzle difficulty").selectOption("challenging");
  await screenshot(page, "settings-mobile", 390, 844);
  await accessible(page);
  await page.keyboard.press("Escape");
  expect((await (await page.request.get("/api/solo")).json()).id).toBe(next.id);
  const word = (await soloSecret(next.id)).answer;
  for (const letter of word.toUpperCase())
    await page.getByRole("button", { name: letter, exact: true }).click();
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(page.locator(".game-status")).toHaveText("Solved in 1/6");
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await expect(page.locator(".guess-count")).toHaveText("0 / 6");
  expect((await (await page.request.get("/api/solo")).json()).difficulty).toBe(
    "challenging",
  );
  await page.getByRole("link", { name: "Modes", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/");
  await page.goto("/stats");
  await expect(page.locator(".stats-metrics")).toContainText("Played");
  await screenshot(page, "stats-mobile", 390, 844);
  await accessible(page);
});

test("a lost sixth-guess response recovers the saved loss once; an unsaved request remains retryable", async ({
  page,
}) => {
  const fixture = await finalSolo(page);
  let committed!: () => void,
    release!: () => void,
    posts = 0;
  const saved = new Promise<void>((resolve) => (committed = resolve)),
    held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/solo", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "guess"
    ) {
      posts++;
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
    await page.clock.fastForward(12001);
    await expect(page.locator(".game-status")).toHaveText("Out of guesses");
    await expect(page.locator(".result-word h2")).toHaveText(
      fixture.answer.toUpperCase(),
    );
    expect(posts).toBe(1);
    expect(
      (await (await page.request.get("/api/solo")).json()).stats.played,
    ).toBe(1);
    await screenshot(page, "solo-loss-mobile", 390, 844);
  } finally {
    release();
    await page.unroute("**/api/solo");
    await page.clock.resume();
  }
  await page.getByRole("button", { name: "Next word", exact: true }).click();
  await expect(page.locator(".guess-count")).toHaveText("0 / 6");
  const game: PublicSoloGame = await (
    await page.request.get("/api/solo")
  ).json();
  const word = (await soloSecret(game.id)).answer;
  await page.route("**/api/solo", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.getByLabel("Type your five-letter guess").fill(word);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(page.locator(".game-error")).toBeVisible();
  await expect(page.getByLabel("Type your five-letter guess")).toHaveValue(
    word.toUpperCase(),
  );
  await page.unroute("**/api/solo");
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(page.locator(".game-status")).toHaveText("Solved in 1/6");
});

test("Daily loss resumes without another attempt; results share a spoiler-free grid and stats remain separate", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/daily");
  await expect(
    page.getByRole("heading", { name: "Daily challenge" }),
  ).toBeVisible();
  const game: PublicSoloGame = await (
      await page.request.get("/api/daily")
    ).json(),
    answer = (await soloSecret(game.id)).answer;
  for (const word of wrongWords(answer)) await guess(page, word);
  await expect(page.locator(".game-status")).toHaveText("Out of guesses");
  await expect(page.getByText(/Next daily in/)).toBeVisible();
  await page.getByRole("button", { name: "Copy result" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("X/6");
  expect(copied.toLowerCase()).not.toContain(answer);
  await page.reload();
  await expect(page.locator(".game-status")).toHaveText("Out of guesses");
  await expect(page.getByRole("button", { name: "Next word" })).toHaveCount(0);
  await screenshot(page, "daily-exhausted", 320, 700);
  const stats = await (await page.request.get("/api/stats")).json();
  expect(stats.daily.played).toBe(1);
  expect(stats.unlimited.played).toBe(0);
});

test("four real clients play a team championship with bonus scores and fixed teams", async ({
  browser,
}) => {
  const f = await friends(browser, {
    mode: "teams",
    players: 4,
    rounds: 1,
    seconds: 0,
    scoring: "bonus",
    matches: 2,
  });
  try {
    await start(f.pages, f.code);
    await screenshot(f.pages[0], "teams-mobile", 390, 844);
    for (let match = 0; match < 2; match++) {
      const answer = (await roomSecret(f.code)).rounds[0].answer;
      for (const [index, page] of f.pages.entries()) {
        if (index === 1) await guess(page, wrongWords(answer, 1)[0]);
        await guess(page, answer);
      }
      await expect(f.pages[0].getByLabel("Round result")).toBeVisible();
      const view: PublicRoom = await (
        await f.pages[0].request.get(`/api/rooms/${f.code}`)
      ).json();
      expect(view.players.map((p) => p.score)).toEqual([6, 5, 6, 6]);
      expect(view.current!.ended).toBe(true);
      if (!match) {
        await f.pages[0].getByRole("button", { name: "Start match 2" }).click();
        await expect(
          f.pages[0].getByRole("button", { name: "Green", exact: true }),
        ).toBeDisabled();
        await f.pages[0]
          .getByRole("button", { name: "Start the match" })
          .click();
        for (const page of f.pages)
          await expect(
            page.getByLabel("Type your five-letter guess"),
          ).toBeEnabled();
      }
    }
    await f.pages[0]
      .getByText("Match & tournament breakdown", { exact: true })
      .click();
    await expect(
      f.pages[0].getByRole("button", { name: "Rematch", exact: true }),
    ).toBeVisible();
    await screenshot(f.pages[0], "championship-results");
    await screenshot(f.pages[0], "championship-results-small", 320, 700);
    await accessible(f.pages[0]);
  } finally {
    await f.close();
  }
});

test("free-for-all timer and server results stay consistent across three clients", async ({
  browser,
}) => {
  const f = await friends(browser, {
    mode: "free",
    players: 3,
    rounds: 1,
    seconds: 30,
  });
  try {
    await roomAction(f.pages[0], f.code, "start");
    await shortenRound(f.code);
    await Promise.all(f.pages.map((p) => p.goto(`/room/${f.code}`)));
    for (const page of f.pages)
      await expect(page.locator(".game-status")).toContainText(
        "No points awarded",
        { timeout: 10000 },
      );
    const views: PublicRoom[] = await Promise.all(
      f.pages.map(async (p) =>
        (await p.request.get(`/api/rooms/${f.code}`)).json(),
      ),
    );
    expect(new Set(views.map((v) => v.current?.endsAt)).size).toBe(1);
    expect(
      views.every(
        (v) =>
          v.status === "finished" &&
          v.current?.ended &&
          v.players.every((p) => p.score === 0),
      ),
    ).toBeTruthy();
    await screenshot(f.pages[0], "free-for-all-result", 320, 700);
  } finally {
    await f.close();
  }
});

test("invalid codes and room/API boundaries fail clearly without exposing another player's board", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Join with code" }).click();
  await page.getByLabel("Your player name").fill("Guest");
  await page.getByLabel("Room code", { exact: true }).fill("ZZZZZZ");
  await page.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    /not found|expired/i,
  );
  await page.keyboard.press("Escape");
  expect(
    (
      await page.request.post("/api/rooms", {
        data: {
          name: "Guest",
          config: { mode: "duel", players: 3, rounds: 1, seconds: 0 },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/rooms", {
        headers: { Origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const f = await friends(browser, {
    mode: "duel",
    players: 2,
    rounds: 1,
    seconds: 0,
  });
  try {
    await start(f.pages, f.code);
    const answer = (await roomSecret(f.code)).rounds[0].answer;
    await guess(f.pages[0], answer);
    const rival: PublicRoom = await (
      await f.pages[1].request.get(`/api/rooms/${f.code}`)
    ).json();
    expect(rival.current?.guesses).toEqual([]);
    expect(rival.current?.answer).toBeUndefined();
    expect(rival.results).toEqual([]);
    expect("rounds" in rival).toBeFalsy();
    expect((await page.request.get(`/api/rooms/${f.code}`)).status()).toBe(403);
    await accessible(f.pages[1]);
  } finally {
    await f.close();
  }
});
