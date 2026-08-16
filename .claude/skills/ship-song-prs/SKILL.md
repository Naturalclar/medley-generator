---
name: ship-song-prs
description: >-
  曲を追加する Pull Request を拾って、作品コード(JASRAC / NexTone)と作詞者・作曲者が
  埋まっていなければ J-WID / NexTone を引いて補完し、CI が通ったら squash マージするスキル。
  「曲追加のPRを処理して」「PRの曲に作品コードを入れて」「作品コードを調べて」
  「曲を追加して」「この曲の作品コードは?」「未調査の曲を埋めて」などの依頼で使う。
  曲を1曲追加するだけの依頼でも、作品コードを調べる必要があるならこのスキルの
  スクリプトを使う(J-WID / NexTone を叩く道具一式がここにある)。
---

# ship-song-prs

曲追加の PR を「申請できる状態」にしてからマージするスキル。

このリポの曲プールは配信で演奏するメドレー用で、**実際に音楽利用の申請(avvy)に使う**。
申請には作品コードと作詞者・作曲者が要るので、コードの入っていない曲は「プールにあるが
申請できない曲」になる。実際に一度そうなって 212曲ぶんを後から調べ直す羽目になったので、
**曲が入る PR の時点で埋め切る**のがこのスキルの目的。

owner/repo は `Naturalclar/medley-generator`、base は `main`、マージ方式は **squash**。
GitHub 操作は `mcp__github__*` ツールで行う(必要なら ToolSearch で読み込む)。

## 全体の流れ

1. 対象の PR を見つける
2. **DB への到達確認**(ここで詰まったら回避せず報告)
3. 未調査の曲を洗い出す
4. 作品コードを調べる → 作詞者・作曲者を調べる
5. 反映して lint / test / build
6. commit・push → CI green を確認 → マージ

「マージまでやってよいか」はユーザーの指示に従う。**このスキルを呼ばれただけでは
マージしない**。PR を見つけて報告する段階で、マージしてよいか確認する
(`review-prs` と同じ姿勢。CI が失敗したら当然マージしない)。

## 1. 対象の PR を見つける

```
mcp__github__list_pull_requests(owner, repo, state: "open",
  fields: ["number","title","draft","mergeable_state","head","user","created_at"])
```

`pull_request_read(method: "get_diff")` で `src/data/songs.json` に曲オブジェクトを
追加している PR を拾う。`mergeable_state` が `dirty` ならコンフリクトあり(後述)。

## 2. DB への到達確認(先にやる)

```sh
curl -s -o /dev/null -w "J-WID: %{http_code}\n" --max-time 30 "https://www2.jasrac.or.jp/eJwid/"
curl -s -o /dev/null -w "NexTone: %{http_code}\n" --max-time 30 "https://search.nex-tone.co.jp/"
```

J-WID は `200`、NexTone は `302`(利用規約ページへの通常のリダイレクト)が正常。
`000` や `403` が返るなら egress ポリシー等でブロックされている。その場合は
**回避を試みず、調べられないことをユーザーに報告する**。到達できないのを黙って
「不明」として流すと、後で「調べたが無かった」と区別がつかなくなる。

## 3. 未調査の曲を洗い出す

コードが両方 `null` かつ `workCodeNotFound` が `false` の曲が「まだ調べていない」曲:

```sh
node -e "
const s=require('./src/data/songs.json');
s.filter(x=>!x.jasracCode&&!x.nextoneCode&&!x.workCodeNotFound)
 .forEach(x=>console.log(x.id,'|',x.title,'|',x.artist));
"
```

## 4. 調べる

同梱スクリプトは `scripts/` にある。リポジトリのルートから実行する前提で、
`songs.json` の位置は自分で解決するのでパス指定は要らない。

### 4-1. 作品コード

```sh
python3 .claude/skills/ship-song-prs/scripts/resolve.py <id> <id> ...
```

各曲について J-WID と NexTone の候補を、**配信(インタラクティブ配信)を管理して
いるか**付きで出す。出力例:

```
######## ch4nge | CH4NGE | Giga
  [JASRAC:title=exact,artist=db] 751-0829-1 | ＣＨ ４ ＮＧＥ | ＧＩＧＡ | Ｇｉｇａ | partial 配信=True
  [NexTone:artist-matched] N01123464 | CH4NGE | Giga | Giga | 配信=False
```

判断材料を並べるだけなので、**採用は自分で決める**。

### 4-2. どちらの団体のコードを入れるか

同じ作品が JASRAC と NexTone の**両方に載っていることはよくある**(支分権ごとに
管理団体が分かれるため)。スキーマ上どちらか片方しか持てないので、
**配信を管理している方**を採る。この曲プールの用途は配信での演奏で、必要な支分権が
配信だから。

