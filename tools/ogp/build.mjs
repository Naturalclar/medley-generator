// OGP画像 (public/ogp.png) を template.html から書き出す。
//
// 画像を差し替えたいときは tools/ogp/art.png を置き換えて再実行する。
// art.png が無ければキャラクター枠は消えて、文字だけの版になる。
//
//   node tools/ogp/build.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../public/ogp.png");

// 環境に入っている Chromium を使う(PLAYWRIGHT_BROWSERS_PATH 経由で解決される)
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(pathToFileURL(resolve(here, "template.html")).href, {
  waitUntil: "networkidle",
});
await page.screenshot({ path: out });
await browser.close();
console.log(`書き出した: ${out}`);
