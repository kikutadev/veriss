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

## Phase 2b: ログイン後の第三者Webアプリ2件（2026-11-22）

### 検証対象・入力状態

| アプリ | 出所 | 認証方法 | 実際に操作した状態 |
| --- | --- | --- | --- |
| [RBAC管理画面](https://jorgeariosg.github.io/react-admin-rbac/) | [公開ソース](https://github.com/JorgeARiosG/react-admin-rbac) | READMEで公開された**デモアカウント**のみ | login → dashboard → メニュー開閉 → Users一覧、閉じたメニューからTabを6回 |
| [React-admin公式デモ](https://marmelab.com/react-admin-demo/) | [公開ソース](https://github.com/marmelab/react-admin/tree/master/examples/demo) | 画面に表示される **demo/demo** | login → dashboard → メニュー開閉 → Orders一覧 → dashboard、閉じたメニューからTabを6回 |

両サイトはWebアプリであり、**ログイン後の描画済みDOM**を Chromium / Firefox / WebKit の各320・390・768・1280px（高さ844px）で計測した。実行手順は `node tools/gate-guarded.mjs --external-e2e`（別設定 `playwright.external.config.mts`）。サンプル用の公開認証情報だけを使用し、任意の本物アカウント・Cookie・セッショントークン・利用者データは取得/保存しない。外部デモの公開状態とネットワークに依存するため、**通常のオフラインrelease gateには含めない**。

### 確認できたこと（ブラウザ観測であり全幅証明ではない）

- **RBAC / 閉じたモバイルメニュー:** メニューの外側の操作からTabキーで進むと、`aside` が左へ完全退避しているにもかかわらず、その内部リンクやボタンへフォーカスが移る。390pxで Chromium 4件、Firefox 4件、WebKit 2件（先頭6回のTabだけを計測）。メニューが画面外にある**こと自体は不具合ではない**が、見えない操作へのキーボード到達は再現した。メニューを開いてUsers一覧へ移動できることも実操作で確認。
- **React-admin / Orders一覧:** 320px幅で `main` の横幅がおよそ**334.36px**、document rootのscrollWidthがおよそ**334px**となり、ページ単位で約14pxはみ出す。Chromium・Firefox・WebKitすべてで確認。主な越境要素は `.RaList-actions` と内部のフィルターフォーム。テーブル内部での**意図的な横スクロールだけ**をページ全体の破綻と数えないよう、`documentElement.scrollWidth` と `main.getBoundingClientRect()` を分けて採取した。
- **対照:** RBACのダッシュボード初期表示は各幅でrootの横はみ出しがなく、React-adminの閉じたメニューからの最初の6回のTabでも画面外フォーカスは検出されなかった。画面幅390/1280ではReact-admin Ordersの約14px越境は再現しない。RBAC Users一覧では描画/読み込み状況によって追加のページ横越境も観測されたが、その幅・再現安定性は今後再評価する。
- `verifyUI`に手動で宣言した `login/dashboard/drawer-open/list` の状態グラフ、各画面の実測 `main` と `document-scroll-extent`、キーボード操作の成功/失敗を観測として入力した。**どちらも全幅の静的 `status=unknown` を維持**しながら、実測不一致を `observationStatus=failed` として報告。RBACは `keyboard-focus-visible`、React-adminは `main-horizontal-fit` と `document-width-fit` が失敗（他の幅・状態は対照として保持）。これは描画後の実測に対する失敗判定であり、CSS・JS実装から保証付きで自動導出した反例ではない。

### 製品上の意味と未対応

**実ブラウザでログイン済みUIの不具合候補を見つけ、状態別のveriss観測契約に渡す経路**を再現可能にした。現時点では「既存デモの無断変更なしに、宣言した状態と画面幅の観測を比較できる」まで。サンプル点から全幅の静的Verifiedを導くこと、実装からすべての状態・遷移を自動推論すること、認証済みセッションの安全なスナップショットを閉じたCSSモデルにすることは**未実装**。E2Eが6件成功したことは第三者アプリが6件合格だったという意味ではなく、上記の検出と対照が再現できたという意味である。

### Phase 2c: WebアプリE2Eへの再利用可能な観測API（2026-11-23）

- `packages/adapter-core/src/browser-observations.mts` にPlaywrightの実装を依存関係へ加えず、`captureViewport`、`captureClosedScopeTabFocus` と型・純粋な観測変換関数を公開した。既存のPlaywright Pageを渡し、すでに認証・操作された**その場のDOM**からデータを得る。自動ログイン、任意URL取得、Cloudflare Worker、HTML/CSSのWebアップロードは加えていない。
- 取得するのはdocumentの `scrollWidth`、選んだ `main` の矩形、横はみ出し候補の*タグ名＋DOM上の位置*（属性値/本文なし）、閉じたスコープへのTabフォーカスの矩形のみ。フォーム値、Cookie、セッション、トークン、全文HTMLは保持しない。アプリ側の状態待機・ログイン操作は呼び出し側が責任を持つ。
- 同じ2公開デモの外部E2Eを新API利用へ切替え、3ブラウザで**6件成功**。RBACの画面外フォーカスとReact-admin Ordersの320px越境を維持して検出。アプリ側の描画タイミングによる追加の越境数値変化は固定の断定をしない。
- 新規のオフライン3ブラウザE2E `layout-browser-observations.spec.mts` で、**意図的な内部横スクロールはページ越境ではない／見えないフォーカスを検出／閉じたdrawerをinert化すると観測失敗が消える／320px画面に334px mainを置くと観測失敗／正しい幅へ戻すと観測成功**、を全エンジンで検証。単体テストでは実測失敗後でも静的全幅の`status`がUnknownから昇格しないことを確認。
- [READMEのコピー可能な使い方](../README.md#check-an-authenticated-web-app-from-an-existing-playwright-test) にPlaywright上でのstate/contract/observationの接続例を追加。

### Phase 2c 公開・導入受入（2026-11-23）

- 共通observer実装はfork `main` `b8ba7ac`、公開デモはGitHub Pages `gh-pages` `12dfb00` に統合。正式 `tools/gate.sh`（`tools/gate-guarded.mjs`で隔離実行）は **exit 0**、全package unit fail 0、既存3ブラウザE2E **552 passed**。新規observerの独立オフラインE2E **3 passed**、第三者ログイン済みWebアプリの外部E2E **6 passed** はそれぞれ別実行であり、正式552件に含めていない。
- 公開 <https://kikutadev.github.io/veriss/#real-ui> は静的ビルド `_site/index.html` とSHA-256一致。実ブラウザでログイン後UI結果表、共通observerの導入文書リンク、NG→OK→Unknown切替、390px横はみ出しなし、不要なファイル入力/Worker未復活を確認。
- 本体/adapter-coreをtarball化して別の空プロジェクトへインストールし、公開APIと`verifyUI`の観測失敗/静的Unknownを確認。さらに、**フォークのGitコミット `b8ba7ac` から両パッケージを別プロジェクトへ直接インストール**し、同じ結果を確認。Webサイトで認証処理を実行したり、入力を取得するWorkerを増設したりはしていない。
- 残余: React/Vue等の実装からの完全な状態列挙やJS/CSS閉包を静的に自動導出する機能は未実装。ログイン済みE2Eを利用する観測APIは実際に機能するが、それだけで全幅・全状態をVerifiedとは主張しない。

### Phase 2d: ログイン後モーダルとフォーカス漏れの対照（2026-11-23）

- React-admin公式デモで**実際にログイン後のOrders一覧**を開き、Add filter → Save current queryを操作すると `role=dialog` / `aria-modal=true` のモーダルが表示される。保存はせずCancelで閉じる。`captureModalTabFocus`を追加して、320/390/768px幅の各8回Tab（Chromium/Firefox/WebKit）で**背面へのフォーカス漏れなし**を確認した。これは「問題発見」ではなく正常な対照例である。
- 同じ検査を使い、`aria-modal=true` だけを付けたフォーカス非制御の模擬モーダルは背面のボタンへフォーカスが漏れるため**観測失敗**、フォーカスを内部で循環させる対照は**観測成功**（3ブラウザ）。どちらも静的全幅の証明 `status=unknown`、観測のみの失敗/成功を独立扱い。
- native `<dialog>` では、ブラウザによりTab途中のactiveElementが `body` へ一時的に移る場合がある。背景の操作可能要素への移動と区別できない曖昧なサンプルを確定違反にしないよう、`body`/`html`の場合は**不確定で検査を拒否**する。実際の背景ボタンへの移動は引き続き失敗になる。非modal・非表示のダイアログも測定成功扱いしない。
- 実サイト固有のDOMテキストやフォーム値を保存・送信しない。Playwright既存セッション利用、保存/変更API呼び出しなし。アプリ実装からの全状態自動列挙は引き続き未対応。

### Phase 2d 公開受入（2026-11-23）

- fork `main` の実装 `14a8e85`、公開Pages `98ad6ef`。正式 `tools/gate.sh`（`tools/gate-guarded.mjs`経由）**exit 0**、root/5パッケージ単体テスト fail 0、既存Chromium/Firefox/WebKit回帰E2E **552 passed**。追加オフラインの状態観測 **6 passed**、第三者ログイン済みWebアプリ **6 passed** は正式ゲートとは**別実行**。React-adminの実モーダル9測定点すべてでTabの背面漏れ0、保存操作なし。
- `@mizchi/veriss-adapter-core` のモーダル観測APIはパッケージ化して別プロジェクトから呼び出し成功。フォークのGitコミット `14a8e85` からveriss本体+adapter-coreを外部空プロジェクトへ直接インストールした場合も、正常/違反を区別できることを確認。
- <https://kikutadev.github.io/veriss/#real-ui> で追加のモーダル対照説明、既存2サイトのログイン後UI実測表、NG→OK→Unknown、390pxの横はみ出しなし、不要なファイル選択/Worker機能の未復活を実ブラウザで確認。配信HTMLはビルド済み`_site/index.html`とSHA-256一致。
- **残余:** 実サイトに元からある未知のモーダル不具合を検出したとの主張ではない。React-adminのモーダルは正常対照であり、人工的な背景フォーカス漏れは負例。全状態・全幅の静的証明は未完了（Unknown）。

### Phase 2e: RBAC管理画面の権限別UIと対照（2026-11-23）

- 公開デモのUsers画面へ**Admin / Manager / Viewer**それぞれでログインし、390px/1280px × Chromium/Firefox/WebKitの18測定点で観測。表示ページの8人分を対象に `Edit` と `Suspend` / `Reactivate` のネイティブボタン状態を比較した。Admin: Edit **8/8有効**、Status **7/8有効・1件無効**（自分自身への停止を避けるUI例外）。ManagerとViewer: Edit **0/8有効**、Status **0/8有効**。ブラウザ上でdisabledボタンがフォーカスを受け付けないことも検算した。
- `captureControlAvailability` / `controlAvailabilityObservation` を`@mizchi/veriss-adapter-core`へ追加。既存Playwrightのログイン後ページから、開発者が指定したセレクタに対し `all-enabled` / `some-enabled` / `all-blocked` の期待を宣言。matched/enabled/blocked/uncertain の**件数とグループIDのみ**返し、DOMテキスト・属性値・個人情報を収集しない。`verifyUI` action観測では期待外のUI操作可能性を失敗として扱い、静的全状態 `status=unknown` は維持。
- 3ブラウザのオフラインE2Eで、disabled/inertの正常例、閲覧専用の編集ボタンが有効になる反例、`aria-disabled`のみ・セレクタに要素がない場合の不確定を検査。**UIの有効状態とサーバの認可は別問題**であり、APIの権限チェックや変更操作の送信は検査していない。

### Phase 2e 公開受入（2026-11-23）

- 実装はfork `main` `98795c2`、公開GitHub Pagesは `gh-pages` `4f53fe5`。`node tools/gate-guarded.mjs`の正式ゲート **exit 0**、rootと全5パッケージunit fail0、既存Chromium/Firefox/WebKit必須E2E **552 passed**。新しい権限テストを含む外部ログイン済みアプリE2E **15 passed** と、オフライン対照E2E **9 passed** は別実行で、正式552件とは混同しない。
- Pagesの公開HTMLは同じ`_site/index.html`とSHA-256一致。<https://kikutadev.github.io/veriss/#real-ui> でAdmin/Manager/Viewer比較、既存のNG→OK→Unknownデモ、390px横はみ出しなし、ファイルアップロード/Worker未復活を実ブラウザで確認。第三者サイト側データの更新は行っていない。
- 本体とadapter-coreのtarballを空の別プロジェクトにインストールしてAPIが読み込めることを確認。さらに**Gitコミット `98795c2` を指定した両パッケージ**を別の空プロジェクトへ導入し、`captureControlAvailability`、正常の観測通過／違反の観測失敗、静的 `status=unknown` を確認。
- 未対応: 本番のサーバ認可、JS/DOMの全遷移の自動導出、すべての画面幅・権限状態の静的な証明。ユーザーの既存Playwrightテストに埋め込んだ範囲でのフロントエンド実測に限定する。


### Phase 2f P0: 実測をPlaywrightの直接assertionへ整理（2026-11-23）

- Phase2eで追加した `captureControlAvailability` はP0で撤去。ログイン後の公開RBACデモにおけるAdmin「全員編集可能・本人停止不可」、Manager/Viewer「編集/状態変更不可」を、**8人それぞれの対象に対して**Playwrightで検査する。件数のみの緩い `some-enabled` 条件では、別人の停止が誤って無効化されても検知できなかったため変更。
- モーダル/閉じたdrawerのTab操作は `captureModalTabFocus` / `captureClosedScopeTabFocus` の直接 `passed` をassertし、actionの擬似自己遷移は削除。root/mainの**幾何の点観測**は既存 `verifyUI` に渡すが、静的な `status=unknown` は維持。以前のPhase2e記録は当時の経緯であり、現行SDKの仕様はREADMEとADR-0021を参照。
