// 収集した作詞者・作曲者を songs.mjs 経由で songs.json に反映する。
//
// 以前は bash の `IFS=$'\t' read -r id lyr com` で読んでいたが、bash はタブを
// IFS whitespace として扱うため連続タブが1つに畳まれ、作詞者が空の曲(インスト)で
// 作曲者が作詞者の位置にずれていた。フィールドを取り違えないよう Node で処理する。
//
// lyricist / composer は常に両方渡す(片方だけ渡すと、以前の誤った値が残るため)。
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// リポジトリのどこから実行しても動くよう、自分の位置から解決する。
// このファイルは .claude/skills/ship-song-prs/scripts/ にある。
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = `${REPO}/.claude/skills/manage-songs/scripts/songs.mjs`;

let applied = 0;
const merged = {};
for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) continue;
  Object.assign(merged, JSON.parse(readFileSync(f, "utf8")));
}

for (const [id, v] of Object.entries(merged)) {
  const args = [
    SCRIPT,
    "edit",
    id,
    "--lyricist",
    v.lyricist ?? "null",
    "--composer",
    v.composer ?? "null",
  ];
  execFileSync("node", args, { cwd: REPO, stdio: "pipe" });
  applied++;
}
console.log(`反映: ${applied}曲 (入力 ${Object.keys(merged).length}件)`);
