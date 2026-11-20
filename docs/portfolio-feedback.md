# 実サイトでの改善ループ

目的: 配信済みの HTML/CSS に対する解析の適用性を改善する。kikuta.dev の HOME/ABOUT/WORKS/ARTICLES/GALLERY を同じ入力で比較し、Unknown の原因を最小再現へ切り出す。Unknown を隠したり、実サイトを検証器に合わせて変更しない。

順序: HTML 文書のコメント、圧縮 CSS の小数表記、リンク属性、次にレスポンシブ寸法と厳格 shorthand policy の扱いを検討する。各修正は Red→Green の回帰テストを付け、必要なブラウザ照合と gate を通したものだけ push する。実サイトで再計測し、残りを優先付けする。upstream への PR は別途判断する。

## 現時点の結果（2026-11-20）

同じ取得済み HTML/CSS を、upstream `51dbd0a` と fork `ec4b09a` で比較した。数値は Unknown 診断の発生件数であり、検証成功件数ではない。

| ページ | upstream | 前回の fork | 同一プロファイル | scripting enabled |
| --- | ---: | ---: | ---: | ---: |
| HOME | 154 | 98 | 76 | 64 |
| ABOUT | 106 | 52 | 52 | 50 |
| WORKS | 104 | 52 | 52 | 50 |
| ARTICLES | 152 | 100 | 52 | 50 |
| GALLERY | exception | 38 | 37 | 37 |
| 主要4ページ計 | 516 | 302 | 232 | 214 |

同条件で 55.0% 減、明示的に JS 有効を選ぶ場合は 58.5% 減。GALLERY の例外は解消。全ページの証明は未達（checks 0、Unknown のまま）。JS 有効の静的 DOM では noscript の非表示をモデル化するが、実行時の DOM 変化や JS 無効状態は証明しない。

対応: 生成 HTML の文書コメント、圧縮 CSS の一部小数表記、限定したリンク rel、物理方向 border shorthand、time/datetime、img/fetchpriority、明示的な scripting プロファイルと noscript。コード `ec4b09a` の全 gate は成功: 6 テスト群 fail=0、component-lint 4 評価に差分なし、Chromium/Firefox/WebKit の E2E 324 passed（新規実サイト由来 6 件を含む）。

## 再現手順

portfolio の `scripts/verify-veriss.mjs` で `--capture` を一度実行し、以後は同じ `--snapshot` と `--compare` で比較する。各入力の SHA-256 と解析プロファイルを記録し、反復診断は `unknownGroups` に集約する。portfolio の `veriss-audit` ブランチに手順・スクリプトを保存した。Mac の gate は `scripts/verify-veriss-gate.py` の専用一時ホーム・プロファイルとプロセス監督を使用する。サイト公開コードは変更しない。

## 残る論点

- padding/margin の clamp は定数専用の経路を含むため、既存の区分的寸法モデルへの接続と境界値照合が必要。
- hover 子孫、nth-child 子孫、View Transition は、状態・適用範囲を正確に表現する必要がある。単純に未知診断を抑制しない。
- CSS shorthand の厳格ポリシーは未変更。GALLERY の外部フォント CSS や br を含むテキスト流し込みも未対応。意味のある部分証明と対象範囲の明示を優先する。

この段階のリリース条件は既存 gate の成功、同入力での再計測、回帰テスト、fork への push。全 CSS 対応・全ページの証明達成とは区別する。upstream に PR を提出するかは別途判断する。

### ブラウザゲームへの適用

目的: UIが完成に近いゲームのHTML/CSSで、検査器の不足を再現し、一般化できる修正をテストする。ゲーム本体や公開先は変更しない。未対応を成功に変えない。まず圧縮された複合media queryを修正し、同じビルド入力で再計測する。次に環境依存の寸法、描画効果、局所的な契約を検討する。

同一入力・同一解析条件の比較 (2026-11-20、基準 51188a6、修正 fde8ecf)。viewport は幅320–1920、高さ320–1080 CSS px、scripting enabled、integrity/accessibility 有効。ビルド済み HTML 2件、実行後の DOM 1件。外部 CSS の取得は行わない。未指定/全辺0/上47・下34pxの仮定の3 safeArea プロファイルで診断件数は同じ。

| 入力 | Unknown 前→後 | error 前→後 | checks |
| --- | ---: | ---: | ---: |
| 潮界防衛 (静的) | 34→23 | 1→2 | 0 |
| 墨ノ太刀 (静的) | 56→56 | 3→3 | 0 |
| また村人から。 (WebKit 390×844 の初期描画DOM) | 25→25 | 1→1 | 0 |

潮界防衛の複合 query の Unknown 7→1、safe-area-inset を含む診断 6→1。新たに解析した規則から padding-bottom と padding-inline の厳格 shorthand conflict が出た。これは CSS の実害を証明した結果ではない。3件すべてページ全体の証明は未達。会社経営は UI 未完成のため除外。