**アーティスト単位ではなく作品単位で見ること。** 同じ人の曲でも割れる:

| 例 | 判定 |
|---|---|
| CH4NGE (Giga) | 両DBにあり、配信は JASRAC → JASRAC |
| G4L (Giga) | JASRAC のみ → JASRAC |
| アディショナルメモリー (じん) | JASRAC が全支分権 → JASRAC |
| カゲロウデイズ (じん) | 配信は NexTone → NexTone |

`resolve.py` は J-WID の詳細画面から判定している。全支分権を JASRAC が持つ作品は
利用分野ごとの内訳が出ず冒頭の一文だけになるので、`full` = 配信も管理、
`partial` = 内訳を見る、という読み方をしている。

### 4-3. タイトルが一致しないとき

`resolve.py` が「一致候補なし」を返しても、登録が無いとは限らない。表記が違うだけの
ことが多い:

- **タイトルそのものが違う** — 「マスク」(Aqua Timez) は DB に無く、`ＭＡＳＫ` で
  登録されていた。正式表記が違うと分かったら `songs.json` の `title` も直す
- **記号や幅の違い** — `完全感覚Dreamer` は DB では `ＤＲＥＡＭＥＲ`、
  `心拍数♯0822` は `＃`、`secret base 〜君がくれたもの〜` は波ダッシュが違う。
  `resolve.py` は頭の部分だけの前方一致でフォールバックする
- **短くてありふれたタイトル** — 恋 / ライオン / Pretender / カルマ のように同名異曲が
  大量に出る場合は、**著作者名で引く**のが確実:

```sh
python3 -c "
import sys; sys.path.insert(0,'.claude/skills/ship-song-prs/scripts')
import jwid; jwid.start()
for r in jwid.rows(jwid.search('Mask', match=jwid.EXACT, author='太志')):
    print(r)
"
```

`jwid.search(title, match=, artist=, author=)` の `match` は
`jwid.FORWARD / BACKWARD / PARTIAL / EXACT`。タイトルを空にして `author` だけ
渡せばその著作者の作品一覧が引ける(同定に迷ったときに効く)。

### 4-4. 作詞者・作曲者

**`artist` から導かないこと。** `artist` は実演者(歌手・バンド・キャラ名義)であって
著作者ではない。実例:

- Butter-Fly の `artist` は 和田光司 だが作詞作曲は 千綿偉功
- G4L / CH4NGE の `artist` は Giga だが**作詞は Ｑ＊ＬＥＦＴ**(作曲が ＧＩＧＡ)
- 怪獣 (サカナクション) の作曲は山口一郎ひとりではなく**メンバー5人全員**
- 灰色と青 の `artist` は「米津玄師 × 菅田将暉」だが、菅田将暉は著作者に出てこない

作品コードが入っていれば**コードで完全一致検索**できるので、同名異曲を取り違えない:

```sh
python3 .claude/skills/ship-song-prs/scripts/credits.py <id> ... --out=credits-jw.json     # JASRAC
python3 .claude/skills/ship-song-prs/scripts/nt_credits.py <id> ... --out=credits-nt.json  # NexTone
```

先にコードを `songs.mjs edit` で入れてから実行する(コードで引くため)。
外国作品は `作曲作詞` のように役割が1つにまとまっていることがあり、その場合は
両方に入る。複数人は `"A / B"` の1文字列にまとめる。

### 4-5. 表記は DB の表示どおりにする

申請書に書く名前なので、DB が出している通りに入れる。**作品ごとに違うことがあるので、
他の曲からの類推で書かない**:

- J-WID は英字を**全角**で出す → `Ｎ−ＢＵＮＡ` / `ＲＹＯ` / `ＧＩＧＡ`
  (ヨルシカの既存6曲もすべて `Ｎ−ＢＵＮＡ`)
- J-WID の日本語名は姓名の間に半角スペース → `米津 玄師` / `藤原 基央` / `広瀬 香美`
- NexTone は半角で出す → `n－buna` / `DECO＊27` / `Eight`
- 同じ人でも作品ごとに名義が違う → アディショナルメモリーは `じん`、
  カゲロウデイズは `じん（自然の敵P）`

### 4-6. 見つからなかったとき

両DBを調べて登録が無かったら `--work-code-not-found true` を立てる。両コードが `null`
なだけでは「まだ調べていない」のか「調べたが無かった」のか区別できず、何度も同じ曲を
調べ直すことになる。

