import { expect, test } from "@playwright/test";
import songs from "../src/data/songs.json" with { type: "json" };

for (const width of [375, 1280]) {
  test(`セトリを読み取り、閉じたプレビューからコピーして再生成できる (${width}px)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.clock.install({ time: new Date("2026-11-04T12:00:00Z") });
    await page.route("**/songs.json", route => route.fulfill({ json: [
      { ...songs[0], title: "長い曲名".repeat(20), artist: "LongArtist".repeat(20), mastery: "practicing" },
      { ...songs[1], title: "アーティスト未登録", artist: "", mastery: "practicing" },
    ] }));
    await page.goto("/medley-generator/");
    await page.getByRole("checkbox", { name: "練習中の曲だけ", exact: true }).check();
    await page.getByRole("spinbutton").fill("2");
    await page.getByRole("button", { name: "セトリ生成", exact: true }).click();
    const preview = page.locator("#setlist-copy-preview");
    const summary = page.locator(".setlist-preview summary");
    await expect(page.locator(".setlist-songs li")).toHaveCount(2);
    await expect(preview).not.toBeVisible();
    await page.getByRole("button", { name: "テキストをコピー", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await preview.textContent());
    // 日付が変わっても、再生成するまではコピーとプレビューの日付を保つ。
    await page.clock.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    await summary.focus();
    await summary.press("Enter");
    await expect(preview).toBeVisible();
    expect(await preview.textContent()).toBe(copied);
    await expect(summary).toHaveAttribute("aria-controls", "setlist-copy-preview");
    await page.getByRole("checkbox", { name: "挑戦曲に🔰(コピー用)" }).check();
    await expect(preview).toContainText("🔰");
    await page.getByRole("checkbox", { name: "挑戦曲に🔰(コピー用)" }).uncheck();
    await expect(preview).not.toContainText("🔰");
    const titles = await page.locator(".setlist-songs .title").allTextContents();
    const text = await preview.textContent();
    expect(text!.indexOf(titles[0])).toBeLessThan(text!.indexOf(titles[1]));
    for (const element of await page.locator(".setlist-songs .title, .setlist-songs .artist").all()) {
      const box = await element.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.locator(".setlist").screenshot({ path: `test-results/setlist-${width}.png` });
    await summary.press("Space");
    await expect(preview).not.toBeVisible();
    await expect(summary).toBeFocused();
    await page.getByRole("button", { name: "再生成", exact: true }).click();
    await expect(page.locator(".setlist-songs li")).toHaveCount(2);
    await expect(preview).not.toBeVisible();
    await page.getByRole("button", { name: "テキストをコピー", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.textContent());
    expect(await preview.textContent()).not.toBe(text);
  });
}
