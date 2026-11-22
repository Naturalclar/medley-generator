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
    // 本番ビルドは Service Worker を登録する。Worker が返した応答は page.route の
    // モックを素通りするので、既定では止める。オフラインのテストだけ個別に許可する。
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `${ORIGIN}/medley-generator/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
