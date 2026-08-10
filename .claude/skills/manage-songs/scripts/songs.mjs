#!/usr/bin/env node
// songs.json を「既存フォーマットのまま」add / edit / remove / list するヘルパー。
//
// JSON.stringify で丸ごと書き直すと tags のインライン整形などが崩れて巨大な diff に
// なるため、このスクリプトは 1曲=1オブジェクトを既存スタイルに合わせて手で組み立て、
// 変更した曲以外の行は 1文字も変えない。Git 履歴を綺麗に保つのが目的。
//
// 使い方:
//   node songs.mjs add    --id <slug> --title <t> [--artist <a>] [--key <k>]
//                         [--bpm <n>] [--mastery ready|practicing|wishlist]
//                         [--tags "a,b"] [--memo <m>] [--last-played YYYY-MM-DD]
//                         [--youtube-id <id|URL>]
//   node songs.mjs edit   <id> [同上の --field ...]   (渡したフィールドだけ更新 / "null" で消去)
//   node songs.mjs remove <id>
//   node songs.mjs list   [--mastery <m>]
//
// 補足:
//   - ローマ字スラッグ(id)や自由入力のパースは呼び出し側(Claude)が担当。
//   - --file <path> で対象ファイルを上書きできる(テスト用)。既定はリポジトリの
//     src/data/songs.json。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MASTERY = ["ready", "practicing", "wishlist"];
// フィールドの並び順は既存 songs.json と一致させる(差分を素直に保つため)。
const FIELD_ORDER = [
  "id",
  "title",
  "artist",
  "key",
  "bpm",
  "mastery",
  "lastPlayedAt",
  "youtubeId",
  "tags",
  "memo",
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
// scripts -> manage-songs -> skills -> .claude -> <repo>
const DEFAULT_FILE = resolve(scriptDir, "../../../../src/data/songs.json");

function fail(msg) {
  console.error(`エラー: ${msg}`);
  process.exit(1);
}

/** ["--id","x","--tags","a,b"] を { id:"x", tags:"a,b" } に。値なしフラグは true。 */
function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) fail(`予期しない引数: ${tok}`);
    const keyRaw = tok.slice(2);
    const key = keyRaw.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // last-played -> lastPlayed
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** 文字列 "null"(大小無視)は JSON null として扱う。それ以外はそのまま。 */
function nullable(v) {
  if (v === undefined) return undefined;
  return String(v).toLowerCase() === "null" ? null : v;
}

function parseBpm(v) {
  const n = nullable(v);
  if (n === null || n === undefined) return n;
  const num = Number(n);
  if (!Number.isInteger(num) || num <= 0) fail(`bpm は正の整数か null: ${v}`);
  return num;
}

function parseTags(v) {
  if (v === undefined) return undefined;
  const s = nullable(v);
  if (s === null || s === "") return [];
  return String(s)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseLastPlayed(v) {
  const n = nullable(v);
  if (n === null || n === undefined) return n;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) fail(`last-played は YYYY-MM-DD か null: ${v}`);
  return n;
}

function validateMastery(v) {
  if (v === undefined) return undefined;
  if (!MASTERY.includes(v)) fail(`mastery は ${MASTERY.join(" / ")} のいずれか: ${v}`);
  return v;
}

/**
 * YouTube 動画ID。URL を渡されてもIDを抜き出す(手で貼れるように)。
 * 対応: 生ID / youtu.be/<id> / (music.)youtube.com/watch?v=<id> / /shorts/<id> など
 */
function parseYoutubeId(v) {
  const n = nullable(v);
  if (n === null || n === undefined) return n;
  const s = String(n).trim();
  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (ID.test(s)) return s;
  // URL からの抽出を試す
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    s.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  fail(`youtube-id は11文字の動画IDかYouTubeのURL: ${v}`);
}

/** 1曲を既存スタイル(4スペースインデント / tags はインライン)で文字列化。 */
function serializeSong(song) {
  const line = (key) => {
    const value = song[key];
    if (key === "tags") {
      const inner = (value ?? []).map((t) => JSON.stringify(t)).join(", ");
      return `    "tags": [${inner}]`;
    }
    return `    ${JSON.stringify(key)}: ${JSON.stringify(value ?? null)}`;
  };
  return ["  {", FIELD_ORDER.map(line).join(",\n"), "  }"].join("\n");
}

function serializeAll(songs) {
  if (songs.length === 0) return "[]\n";
  return `[\n${songs.map(serializeSong).join(",\n")}\n]\n`;
}

