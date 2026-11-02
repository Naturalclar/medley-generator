---
name: find-utaten
description: >-
  utatenUrl が未登録の曲について UtaTen の歌詞ページを探し、本人のページだと確認して
  src/data/songs.json に登録するスキル。「UtaTenのURLを探して」「歌詞リンクを埋めて」
  「utatenがない曲を調べて」「歌詞URLを追加して」などの依頼で使う。曲の追加ではなく、
  既存の曲にリンクを足すときに使う(曲の追加は manage-songs)。
---

# find-utaten

曲一覧の「歌詞」列に出す `utatenUrl` を埋めるスキル。**同名曲やカバー版の取り違えが
いちばんの失敗**なので、URL を見つけることより「本人のページだと確かめること」を重く見る。
間違ったリンクより空欄の方がよい。

GitHub 操作の流儀は `ship-pr` / `review-prs` に従う。owner/repo は
`Naturalclar/medley-generator`。マージは**ユーザーの指示があるまでしない**。

## 手順

### 1. 未登録の曲を出す

```sh
node .claude/skills/find-utaten/scripts/utaten.mjs missing
```

`id / 曲名 / アーティスト / 習熟度` がタブ区切りで出る。

### 2. 候補を探す

**UtaTen のサイト内検索は使えない**(`/lyric/search` は本文の無い応答を返す)。
`WebSearch` を `allowed_domains: ["utaten.com"]` で使う:

```
query: "<曲名> <アーティスト> 歌詞 うたてん"
```

結果のタイトルは `<曲名> 歌詞 <名義> ふりがな付 - うたてん` の形で並ぶ。
`https://utaten.com/lyric/<ID>/` の形の URL だけを候補にする。

曲数が多いときは Agent で分担してよい。その場合は候補の URL を返させるだけにして、
判定は次の手順でまとめて行う。

### 3. 判定する

```sh
node .claude/skills/find-utaten/scripts/utaten.mjs verify <id>=<url> <id>=<url> ...
```

ページの `<head>` の `<title>` と canonical だけを読み、`判定 / id / url / 理由` を出す。
1秒ずつ間を空けて取得する。

| 判定 | 意味 | どうする |
|---|---|---|
| `match` | 曲名が一致し、登録名義がページ名義に含まれる | `apply` で書ける |
| `review` | 曲名は一致するが名義で裏が取れない、または曲名に付記がある | 下の基準で見る |
| `reject` | 別の曲、または登録済み | 採用しない |
| `error` | 取得に失敗 | 間を置いて再試行。**見つからなかった扱いにしない** |

**`review` の判断基準:**

- **同じ曲で採用してよい:** 同じ人の別名義(`じん` と `自然の敵P`)、
  プロジェクト名義と歌手名義の違い(`初星学園` と出演者名)など、同じ音源だと言える場合
- **採用しない:** 別の人のカバー。歌ってみた、別ユニットの収録版など
- **判断できない:** 登録しないで保留する

`match` でも安心しきらない。`youtubeId` が入っている曲で動画の歌唱者とページの名義が
明らかに食い違うとき(例: 動画が初音ミク版でページが別の歌手)は保留する。

**題名と名義の表記をページに合わせて `songs.json` 側を書き換えない。** リンクを足すだけ。

### 4. 書き込む

```sh
node .claude/skills/find-utaten/scripts/utaten.mjs apply <id>=<url> ...
# 確認した review を書くとき(その id だけを渡す)
node .claude/skills/find-utaten/scripts/utaten.mjs apply <id>=<url> --accept-review true
```

`utatenUrl` の1行を足すだけで、他の行は変えない。**`songs.mjs` は使わない**
(全曲を書き直して巨大な diff になる。#292)。#292 が直ってフィールドの位置が変わったら、
`utaten.mjs` の `insertUrl` も合わせる。

書いたら確認する:

```sh
git diff --stat src/data/songs.json   # 件数ぶんの追加だけになっていること
pnpm run lint && pnpm exec vitest run src tools && pnpm run build
```

### 5. PR を出す

ブランチを切って commit し、PR を出す。本文には次を書く:

- 追加した曲とURLの一覧
- `review` から採用した曲と、その理由
- **保留した曲と、その理由**(見つからなかった / カバーしか無い / 判断できない)
- 確認した日付

## やってはいけないこと

- **歌詞本文を保存・出力しない。** 著作物なので、ページの本文やメタ情報の歌い出しを
  ファイルや PR、会話に残さない。`utaten.mjs` が `<title>` と canonical しか読まないのは
  このため。`WebFetch` でページ本文を読ませることもしない
- **サイト内検索が使えないのを回避しない。** ヘッダーや Cookie を偽装して叩かない
- **アクセスを急がない。** `verify` の間隔を詰めない。並列で回さない
- **推測で URL を組み立てない。** 検索で実在を確かめた URL だけを使う
