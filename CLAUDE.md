# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

配信で演奏するメドレーのセトリを自動生成する小さなWebサービス (Vite + React 19 + TypeScript SPA)。バックエンド・DBは無し。曲データは `src/data/songs.json` を直接編集し、Gitが履歴になる。UIテキストはすべて日本語。

## Commands

パッケージマネージャは pnpm (`packageManager` フィールドで固定)。

```sh
pnpm run dev       # Vite dev server
pnpm run build     # tsgo -b + vite build (型チェックはbuildで行う)
pnpm run lint      # oxlint (ESLintではない — 設定は .oxlintrc.json)
pnpm run preview   # ビルド結果のローカル確認
```

型チェックは `tsc` ではなく `tsgo` (@typescript/native-preview) を使う。

テストは無い(テストランナー未導入)。

## Architecture

- `src/lib/types.ts` — `Song` 型と `Mastery` ("ready" | "practicing" | "wishlist")、日本語ラベル定義
- `src/lib/generator.ts` — 生成ロジックの本体(純粋関数、React非依存)。ヒューリスティック:
  - 「練習中(practicing)」の曲は1枠に1曲だけ選出
  - 選出は一様ランダム。並び順はBPMの山型(緩→急→緩)。BPM不明の曲は既知BPMの中央値として扱う
- `src/App.tsx` — 全UI(単一コンポーネント)。songs.jsonをimportしてgeneratorを呼ぶだけ
- `src/data/songs.json` — 曲プール。`key` / `bpm` / `lastPlayedAt` / `artist` は `null` 許容

ロジック変更は `generator.ts`、曲の追加・編集は `songs.json` を触る。`generateSetlist` は `random?: () => number` をオプションで受け取る(テストで決定的にするため)。`lastPlayedAt` はスキーマに残るが現在ロジックでは未使用。

## Deploy

`main` へのpushで GitHub Actions (`.github/workflows/deploy.yml`) が GitHub Pages へ自動デプロイ。`vite.config.ts` の `base: '/medley-generator/'` はPages配信用なので削除しないこと。

公開URL: https://naturalclar.github.io/medley-generator/
