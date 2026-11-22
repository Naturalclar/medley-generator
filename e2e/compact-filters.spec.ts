import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { workCodeStatusOf, youtubeStatusOf } from "../src/lib/generator";
import type { Song } from "../src/lib/types";

const songs: Song[] = JSON.parse(readFileSync(new URL("../src/data/songs.json", import.meta.url), "utf8"));

test.beforeEach(async ({ page }) => {
  await page.goto("/medley-generator/");
  await expect(page.locator(".pool-count")).toContainText(`${songs.length}曲`);
});

test("開閉しても選択を維持し、閉じたままタグと除外条件を解除できる", async ({ page }) => {
  const tags = page.getByRole("button", { name: /^タグ を/ });
  const details = page.getByRole("button", { name: /^詳細フィルター を/ });
  await expect(tags).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#pool-tags")).toBeHidden();
  await expect(page.locator("#pool-details")).toBeHidden();
  await tags.focus();
  await page.keyboard.press("Enter");
  await expect(tags).toBeFocused();
  await page.getByRole("button", { name: "学マス", exact: true }).click();
  await tags.click();
  await expect(page.getByRole("button", { name: "タグ: 学マスを解除" })).toBeVisible();
  await tags.click();
  await expect(page.getByRole("button", { name: "学マス", exact: true })).toHaveAttribute("aria-pressed", "true");
  await tags.click();
  await details.click();
  await page.getByRole("button", { name: "弾ける", exact: true }).click();
  await details.click();
  await page.getByRole("button", { name: "習熟度: 弾けるを除外を解除" }).click();
  await page.getByRole("button", { name: "タグ: 学マスを解除" }).click();
  await expect(page.locator(".pool-count")).toHaveText(`${songs.length}曲中 ${songs.length}曲`);
});

test("タグはOR、異なる条件はANDのまま、0件から全解除できる", async ({ page }) => {
  await page.getByRole("button", { name: /^タグ を/ }).click();
  for (const tag of ["学マス", "ボカロ"]) {
    await page.getByRole("button", { name: tag, exact: true }).click();
  }
  const tagged = (songs as Song[]).filter((s) => s.tags.some((t) => ["学マス", "ボカロ"].includes(t)));
  await expect(page.locator(".pool tbody tr")).toHaveCount(tagged.length);
  await page.getByRole("button", { name: /^詳細フィルター を/ }).click();
  await page.getByRole("button", { name: "覚えたい", exact: true }).click();
  await page.getByRole("button", { name: "登録なし", exact: true }).click();
  await page.getByRole("button", { name: "動画なし", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "曲名・アーティスト", exact: true });
  await search.fill("a");
  const expected = tagged.filter((s) => s.mastery !== "wishlist" &&
    workCodeStatusOf(s) !== "not-found" && youtubeStatusOf(s) !== "no-video" &&
    (s.title.toLowerCase().includes("a") || s.artist?.toLowerCase().includes("a")));
  expect(expected.length).toBeGreaterThan(0);
  await expect(page.locator(".pool tbody tr")).toHaveCount(expected.length);
  await search.fill("存在しない曲__348");
  await expect(page.locator(".pool-empty")).toBeVisible();
  await page.getByRole("button", { name: "すべてクリア" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".pool tbody tr")).toHaveCount(songs.length);
});

test("一覧の条件は生成候補・生成済みセトリに影響しない", async ({ page }) => {
  await page.getByRole("checkbox", { name: "覚えたい曲だけ" }).check();
  const max = await page.locator(".max-hint").innerText();
  await page.getByRole("button", { name: "セトリ生成", exact: true }).click();
  const before = await page.locator(".setlist-songs").textContent();
  await page.getByRole("searchbox", { name: "曲名・アーティスト", exact: true }).fill("存在しない曲__348");
  await expect(page.locator(".pool-empty")).toBeVisible();
  await expect(page.locator(".setlist-songs")).toHaveText(before!);
  await expect(page.locator(".max-hint")).toHaveText(max);
  await page.getByRole("button", { name: "セトリ生成", exact: true }).click();
  await expect(page.locator(".setlist-songs li")).toHaveCount(4);
  await expect(page.locator(".setlist-songs .badge.wishlist")).toHaveCount(4);
  await page.getByRole("button", { name: "すべてクリア" }).click();
  await expect(page.getByRole("checkbox", { name: "覚えたい曲だけ" })).toBeChecked();
});

for (const width of [375, 1280]) {
  test(`${width}pxで初期・展開中のフィルターが横にはみ出さない`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const expanded of [false, true]) {
      if (expanded) {
        await page.getByRole("button", { name: /^タグ を/ }).click();
        await page.getByRole("button", { name: /^詳細フィルター を/ }).click();
      }
      await page.locator(".pool").scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(expanded ? "expanded.png" : "collapsed.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const button of await page.locator(".pool-filter-toggles button, #pool-tags button:visible, #pool-details button:visible").all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
}
