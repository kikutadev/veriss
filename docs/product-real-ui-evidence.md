# Phase 2: 実UIのオフライン検証記録（2026-11-22）

## 結論

veriss の CLI を**ポートフォリオ / ブラウザゲーム / 第三者 UI の3種類**の静的 HTML・CSS に適用した。いずれも `UNKNOWN` で、**実UIのレイアウト破綻を実際に検出・修正できた実証はまだない**。一方、同じ入力に対する Chromium・Firefox・WebKit の5幅×3種＝**45点観測**では、文書の水平スクロール幅が viewport を超えるケースは0だった。

**初回測定で検出した `E_` 13件**は全て `E_CSS_SHORTHAND_CONFLICT` だった。しかし大半は `border:0` → `border-top` のような正常な一括指定から個別指定への絞り込みだった。改修後は**3件すべてエラー0**となり、Bootstrapの見かけの警告も27件→2件に減った。3件のページ全体は依然 `Unknown`。真のレイアウト破綻を見つけたとは主張しない。

| 対象 | 取得元 | CLI | Error（初回→改修後） | Warning（初回→改修後） | Unknown（初回→改修後） | 5幅×3ブラウザの水平はみ出し |
| --- | --- | --- | ---: | ---: | ---: | --- |
| portfolio-about | <https://kikuta.dev/about/> | `UNKNOWN` | 3→0 | 13→13 | 33→33 | 0/15 |
| duo-game-title | `../game/duo-breaker/index.html` + `src/style.css` | `UNKNOWN` | 5→0 | 3→2 | 6→9 | 0/15 |
| bootstrap-album | <https://getbootstrap.com/docs/5.3/examples/album/>（Bootstrap公式サンプル） | `UNKNOWN` | 5→0 | 27→2 | 437→438 | 0/15 |

「Unknown診断の件数」は**未対応箇所の報告件数**であり、CSSルールや画面の何％を証明したかではない。現状で割合を被覆率として示すことはできない。Bootstrap はCSS約234KBで複雑なカスケード・変数・セレクタを持ち、`U_LAYOUT_CSS` 328件と `U_LAYOUT_SELECTOR` 94件が Unknown の大半を占める。ポートフォリオは主に `U_LAYOUT_SELECTOR` 20件、ゲームは `U_LAYOUT_CSS` 5件。

## ブラウザ側で実際に観測できたこと

- 各ブラウザで **320×600、390×844、768×768、1024×768、1280×800px** を計測。検査対象はローカル保存した同一の初期HTML・CSSで、外部ネットワーク要求を遮断し、JSは実行しない。CSSの外部 `@import`、外部フォント、画像は再現しない。
- ポートフォリオ: `.about-document` の幅は各ブラウザで320px viewport時288px、390px時350px、1280px時1090px。画面幅超過は観測なし。文字の高さはブラウザ間で異なり、テキスト寸法の同一性までは主張しない。
- DUO瓦割り: `#game-shell` は狭い幅でviewport幅に一致し、768〜1280pxでは `max-width:560px` に従い中央配置。15点とも期待どおり。タイトル操作のクリック成功・JSで生成する画面・画面高さが小さい条件は**この評価では未測定**。
- Bootstrap Album: カードは320/390pxでは1列、768/1024/1280pxでは3列になり、3ブラウザ間で同じ行の配置を観測。これは**5幅での実測**であり、連続する全幅の静的証明ではない。

## 入力の固定と再実行

- `tests/fixtures/product-real-ui/{portfolio-about,duo-game-title,bootstrap-album}.{html,css}` は実際のページ/リポジトリから収集。`*.source.json` に取得元とSHA-256を保存。HTML は script/style/stylesheet-link の読込ノードを除き、CSS は取得した元の著者規則を順番に連結する（CSS自体の勝手な再記述はしない）。各対象のHTML/CSSは1対で、JS実行後のDOMを代表しない。
- `node --test tests/product-real-ui.test.mjs` でハッシュ・CLIのステータス／終了コードを検証。CLIの単独実行例（他の2件は同名ファイルを替える）:

  ```sh
  node packages/veriss/bin/veriss.mjs check --html tests/fixtures/product-real-ui/duo-game-title.html --css tests/fixtures/product-real-ui/duo-game-title.css --min-width 320 --max-width 1280 --json
  ```
