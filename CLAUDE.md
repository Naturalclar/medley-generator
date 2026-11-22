# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

配信で演奏するメドレーのセトリを自動生成する小さなWebサービス (Vite + React 19 + TypeScript SPA)。DBは無し。曲データは `src/data/songs.json` を直接編集し、Gitが履歴になる。UIテキストはすべて日本語。

公開サイト(GitHub Pages)は静的配信だけ。歌詞・コードのURL取り込み用に小さな Node サーバー(`server/`)があるが、取得元ごとの許諾が取れるまで既定で無効で、Pages では動かない(#357、`docs/score-import.md`)。

## Commands

パッケージマネージャは pnpm (`packageManager` フィールドで固定)。

```sh
pnpm run dev       # Vite dev server
pnpm run build     # tsgo -b + vite build (型チェックはbuildで行う)
pnpm run lint      # oxlint (ESLintではない — 設定は .oxlintrc.json)
pnpm run preview   # ビルド結果のローカル確認
pnpm test          # vitest (src/**/*.test.ts) — 生成ロジックと songs.json のスキーマを検証
pnpm run test:e2e  # Playwright (e2e/) — 本番ビルドに対してUIを操作して確認
pnpm run test:ipad # Playwright の WebKit / iPad エミュレーションで譜面ビューを確認
pnpm run test:server # node --test (server/*.test.mjs) — URL取り込みサーバー
pnpm start         # ビルド結果と取り込みAPIを Node で配信(server/start.mjs)
```

型チェックは `tsc` ではなく `tsgo` (@typescript/native-preview) を使う。

## Architecture

- `src/lib/types.ts` — `Song` 型と `Mastery` ("ready" | "practicing" | "wishlist")、日本語ラベル定義
- `src/lib/generator.ts` — 生成ロジックの本体(純粋関数、React非依存)。ヒューリスティック:
  - 「練習中(practicing)」の曲は1枠に1曲だけ選出
  - `wishlistOnly` / `practicingOnly` は絞り込み。その習熟度の曲だけで組む(`practicingOnly` では「1曲だけ」の制限を外す。UIでは排他)
  - 選出は一様ランダム。並び順は選出順のまま(BPMの山型並べ替えは #142 で廃止)
- `src/App.tsx` — セトリ生成・曲プール・申請まわりのUI。`App` が songs.json を fetch し、読み込み後に `SetlistApp` を描画する
  (import しないのはバンドルのキャッシュを曲追加で壊さないため。#144)
- `src/ScoreLibrary.tsx` / `src/lib/scores.ts` — 曲IDに紐づく私用の歌詞・コード譜(ChordPro)の編集・保存・演奏ビュー。保存先は端末の localStorage で、公開の songs.json には入れない
- `offline-plugin.ts` — ビルド時に Service Worker(`sw.js`)を生成。index.html と songs.json はネットワーク優先(曲追加をすぐ反映するため)、ハッシュ付きの assets はキャッシュ優先
- `server/` — 取り込みAPI(`score-import.mjs`)と配信用サーバー(`start.mjs`)
- `src/data/songs.json` — 曲プール。`bpm` / `artist` / `lyricist` / `composer` などは `null` 許容

ロジック変更は `generator.ts`、曲の追加・編集は `songs.json` を触る。`generateSetlist` は `random?: () => number` をオプションで受け取る(テストで決定的にするため)。未使用だった `key` / `lastPlayedAt` は #143 で廃止した。

## Deploy

`main` へのpushで GitHub Actions (`.github/workflows/deploy.yml`) が GitHub Pages へ自動デプロイ。`vite.config.ts` の `base: '/medley-generator/'` はPages配信用なので削除しないこと。

公開URL: https://smashcat.dev/medley-generator/

GitHub Pages は配信元(オリジン)のまま変わらない。smashcat.dev のルートは Cloudflare 上にあり、`/medley-generator/*` を Cloudflare Worker が GitHub Pages へプロキシしている。詳細は README.md の「デプロイ」節を参照。