修正: 閉じ括弧の直後の and + 空白を認識する。and( を誤って許可しない。calc の非負 px と safe-area-inset の和を限定的に計算する。未定義の inset は従来どおり Unknown。関連単体テスト 127/127、3ブラウザー境界値照合 3/3 成功。全 gate の完了結果は未確認なので push しない。

次: max(vw, calc(px + env(...))) と入力デバイス条件、装飾 CSS を含むページの検証範囲分離。安全に局所的な契約を検証できる範囲を決める。ゲーム本体を検査器に合わせて改変しない。

実行後の DOM に対する追加確認: WebKit・390×844 のローカルビルドを外部通信なしで起動。潮界防衛はタイトル (254要素) と技術開発 (318要素) で、共に Unknown 23/エラー2/checks 0、ページ例外なし。「また村人から。」は冒険準備 (52要素) と冒険開始 (28要素) を別スナップショットとして検査し、共に Unknown 25/checks 0。状態の収集・解析はできたが、全状態/全 viewport の証明はできていない。後者は別ブランチの snapshot API を利用した試験であり、現時点の portfolio-feedback 自体には含まれない。

リリースゲート: 2026-11-20、6単体テスト群すべて fail=0、component-lint の4評価に変更なし、Chromium/Firefox/WebKit 327 E2E passed。監督ランナー exit=0、606 PID 追跡・残留0。今回の修正範囲を fork main に統合する。未判定領域の全解消や全ゲーム状態の証明を完了条件とはしない。

### 状態別スナップショットとゲーム契約の統合

状態別の HTML/CSS 検証 CLI/API、幅・高さ両軸の矩形契約（within-viewport / contains / disjoint / data-noshift）、明示した文字寸法・フォント契約、未判定時の終了コードを追加。全 gate 成功（6単体群 fail=0、component-lint 4評価不変、3ブラウザー330 E2E passed、監督ランナー exit=0・残留0）。gate 開始後のソース差分なし。

潮界防衛の WebKit 実 DOM で home / tech の2状態を captureSnapshot で収集し、開始ボタンの画面内収容、開始・技術開発ボタンの非重複、技術開発ダイアログと末尾のホームに戻るボタンの包含・画面内収容を API に渡した。4契約とも全体モデルが未構築のため Unknown。別途 WebKit の幅×高さ 320×568、390×844、650×510、651×510、844×390、1920×1080 で実矩形を照合すると home の2条件は全6点で成立。末尾の戻るボタンは5点で初期表示領域外だが dialog は overflow:auto、320×568 でもスクロール後のクリックで閉じられた。上部に別の閉じるボタンも存在する。この2契約は初期表示の要件として妥当でなく、ゲームの不具合とは断定しない。次の課題は局所モデルの健全な独立化と、スクロール到達性・固定操作ボタンの契約の区別。ゲーム本体に変更なし。

### Game UI model v1 による実ゲーム評価

設計・意味・API: [game-ui-model.md](game-ui-model.md), [ADR-0018](adr/0018-game-ui-model.md)。
2026-11-20、`tools/eval-game-ui.mjs ../game/voxel-tide-defense/dist` を独立 QA 監督下で実行。
WebKit、外部通信を遮断した HTTPS の local route、DPR 1・inset 0、各 viewport は新規 context。
対象は home → tech → home → prepare → pause → prepare → combat の抽象部分グラフ。
viewport 幅320–1920、高さ320–1080 を契約の証明範囲とし、実測は6点（全JS状態を列挙したわけではない）。
画面遷移後に scene アニメーションの終了を確認する。HTTP では crypto.randomUUID が使えず
防衛開始に失敗したので、 secure context の HTTPS へ直して再検証した。外部フォントは取得していない。

14契約: 条件付き verified 1、条件付き violated 1、Unknown 12（うち6件は action のため静的証明対象外）。
6操作×6画面サイズ = 36/36 到達観測成功。矩形の点観測は初期画面の開始ボタン・技術開発ボタン、
技術ダイアログ、準備画面の操作ボタン、Canvas を比較した。
全ページCSS は kbd 等の未対応により依然 Unknown。一方、ビルドCSSの field 100% / min-height:400px、
#scene inset:0、canvas 100% と renderer の mount 寸法契約に基づく独立 scene model は、
field に Canvas が収まることを全指定範囲で条件付き証明した（prepare/combat、12点観測一致）。
Canvas が viewport に収まることは height<400 の条件で違反、数理反例 1120×360px。
844×390px の実測では field/canvas 高さ400px、開始ボタン下端394px（初期表示4px超過）。
ただし開始ボタンの操作に成功しており、全く操作できない不具合ではない。
scene 証拠は実装CSSからの独立した限定モデルであり、CSS の全カスケードの完全性や3D内容の証明ではない。

| viewport | 下部 HUD 2矩形の占有率（field 基準） | 開始ボタン初期収容 | 操作6件 |
|---|---:|---|---:|
| 320×568 | 22.71% | pass | 6 |
| 390×844 | 15.79% | pass | 6 |
| 650×510 | 23.57% | pass | 6 |
| 651×510 | 15.02% | pass | 6 |
| 844×390 | 19.91% | fail | 6 |
| 1920×1080 | 4.22% | pass | 6 |

HUD の1/3は仮の評価契約で、ユーザー合意済みの製品仕様ではない。全HUD・視覚的な遮蔽も測っていない。
準備/戦闘画面での canvas containment の数学的結果に根拠があっても、
他の契約と実測の違反は独立に残る。この結果をゲーム全体の証明成功としない。
ゲーム本体・本番公開先への変更なし。

リリースゲート結果: 6単体群 fail=0、既存 component-lint 4評価不変、
Chromium / Firefox / WebKit 333 E2E passed、監督ランナー exit=0、605 PID追跡・残留0。
ゲート開始後は実ゲーム評価ツール・文書のみ追加し、リリースゲート対象ソースは変更していない。
追加の決定論的な矩形モデル照合180件（verified 146、violated 34）で、
違反34件の witness の独立面積計算と、verified 146件の計64,386点サンプリングに不一致なし。
サンプリングは補助検査であり、連続領域の証明の代用ではない。

### 残り2作品の局所モデル評価

目的: Game UI model v1 の独立幾何証拠を墨ノ太刀の戦闘操作と「また村人から。」の初期冒険画面に適用し、実装由来の条件付き証明、実測、未検査を区別する。既存配信コードは変更しない。既知のビルドCSSハッシュで局所式を固定し、異なるCSSは拒否する。境界値を含む複数viewportで操作と矩形を照合し、再実行スクリプトを保存する。実測と局所式の不一致は隠さない。既存のライブラリ・ゲート対象の差分がないことを確認した上で、検証記録とスクリプトを統合する。

実行結果（2026-11-20、base 97c5a3f）:
`tools/eval-game-ui-remaining.mjs sumi-no-tachi|rpgsim [dist]` を既存の QA supervisor 下で実行する。
対象ビルドの CSS SHA-256 と実ロード順が一致する場合だけ、レビュー済みの区分アフィン式を利用する。
両作品共 WebKit、DPR 1、overlay、safeArea 0、外部通信なし、viewport 320–1920 × 320–1080 CSS px。
実測は境界点を含む墨ノ太刀10点・また村人から。8点、各3状態（初期画面、プレイ/冒険開始、ポーズ）。
契約の保証は指定された抽象状態・CSS・独立モデルの前提に限る。点観測は前提の全面的な証明ではない。

| 作品 | verified | violated | unknown | 幾何照合 | 操作到達 |
|---|---:|---:|---:|---:|---:|
| 墨ノ太刀 | 13 | 1 | 3 | 140/140 | 30/30 |
| また村人から。 | 5 | 0 | 5 | 80/80 | 24/24 |

墨ノ太刀: Canvas 2枚の game 内収容、pause 端点での画面安定、pad/slash/dodge/iai の viewport 内収容と44px最小寸法、移動パッドと攻撃操作群の分離、4つの操作矩形の HUD 占有率1/3以下を条件付き証明。
slash/iai の外接矩形分離は violated（反例330×390、10実測点でも重なり）。320×568では slash (226,458,82,82)、iai (247,412,56,56)。
円形等の描画・実ヒット領域を判定した結果ではなく、実際の操作干渉を断定しない。
また村人から。: shell の viewport 内収容、toolbar の shell 内収容、初期冒険 canvas の stage 内収容、toolbar と stage の分離、pause端点の canvas 安定を条件付き証明。
pause/skip の非重複は実測16/16成立・形式証明 Unknown。pause の44px実験契約は実測16/16不成立（30×34px）・形式証明 Unknown。44px と HUD 占有率は評価用の仮条件であり製品要件とはしない。
操作はいずれも開始、ポーズ、再開を実行し全54件成功。action の静的証明は対象外。ゲーム全体の DOM/CSS、全状態、任意のビルドの自動分離は未証明。

最終版の両評価スクリプト exit=0（評価の実行成功であり契約違反がないという意味ではない）、QA supervisor 残留0。game-ui 単体7件再実行成功。base 97c5a3f の全 gate（6群、eval 4回、3ブラウザー333件）は変更のない対象ソースに対する結果を採用し、今回の追加評価コードは実ゲーム再実行で検証した。ゲーム本体の変更なし。

### Portfolio layout coverage (2026-11-20)

フォークの 97c5a3f を基準に、viewport-fixed の純粋な translation の画面収容を描画座標で判定するよう修正。元の layout 座標は保持する。完全に左へ退避したドロワーと visibility:hidden は従来の配置義務を保持し、フォーカスの問題はアクセシビリティ検査へ委ねる。初回 gate で発生した drawer 評価3件の差を再現して修正し、評価を変更せず解消した。rotate(0) と固定 viewport 条件の row flex-basis の svh/lvh/dvh 等も追加。ブラウザーのツールバーの動的変化は仮定の外。

同じ入力・scripting enabled の全ページ再検査 (a09df13): HOME 63→62、ABOUT 49→48、WORKS 49→48、ARTICLES 49→48、GALLERY 36→35 Unknown。全ページ status=unknown / checks=0。CSS shorthand conflict は4/3/3/3/8件で変化なし。padding/gap の可変 clamp、状態を持つ祖先セレクター、View Transition、外部フォント・描画機能等は未対応。全ページ証明の成功とは扱わない。

別途、実入力4件の HTML/CSS SHA-256 を固定し、ナビゲーション外枠の横方向だけを独立モデル化。`portfolio/scripts/verify-veriss-island.mjs` (portfolio の veriss-audit ブランチ b21f46e) で再現する。実行: portfolio で `python3 scripts/verify-veriss-gate.py 120 node scripts/verify-veriss-island.mjs --snapshot qa/evidence/veriss-trial --live`。スナップショットは以前の捕捉済み入力を利用、変更時は再レビュー必須（改変入力の拒否を実測）。CSS 原本から規則を抽出し、幅320–1920、高さ320–1080、固定 containing block=viewport、scrollbar gutter=0、左右 safe area=0、可視の開閉2状態を前提とする。高さ2px・内容空の横方向投影であり、元の高さや内部レイアウトを証明したものではない。

| 対象 | 結果 |
| --- | --- |
| 4ページ×開閉2状態 | 8/8 Z3 UNSAT (条件付き verified)、計356 enforced/non-enforced checks |
| 3ブラウザー×4ページ×9幅×3高さ×2状態の原CSS・原DOM | 648/648 横方向一致、同じ点で縦方向外枠収容も648/648 |
| 本番JSの実操作 (第三者通信のみQA側で遮断、reduced motion、HOME は Works へスクロール) | 3ブラウザー×4ページ×4幅×2状態=96/96 寸法一致、Escapeで閉じる |
| transform を外した対照 | 4/4 SMT witness、12/12 実ブラウザーの右側はみ出し |

結果は証拠ディレクトリの island-proof.json と coverage-final.json に保存。本番サイト変更なし。連続領域の縦方向・内側の配置・アニメーション途中・全状態・全ページ CSS の証明は未達。

最終 gate (a09df13): 6単体テスト群 fail=0、component-lint 4評価不変、Chromium/Firefox/WebKit 339 E2E passed、監督ランナー exit=0、619 PID追跡・残留0。ゲート対象のソースが同一であることを確認して並行作業の main へ統合する。

後続: 汎用 UI の relational/1 に移行した。ゲームは利用例の一つであり契約本体の仕様は [layout-contract-ir.md](layout-contract-ir.md#relational1-汎用-ui-関係述語)。旧 game-ui API の実装経緯と評価は上記の履歴として残す。

### 自動部分証拠の導入

目標: 手書きの矩形式を要求せず、完全な HTML snapshot と author CSS の依存関係を検査し、独立した明示サイズの矩形だけを自動抽出して relational/1 の証拠へ接続する。元の全ページ判定は変更しない。セレクター・継承・含有ブロック・内容依存・外部 CSS・環境の不明な依存は拒否する。正常/反例/拒否の unit と3ブラウザー照合、実入力での評価、再実行 CLI、gate と fork main への統合を完了条件とする。無制限の CSS の自動分割は保証しない。

### Responsive gap model (継続)
目標は実CSSの幅依存の余白・グリッドの連続範囲解析を前進させること。まず gap の区分アフィン化を grid/flex の既存解法へ接続し、幅と高さの分岐及び overflow 反例を3ブラウザーで照合する。次に同一HTML/CSSを再測定する。全ページの Unknown は未対応を無視せず残す。既存ゲートと fork main 統合を完了条件とする。

### Responsive gap and padding (2026-11-20)
- Tested revision `b4d04c0`: viewport-dependent gap and supported block padding use exact piecewise-affine geometry. Explicit grid tracks, flex wrapping and nested block/grid are tested. Variable subgrid / auto-repeat gaps, flexible-item / native intrinsic / positioned padding and percentage expressions remain Unknown where not modeled.
- Same reviewed inputs and prior width-only scripting profile: Unknown 241 -> 175 (HOME 62 -> 43, ABOUT/WORKS/ARTICLES each 48 -> 33, GALLERY 35 -> 33). All five full-page reports remain Unknown with zero geometric checks. Full width/height + overlay/classic scrollbar profiles remain Unknown too; diagnostic counts are repeated per profile. Do not interpret the reduced count as proof.
- Portfolio audit branch `f2b415a`: reviewed HOME grid horizontal projection, 795 checks, Z3 verified, 264 configurations / 2640 horizontal rectangles (234 captured and 30 live configurations) matched across 3 engines. Broken three-column track control exceeded viewport at 320px in all 3 engines and Z3 reported violated. The model uses synthetic vertical content; the proof covers horizontal outer geometry only.
- Separate live page audit: 5 paths × 22 widths × 3 heights × 2 states × 3 engines = 1980/1980 sampled checks, no failures; reduced motion and third-party requests blocked, first gallery detail only. Checks document/main horizontal overflow, visible island bounds, viewer visibility and close control, Escape closing. One initial test race following Escape was corrected and all points rerun. This is not continuous-size, all-state or complete accessibility proof.
- Strict full-page runner exits 1 on Unknown; a small known-good fixture confirms exit 0 and Z3 verified across all 5 inputs. No deployed site changes.
- Gate on `b4d04c0`: 6 unit groups failure 0, component-lint 4 runs unchanged, 348 E2E passed, supervisor exit 0 / 645 observed processes / remaining 0.
- Whole-page blockers remaining include ancestor state selectors, View Transition pseudo-elements, preference-dependent geometry, SVG / paint effects, variable margins, external stylesheet/font data and native/mixed-content geometry. Full static verification is not complete.

### 自動部分幾何の実入力評価 (2026-11-20)

`domGeometry` の自動縮約を relational/1 に接続。元の全ページの Unknown を変更せず、手書きの矩形式なしで、閉じた snapshot/CSS から独立した矩形を計算する。条件・対応外の理由は [layout-contract-ir.md](layout-contract-ir.md#自動部分幾何-independent-rectangle-projection) に記載。 `tools/eval-ui-build.mjs` と `tools/ui-build-examples/` の JSON は、他のビルドでも手計算無しで再実行できる。実際の対象・状態・契約は呼び出し側の要求として指定する。

統合版 70176a6 の WebKit 4点/状態 (幅320–1920、高さ320–1080、DPR 1、overlay・safe area 0、ローカルビルド、外部通信無し) の結果:

| 入力 | 条件付き verified / Unknown | 自動矩形と実測の比較 | 操作実測 |
| --- | --- | --- | --- |
| 墨ノ太刀 title/play/paused | 6 / 7 | 24/24 | 8/8 |
| 潮界防衛 home/prepare | 2 / 7 | 8/8 | 4/4 |
| また村人から。 planning | 1 / 2 | 4/4 | — |
| portfolio HOME | 0 / 3 | — | — |

墨ノ太刀: game と inkImpact、潮界防衛: app、また村人から。: app が自動証明対象。点測定は計36/36一致、操作は12/12到達、捕捉エラー0。Portfolio は正常な縦スクロールを許す横方向の3契約を設定し、実測11件成功・1件非表示で未観測、静的3件 Unknown。潮界防衛の844x390で field/scene高さ400・準備開始ボタンの下端394を再検出し、5観測が画面収容契約違反（実際の操作は成功）。開始操作の形式証明は対象外。

未対応は明示基準位置の無い絶対配置、native control、aspect-ratio、内容依存または flex/grid 兄弟、min() と auto margin の組合せ、View Transition selector 等。全 CSS の自動分割・全状態のモデル化・実ゲームの配信変更は行っていない。ビルド毎に取得する入力が変わるため契約が verified でない場合も再現可能な結果として保持する。

最終統合ゲート: 6単体群 fail=0、component-lint 4評価不変、Chromium/Firefox/WebKit 351 E2E passed、supervisor exit=0、639 PID追跡・残留0。自動部分幾何単独の3 E2Eも成功。実入力 manifest による ui-check/lint の Unknown exit=2、証明済み6契約の exit=0、意図的な不成立契約の exit=1 と有理数 witness (1120,700) を確認。gate 起動後の差分は文書のみ。

### 次の自動証明改善
実入力の残りから、(1) overflow の数理反例があっても解決済み矩形を独立契約に渡せること、(2) block flow の明示的な min()/max()/clamp() 幅と auto margin を既存の厳密長さモデルで評価することを目標とする。検査の未完了を成功にせず、全体判定は維持する。反例・正常例・3ブラウザの境界比較・実ビルド再評価・gate を完了条件とする。

### 自動証明改善の検証完了 (2026-11-20)
c2ce669: 対応済み幾何違反の数理反例がある場合も完全な矩形を relational/1 に渡す。元 report の violated を維持。通常 block flow の明示 min/max/clamp 幅と auto margin を実際の幅計算と共有し、入れ子の hidden overflow の直接の絶対配置を独立矩形の初期スクロール位置に限定して扱う。
同一の28契約: verified 9→10、violated 0→4、Unknown 19→14。WebKit実ビルド矩形照合56/56、操作12/12、捕捉エラー0。
追加: 潮界防衛 home/prepare を3ブラウザー・幅1120・高さ360/399/400/401/568で照合。矩形90/90、開始操作15/15、捕捉エラー0。4契約各3環境で同じ反例1120×360を生成し、高さ400未満のfield/sceneの実高さ400と一致。400以上の対照も一致。操作不能や描画全体の違反を意味しない。各監督ランナー残留0。
Portfolio 5ページの同一捕捉入力に対する全体検査: Unknown 43/33/33/33/33、checks 0、エラー4/3/3/3/8、すべて前回と同じ。軸独立証拠、複雑な構造・動的選択子、暗黙配置は引き続き未対応。ゲーム・サイトの配信変更なし。
gate: 6単体群 fail=0、component-lint 4評価不変、357 E2E passed (Chromium/Firefox/WebKit)、supervisor exit=0、670 PID追跡・残留0。

### 軸独立証拠の設計
既存 relational/1 の矩形証拠を明示的な軸の部分証拠へ拡張する。未証明の軸を0等で補わず、述語が参照する軸ごとに被覆・矛盾・非負寸法を検査する。まず通常block flow・overlay scrollbar・閉じたカスケードの横方向に限定し、高さ・内容の依存から分離する。既存の厳密レイアウト計算、キャッシュと合成を利用し、不足する軸への証明は拒否する。単体・3ブラウザ照合・実ビルド・全gateを確認する。

### 軸独立証拠の実入力評価 (2026-11-20)

66b3f7e: 既存 relational/1 の証拠に axes を明示し、参照される座標のみで片軸契約の証明を行う。元 DOM/CSS に対して通常 block flow の横軸を自動抽出し、純粋に縦軸の宣言と内容を縮約する。float・aspect-ratio・依存する Flex/Grid・未解決の動的条件/外部 CSS は拒否。元 report を書き換えない。単純な html/body の :has() は元 DOM の存在判定と同じ詳細度で固定。ブラウザーの実測値は丸めずに厳密な有理数へ変換し、述語が要求する座標を比較する。

`tools/ui-build-examples/portfolio-pages/` の5設定、ローカル dist、Chromium/Firefox/WebKit、profile 幅320–1920 高さ320–1080、DPR 1、overlay、safe area 0、外部通信遮断。実測4点/環境。同一捕捉入力で旧版 45673c6 （関係エンジンと射影は 72330bc と同じ。旧 adapter は非キャッシュ実行）と比較。

| ページ・対象 | 旧版 | 軸独立 | 実測の契約 |
| --- | --- | --- | --- |
| HOME main-content | Unknown | verified (3/3環境) | 12/12 |
| HOME mobile-island-panel | Unknown | Unknown | 12/12 |
| HOME selected-work | Unknown | Unknown | 12/12 |
| ABOUT main-content | Unknown | verified (3/3環境) | 12/12 |
| WORKS main-content | Unknown | verified (3/3環境) | 12/12 |
| ARTICLES main-content | Unknown | verified (3/3環境) | 12/12 |
| GALLERY main | Unknown | Unknown | 12/12 |

7契約中 verified 0→4、Unknown 7→3。3環境では21件中12件成立・9件Unknown。
局所モデルと実ブラウザー座標照合48/48、契約観測84/84、捕捉エラー0。
ABOUT・WORKS・ARTICLES は exit=0、HOME と GALLERY は未証明があるため exit=2。全QA supervisor 残留0。
GALLERY は色・背景の transition を含む cascade の縮約未対応、HOME island は祖先/対象 markup、selected-work は grid 依存。縦軸の独立外部証拠は直接検証できるが、縦軸の自動縮約、全ページの全要素・全状態の証明は未達。既知の未証明座標に0を与えない。
関連単体22件、新規3ブラウザー6 E2E 成功。片軸の外部 block 証拠についても、欠落軸・負寸法・矛盾・被覆不足を拒否する対照を別途確認。4ページ/WebKit の単回計測では非キャッシュ2.20s、セッション初回1.77s、再実行1.55s（並行QA負荷あり、一般性能保証ではない）。証拠行一致、4 projected cache hits。
ゲーム・サイト配信コード変更なし。

軸独立版の全gate: 6単体群 fail=0、component-lint 4評価不変、3ブラウザー369 E2E passed、supervisor exit=0（660 PID追跡、残留0）。並行開発の有限状態解析・永続キャッシュ・割当写像による合成を保持するため fork main f99ab46 を取り込み d135ca9 に統合した。統合後の関連単体32件成功、実ビルド保存済み15 snapshotから再抽出した21証拠はすべて統合前と完全一致。

統合後 d135ca9 の全gate: 6単体群 fail=0、component-lint 4評価不変、Chromium/Firefox/WebKit 381 E2E passed、supervisor exit=0、654 PID追跡・残留0。gate中の変更はこの検証記録のみ。


### 描画専用 transition の縮約 (2026-11-20)

GALLERY の root/body にある background/color transition は、明示的に幾何へ影響しない
property に限り、独立した unscrolled inline geometry から除外できることを確認。
既存の `tools/ui-build-examples/portfolio-pages/gallery.json` を現行ローカル dist で再実行。
Chromium/Firefox/WebKit の 3 profile すべてで main-horizontal-fit が Verified、
矩形比較12/12・契約観測12/12・捕捉エラー0。保存済みの旧 GALLERY 入力でも
閉じたオフライン cascade から inlineSize=viewport width の証拠を抽出。
既存4ページの証明と合わせ7契約のうち解析可能な横方向契約は5件。
HOME の island/selected-work は別課題。全ページ・全状態・描画の完全証明ではない。
本番変更なし。

### 軸独立証拠の残り依存の精査
実入力で残った GALLERY と selected-work を、既存の縮約により安全にモデル化する。transition は明示した非幾何 property のみ除外し、通常 block に確定している場合に限って無効な grid track 宣言を除く。動的配置や依存する grid/flex を無条件に除外しない。限られた縦軸独立モデルを検討し、対照テスト・3ブラウザー・同一 snapshot と全 gate により検証する。


### 残り依存の精査結果 (2026-11-20)
df34f51: paint-only transition と、全 retained chain が通常 block である場合の inactive grid tracks を区別。viewport-fixed の独立した block 軸も追加。相互依存のある軸を証明しない。単体13件、新規 E2E 6件成功。
同じ5ページ・3ブラウザー・幅320–1920/高さ320–1080・DPR1・overlay・safe area 0・外部通信遮断・4点/環境の実ビルド再評価:
- 7契約中成立4→6、Unknown3→1。3環境合計21ケース中18成立、3 Unknown。
- GALLERY main と HOME selected-work が全3環境で成立。ABOUT/WORKS/ARTICLES/GALLERY exit=0、HOME exit=2。
- 実測契約84/84、モデルの座標照合72/72、捕捉エラー0、Supervisor 残留0。
- 縦軸は viewport-fixed、明示高・block anchor、通常 block 祖先に限定。仮の横幅を証拠に含めない。
- 残りの island: nav に inert 属性、ancestor の fixed column-reverse Flex、対象の Grid、横幅の transition、幅の複合式 min(230px,100vw - 24px)、translate(-50%)、backdrop-filter、状態による transform/visibility がある。単純な block 縮約で解決せず、横方向の stretch 依存と固定配置、状態の時間的条件を個別に証明する必要がある。
- 今回の作品契約は selected-work のセクション外枠の横収容。内部のカード配置全体の証明ではない。全ページ・全状態・hit-test の証明は未達。配信コード変更なし。

同一の前回捕捉済み15 snapshot の再解析でも12→18/21環境ケースを確認。ゲーム3作品の25契約は成立10、違反4、Unknown11で不変。
全gate: 6単体群 fail=0、component-lint 4評価不変、Chromium/Firefox/WebKit 387 E2E passed、supervisor exit=0、657 PID追跡・残留0。gate起動後の変更は文書のみ。

### 可変 margin の厳密計算
目標: viewport 依存の非負 margin を通常 block flow と Grid の既存区分アフィン計算へ接続する。隣接する正の block margin は大小が逆転する領域で分割する。Flex は定数の基準サイズと可変外寸を分離し、内寸に基づく shrink weight を維持して接続する。未対応の親子/空箱の相殺、負値、intrinsic contribution、可変主軸 margin と %/content basis の組合せ、positioned box は明示 Unknown とする。既存の固定 margin の挙動を変えず、対照付き単体・3ブラウザ・同一実入力・全gateを確認し fork main に統合する。

### 可変 margin の検証結果 (2026-11-20)
f538ba2: 非負の viewport 依存 margin を既存の厳密な区分アフィン計算に接続。Block は隣接非空要素の正の margin 相殺を大小の境界ごとに分割。Grid は外寸と自動行の計測、Flex は外寸の変動と内側基準寸法による shrink weight を区別する。
- 同一公開5ページ snapshot の比較 (e874e62 → f538ba2): parser Unknown 175→163 (HOME 43→40、ABOUT/WORKS/ARTICLES 各33→30、GALLERY 33→33)。全ページの証明判定は Unknown のまま、既存 error 件数は不変。
- 既存15実ビルド捕捉の replay: 21契約環境の証拠データがすべて一致、うち18成立。新たな実ページ測定ではなく保存入力の再解析。
- 新規単体3件、新規3ブラウザー E2E 6件。追加差分計測34ケース・幅高さ24点・4箱・3ブラウザー、9792/9792矩形一致 (許容誤差0.15px)。Z3独立再検証34/34ケース、17526チェック成立。固定basisの縮小制御対照では成立判定と違反判定双方を確認。
- 親子/空箱の相殺、負の可変 margin、intrinsic contribution、可変主軸 margin と %/content basis の組合せ等は Unknown を維持。HOME キャラクターの負値 clamp も未対応。配信コード変更なし。
- 全gate (f538ba2): 6単体群 fail=0、component-lint 4評価不変、Chromium/Firefox/WebKit 402 E2E passed、supervisor exit=0、717 PID追跡・残留0。独立プロセス検査 CLEAN。gate後のコード変更なし。

### 固定配置の状態と遷移の監査
対象は既存 island panel の横収容。実際の開閉を複数 viewport/UA で測り、初期の非表示状態だけを評価していた不足を解消する。静止状態の証拠と途中フレームの観測を分ける。汎用エンジンを迂回して実測値から連続領域の証明を捏造しない。

### アイランドの開閉端点と遷移の評価
34157a9: `verifyInterpolatedPredicate` を既存 transitions API に追加。
同じ viewport に対する端点証拠を relational/1 で検査し、共通アフィン進捗、
有界 easing、凸な比較の conjunction を前提として途中の不変条件を導く。
未知進捗、overshoot、OR、not、ne、端点証拠不足を成功にしない。
新しい長さ計算器やソルバーは導入しない。
portfolio 側が既にレビューした4ページの入力ハッシュと既存外枠の射影CSSを照合し、
panel の横方向 stretch と共通進捗を明示条件として既存 layout engine で両端を計算。
従来の全自動 DOM 縮約の残存 Unknown を書き換えない。
連続領域の条件付き証明は3/3 UA、実測は実ローカルビルドの4ページ、通常 motion、
ABOUT/WORKS/ARTICLES 各7幅、HOME (#selected-work 直接遷移) 5幅、H=844。
本物の click / Escape、156/156 操作、10,465 rAF フレーム、横収容・端点範囲違反0。
実測と端点モデルの照合許容差0.1 CSS px。
外部通信遮断、safe-area 0、overlay、DPR1。HOME のフルヒーロー遷移、内部リンク全配置、
縦方向、viewport 変更中、複数の非同期進捗、CSSからの補間/縮約自動導出は未証明。
既存レビュー済み入力と現在のローカルビルドの実測は別の証拠。
再実行: `node tools/ui-build-examples/portfolio-pages/eval-island-transition.mjs ../portfolio/qa/evidence/veriss-trial ../portfolio/dist`、
HOME は同コマンドに `--home-only` を付ける。各実行は既存ブラウザー supervisor 下で行う。
新規3ブラウザー E2E 3件（各27フレーム）、関連単体13件成功。
各実測 supervisor 残留0。サイト本体・配信コードは変更なし。

### 汎用性の監査
サイト固有セレクタ・寸法・入力ハッシュ・運用パスを package の実装へ持ち込まない。対象サイトの実測スクリプトは利用例として隔離し、別のUIの正常/違反/Unknown を共通 API で再現する。転用できない局所モデルはアプリ側の前提付き証拠であって一般解析機能ではない。各ブランチのテストに加えて統合版の gate を確認する。

### 汎用性の監査結果 (2026-11-20)
上流 51dbd0a からの package source 差分を確認。対象サイト名・アプリ名・固有 selector・寸法/入力ハッシュの特別扱いは見つからなかった。固定100pxの縦軸射影用 surrogate 等は未証明軸の計算補助であり、その軸の証拠を出さない。固有のレビュー済み射影は `tools/ui-build-examples/portfolio-pages/eval-island-transition.mjs` に隔離。汎用 `eval-ui-build.mjs` は JSON の対象・契約・状態のみを受け取る。
初回 island-state-audit 39ee50b の gate: 6単体群失敗0、component-lint 4評価不変、399 E2E、supervisor exit 0 / 699 PID / 残留0。並行の responsive-margin-model 7775548 を d50cf1f で取り込み、以下の汎用性改善と統合した。

498bb0d: 別用途のサイトを調査して、独立幾何に無関係な outline、font-smoothing、実行する animation-name/shorthand がない場合の animation metadata を除外。focus による寸法変更、実際の animation-name / shorthand、font-relative geometry は引き続き拒否。WebKit profile の静的 dist HTML/CSS 5アプリ14対象で、成立1→6。
- PC Mini Tools: main/catalog 0/2→2/2、concept は calc(100% - 28px) 依存で Unknown。
- Spex: main/hero/faq 0/3→3/3。
- Cinema UI: main 1/1 不変、fullscreen と ticket は Unknown。
- SheetDojo: 0/3、body overflow propagation。
- Scene Director: 0/2、Grid/float 依存。
この初回の静的比較では script/style/link を除外し、ローカルCSSを連結。アプリ全体の証明ではない。

既存の汎用 runner と `tools/ui-build-examples/{minitools,spex,cinema-ui}.json` を使った実ビルド評価: 3アプリ×3 UA×4 viewport点、同一の捕捉済み9 snapshot を Node module loader で変更前の partial-geometry.mjs (5d17082) のみに差し替えて再解析。27環境別契約ケースが成立3→18、Unknown24→9。モデル座標照合72/72、契約観測96成立・12 Unknown（非表示チケット）、捕捉エラー0。各監督ランナー残留0。幅320–1920、高さ320–1080、overlay、DPR1、外部通信遮断、safe area 0。別アプリのコード、配信、CSS は変更していない。

追加 E2E 6/6: 設定フォームの横収容、編集ツールの2領域の共通進捗による一定間隔・縦横収容を Chromium/Firefox/WebKit で検証。非同期進捗で実際に重なる反例、端点違反、未対応の幾何アニメーションを確認。初回 Firefox の座標比較に 0.00001525878906 CSS px の浮動小数丸め差が出たため観測照合のみ従来の許容差へ合わせた。数理的な述語判定は厳密のまま。部分幾何単体15/15。
サイト固有の入力ハッシュや補間仮定は検証例に留め、今後の追加は HTML/CSS セレクターと意味論の一般的な依存から根拠を導く。自動縮約や補間条件の導出は未対応を残す。

### CSS 幅遷移の自動検証
既存の有界アフィン不変条件を利用して、閉じた CSS と前後 DOM の幅遷移から補間条件を導出する。まず独立した fixed 幅と、中心/片側アンカーおよび通常 block/明示 stretch の直下子に限定する。既存 cascade と幾何抽出を再利用し、曖昧な遷移、複数の幾何プロパティ、未知の祖先依存、非対応長さの組合せは Unknown。実測による証拠の捏造は禁止。単体・3 UA・全 gate を通して統合する。
