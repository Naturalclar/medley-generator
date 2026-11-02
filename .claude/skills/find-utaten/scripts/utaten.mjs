#!/usr/bin/env node
// utatenUrl が未登録の曲に UtaTen の歌詞ページを紐付けるための道具。
//
//   missing                 未登録の曲を一覧する
//   verify <id>=<url> ...   ページの題名と canonical を見て、その曲のページか判定する
//   apply  <id>=<url> ...   判定が match のものだけ songs.json に書く
//                           (--accept-review true で、人が確認した review も書く)
//
// 読むのはページの <head> の <title> と canonical だけ。歌詞本文は保存も出力もしない。
// 書き込みは utatenUrl の1行を足すだけ(songs.mjs は全曲を書き直してしまうため。#292)。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const URL_PATTERN = /^https:\/\/utaten\.com\/lyric\/[A-Za-z0-9]+\/$/;
const PAGE_TITLE = /^(.+?) 歌詞 (.+?)(?: ふりがな付)? - うたてん$/;
const FETCH_INTERVAL_MS = 1000;

/** 題名・名義の比較用。幅・大小・空白・記号の違いを無視する。 */
function norm(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

/** artist を照合キーに分ける。feat. の後ろ(歌唱ソフト等)はキーにしない。 */
function artistKeys(artist) {
  return artist
    .split(/\s+feat\.?\s+/i)[0]
    .split(/[&×+/、,]|\sand\s/i)
    .map(norm)
    .filter((key) => key.length >= 2);
}

/**
 * <title> の文字列と曲から判定する。
 * - match: 曲名が一致し、登録名義もページ名義に含まれる
 * - review: 曲名は一致するが名義で裏が取れない(カバー版の可能性があるので人が見る)
 * - reject: 別の曲
 */
function judge(song, pageTitle) {
  const parsed = PAGE_TITLE.exec(pageTitle.trim());
  if (!parsed) return { verdict: "reject", reason: "題名の形式が想定外" };
  const [, title, artist] = parsed;
  if (norm(title) !== norm(song.title)) {
    return { verdict: "reject", reason: `曲名が違う: ${title}` };
  }
  const keys = song.artist ? artistKeys(song.artist) : [];
  if (keys.length === 0) {
    return { verdict: "review", reason: `登録名義で照合できない: ${artist}` };
  }
  return keys.some((key) => norm(artist).includes(key))
    ? { verdict: "match", reason: artist }
    : { verdict: "review", reason: `名義が違う: ${artist}` };
}

/** <head> だけを読み、題名と canonical を返す。本文には触らない。 */
async function fetchPageTitle(url) {
  const res = await fetch(url, { redirect: "manual" });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const head = html.slice(0, html.indexOf("</head>"));
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head)?.[1];
  if (canonical !== url) throw new Error(`canonical が違う: ${canonical}`);
  const title = /<title>([^<]*)<\/title>/.exec(head)?.[1];
  if (!title) throw new Error("title が無い");
  return title;
}

/** `"id": "<id>",` の次の行に utatenUrl を足す。既存曲の並びに合わせた位置。 */
function insertUrl(text, id, url) {
  const line = `    "id": ${JSON.stringify(id)},\n`;
  const at = text.indexOf(line);
  if (at === -1 || text.indexOf(line, at + 1) !== -1) {
    throw new Error(`id の行を特定できない: ${id}`);
  }
  const end = at + line.length;
  return `${text.slice(0, end)}    "utatenUrl": ${JSON.stringify(url)},\n${text.slice(end)}`;
}

function parseArgs(argv) {
  const pairs = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else pairs.push(argv[i]);
  }
  return { pairs, flags };
}

/** 引数の id=url を検証して判定を返す。--page-title を渡すと取得を省く(テスト用)。 */
async function check(songs, pair, pageTitle) {
  const sep = pair.indexOf("=");
  const id = pair.slice(0, sep);
  const url = pair.slice(sep + 1);
  const song = songs.find((s) => s.id === id);
  if (!song) return { id, url, verdict: "reject", reason: "id が無い" };
  if (song.utatenUrl) return { id, url, verdict: "reject", reason: "登録済み" };
  if (!URL_PATTERN.test(url)) {
    return { id, url, verdict: "reject", reason: "URL の形式が違う" };
  }
  try {
    return { id, url, ...judge(song, pageTitle ?? (await fetchPageTitle(url))) };
  } catch (error) {
    return { id, url, verdict: "error", reason: error.message };
  }
}

async function checkAll(songs, pairs, pageTitle) {
  const results = [];
  for (const [i, pair] of pairs.entries()) {
    if (i > 0 && !pageTitle) {
      await new Promise((done) => setTimeout(done, FETCH_INTERVAL_MS));
    }
    const result = await check(songs, pair, pageTitle);
    results.push(result);
    console.log(`${result.verdict}\t${result.id}\t${result.url}\t${result.reason}`);
  }
  return results;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { pairs, flags } = parseArgs(rest);
  const file = flags.file ?? resolve(ROOT, "src/data/songs.json");
  const text = readFileSync(file, "utf8");
  const songs = JSON.parse(text);

  if (command === "missing") {
    for (const s of songs.filter((song) => !song.utatenUrl)) {
      console.log(`${s.id}\t${s.title}\t${s.artist ?? ""}\t${s.mastery}`);
    }
  } else if (command === "verify") {
    await checkAll(songs, pairs, flags["page-title"]);
  } else if (command === "apply") {
    const results = await checkAll(songs, pairs, flags["page-title"]);
    let next = text;
    for (const { id, url, verdict } of results) {
      const accepted = verdict === "review" && flags["accept-review"] === "true";
      if (verdict === "match" || accepted) next = insertUrl(next, id, url);
    }
    JSON.parse(next);
    writeFileSync(file, next);
  } else {
    console.error("使い方: utaten.mjs missing | verify <id>=<url> ... | apply <id>=<url> ...");
    process.exit(1);
  }
}

await main();
