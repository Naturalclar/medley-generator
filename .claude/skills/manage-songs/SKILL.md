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
  "artist": "アーティスト",   // 実演者(歌手・バンド・キャラ名義)。不明なら null
  "lyricist": "作詞者",       // 楽曲申請に使う。不明なら null
  "composer": "作曲者",       // 楽曲申請に使う。不明なら null
  "key": "Am",               // 不明なら null
  "bpm": 120,                // 正の整数。不明なら null
  "mastery": "ready | practicing | wishlist",  // 既定は wishlist
  "lastPlayedAt": "2026-08-04",                // 不明なら null
  "youtubeId": "dQw4w9WgXcQ",                  // YouTube動画ID(11文字)。不明なら null
  "jasracCode": "052-2119-3",                  // JASRAC作品コード。管理外・不明なら null
  "nextoneCode": null,                         // NexTone作品コード。管理外・不明なら null
  "workCodeNotFound": false,                   // 両DBを調べたが登録が無かった曲は true
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
  [--artist "<名>"] [--lyricist "<作詞者>"] [--composer "<作曲者>"] \
  [--key "<調>"] [--bpm <整数>] \
  [--mastery ready|practicing|wishlist] \
  [--tags "タグA, タグB"] [--memo "<メモ>"] [--last-played YYYY-MM-DD] \
  [--youtube-id <動画ID または YouTubeのURL>] \
  [--jasrac-code <123-4567-8>] [--nextone-code <N12345678>] \
  [--work-code-not-found true|false]