- `node tools/gate-guarded.mjs --product-e2e` で3ブラウザの全45点観測を実行。検証器出力とブラウザ計測は別物として扱い、点観測を証明に変換しない。
- **再取得が必要な場合のみ** `node tools/capture-product-real-ui.mjs --capture`。ポートフォリオ・Bootstrapは開発マシンから直接公開ページにアクセスし、DUOは隣接するゲームのソースを参照する。再取得によりソースが変わり得るので、比較時は事前のSHA-256を照合する。Workerは使用しない。
- Bootstrap部分は第三者の実例としてのオフライン評価資料であり、当フォークの作例や独自成果とは称しない。

## 製品価値への判断と次の課題

1. **未達:** 実ページから「verissでのみ発見してブラウザで再現し、修正後に反例が消えた」実例はまだ0件。既存のGrid NG→OKは、意図して作った製品デモであり実サイトでの発見実績ではない。
2. **最優先:** `E_CSS_SHORTHAND_CONFLICT` の判定・重大度を「実際に壊れる」表示と混同しない。一般的な上書きの正常例と意図しないミスの対照を3ブラウザで調べ、誤検知・有効検出を確定する。
3. **次点:** 3件の Unknown 主要因から、小さくても健全に証明できる局所モデル・入力準備の改善点を抽出する。ただし未対応を黙って成功にしない。
4. **使い始める導線:** 公開WebはHTML/CSSの直接入力と既存デモを維持。ファイル選択UIは不要との判断で撤去し、実ファイルはCLIから検査する。Cloudflare Workerは使わない。

本レポートは Phase 2 の **実UIデータ収集・実測段階** の完了記録であり、検出精度の製品価値実証が完了したことを意味しない。

## リリース受入（2026-11-22）

- 追加の固定入力・CLI再現3/3単体テスト成功。当時の新しい実UI観測9件と、後に撤去したWebファイル入力等9件は、Chromium / Firefox / WebKit で **18/18成功**（`node tools/gate-guarded.mjs --product-e2e`）。Chromeプロセス残留0。
- 全体の正式 `tools/gate.sh` は監督ランナーを通して **exit 0**、root + 5 package単体失敗0、既存component-lint評価の不変、3ブラウザE2E **549 passed**。`pnpm build:ts` / `pnpm check:ts` 成功。正式ゲートのE2E549件と新規個別18件は別実行（合算の全体ゲートではない）。
- fork mainの実装 `045f748`、静的配信 `gh-pages` の `fcd13ed`。GitHub Actionsは使用せず、<https://kikutadev.github.io/veriss/#live-check> の配信済みHTMLをローカルビルドとSHA-256照合。当時は実公開ブラウザでHTML/CSSファイル読込とNG→修正済みCSS、390px画面、実UI3件の結果表を確認した。その後、ファイル読込UIはユーザー指定で撤去した。Cloudflare Workerへの呼び出しコードは配信バンドルに存在しない。
- 完了したのはPhase 2の**実例収集・限定実測**である。ファイル選択UIは後続のユーザー判断で撤去した。実サイトでverissが新たな不具合を発見してNG→修正後OKにした実績は **0件のまま**。検査精度の価値実証およびPhase 3は未達。

## Phase2 負例：実ゲームの改変CSSで検出漏れを調査（2026-11-22）

- DUO瓦割りの**実際の初期HTMLとCSS**に、テスト限定で `#game-shell{width:700px!important;max-width:none!important}` を追記する（ゲーム本体は変更しない）。390×600pxで、元のゲームシェル幅は390pxだが改変後700pxとなる。横方向の操作・表示が欠損し得る明白な**意図的な破壊**であり、実際に配信中のゲームのバグではない。
- 同じ完全文書への静的 `analyzeHTML` は、元のCSSの `@import` や未対応規則等のため `Unknown`、幾何反例 `E_LAYOUT_*` は取得できない。当初は改変前後のエラー5件が全て `E_CSS_SHORTHAND_CONFLICT` だったが、正常な上書きのモデル化後は0件。**ゲームシェルの幅超過をまだ検出できない点は変わらない**。
- ブラウザでの負例は `e2e/layout-product-real-ui.spec.mts` に固定し、幅390pxでゲームシェルが390→700pxになることをChromium・Firefox・WebKitで照合する。**既存コードの部分幾何投影も**、headの非スタイルリンク、未閉包の `@import`、body overflow伝播などがある元入力では独立した矩形を作れない。これらはエンジンが根拠なしに値を補完しないためのUnknownである。
- **次の実装修正の条件**: CSSの読み込み閉包が成立している入力だけを対象に、実装から依存関係を独立投影できる要素を増やす。`@import`や祖先の overflow を単に削り落として `VERIFIED` にすることは禁止する。正常なCSSに対する幾何モデルの成立を先に確認し、その上で上記改変に対する反例の検算へ進む。

