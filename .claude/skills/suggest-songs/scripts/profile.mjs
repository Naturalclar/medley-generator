#!/usr/bin/env node
// 曲プールの傾向を集計して、サジェストの材料を出す。
//
// 出力するもの:
//   - 総数と mastery 別の内訳
//   - 複数曲あるアーティスト(=好みが出ている作家)
//   - タグ分布
//   - 全曲の「タイトル / アーティスト」一覧(重複チェック用)
//
// 使い方:
//   node profile.mjs            # 傾向サマリ(既定)
//   node profile.mjs --titles   # 全曲のタイトル一覧のみ(重複チェック用)
//   node profile.mjs --file <path>

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// scripts -> suggest-songs -> skills -> .claude -> <repo>
const DEFAULT_FILE = resolve(scriptDir, "../../../../src/data/songs.json");

const argv = process.argv.slice(2);
const fileFlagIdx = argv.indexOf("--file");
const file = fileFlagIdx !== -1 ? resolve(argv[fileFlagIdx + 1]) : DEFAULT_FILE;
const titlesOnly = argv.includes("--titles");

let songs;
try {
  songs = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`エラー: songs.json が読めない (${file}): ${e.message}`);
  process.exit(1);
}

const norm = (s) => (s ?? "").toString();

if (titlesOnly) {
  for (const s of songs) {
    console.log(`${norm(s.title)}\t${norm(s.artist) || "-"}`);
  }
  process.exit(0);
}

const count = (arr, key) => {
  const m = new Map();
  for (const x of arr) {
    const k = key(x);
    if (k == null || k === "") continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
};

const byMastery = count(songs, (s) => s.mastery);
const byArtist = count(songs, (s) => s.artist);
const byTag = count(
  songs.flatMap((s) => (s.tags ?? []).map((t) => ({ t }))),
  (x) => x.t,
);

console.log(`総数: ${songs.length}曲`);
console.log(`内訳: ${byMastery.map(([k, n]) => `${k} ${n}`).join(" / ")}`);

console.log(`\n=== 複数曲あるアーティスト(好みの傾向) ===`);
for (const [a, n] of byArtist.filter(([, n]) => n >= 2)) {
  console.log(`${n}\t${a}`);
}

console.log(`\n=== タグ分布 ===`);
for (const [t, n] of byTag) console.log(`${n}\t${t}`);

console.log(`\n=== 1曲だけのアーティスト(掘り下げ候補) ===`);
console.log(
  byArtist
    .filter(([, n]) => n === 1)
    .map(([a]) => a)
    .join(", "),
);
