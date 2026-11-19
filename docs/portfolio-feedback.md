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
