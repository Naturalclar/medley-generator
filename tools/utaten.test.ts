import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = "https://utaten.com/lyric/ab123456/";
const SCRIPT = ".claude/skills/find-utaten/scripts/utaten.mjs";
const SONGS = `[
  {
    "id": "stella",
    "title": "ステラ",
    "artist": "じん",
    "tags": ["ボカロ"]
  },
  {
    "id": "no-artist",
    "title": "思い出",
    "artist": null,
    "tags": []
  },
  {
    "id": "linked",
    "utatenUrl": "https://utaten.com/lyric/zz000000/",
    "title": "登録済み",
    "artist": "じん",
    "tags": []
  }
]
`;

/** 取得せず --page-title の題名で判定する。ネットワークには出ない。 */
function run(command: string, pair: string, pageTitle: string, ...flags: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "utaten-find-"));
  const file = join(dir, "songs.json");
  writeFileSync(file, SONGS);
  try {
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT, command, pair, "--file", file, "--page-title", pageTitle, ...flags],
      { encoding: "utf8" },
    );
    return { verdict: stdout.split("\t")[0], text: readFileSync(file, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it.each([
  ["名義が一致", "ステラ 歌詞 じん feat. 初音ミク ふりがな付 - うたてん", "match"],
  ["同名の別名義", "ステラ 歌詞 Leo/need ふりがな付 - うたてん", "review"],
  ["別の曲", "ステラの夜 歌詞 じん ふりがな付 - うたてん", "reject"],
  ["題名に付記がある", "ステラ [original ver.] 歌詞 じん ふりがな付 - うたてん", "review"],
  ["エスケープされた付記", "ステラ (feat. A&amp;B) 歌詞 じん ふりがな付 - うたてん", "review"],
  ["形式が想定外", "ステラ | 歌詞サイト", "reject"],
])("%s の判定", (_name, pageTitle, expected) => {
  expect(run("verify", `stella=${URL}`, pageTitle).verdict).toBe(expected);
});

it("登録名義が無ければ人の確認に回す", () => {
  const { verdict } = run("verify", `no-artist=${URL}`, "思い出 歌詞 誰か - うたてん");
  expect(verdict).toBe("review");
});

it("登録済みの曲と不正な URL は弾く", () => {
  const pageTitle = "登録済み 歌詞 じん - うたてん";
  expect(run("verify", `linked=${URL}`, pageTitle).verdict).toBe("reject");
  const bad = "https://evil.example/lyric/ab123456/";
  expect(run("verify", `stella=${bad}`, "ステラ 歌詞 じん - うたてん").verdict).toBe("reject");
});

it("match は id の次の行に1行だけ足し、他は書き換えない", () => {
  const { text } = run("apply", `stella=${URL}`, "ステラ 歌詞 じん - うたてん");
  const line = `    "utatenUrl": "${URL}",\n`;
  expect(text).toBe(SONGS.replace(`    "id": "stella",\n`, `    "id": "stella",\n${line}`));
});

it("review は確認の指定が無ければ書かない", () => {
  const pageTitle = "ステラ 歌詞 Leo/need - うたてん";
  expect(run("apply", `stella=${URL}`, pageTitle).text).toBe(SONGS);
  const accepted = run("apply", `stella=${URL}`, pageTitle, "--accept-review", "true");
  expect(accepted.text).toContain(URL);
});
