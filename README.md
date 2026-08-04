# メドレーセトリ生成 (medley-generator)

配信で演奏するメドレーの曲目を自動で組んでくれる小さなWebサービス。

朝枠・夜枠で「今日何弾こう」を考える時間をゼロにしつつ、練習中の曲を自然に枠へ混ぜて、練習が配信ネタになる循環を作る。

## 機能 (v0)

- `src/data/songs.json` の曲プールから曲数を指定してセトリ生成
- 生成ヒューリスティック:
  - 「練習中」の曲は1枠に1曲だけ混ぜる(練習ノルマの自然消化)
  - 最後に演奏した日が近い曲は選出確率を下げる(7日クールダウン)
  - BPMは緩→急→緩の山型に並べる(いきなり最速から始めない)
- 「覚えたい」曲を挑戦枠として含めるかのトグル
- コメント欄/概要欄に貼れるプレーンテキスト出力(コピー付き)

## 開発

```sh
npm install
npm run dev
```

## 曲の追加

`src/data/songs.json` を直接編集する。DBは無し、Gitが履歴になる。

```json
{
  "id": "unique-slug",
  "title": "曲名",
  "artist": "アーティスト",
  "key": "Am",
  "bpm": 120,
  "mastery": "ready | practicing | wishlist",
  "lastPlayedAt": "2026-08-04",
  "tags": ["ボカロ"],
  "memo": ""
}
```

`key` / `bpm` / `lastPlayedAt` は不明なら `null` でOK(無くても動く)。

## デプロイ

`main` へのpushで GitHub Actions が GitHub Pages へ自動デプロイする。

https://naturalclar.github.io/medley-generator/

## 元ネタ

kanbanリポジトリの `brainstorm/medley-setlist-generator.md` を参照。
