import { expect, test } from "@playwright/test";
import songs from "../src/data/songs.json" with { type: "json" };

const lyricsUrl = "https://utaten.com/lyric/ab123456/";

test("登録済みの安全な歌詞リンクだけを表示し、一覧操作を維持する", async ({ page, context }) => {
  const fixtures = [
    { ...songs[0], title: "歌詞あり", utatenUrl: lyricsUrl },
    { ...songs[1], title: "歌詞省略" },
    { ...songs[2], title: "歌詞なし", utatenUrl: null },
    { ...songs[3], title: "歌詞不正", utatenUrl: "javascript:alert(1)" },
    { ...songs[4], title: "外部サイト", utatenUrl: "https://evil.example/lyric/ab123456/" },
  ];
  await page.route("**/songs.json", route => route.fulfill({ json: fixtures }));
  // 歌詞本文や外部サイトを取得せず、実際の別タブ遷移を確認する。
  await context.route("https://utaten.com/**", route => route.fulfill({ body: "test" }));
  await page.goto("/medley-generator/");
  const link = page.getByRole("link", { name: "歌詞あり の歌詞を UtaTen で開く（別タブ）" });
  await expect(page.locator(".pool .utaten-link")).toHaveCount(1);
  await expect(link).toHaveAttribute("href", lyricsUrl);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveText("歌詞（UtaTen・別タブ）");
  await page.fill(".pool-search", "歌詞あり");
  await expect(page.locator(".pool tbody tr")).toHaveCount(1);
  const row = page.locator(".pool tbody tr").first();
  await row.getByRole("button", { name: "申請", exact: true }).click();
  await link.focus();
  await expect(link).toBeFocused();
  const popupPromise = page.waitForEvent("popup");
  await link.press("Enter");
  const popup = await popupPromise;
  await expect(popup).toHaveURL(lyricsUrl);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  await expect(page.locator(".pool .wizard")).toBeVisible();
  await expect(row.locator(".row-request")).toHaveAttribute("aria-expanded", "true");
  await row.locator(".row-request").click();
  await expect(page.locator(".pool .wizard")).toHaveCount(0);
  await page.fill(".pool-search", "");
  await page.getByRole("button", { name: /^アーティスト/ }).click();
  await expect(page.locator(".pool tbody tr")).toHaveCount(5);
  await expect(link).toHaveAttribute("href", lyricsUrl);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(link).toBeVisible();
});
