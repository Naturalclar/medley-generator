import { defineConfig, devices } from "@playwright/test";

// E2E は本番ビルド(vite preview)に対して実行する。base が '/medley-generator/'
// なので baseURL はオリジンにし、各テストは beforeEach で /medley-generator/ に遷移する。
const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: ORIGIN,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `${ORIGIN}/medley-generator/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
