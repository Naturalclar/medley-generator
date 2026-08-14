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

  // #103: 一覧から申請できるように、作品コード列とその状態フィルタを足した。
  test("作品コード列が出て、クリックでコピーできる", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // 「申請可」だけに絞れば、全行がコピー可能なコードを持つ
    await page.getByRole("button", { name: "未調査", exact: true }).click();
    await page.getByRole("button", { name: "登録なし", exact: true }).click();

    const codeButtons = page.locator(".pool tbody .copy-value.code");
    expect(await codeButtons.count()).toBeGreaterThan(0);

    await codeButtons.first().click();
    await expect(
      page.locator(".pool tbody").getByRole("button", { name: "コピー ✓" }),
    ).toBeVisible();
  });

  test("作品コードの状態チップで絞り込める", async ({ page }) => {
    const rows = page.locator(".pool tbody tr");
    const all = await rows.count();

    // 「申請可」を OFF にすると、コードを持つ曲が消えて行数が減る
    await page.getByRole("button", { name: "申請可", exact: true }).click();
    const withoutRequestable = await rows.count();
    expect(withoutRequestable).toBeLessThan(all);
    // 残った行にはコードのコピーボタンが1つも無い
    await expect(page.locator(".pool tbody .copy-value.code")).toHaveCount(0);

    // 「登録なし」だけに絞る(未調査は現在0曲なのでカウントは指定しない)
    await page.getByRole("button", { name: "未調査", exact: true }).click();
    const onlyNotFound = page.locator(".pool tbody .work-status.not-found");
    expect(await onlyNotFound.count()).toBeGreaterThan(0);
    expect(await onlyNotFound.count()).toBe(await rows.count());
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

// OAuth審査の要件(ホームページでの用途説明とプライバシーポリシーへのリンク)を
// うっかり消してしまわないための回帰テスト。
test.describe("アプリ説明とプライバシーポリシー", () => {
  test("説明セクションに YouTube 権限の用途が書かれている", async ({ page }) => {
    const about = page.locator("section.about");
    await expect(about).toContainText("限定公開のプレイリストを作成");
    await expect(about).toContainText("読み取り・変更・削除は行いません");
  });

  test("フッターからプライバシーポリシーへ遷移できる", async ({ page }) => {
    await page
      .locator(".site-footer")
      .getByRole("link", { name: "プライバシーポリシー" })
      .click();
    await expect(page).toHaveURL(/\/medley-generator\/privacy\.html$/);
    await expect(
      page.getByRole("heading", { name: "プライバシーポリシー", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("楽曲申請", () => {
  test("セトリ生成後に申請セクションとフォームへのリンクが出る", async ({
    page,
  }) => {
    // 生成前は出ない
    await expect(page.locator("section.request")).toHaveCount(0);

    await page.getByRole("button", { name: "セトリ生成" }).click();

    const section = page.locator("section.request");
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("link", { name: "申請フォームを開く" }),
    ).toHaveAttribute("href", "https://app.avvy.live/music-use-request");
  });

  // #100: 申請フォームでの取り違え防止に、コードと一緒に管理団体を出す。
  test("申請できる曲に管理団体(JASRAC / NexTone)が付く", async ({ page }) => {
    await page.fill('input[type="number"]', "20");
    await page.getByRole("button", { name: "セトリ生成" }).click();

    const societies = page.locator(".request-list .society");
    const n = await societies.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(societies.nth(i)).toHaveText(/^(JASRAC|NexTone)$/);
    }
  });

  // #111: フォームに上から順に貼れるよう、セトリ側も avvy の入力順に並べる。
  test("申請リストの値が avvy のフォームと同じ順に並ぶ", async ({ page }) => {
    await page.fill('input[type="number"]', "20");
    await page.getByRole("button", { name: "セトリ生成" }).click();

    // アーティストが null の曲だと3つ目が無いので、artist 付きの行で見る
    const row = page
      .locator(".request-list li")
      .filter({ has: page.locator(".copy-value:nth-of-type(3)") })
      .first();
    const classes = await row
      .locator(".copy-value")
      .evaluateAll((els) => els.map((e) => e.className));
    expect(classes[0]).toContain("code");
    expect(classes[1]).toContain("title");
    expect(classes[2]).not.toContain("code");
    expect(classes[2]).not.toContain("title");
  });

  // #102: 1曲ずつ往復するので、コピー状況と進捗が見えるようにした。
  test("ウィザードで1曲ずつ進められ、コピー済みが分かる", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.fill('input[type="number"]', "5");
    await page.getByRole("button", { name: "セトリ生成" }).click();

    await page.getByRole("button", { name: "申請を始める" }).click();
    const wizard = page.locator(".wizard");
    // 分母は「作品コードがある曲」の数なので、セトリの曲数とは限らない
    await expect(wizard.locator(".wizard-head strong")).toHaveText(
      /^1 \/ \d+ 曲目$/,
    );
    // 最初は「前へ」が押せない
    await expect(wizard.getByRole("button", { name: "← 前へ" })).toBeDisabled();

    // コピーすると、その値にだけ印が付く
    await expect(wizard.locator(".copied-mark")).toHaveCount(0);
    await wizard.locator(".copy-value.code").click();
    await expect(wizard.locator(".copied-mark")).toHaveCount(1);

    await page.getByRole("button", { name: /申請済みにして次へ/ }).click();
    await expect(wizard.locator(".wizard-head strong")).toHaveText(
      /^2 \/ \d+ 曲目$/,
    );
    // 曲が変わったらコピー済みの印はリセットされる(前の曲の状態を持ち越さない)
    await expect(wizard.locator(".copied-mark")).toHaveCount(0);
    await expect(page.locator(".request-progress")).toHaveText(
      /^申請済み 1 \/ \d+$/,
    );
    await expect(page.locator(".request-list li.done")).toHaveCount(1);
  });

  test("中断して開き直すと、未申請の曲から再開する", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.fill('input[type="number"]', "5");
    await page.getByRole("button", { name: "セトリ生成" }).click();

    // 1曲目を申請済みにして閉じる
    await page.getByRole("button", { name: "申請を始める" }).click();
    await page.getByRole("button", { name: /申請済みにして次へ/ }).click();
    await page.getByRole("button", { name: "× 閉じる" }).click();

    // 済んだ曲を頭からなぞり直さず、2曲目から開く
    await page.getByRole("button", { name: "申請を再開" }).click();
    await expect(page.locator(".wizard .wizard-head strong")).toHaveText(
      /^2 \/ \d+ 曲目$/,
    );
  });

  test("申請の進捗はリロードしても残る", async ({ page }) => {
    // セトリはランダムなので、リロード後も必ず入る「弾ける」曲を対象にする
    // (練習中の曲は1枠に1曲だけランダムに入るので、再生成で消えることがある)
    const TARGET = "千本桜 を申請済みにする";
    const generateAll = async () => {
      await page.fill('input[type="number"]', "999");
      await page.getByRole("checkbox", { name: /覚えたい曲も含める/ }).uncheck();
      await page.getByRole("button", { name: "セトリ生成" }).click();
      await expect(page.locator(".request-list li").first()).toBeVisible();
    };

    await generateAll();
    await page.getByRole("checkbox", { name: TARGET }).check();
    await expect(page.getByRole("checkbox", { name: TARGET })).toBeChecked();

    await page.reload();
    await generateAll();

    await expect(page.getByRole("checkbox", { name: TARGET })).toBeChecked();
    await expect(
      page.getByRole("button", { name: "申請を再開" }),
    ).toBeVisible();
  });

  // #101: 除外された曲を黙って落とさず、理由付きで出す。
  test("申請できない曲が理由付きで出る", async ({ page }) => {
    // 弾ける曲のうち作品コードが無いのは2曲だけなので、多めに生成して引き当てる
    await page.fill('input[type="number"]', "129");
    await page.getByRole("checkbox", { name: /覚えたい曲も含める/ }).uncheck();
    await page.getByRole("button", { name: "セトリ生成" }).click();

    const list = page.locator(".unrequestable-list li");
    expect(await list.count()).toBeGreaterThan(0);
    // 調査済みで両DBに登録が無い曲には「登録なし」が付く
    await expect(
      page.locator(".unrequestable-list .work-status.not-found").first(),
    ).toHaveText("登録なし");
  });
});

// #108: セトリを組まずに、一覧から1曲だけ申請情報を出せる。
test.describe("一覧からの単発申請", () => {
  const poolRow = (page: import("@playwright/test").Page) =>
    page.locator(".pool tbody tr").first();

  test("セトリを生成せずに1曲の申請情報を出してコピーできる", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // セトリは作らない
    await expect(page.locator("section.setlist")).toHaveCount(0);

    await page.fill(".pool-search", "千本桜");
    await poolRow(page).getByRole("button", { name: "申請" }).click();

    const wizard = page.locator("section.pool .wizard");
    await expect(wizard).toBeVisible();
    // 1曲だけなので曲名が見出しになり、前へ/スキップは出ない
    await expect(wizard.locator(".wizard-head strong")).toHaveText("千本桜");
    await expect(wizard.getByRole("button", { name: "スキップ" })).toHaveCount(
      0,
    );
    // 申請に必要な値が、avvy のフォームと同じ入力順で揃っている (#111)
    await expect(wizard.locator("dt")).toHaveText([
      "作品コード",
      "曲名",
      "アーティスト",
    ]);

    await wizard.locator(".copy-value.code").click();
    await expect(wizard.locator(".copied-mark")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "N00099604",
    );
  });

  test("申請済みにすると行に印が付き、リロードしても残る", async ({ page }) => {
    await page.fill(".pool-search", "千本桜");
    await poolRow(page).getByRole("button", { name: "申請", exact: true }).click();

    await page
      .locator("section.pool .wizard")
      .getByRole("button", { name: "申請済みにして終了" })
      .click();

    await expect(page.locator("section.pool .wizard")).toHaveCount(0);
    await expect(poolRow(page).locator(".row-request")).toHaveText("申請済 ✓");

    await page.reload();
    await page.fill(".pool-search", "千本桜");
    await expect(poolRow(page).locator(".row-request")).toHaveText("申請済 ✓");
  });
});
