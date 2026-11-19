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