**どちらのDBにも登録が無い作品は、そもそも利用申請が要らない。** 作詞者・作曲者を
別の情報源から無理に埋めようとしないこと。

### 4-7. やってはいけないこと

- **推測で埋めない。** 作品コードは申請に使う実務的な番号で、間違った値は空欄より害がある
- **許諾番号(`9013388002Y30005` のような番号)は作品コードではない**
- **JASRAC と NexTone を両方入れない**(スキーマテストが落ちる)
- **DB が重くなったら間を置く。** 続けて叩くと極端に遅くなるが、少し待って再試行すると
  通る。取れなかった曲は諦めずに後でまとめて再試行する

## 5. 反映と検証

**手で `songs.json` を編集しない。** `manage-songs` のスクリプト経由で入れる:

```sh
node .claude/skills/manage-songs/scripts/songs.mjs edit <id> --jasrac-code 123-4567-8
node .claude/skills/manage-songs/scripts/songs.mjs edit <id> --nextone-code N12345678
```

作詞者・作曲者は収集した JSON をまとめて反映する(複数ファイルをマージできる):

```sh
node .claude/skills/ship-song-prs/scripts/apply.mjs credits-jw.json credits-nt.json
```

`apply.mjs` は `lyricist` / `composer` を常に両方渡す。片方だけ渡すと以前の誤った値が
残るため。また、シェルでタブ区切りを読むと**インスト曲(作詞者が空)でフィールドがずれる**
(bash がタブを IFS whitespace として畳む)ので、この処理は Node に寄せてある。

反映したら差分を見て、意図した最小差分になっているか確認する:

```sh
git diff src/data/songs.json
pnpm run lint && pnpm test --run && pnpm run build
```

## 6. commit・push・マージ

`ship-pr` スキルと同じ手順。加えて、このワークフロー特有の落とし穴が3つある。

### ブランチが動く

調べている間に**ユーザーがそのブランチへ曲を足してくることがよくある**(実際に1つの
PR で4回起きた)。push が弾かれたら fetch して確認し、rebase してから続ける。
**新しく増えた曲も未調査なので、3〜5をもう一度回す**:

```sh
git fetch origin <branch>
git log --oneline HEAD..origin/<branch>
git rebase origin/<branch>
```

### コンフリクト

`mergeable_state` が `dirty` のときは、たいてい `songs.json` の**末尾に別々の曲を
追記したことによる衝突**。どちらかを捨てる話ではないので、`git merge origin/main` して
**両方の曲を残す**形で解消する。解消後に曲数を数えて、消えた曲が無いか確認する。

### マージ直前にもう一度 head sha を見る

CI を確認してからマージするまでの間に新しいコミットが乗ると、**自分が検証していない
変更ごとマージしてしまう**(実際に一度やった。作品コードの無い曲がそのまま main に入った)。
`pull_request_read(method: "get")` で `head.sha` を取り直し、CI が通った sha と
同じであることを確認してからマージする。

### マージ判定

- 全ジョブ(`check` と `e2e`)が `completed` かつ `conclusion: success` → squash マージ
- どれか失敗 → **マージしない**。`get_job_logs`(`failed_only: true`)で原因を調べて報告

CI 待ちは foreground の `sleep` が使えないので、`Bash` を `run_in_background: true` で
`sleep 80` するか `Monitor` の until ループで待つ。e2e はブラウザ取得込みで1分程度。

マージ前に PR 本文が実態とずれていたら直す(調べた結果や表記の修正が本文に無いと、
後から履歴を読んだときに何を確認したのか分からなくなる)。

マージ後は次の作業に備えてブランチを作り直す:

```sh
git fetch origin main
git checkout -B <branch> origin/main
```

## 報告

**埋まらなかった曲は正直に報告する。** 「N曲中M曲は見つからなかった」と件数と理由を
はっきり書く。埋めた数を多く見せるために推測を混ぜない。

併せて、次のことは見つけたら必ず伝える。申請の不備に直結するため:

- **PR に書かれていた作詞者・作曲者が DB と違っていた**(怪獣の作曲が5人だった等)
- **タイトルが正式表記と違っていた**(マスク → Mask 等)
- **両DBに登録があって配信で判定した**曲

## 注意

- `songs.json` は公開エンドポイントとして配信される。`memo` に個人を特定できる情報
  (配信者名・本名・SNSアカウント等)を書かない
- 申請の進捗・履歴は `songs.json` に持たせない(localStorage 側の責務)
- J-WID / NexTone の利用規約は無断の複写・複製・転載を禁じている。調べた結果を
  `songs.json` に入れるのは申請に必要な範囲の参照だが、DB の内容をまとまった形で
  持ち出すような使い方はしない
