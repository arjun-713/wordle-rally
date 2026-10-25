import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/e2e.spec.ts",
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_CHROME_PATH
      ? {
          launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_PATH },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: { ALLOW_LOCAL_STORE: "true", RALLY_DATA_NAMESPACE: "e2e" },
    timeout: 30000,
  },
});
