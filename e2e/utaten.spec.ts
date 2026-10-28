import { expect, test } from "@playwright/test";
import songs from "../src/data/songs.json" with { type: "json" };

const lyricsUrl = "https://utaten.com/lyric/ab123456/";
// 「歌詞省略」(utatenUrl キーが無い曲)の fixture。実データの songs[1] に URL が
// 登録されても前提が崩れないよう、キーを取り除いて作る(#270)。
const { utatenUrl: _utatenUrl, ...songWithoutUrl } = songs[1];

test("登録済みの安全な歌詞リンクだけを表示し、一覧操作を維持する", async ({ page, context }) => {
  const fixtures = [
    { ...songs[0], title: "歌詞あり", utatenUrl: lyricsUrl },
    { ...songWithoutUrl, title: "歌詞省略" },
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
  await expect(link).toHaveText("UtaTen ↗");
  await expect(page.getByRole("columnheader", { name: "歌詞", exact: true })).toBeVisible();
  await expect(link.locator("..")).toHaveClass("col-resource");
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
  await expect(page.locator(".request-row > td")).toHaveAttribute("colspan", "8");
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


test("YouTube 列は有効な動画だけ別タブで開き、未登録・不正IDはリンクにしない", async ({ page, context }) => {
  const videoId = "AL6hWKN0WQo";
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  await page.route("**/songs.json", route => route.fulfill({ json: [
    { ...songs[0], title: "動画あり", youtubeId: videoId },
    { ...songs[1], title: "動画なし", youtubeId: null },
    { ...songs[2], title: "動画不正", youtubeId: "bad&list=injected" },
  ] }));
  await context.route("https://www.youtube.com/**", route => route.fulfill({ body: "test" }));
  await page.goto("/medley-generator/");
  await expect(page.getByRole("columnheader", { name: "YouTube", exact: true })).toBeVisible();
  const link = page.getByRole("link", { name: "動画あり を YouTube で開く（別タブ）" });
  await expect(page.locator(".pool .youtube-link")).toHaveCount(1);
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  for (const title of ["動画なし", "動画不正"]) {
    const row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    await expect(row.locator("td").nth(3)).toHaveText("—");
  }
  await link.focus();
  const popupPromise = page.waitForEvent("popup");
  await link.press("Enter");
  const popup = await popupPromise;
  await expect(popup).toHaveURL(url);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  await page.setViewportSize({ width: 375, height: 812 });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.fill(".pool-search", "存在しない曲名");
  await expect(page.locator(".pool-empty")).toHaveAttribute("colspan", "8");
});
