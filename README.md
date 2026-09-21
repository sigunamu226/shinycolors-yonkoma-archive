# シャニマス web四コマ リンク台帳

Xで連載中の四コマ漫画を、話数ごとにリンクだけ索引する静的サイト。

**漫画の画像・本文は保存していません。** 保持するのは投稿へのリンクのみで、
各話の表示はすべて X 公式の埋め込みウィジェットによるものです。

## 構成

ビルド不要・依存パッケージなし。`npm install` すら要りません。

| ファイル | 役割 |
|---|---|
| `episodes.json` | **唯一の正データ** |
| `index.html` | サイト本体（バニラJS） |
| `scripts/add.mjs` | 台帳への取り込み |
| `lib/tweet.mjs` | ツイート取得・本文パース |
| `scripts/serve.mjs` | 動作確認用の簡易サーバ |

## 使い方

### 新着を追加する

```bash
npm run add -- https://x.com/imassc_official/status/1234567890123456789
git commit -am "第123話を追加"
git push
```

push から1分ほどで公開サイトに反映されます。

話数・サブタイトル・投稿日は**ツイート本文から自動で判定**します
（`第12話「タイトル」` 形式を想定。全角数字も可）。
自動判定できない投稿だけ手動で上書きします:

```bash
npm run add -- <URL> --num 123 --title "タイトル"
```

複数まとめて追加、保存せず結果だけ確認:

```bash
npm run add -- <URL1> <URL2> <URL3>
npm run add -- <URL> --dry-run
```

重複ID・話数の衝突・取得失敗はすべてスキップして報告するので、
同じURLを二度入れても壊れません。

### 既存データのメタを取り直す

```bash
npm run refresh
```

### ローカルで表示を確認する

```bash
npm run serve   # http://localhost:8000
```

## データ取得について

認証不要で使えるのは以下のみ（2026-09 時点で動作確認済み）:

- `cdn.syndication.twimg.com/tweet-result?id=...` — **既知IDから**本文・投稿日を取得
- `publish.twitter.com/oembed` — 埋め込みHTML

一方、**新着の発見**にあたる経路はすべて塞がっています:

| 経路 | 状態 |
|---|---|
| `cdn.syndication.twimg.com/timeline/profile` | 200を返すが中身が空（実質廃止） |
| `syndication.twitter.com/srv/timeline-profile/` | 429固定（自宅回線でも同じ） |
| 公式サイトのRSS/sitemap | 403（配信元がbotを拒否）。4コマ一覧ページも存在しない |

このため**新着URLの投入だけ手動**です。メタデータは全部自動なので、
実作業は「URLを1本貼る」だけになります。

## 実装上の注意

### パスは必ず相対で書く

GitHub Pages では `/shinycolors-yonkoma-archive/` 配下に配信されます。
`fetch("/episodes.json")` のような絶対パスは404になります。

### 埋め込みホストをflexにしない

`widgets.js` は親要素がflexだと iframe に `width:0 / flex-grow:1` を当てて
埋め込みを潰します。`.koma-embed` は必ず `display: block` にしてください。

### 埋め込みの成否は「高さ」で判定する

`createTweet` の Promise は、埋め込みが描画されても解決しないことがあります。
そのため成功判定にはホストの実描画高さを使っています。

- 8秒で描画されなければ暫定でリンクを表示（**監視は継続**し、遅れて描画されたら埋め込みに戻す）
- 削除済みツイート等の確定的な失敗のみ、リンク表示に固定する

各カードの `data-embed-state` 属性に現在の状態（`idle` / `loading` / `done` /
`fallback` / `failed`）が出るのでデバッグに使えます。

## 将来、自動化する場合

`scripts/add.mjs` は引数にURLを取るだけなので、新着URLを見つける処理を書いて
その出力を渡せば済みます。サイト側の変更は不要です。
GitHub Actions の cron からそのまま呼べます。