```

`--youtube-id` は生のID(11文字)でも URL でもよい。URL の場合はIDを自動抽出する
(`youtu.be/<id>` / `watch?v=<id>` / `music.youtube.com/watch?v=<id>` / `/shorts/<id>` に対応)。

`--id` と `--title` は必須。省いたフィールドは既定値(null / [] / "" / mastery は wishlist)。
新規に発見・登録する曲は基本 `wishlist`。ユーザーが「弾ける」「練習中」と言えばそれに従う。

**追加時は申請に必要な情報まで揃える。** 何を調べるかは後述の「登録時に揃えるもの」を見る。

## 作品コード(JASRAC / NexTone)

楽曲利用の申請に使う。**1曲につきどちらか片方だけ**入れる(両方入っているとスキーマ
テストが落ちる)。分からなければ両方 `null` のままでよい。

| 管理団体 | 形式 | 例 |
|---|---|---|
| JASRAC(内国作品) | 数字3桁 - 数字4桁 - 数字1桁 | `052-2119-3` |
| JASRAC(外国作品) | 2桁目のみ英字、他は数字 | `0A1-2345-6` |
| NexTone | `N` + 半角数字8桁 | `N12345678` |

スクリプト側で正規化するので、ハイフン無し(`05221193`)や小文字英字、NexTone の
先頭 `N` 省略(`12345678`)で渡しても正しい形で保存される。桁数や文字種が合わない
値はエラーで弾かれる。

コードは J-WID(JASRAC)や NexTone の作品検索で調べる。**推測で埋めないこと。**
許諾番号(`9013388002Y30005` のような番号)は作品コードとは別物なので混同しない。

### どちらの団体のコードを入れるか

同じ作品が JASRAC と NexTone の**両方に載っていることはよくある**(支分権ごとに管理
団体が分かれるため)。片方しか持てないので、**「配信(インターネット上での音楽利用)を
管理している方」**を採用する。この曲プールの用途は配信での演奏なので、必要な支分権が
配信だから。

J-WID の作品詳細画面に利用分野(演奏 / 配信 / 放送 / 録音 …)ごとの管理状況が出るので、
そこで判定する。配信の管理団体は JASRAC 側・NexTone 側どちらにも振れるため、
アーティスト単位ではなく**作品単位**で見ること。

### 作詞者・作曲者

申請には作品コードだけでなく**作詞者名・作曲者名**も要る。`artist` は実演者
(歌手・バンド・キャラ名義)であって著作者ではないので、**`artist` から作詞者・
作曲者を導かないこと**(例: Butter-Fly の artist は 和田光司 だが作詞作曲は 千綿偉功)。

作品コードと同じDBで調べられる。作品コードが入っていれば**コードで完全一致検索**
できるので、同名異曲を取り違える心配が無い。

- **J-WID**: 作品詳細の「著作者/出版者情報」に `識別: 作詞 / 作曲` が出る。
  外国作品は `作曲作詞` のように1つにまとまっていることがあり、その場合は両方に入れる
- **NexTone**: 作品詳細の「著作者情報」に `役割: 作詞 / 作曲` が出る

複数人いる場合は `"A / B"` のように1つの文字列にまとめる。インスト曲など作詞者が
いない曲は `lyricist` を null にする。

### 調べたが見つからなかった場合

`workCodeNotFound` に `true` を入れる。両コードが `null` なだけでは「まだ調べていない」
のか「調べたが無かった」のか区別できず、何度も同じ曲を調べ直すことになるため。

```sh
node .claude/skills/manage-songs/scripts/songs.mjs edit <id> --work-code-not-found true
```

後からコードが見つかったら、コードと一緒に `--work-code-not-found false` を渡して
印を下ろす(コードと印が同時に立つ状態はスクリプトとテストの両方で弾かれる)。

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

## 登録時に揃えるもの

**曲を追加するときは、その場で申請に必要な情報まで調べて入れる。** 後回しにすると
「追加はしたが申請できない曲」が溜まり、申請したくなった時点でまとめて調べ直す
ことになる(実際に一度そうなって、212曲ぶんを後から埋める羽目になった)。

追加1曲ごとに、次を順に埋める:

| 項目 | 調べ方 | 取れなければ |
|---|---|---|
| `youtubeId` | YouTube で公式チャンネル / 公式音源を探す | `null` |
| `jasracCode` **または** `nextoneCode` | J-WID / NexTone 作品検索。配信を管理している方を採用 | 両方 `null` |
| `lyricist` / `composer` | 同じ作品ページの著作者情報。コードが取れていれば**コードで完全一致検索**できる | `null` |
| `tags` | 既存の流儀に合わせる(`ボカロ` / `アニソン` + 作品名) | `[]` |

`bpm` / `key` は無理に埋めず `null` のままでよい(README にある通り「不明なら null で
OK、無くても動く」)。

### 埋まらなかったときは黙って進めない

**推測で埋めるより空欄の方がよい。** 作品コードは申請に使う実務的な番号なので、
間違った値は空欄より害がある。次を守る:

- 調べて**両DBに登録が無かった**なら `--work-code-not-found true` を立てる
  (「まだ調べていない」と区別するため)
- **DBに到達できない環境**(egress ポリシーで J-WID / NexTone がブロックされる等)
  では、`null` のまま登録して**その旨をユーザーに報告する**。到達できないことを
  黙って「不明」として流さない
- 何曲中何曲が埋まらなかったかを、件数と理由付きで報告する

### 既に登録済みの曲を後から埋める

未調査の曲(`workCodeNotFound` が `false` かつ両コードが `null`)を拾う:

```sh
node -e "
const s=require('./src/data/songs.json');
s.filter(x=>!x.jasracCode&&!x.nextoneCode&&!x.workCodeNotFound)
 .forEach(x=>console.log(x.id,'|',x.title,'|',x.artist));
"
```

## 進め方

1. ユーザーの自由入力(「Ado の金木犀を練習中で追加して」等)から
   title / artist / mastery / tags を読み取る。
2. **正式表記を確認する。** 表記ゆれ・同名異曲・コラボ名義が頻出するので、
   少しでも怪しければ Web 検索で裏を取る。ユーザーの入力表記を鵜呑みにしない。
   認識と違っていたら正式表記で登録した上でその旨を伝える。
3. タイトルからローマ字 id を作る。必要なら `list` で既存を確認。
4. **「登録時に揃えるもの」を調べる**(youtubeId / 作品コード / 作詞者・作曲者)。
5. `add` を実行する。複数曲なら 1曲ずつ呼ぶ。
6. 実行後、スクリプトの出力と `git diff src/data/songs.json` を見て、意図した
   最小差分になっているか確認する。
7. 何をどう変えたか、**埋まらなかった項目とその理由**も含めて簡潔に報告する。

## memo の注意(重要)

`songs.json` は公開エンドポイント(`https://smashcat.dev/medley-generator/songs.json`)
としてそのまま配信される。**`memo` に特定の個人を識別できる情報(配信者名・本名・
SNSアカウント等)を書かない**こと。「◯◯さんの配信で知った」のような由来メモは、
個人名を外して「配信で発見」のように一般化する。ユーザーがそういう入力をしても、
memo に入れる際は個人名を落とす。
