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

後続: 汎用 UI の relational/1 に移行した。ゲームは利用例の一つであり契約本体の仕様は [layout-contract-ir.md](layout-contract-ir.md#relational1-汎用-ui-関係述語)。旧 game-ui API の実装経緯と評価は上記の履歴として残す。