## Phase2 状態別の警告分類：ポートフォリオ About（2026-11-22）

- 取得済み `portfolio-about.html/css` の初期状態では、`#mobile-island-panel` に `inert` と `aria-hidden="true"` が付いている。この閉じた状態に `analyzeHTML` を適用すると `W_CSS_STATE_UNREACHABLE` が10件（フォーカス状態の警告）出る。
- 同じHTMLの**メニューの `inert` と `aria-hidden` を解除した明示的状態**を同じCSSで解析すると、上記10件は0件になる。両状態ともページ全体は `Unknown` のままで、CSS・DOMの完全証明を意味しない。
- 公開 <https://kikuta.dev/about/> を実ブラウザで操作して確認：初期は `inert=true` / `aria-hidden=true`、メニューボタン押下後は `inert=false` / `aria-hidden=false` / `aria-expanded=true`、リンクに `tabIndex=0`。初期DOMの警告を「開いてもフォーカスできない不具合」と読むのは誤り。
- **判断**：状態遷移を無視して警告を隠すのではなく、`closed` と `open` の**明示的なDOMスナップショット**を個別に評価する。JavaScriptのあらゆる到達状態を自動証明したとは主張しない。

## ファイル選択UI撤去後の公開受入（2026-11-22）

- ユーザー判断により、WebのHTML/CSSファイル選択と読込処理・専用E2Eを撤去した。ローカルファイルは既存のCLIで検証する。HTML/CSSの直接入力、NG→OKデモ、実UI3件のUnknownの表は維持。
- fork `main` のコード `beda8f9` は `pnpm build:ts`、`pnpm check:ts`、`tools/gate.sh` 監督ランナー**exit 0**。root・全5 package単体失敗0、既存component-lint eval差分なし、3ブラウザE2E **549 passed**。追加の実UIサンプル・ゲームシェル改変のE2Eは別実行でChromium/Firefox/WebKit **12/12 passed**、作業対象Chrome残留0。
- 公開は `gh-pages` `73900a5`。GitHub Pages build完了、配信HTMLはローカルビルドと SHA-256 一致。<https://kikutadev.github.io/veriss/#live-check> において、ファイル選択欄0件、NG=`VIOLATED` → 修正後=`VERIFIED` → 未対応=`UNKNOWN`、390px幅の横はみ出しなし、実UI3件の結果表を実ブラウザで確認。
- 残りは**実UIの有効な不具合発見・修正の再現**と閉包済みCSS・状態別契約の改善。今回の意図的なゲームCSS破壊とナビ状態別警告は診断上の限界を明らかにしたが、実サイト由来の不具合発見実績としては計上しない。

## Phase 2 検出精度修正（2026-11-22）

- 3件の実サイトに共通していた「広いCSSプロパティの後に、その一部を個別に指定する」正常なカスケードを再解釈し、`E_CSS_SHORTHAND_CONFLICT` の一律停止を撤廃。先行する他の宣言も上書きするケースは漏らさず再検査する。後続の個別指定が、前の一括指定の真部分集合であることを全6方向の書字モードで確認してから実際の値を解析し、不適合なCSSは引き続きUnknownにする。
- `margin-top` と `margin-inline` のように書字モードによってのみ重複する指定は確定エラーではないため、モデルが確定できない `U_LAYOUT_CSS` に分類。正常なCSSを誤って「破綻あり」と宣言しない。
- 標準的な `*,*::before,*::after{box-sizing:border-box}` だけを理由に、存在しない疑似要素の警告を大量に出すことをやめた。背景・位置・サイズを実際に指定し、`content` がない場合の警告は維持。Bootstrap公式サンプルでこの種のノイズ警告が25件減った。
- 3ブラウザで、5種類の上書き（border、padding、margin、`!important`）について実測値とverissの区間幾何証明を比較。追加の個別E2Eで3ブラウザそれぞれ成功。対応CSSのみ `Verified` とし、実ページ3件は `Unknown` を維持。
- 残る本質課題はJS状態の列挙や `@import` の閉包、ゲームシェル幅超過の部分幾何検出。ブラウザ実測は証明ではなく、実サイトのレイアウト破綻検出実績も現時点では0件。

### 精度改善の公開受入（2026-11-22）