function load(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    fail(`ファイルが読めない: ${file}`);
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) fail("songs.json はトップレベルが配列である必要がある");
    return data;
  } catch (e) {
    fail(`JSON パース失敗: ${e.message}`);
  }
}

function save(file, songs) {
  writeFileSync(file, serializeAll(songs), "utf8");
}

/** add/edit 共通: フラグからフィールド差分を組み立てる(未指定は含めない)。 */
function fieldsFromFlags(flags) {
  const f = {};
  if (flags.title !== undefined) f.title = String(flags.title);
  if (flags.artist !== undefined) f.artist = nullable(flags.artist);
  if (flags.key !== undefined) f.key = nullable(flags.key);
  if (flags.bpm !== undefined) f.bpm = parseBpm(flags.bpm);
  if (flags.mastery !== undefined) f.mastery = validateMastery(flags.mastery);
  if (flags.lastPlayed !== undefined) f.lastPlayedAt = parseLastPlayed(flags.lastPlayed);
  if (flags.youtubeId !== undefined) f.youtubeId = parseYoutubeId(flags.youtubeId);
  if (flags.tags !== undefined) f.tags = parseTags(flags.tags);
  if (flags.memo !== undefined) f.memo = nullable(flags.memo) ?? "";
  return f;
}

function cmdAdd(file, flags) {
  if (!flags.id) fail("--id は必須(ローマ字スラッグ)");
  if (!flags.title) fail("--title は必須");
  const id = String(flags.id);
  if (!/^[a-z0-9-]+$/.test(id)) fail(`id は英小文字・数字・ハイフンのみ: ${id}`);

  const songs = load(file);
  if (songs.some((s) => s.id === id)) fail(`id が既に存在する: ${id}`);

  const overrides = fieldsFromFlags(flags);
  const song = {
    id,
    title: overrides.title,
    artist: "artist" in overrides ? overrides.artist : null,
    key: "key" in overrides ? overrides.key : null,
    bpm: "bpm" in overrides ? overrides.bpm : null,
    mastery: overrides.mastery ?? "wishlist",
    lastPlayedAt: "lastPlayedAt" in overrides ? overrides.lastPlayedAt : null,
    youtubeId: "youtubeId" in overrides ? overrides.youtubeId : null,
    tags: overrides.tags ?? [],
    memo: overrides.memo ?? "",
  };

  songs.push(song);
  save(file, songs);
  console.log(`追加: ${song.title} (id: ${song.id}, mastery: ${song.mastery})`);
}

function cmdEdit(file, id, flags) {
  if (!id) fail("edit には id が必要: songs.mjs edit <id> --field value ...");
  const songs = load(file);
  const song = songs.find((s) => s.id === id);
  if (!song) fail(`id が見つからない: ${id}`);

  const updates = fieldsFromFlags(flags);
  if (Object.keys(updates).length === 0) fail("更新するフィールドが無い");
  Object.assign(song, updates);

  save(file, songs);
  console.log(`編集: ${song.title} (id: ${id}) — 更新 ${Object.keys(updates).join(", ")}`);
}

function cmdRemove(file, id) {
  if (!id) fail("remove には id が必要: songs.mjs remove <id>");
  const songs = load(file);
  const idx = songs.findIndex((s) => s.id === id);
  if (idx === -1) fail(`id が見つからない: ${id}`);
  const [removed] = songs.splice(idx, 1);
  save(file, songs);
  console.log(`削除: ${removed.title} (id: ${id})`);
}

function cmdList(file, flags) {
  const songs = load(file);
  const filtered = flags.mastery
    ? songs.filter((s) => s.mastery === validateMastery(flags.mastery))
    : songs;
  for (const s of filtered) {
    const artist = s.artist ? ` / ${s.artist}` : "";
    console.log(`${s.id}\t[${s.mastery}]\t${s.title}${artist}`);
  }
  console.log(`\n計 ${filtered.length} 曲`);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  // edit / remove は第1引数に id(フラグでない)を取る
  let positionalId;
  if ((cmd === "edit" || cmd === "remove") && rest[0] && !rest[0].startsWith("--")) {
    positionalId = rest.shift();
  }
  const flags = parseFlags(rest);
  const file = flags.file ? resolve(String(flags.file)) : DEFAULT_FILE;

  switch (cmd) {
    case "add":
      return cmdAdd(file, flags);
    case "edit":
      return cmdEdit(file, positionalId, flags);
    case "remove":
      return cmdRemove(file, positionalId);
    case "list":
      return cmdList(file, flags);
    default:
      fail(`不明なコマンド: ${cmd ?? "(なし)"} — add / edit / remove / list`);
  }
}

main();
