# メドレーセトリ生成 (medley-generator)

配信で演奏するメドレーの曲目を自動で組んでくれる小さなWebサービス。

朝枠・夜枠で「今日何弾こう」を考える時間をゼロにしつつ、練習中の曲を自然に枠へ混ぜて、練習が配信ネタになる循環を作る。

## 機能 (v0)

- `src/data/songs.json` の曲プールから曲数を指定してセトリ生成
- 生成ヒューリスティック:
  - 「練習中」の曲は1枠に1曲だけ混ぜる(練習ノルマの自然消化)
  - BPMは緩→急→緩の山型に並べる(いきなり最速から始めない)
- 「覚えたい」曲を挑戦枠として含めるかのトグル
- コメント欄/概要欄に貼れるプレーンテキスト出力(コピー付き)

## 開発

```sh
pnpm install
pnpm run dev
```

生成ロジック(`src/lib/generator.ts`)には vitest のユニットテストがある。

```sh
pnpm test        # 一回実行
pnpm test:watch  # 変更を監視
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
  "youtubeId": "dQw4w9WgXcQ",
  "jasracCode": "052-2119-3",
  "nextoneCode": null,
  "tags": ["ボカロ"],
  "memo": ""
}
```

`key` / `bpm` / `lastPlayedAt` / `youtubeId` は不明なら `null` でOK(無くても動く)。

`jasracCode` / `nextoneCode` は楽曲利用の申請に使う作品コード。1曲はどちらか一方の
管理なので、両方を同時に埋めない。JASRAC は内国作品が `052-2119-3`、外国作品は
2桁目のみ英字で `0A1-2345-6`。NexTone は `N` + 数字8桁。分からなければ `null`。

## デプロイ

`main` へのpushで GitHub Actions が GitHub Pages へ自動デプロイする。

公開URLは smashcat.dev 側:

https://smashcat.dev/medley-generator/

GitHub Pages は配信元(オリジン)のまま変わらない。smashcat.dev のルートは
Cloudflare にあり、`/medley-generator/*` を Cloudflare Worker が GitHub Pages へ
プロキシしている。URLはブラウザ上でも smashcat.dev のまま保たれる。

同じ内容が GitHub Pages 側のURLからも見えるため、`index.html` で canonical を
smashcat.dev に向けている。検索結果に出したいのはこちらなので、この指定は消さないこと。

`vite.config.ts` の `base` は `/medley-generator/` のままでよい。プロキシ先の
パス接頭辞が一致しているため、ビルド設定の変更は不要。

### OGP画像

SNSでリンクを貼ったときのカード画像は `public/ogp.png`(1200x630)。
版下は `tools/ogp/template.html` で、生成はこれ:

```sh
pnpm run ogp:build
```

`tools/ogp/art.png` を置くと右側にその画像が入る。無ければ文字だけの版になる。
**素材もコミットする**こと(`ogp.png` は公開される成果物なので隠す意味が無く、
素材が無いまま再生成すると文字だけの版に戻ってしまう)。

`index.html` の `og:image` は**絶対URL**で書く。SNSのクローラは相対パスを辿らない。

### 曲データのJSONエンドポイント

ビルド時に `src/data/songs.json` を `dist/songs.json` にもコピーしているため
(`vite.config.ts` の `copySongsJson` プラグイン)、曲データは以下のURLで生のJSONとして取得できる:

https://smashcat.dev/medley-generator/songs.json

> 公開エンドポイントなので、`memo` などに個人を特定できる情報を書かないこと。

## YouTube プレイリスト作成 (任意)

セトリの `youtubeId` が入っている曲は、生成後に2通りの方法で再生できる。

1. **連続再生リンク** — 常に表示される。`youtube.com/watch_videos` を使う一時的な
   プレイリスト(ログイン不要・最大50曲・保存はされない)。
2. **プレイリストに保存** — 環境変数 `VITE_YOUTUBE_CLIENT_ID` が設定されている
   ビルドでのみ表示される。閲覧者が自分の Google アカウントで認証し、自分の
   YouTube に限定公開のプレイリストとして保存する。

### クライアントIDの設定

Google Cloud で OAuth 2.0 クライアント(種別: ウェブアプリケーション)を作り、
YouTube Data API v3 を有効化する。「承認済みの JavaScript 生成元」には**ブラウザから
見えるオリジン**、つまり `https://smashcat.dev` を登録する。

プロキシ先の `https://naturalclar.github.io` ではない点に注意。ブラウザが認証を
行うのは smashcat.dev 上なので、そちらを登録しないとプレイリスト保存が失敗する。

ローカルでは `.env.local` に置く:

```sh
VITE_YOUTUBE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

GitHub Pages へのデプロイでは、リポジトリの Variables に
`VITE_YOUTUBE_CLIENT_ID` を登録すると `deploy.yml` がビルド時に注入する
(未設定でもビルドは通り、その場合は保存ボタンが出ないだけ)。

クライアントIDはビルド成果物に埋め込まれるが、client secret を使わない
暗黙的フローなので公開して問題ない値。アクセストークンはメモリにしか置かず、
保存もサーバー送信もしない。

> 無料枠は1日10,000ユニット。プレイリスト作成50 + 1曲追加ごとに50なので、
> 20曲のセトリで約1,050ユニット(1日およそ9回)。超えると翌日まで作成できない。

## 元ネタ

kanbanリポジトリの `brainstorm/medley-setlist-generator.md` を参照。
