import { configDefaults, defineConfig } from "vitest/config";

// vitest はユニットテスト(src)専用。e2e/ は Playwright が実行するので除外する。
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
