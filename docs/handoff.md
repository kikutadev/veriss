# 引き継ぎ(2026-11-19)

isle から切り出した CSS 検証器(veriss)を、別のマシンで続けて開発するための文書。今どこにいて、何をどう続けるか。

## 今どこにいるか

- `main` に全部入っている(このセッションの作業も)。isle は veriss を git 依存で使う利用者になった(isle の `package.json` の `@mizchi/veriss` が commit を指す)
- **静的検査のパターン**: [docs/static-check-checklist.md](static-check-checklist.md) に F1〜F106(このセッションで F79〜F106)。カテゴリごとの進み具合と残りの観点は [TODO.md](../TODO.md)(52 / 77)
  - 保留: F91(段組の外の `break-*`。印刷を対象にするか未決)、F95(`li{display:flex}` でマーカーが消える。警告の条件が未決)
  - 見送り(実測したら効いていた): flex の `text-indent`、`perspective`、表のセルの `max-width`
  - 健全性の修正: F89(`calc(100%-10px)` を 100%−10px として計算していた)、F99(引用符のない不正な `font-family` を適用していた)
- **モジュール分割**: [ADR-0016](adr/0016-module-decomposition.md)。M1〜M5 が済み、M6 から
  - M1 `src/color/`(色の数学。依存なし)
  - M2 `test/module-boundaries.test.mjs`(import の向きの検査)
  - M3 構文の段の結果を `notes[]` に(`src/rules/syntax-notes.mjs` が文言)
  - M4 捨てた宣言を `style.$dropped[]` に(`src/layout/dropped.mjs`)
  - M5 CSS の誤りの検査を `src/rules/css-mistakes.mjs` の `createCssMistakes({ report, facts, tools })` に
- **実験**: [experiments/style-language/](../experiments/style-language/README.md)(ADR-0014・0015 の構文案 A〜E と、今の veriss での扱い)

## 始め方

```sh
git clone https://github.com/mizchi/veriss && cd veriss
pnpm install
npx playwright install chromium firefox webkit   # e2e は 3 ブラウザで測る
tools/gate.sh                                     # push の前に毎回。20〜30 分かかる(eval が長い)
```

- ブラウザーが既定の場所にないときは `PLAYWRIGHT_BROWSERS_PATH` を指定する
- 1 つのパターンだけの e2e: `npx playwright test -c playwright.layout.config.mjs --trace off e2e/layout-css-mistakes.spec.mjs -g F106 --project=chromium --project=firefox --project=webkit`
- 解析器の読み方を見る: `node tools/probe.mjs '<css>' ['<html>']`
- 宣言が効くかを 3 ブラウザで比べる: `node tools/browser-diff.cjs '<css>' '<css + 宣言>' '<html>'`

## パターンを足す手順

1. 候補を 3 ブラウザで実測する(`tools/browser-diff.cjs`)。**中身と条件を変えて何通りも測る**(1 文字のセルで差が出ず、効く宣言を候補にしたことがある)。対照(効く場合)も一緒に測り、比較が空振りでないことを確かめる
2. 解析器の今の扱いを見る(`tools/probe.mjs`)。verified なのに値がブラウザーと違えば健全性のバグ(最優先)
3. 単体テストを先に書く(`packages/veriss/test/css-mistakes.test.mjs`)。落ちることを確かめる
4. 実装する。置き場所は検査の種類で決まる:
   - 宣言が文法上不正でブラウザーが捨てる → `css.mjs` の宣言の読み込みで `note('W_…', {...})` して宣言を捨て、`src/rules/syntax-notes.mjs` に文言を足す
   - computed style を作るときに捨てる(効かないので解に入れない) → `css.mjs` で `drop(values, reason, property, value)`、文言は `src/rules/css-mistakes.mjs`
   - box と祖先の style から判る → `src/rules/css-mistakes.mjs`(必要な事実は `createCssMistakes` の引数で受ける)
   - 判定できない値は **Unknown のまま**(成功に変えない)
5. e2e(`e2e/layout-css-mistakes.spec.mjs`)、新しいコードなら `packages/adapter-core/src/lint.mjs` の説明、チェックリストの行、TODO.md の観点を更新
6. `tools/gate.sh` が通ったら commit して push

## 次にやること

- **M6**: `solve` の中に残る「効かない宣言」の判定(`reasons` の一覧)を `rules/css-mistakes.mjs` に移す。layout の段は「親の display」「flow の中か」を事実として出す。レイアウトが Unknown のときに検査をやり直す `walkStyles` をなくす
- **M7**: `rules/contrast`(色の規則を `src/color/` の上に。祖先の塗りの鎖だけで判定し、後ろに重なる箱の判定だけ layout があるときに足す)
- **M8**: a11y を DOM の規則と幾何の規則に分ける。integrity と CLS も規則にする
- **M9**: 境界テストの許可が空になったら `packages/` に分ける
- **パターン**: TODO.md の残りの観点(色の関数の不正、`@supports` / `@layer` / `@font-face` / `@property`、`<col>`、`letter-spacing`、3D の transform、フォーム部品の差、重複した `id`、`:has()` の中の状態、ブラウザー差の測り方)
- **isle から移す候補(未移動)**:
  - `models/css_layout/`、`models/layout_contract/`(Z3 検査・契約検査を照合する独立した SMT 仕様)。isle のテストが読んでいる。veriss に置くなら `packages/veriss` の外では isle から読めないので、置き場所と isle のテストの参照を一緒に決める
  - `tests/types/css-verifier.mts`(veriss の型定義の検査)。veriss に TypeScript の検査を入れてから
  - isle の `package.json` が veriss の API を `@isle/prototype/layout/*` として公開し直している。残すか、利用者に veriss を直接使ってもらうか

## 落とし穴(このセッションで踏んだもの)

- ゲートの実行中に作業ツリーを変えると、結果がどの版のものか分からなくなる。ゲートの間はツリーの外(一時ディレクトリ)で準備する
- `css-mistakes.test.mjs` は 1 ファイルで 20 秒以上かかる(止まっているのではない)
- Playwright の `setContent` はページのグローバルを持ち越す: script の `const` はブロックで包む
- WebKit の `::selection` の基準には `::selection{--z:1}` の規則が要る。canvas は描かれるのを待ってから撮る
- div を `display: list-item` にしてもマーカーは箱の左外に描かれて写らない(`ul > li` で比べる)。グラデーションは固有の大きさがないので `list-style-image` の対照に使えない(SVG の data URL を使う)
- `perspective` は none 以外でスタッキングコンテキストを作る。`text-wrap` はショートハンドで `text-wrap-mode` を wrap に戻す(`nowrap` の後に `text-wrap: balance` を書くと折り返しが戻る)
- quirks モード(doctype なし)の WebKit は単位のない長さを px として受ける。解析は標準モードを前提にする
- a11y の e2e は `evals/results/layout-accessibility/` を書き換える(コミット済みの `report.json` は古い)。コミットに混ぜない
- pnpm の git 依存では `workspace:*` が解決しない(内部パッケージは peerDependencies `*`)。`font_ffi.js` のビルド結果は `.gitignore` の否定でコミットしている

## isle との関係

- isle は veriss を `github:mizchi/veriss#<commit>&path:packages/veriss` で使う。veriss を変えたら、isle の pin を上げて isle の照合テスト(`just css-verifier-check`、`just css-text-check`)を回す
- isle に残るのは isle の利用者側だけ: テンプレート → 箱の木(`lib/layout*`)、vite のビルド、`.isle` の例と eval、isle の構文(`layout SafeGrid { ... }`、`@noshift`)の文書
