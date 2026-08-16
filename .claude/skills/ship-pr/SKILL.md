---
name: ship-pr
description: >-
  現在の作業ブランチから PR を作成し、CI(check / e2e)の完了を待って、green なら
  squash マージするまでを一気通貫で行うスキル。「PR作ってCI通ったらマージして」
  「この変更をshipして」「PR出してマージまで」「ship it」等の依頼で使う。
  push 済みの feature ブランチに対して実行する。CI が失敗したらマージせず原因を報告する。
---

# ship-pr

medley-generator で繰り返す「PR作成 → CI待ち → マージ」を1回で回すスキル。
**このスキルの呼び出し自体が「green ならマージしてよい」という承認**とみなす。ただし
**CI が失敗した場合は絶対にマージせず**、原因を調べて報告する。

owner/repo は `Naturalclar/medley-generator`、base は `main`、マージ方式は **squash**
(このリポの慣習)。GitHub 操作はすべて `mcp__github__*` ツールで行う(必要なら
ToolSearch で読み込む: `create_pull_request` / `pull_request_read` / `merge_pull_request`
/ `get_job_logs`)。

## 前提の確認

1. 変更がコミットされ、作業ブランチが origin に push 済みであること。
   未 push の変更があれば先に push する(`git push -u origin <branch>`)。
2. 作業ブランチ名を確認(`git branch --show-current`)。

## 手順

### 1. PR を作成

- PR テンプレートの有無を確認(`.github/pull_request_template.md` など)。あれば構成に従う。
- `mcp__github__create_pull_request`(owner=Naturalclar, repo=medley-generator,
  base=main, head=現ブランチ)。タイトル・本文は**変更内容から**簡潔に書く。
- 本文末尾に必ず Claude Code の attribution footer を付ける。
- 既に同ブランチの PR が open なら新規作成せず、それを対象にする。

### 2. CI の完了を待つ

- `mcp__github__pull_request_read`(method: `get_check_runs`)で check runs を取得。
- **すべてのジョブ(`check` と `e2e`)が `status: completed` になるまで待つ**。
- `in_progress` / `queued` が残る間は、間隔を空けて再取得する。
  **foreground の `sleep` はこの環境でブロックされる**ため、待機は次のどちらかで行う:
  - `Bash` を `run_in_background: true` で `sleep 45` 実行 → 完了通知後に再取得、または
  - `Monitor` の until ループ。
  e2e はブラウザ取得を含み ~1分程度かかる。ポーリングは 30〜60 秒間隔で十分。

### 3. 判定してマージ / 報告

- **全ジョブ `conclusion: success`** → `mcp__github__merge_pull_request`
  (merge_method: `squash`)でマージ。成功を報告する。
- **どれか `failure`(または timed_out / cancelled)** → **マージしない**。
  `mcp__github__get_job_logs`(`failed_only: true`, `return_content: true`)で
  失敗ログを確認し、原因と対処案を報告する。自分の変更が原因で小さく直せるなら
  修正を push し、CI を再度待つ(2 に戻る)。

**マージする直前に head sha を取り直す。** `pull_request_read`(method: `get`)の
`head.sha` が、CI が通った sha と同じであることを確認してからマージする。CI を
確認してからマージするまでの間に新しいコミットが乗ると、**自分が検証していない
変更ごとマージしてしまう**(実際に一度起きて、検証していない変更がそのまま main に
入った)。ずれていたら 2 に戻ってその sha の CI を待つ。

同じ理由で `mergeable_state` も見る。`dirty` ならコンフリクトがあるので、
先に main を取り込んで解消する。

マージ前に PR 本文が実態とずれていたら直す(途中で分かったことや直した内容が本文に
無いと、後から履歴を読んだときに何を確認したのか分からなくなる)。

### 4. マージ後の後片付け(次の作業に備える)

マージ済みブランチにはそれ以上コミットを積まない。次の変更は最新 main から
作り直す:

```sh
git fetch origin main
git checkout -B <branch> origin/main
```

## 注意

- branch protection や必須レビューが設定されている場合はそれに従う
  (auto-merge が必要なら `enable_pr_auto_merge` を使う)。
- CI がまだ何も走っていない(check runs が空)場合は、少し待ってから再取得する。
  それでも走らなければ workflow の設定を確認する。
- 「PR は作るがマージはしない」と明示された場合は 1 で止める。
