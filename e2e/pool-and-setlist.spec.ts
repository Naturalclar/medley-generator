import { expect, test } from "@playwright/test";

const APP_PATH = "/medley-generator/";

test.beforeEach(async ({ page }) => {
  await page.goto(APP_PATH);
});

test.describe("セトリ生成", () => {
  test("生成すると曲数ぶんのセトリが出て、コピーが機能する", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.getByRole("button", { name: "セトリ生成" }).click();
    // 既定の曲数は4
    await expect(page.locator(".setlist li")).toHaveCount(4);

    await page.getByRole("button", { name: "テキストをコピー" }).click();
    await expect(
      page.getByRole("button", { name: /コピーしました/ }),
    ).toBeVisible();
  });

  // #23 回帰: 挑戦枠トグルOFF後に古い wishlist 入りセトリが残らないこと。
  test("「覚えたい曲も含める」をOFFにすると表示中セトリがクリアされ、再生成で wishlist が入らない (#23)", async ({
    page,
  }) => {
    // wishlist が入りやすいよう曲数を多めにして生成(トグルは既定ON)
    await page.fill('input[type="number"]', "40");
    await page.getByRole("button", { name: "セトリ生成" }).click();
    await expect(page.locator(".setlist")).toBeVisible();

    // OFF にすると表示中のセトリはクリアされる(古い結果を残さない)
    await page
      .getByRole("checkbox", { name: /覚えたい曲も含める/ })
      .uncheck();
    await expect(page.locator(".setlist")).toHaveCount(0);

    // 再生成すると wishlist(覚えたい)は1曲も入らない
    await page.getByRole("button", { name: "セトリ生成" }).click();
    await expect(page.locator(".setlist")).toBeVisible();
    await expect(page.locator(".setlist .badge.wishlist")).toHaveCount(0);
  });
});

test.describe("曲プールの絞り込み・並べ替え", () => {
  test("検索で曲名・アーティストが絞り込まれる", async ({ page }) => {
    await page.fill(".pool-search", "ヨルシカ");
    const rows = page.locator(".pool tbody tr");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    // 表示中の全行が検索語を含む(曲名 or アーティスト)
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toContainText("ヨルシカ");
    }
  });

  test("習熟度チップで絞り込める", async ({ page }) => {
    // 「弾ける」「練習中」を OFF にして「覚えたい」だけ表示
    await page.getByRole("button", { name: "弾ける", exact: true }).click();
    await page.getByRole("button", { name: "練習中", exact: true }).click();

    const badges = page.locator(".pool tbody .badge");
    const n = await badges.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(badges.nth(i)).toHaveText("覚えたい");
    }
  });

  test("タグフィルタで絞り込める", async ({ page }) => {
    await page.getByRole("button", { name: "学マス", exact: true }).click();
    const rows = page.locator(".pool tbody tr");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toContainText("学マス");
    }
  });

  test("アーティスト列ヘッダで昇順⇄降順ソートできる", async ({ page }) => {
    await page.getByRole("button", { name: /^アーティスト/ }).click();
    await expect(
      page.getByRole("button", { name: /アーティスト ▲/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^アーティスト/ }).click();
    await expect(
      page.getByRole("button", { name: /アーティスト ▼/ }),
    ).toBeVisible();
  });
});
