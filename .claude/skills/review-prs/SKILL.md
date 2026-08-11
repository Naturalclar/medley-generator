---
name: review-prs
description: >-
  今開いている Pull Request の一覧と状況(CI・コンフリクト・レビュー・変更内容)を調べて
  報告し、マージして問題ないものはマージするか確認するスキル。「PRの状況を教えて」
  「開いてるPR見て」「PR一覧」「マージできるPRある?」「PRのCI通ってる?」などの依頼で使う。
  マージは必ずユーザーに確認してから行う(勝手にマージしない)。
---

# review-prs

open な PR を棚卸しして「今どうなっているか」「マージしてよいか」を判断できる形で
報告するスキル。**このスキル単体では絶対にマージしない**。マージ可能なものを挙げて
ユーザーに聞き、明示的な指示があって初めてマージする。

owner/repo は `Naturalclar/medley-generator`、マージ方式は **squash**(このリポの慣習)。

## 手順

### 1. open な PR を一覧する

```
mcp__github__list_pull_requests(owner, repo, state: "open",
  fields: ["number","title","draft","mergeable_state","head","user","created_at"])
```

0件なら「開いている PR はありません」と伝えて終わり。

### 2. 各 PR の状況を調べる

PR ごとに以下を取得する(PR が多いときは並列で):

- **CI**: `pull_request_read(method: "get_check_runs")` — 各ジョブの `status` と `conclusion`
- **レビュー**: `pull_request_read(method: "get_review_comments")` — 未解決スレッドの有無
- **変更内容**: `pull_request_read(method: "get_files")` または `get_diff` — 何を変える PR か
  (曲追加なら曲名、コード変更ならどのファイルか、が言えるくらいまで)

`mergeable_state` の読み方:
- `clean` … マージ可能
- `dirty` … **コンフリクトあり**(要解決)
- `blocked` … 必須チェック/レビュー待ち
- `unstable` … CI が失敗または進行中だがマージ自体は可能
- `unknown` … GitHub が計算中。少し待って `pull_request_read(method: "get")` で取り直す

### 3. 状況を報告する

PR ごとに **番号・タイトル・変更概要・CI・コンフリクト・レビュー**を簡潔にまとめる。
表形式が読みやすい。そのうえで**マージして問題ない PR**と**問題がある PR**を分けて示す。

「マージして問題ない」= 次のすべてを満たす:

- CI の全ジョブが `completed` かつ `conclusion: success`
- `mergeable_state` が `clean`(コンフリクトなし)
- draft でない
- 未解決のレビューコメントがない

問題がある場合は**何が問題でどうすれば直るか**まで書く(例: 「main と衝突。
`git merge origin/main` で解決が必要」「e2e が失敗。ログを見て原因を調べる必要あり」)。

### 4. マージするか聞く

マージ可能な PR があれば、**AskUserQuestion で確認する**。選択肢は状況に応じて:
「全部マージ」「一部だけ(番号指定)」「マージしない」など。

**ユーザーが明示的にマージを指示するまでマージしない。** 確認せずマージするのは禁止。

### 5. 指示に従ってマージ

```
mcp__github__merge_pull_request(owner, repo, pullNumber, merge_method: "squash")
```

複数マージする場合は1件ずつ。**先にマージした PR の影響で後続がコンフリクトすることがある**
ので、2件目以降はマージ前に `mergeable_state` を取り直して確認する。`dirty` になったら
そこで止めてユーザーに報告する。

マージ後は結果(どれがマージされ、どれが残ったか)を報告する。

## 注意

- 自分が作った PR も他人の PR も同じ手順で扱う。ただし**他人の PR は特に慎重に**、
  内容を確認せずマージ可能と判断しない。
- CI が `in_progress` / `queued` のときは「実行中」と報告する。待つ場合は
  foreground の `sleep` が使えないため、`Bash` を `run_in_background: true` にして待つ。
- 作業ブランチ(`claude/...`)の PR をマージしたら、次の作業に備えて
  ブランチを最新 main から作り直しておくとよい(`ship-pr` スキルと同じ後片付け)。