- CSS shorthand refinement / 疑似要素リセットの修正は fork `main` `41561bc`、GitHub Pages `gh-pages` `5cca38e` に統合・公開。正規 `tools/gate.sh` は隔離ウォッチドッグ経由で **exit 0**、root / 5 package単体テストで fail 0、component-lint eval差分なし、既存3ブラウザE2E **549 passed**。実UIとCSSカスケードの追加個別E2E **18 passed**。
- 公開 <https://kikutadev.github.io/veriss/#real-ui> で最新の3件の診断件数を確認。配信HTMLはビルド済みの `_site/index.html` とSHA-256一致。`#live-check` の NG=`VIOLATED` → 修正後=`VERIFIED` → 未対応例=`UNKNOWN`、幅390pxで横はみ出しなし。ファイル選択UI、Cloudflare Workerともに存在しない。
- **残余:** 任意の実UI全体の証明は3件ともUnknown、実サイト由来のレイアウト破綻の発見実績は0。CSS読み込み閉包、コンポーネント状態の列挙、健全な部分幾何検証による検出範囲拡大が必要。

## Phase 2 閉じたCSSでの実ゲーム横方向検証（2026-11-22）

- DUO瓦割りの**初期HTML + 現物CSS**に含まれる1本のGoogle Fonts `@import` を、macOS上から直接取得した実CSSに置き換えた。固定したCSSは `tests/fixtures/product-real-ui/duo-game-title-fonts.css.gz`（生CSS SHA-256 `a33f5d8c227333f4c47e2e2f2929990877cc59026d288cd6ad4534bc75f3d3e6`）、取得URL・UA・gzipのSHAは隣の `.source.json`。取得した規則632件は**すべて `@font-face`**で、CSSルールを独断で削っていない。取得時点の応答に対する閉包であり、全ブラウザUA・将来のフォントサーバーの変更まで保証しない。フォント本体は保存していない。
- 元のCSSの `@import` が**未解決**のままなら `domGeometry` の検証は従来どおり **Unknown**。実際に取得・固定したCSSを渡した場合のみ、フォント幅に依存しない `#game-shell` の**横方向（inlineStart/inlineSize）**の条件付き証明が成立する。ページ全体や高さ、JS状態、クリッピング・ヒットテストをVerifiedにしない。
- 一般的な `width:100%; max-width:560px; margin:auto` の幅上限と自動余白の領域分割、`body{overflow:hidden}` がルートに伝播する場合の**overlayスクロールバー・floatなし・横方向限定**の保守的な投影、レンダリングに無関係な `link rel=icon` の扱いを改善。その他の外部スタイルシート・未対応書字方向・classicスクロールバー・曖昧な祖先は拒否する。
- 正常版では指定された320〜1280px全幅に対する右端 `inlineEnd <= viewport` が **Verified**。`#game-shell{width:700px!important;max-width:none!important}` を追加した**テスト用破壊版**は同じ検査で **Violated**。390pxの実ブラウザで元の390px幅→破壊版700px幅を確認。これは修正済みの実バグではなく、明示的に挿入した負例である。
- Chromium / Firefox / WebKit で、正常版7幅×2高さ、改変版6幅×2高さの矩形を証明済み領域のアフィン式と比較し、**全点一致**。別のgeneric block例4種類×6幅×2高さも3ブラウザで一致。`e2e/layout-product-real-ui.spec.mts` と `e2e/layout-partial-geometry.spec.mts` に再実行可能なテストを追加。
- **製品価値の現在地**: 実ゲームの現物HTML/CSSと固定したCSS読み込み閉包を使えば、横方向だけでも意図的な破壊を静的に発見できるようになった。ただし **実サイト由来の未知バグ検出実績は依然0件**。次は依存関係の入力整備とJS状態別契約に進める。

### CSS閉包の部分証明：正式ゲート・公開受入（2026-11-22）

- 実装はfork `main` `5508568`、静的Pagesは `gh-pages` `5f4953c` に公開済み。`pnpm build:ts` / `pnpm check:ts` 成功、公式 `tools/gate.sh`（監督起動）exit=0、rootと全5パッケージunit fail=0、既存3ブラウザE2E **552 passed**（従来549件+部分幾何の新規3件）。実UI3ブラウザ個別 **21 passed** は別実行である。Chrome残留なし。
- GitHub Pagesの公開ビルドは`_site/index.html`とSHA-256一致。<https://kikutadev.github.io/veriss/#real-ui> で、Bootstrap公式サンプルと部分幾何実証の文言、NG→OK→Unknown、390pxの横はみ出しなし、ファイルアップロード・Workerなしを実ブラウザで確認。新しい操作UIは作っていない。
- 全3サイトのページ全体はUnknownを維持。DUOのCSS読込依存を固定した場合だけ横方向の契約が成立するという区別を厳守。実サイトの未知不具合を発見した数は依然0件。
