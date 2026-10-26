import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import words from "../data/guesses.json";
import type {
  Config,
  PublicRoom,
  PublicSoloGame,
  Room,
  SoloGame,
} from "../lib/types";
const stateFile = ".data/e2e/state.json";
export const wrongWords = (answer: string, count = 6) =>
  words.filter((word) => word !== answer).slice(0, count);
export async function secret<T extends Room | SoloGame>(
  matches: (value: any) => boolean,
): Promise<T> {
  const records: Record<string, { value: string }> = JSON.parse(
    await readFile(stateFile, "utf8"),
  );
  for (const [key, record] of Object.entries(records)) {
    if (!/^rally:(room|solo|daily):/.test(key)) continue;
    const value = JSON.parse(record.value);
    if (matches(value)) return value;
  }
  throw new Error("Missing isolated game fixture");
}
export const roomSecret = (code: string) =>
  secret<Room>((value) => value.code === code);
export const soloSecret = (id: string) =>
  secret<SoloGame>(
    (value) => value.id === id && typeof value.answer === "string",
  );
export async function shortenRound(code: string) {
  const records = JSON.parse(await readFile(stateFile, "utf8"));
  const record = records[`rally:room:${code}`];
  const room: Room = JSON.parse(record.value);
  room.rounds[room.round].endsAt = Date.now() + 2200;
  room.revision++;
  record.value = JSON.stringify(room);
  await writeFile(stateFile, JSON.stringify(records));
}
export async function guess(page: Page, word: string) {
  const input = page.getByLabel("Type your five-letter guess");
  await expect(input).toBeEnabled();
  await input.fill(word);
  await page.getByRole("button", { name: "Submit guess", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`: ${word.toUpperCase()}$`) }),
  ).toBeVisible();
}
export async function roomAction(page: Page, code: string, action: string) {
  const view: PublicRoom = await (
    await page.request.get(`/api/rooms/${code}`)
  ).json();
  const response = await page.request.post(`/api/rooms/${code}`, {
    data: {
      action,
      round: view.round,
      match: view.match ?? 0,
      matchId: view.matchId,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<PublicRoom>;
}
export async function friends(browser: Browser, config: Config) {
  const contexts: BrowserContext[] = [],
    pages: Page[] = [];
  for (let i = 0; i < config.players; i++) {
    const context = await browser.newContext();
    contexts.push(context);
    pages.push(await context.newPage());
  }
  const created = await pages[0].request.post("/api/rooms", {
    data: { name: "Arjun", config },
  });
  expect(created.ok()).toBeTruthy();
  const room: PublicRoom = await created.json();
  for (let i = 1; i < pages.length; i++)
    expect(
      (
        await pages[i].request.post(`/api/rooms/${room.code}`, {
          data: { action: "join", name: ["Arjun", "Maya", "Sam", "Noor"][i] },
        })
      ).ok(),
    ).toBeTruthy();
  return {
    pages,
    contexts,
    code: room.code,
    close: () => Promise.all(contexts.map((c) => c.close())),
  };
}
export async function start(pages: Page[], code: string) {
  await roomAction(pages[0], code, "start");
  await Promise.all(pages.map((p) => p.goto(`/room/${code}`)));
  await Promise.all(
    pages.map((p) =>
      expect(p.getByRole("table", { name: "Your word board" })).toBeVisible(),
    ),
  );
}
export async function finalSolo(page: Page) {
  const response = await page.request.post("/api/solo", {
    data: { action: "start" },
  });
  const game: PublicSoloGame = await response.json(),
    answer = (await soloSecret(game.id)).answer;
  const wrong = wrongWords(answer);
  for (const word of wrong.slice(0, 5))
    expect(
      (
        await page.request.post("/api/solo", {
          data: { action: "guess", gameId: game.id, word },
        })
      ).ok(),
    ).toBeTruthy();
  await page.goto("/unlimited");
  await expect(page.locator(".guess-count")).toHaveText("5 / 6");
  return { game, answer, wrong: wrong[5] };
}
export async function screenshot(
  page: Page,
  name: string,
  width = 1440,
  height = 900,
) {
  await mkdir(".taste-skill/review", { recursive: true });
  await page.setViewportSize({ width, height });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `.taste-skill/review/${name}.png`,
    fullPage: !(await page.locator("dialog[open]").count()),
  });
}
