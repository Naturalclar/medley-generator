---
name: manage-songs
description: >-
  medley-generator の曲プール (src/data/songs.json) に曲を追加・編集・削除するスキル。
  「曲を追加して」「セトリに〇〇を足して」「add a song」「この曲を練習中にして」「〇〇を弾ける曲に変えて」
  「曲を消して」「bpm を直して」など、songs.json の曲データを変更する依頼が来たら必ずこのスキルを使う。
  ユーザーが JSON やファイル名を明示しなくても、曲プールの中身を変えたそうな依頼なら発動すること。
  日本語タイトルからローマ字 id を自動生成し、既存フォーマットを崩さない最小差分で書き込む。
---

# manage-songs

medley-generator の曲プール `src/data/songs.json` を安全に編集するためのスキル。
DB は無く **Git が履歴**なので、変更は必ず**最小差分**で入れる。丸ごと再整形して
巨大 diff を作らないこと。同梱スクリプト `scripts/songs.mjs` がフォーマット再現と
バリデーションを担当するので、**手で JSON を編集せずスクリプト経由で変更する**。

リポジトリのルート(`src/data/songs.json` がある場所)から実行する前提。スクリプトは
自分の位置から `src/data/songs.json` を自動解決するので、パス指定は不要。

## 曲データの形

```json
{
  "id": "unique-slug",       // 英小文字・数字・ハイフンのみ。タイトルのローマ字化
  "title": "曲名",           // 必須
  "artist": "アーティスト",   // 不明なら null
  "key": "Am",               // 不明なら null
  "bpm": 120,                // 正の整数。不明なら null
  "mastery": "ready | practicing | wishlist",  // 既定は wishlist
  "lastPlayedAt": "2026-08-04",                // 不明なら null
  "tags": ["ボカロ"],        // 無ければ []
  "memo": ""
}
```

`mastery` の意味: `ready`=弾ける / `practicing`=練習中 / `wishlist`=覚えたい。

## id(スラッグ)の作り方

タイトルをローマ字化してハイフン区切りの英小文字にする。既存データの流儀に合わせる:

- ステラ → `stella`
- モザイクロール → `mozaik-role`
- ひみつの小学生 → `himitsu-no-shogakusei`
- リバーシブル・キャンペーン → `reversible-campaign`

英単語やブランド表記が元なら素直にそれを使う (TOXY → `toxy`)。中黒「・」やスペースは
ハイフンに、記号は落とす。曲名の意味が伝わる自然なローマ字を選ぶこと。衝突した場合は
末尾に `-2` などを足すか、アーティスト名を混ぜて区別する。

追加前に既存 id と被っていないか `list` で確認するとよい(スクリプトも重複を弾くが、
先に見ておくと自然な id を選べる)。

## コマンド

すべて `node .claude/skills/manage-songs/scripts/songs.mjs <cmd>` で呼ぶ。

### 一覧(id や現状の確認に)

```sh
node .claude/skills/manage-songs/scripts/songs.mjs list
node .claude/skills/manage-songs/scripts/songs.mjs list --mastery wishlist
```

### 追加

```sh
node .claude/skills/manage-songs/scripts/songs.mjs add \
  --id <slug> --title "<曲名>" \
  [--artist "<名>"] [--key "<調>"] [--bpm <整数>] \
  [--mastery ready|practicing|wishlist] \
  [--tags "タグA, タグB"] [--memo "<メモ>"] [--last-played YYYY-MM-DD]
```

`--id` と `--title` は必須。省いたフィールドは既定値(null / [] / "" / mastery は wishlist)。
新規に発見・登録する曲は基本 `wishlist`。ユーザーが「弾ける」「練習中」と言えばそれに従う。

### 編集(渡したフィールドだけ更新)

```sh
node .claude/skills/manage-songs/scripts/songs.mjs edit <id> --mastery ready --bpm 138
```

指定したフィールドのみ変わる。値を消したいときは `null` を渡す(例 `--artist null`)。
「〇〇を弾けるようにした」→ `--mastery ready`、「昨日弾いた」→ `--last-played <日付>`。

### 削除

```sh
node .claude/skills/manage-songs/scripts/songs.mjs remove <id>
```

削除は元に戻しにくいので、**どの曲を消すか(title と id)をユーザーに確認してから**実行する。

## 進め方

1. ユーザーの自由入力(「Ado の金木犀を練習中で追加して」等)から
   title / artist / mastery / bpm / tags などを読み取る。
2. タイトルからローマ字 id を作る。必要なら `list` で既存を確認。
3. 対応するコマンドを実行する。複数曲なら 1曲ずつ `add` を呼ぶ。
4. 実行後、スクリプトの出力と `git diff src/data/songs.json` を見て、意図した
   最小差分になっているか確認し、何をどう変えたか簡潔に報告する。

不明な項目(bpm や key)は無理に埋めず null のままにする。README にある通り
「不明なら null で OK、無くても動く」。
