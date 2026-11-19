# 実サイトでの改善ループ

目的: 配信済みの HTML/CSS に対する解析の適用性を改善する。kikuta.dev の HOME/ABOUT/WORKS/ARTICLES/GALLERY を同じ入力で比較し、Unknown の原因を最小再現へ切り出す。Unknown を隠したり、実サイトを検証器に合わせて変更しない。

順序: HTML 文書のコメント、圧縮 CSS の小数表記、リンク属性、次にレスポンシブ寸法と厳格 shorthand policy の扱いを検討する。各修正は Red→Green の回帰テストを付け、必要なブラウザ照合と gate を通したものだけ push する。実サイトで再計測し、残りを優先付けする。upstream への PR は別途判断する。

初回結果 (2026-11-20、upstream 51dbd0a): HOME 154→98、ABOUT 106→52、WORKS 104→52、ARTICLES 152→100。GALLERY は文書コメントで例外→Unknown 38 件。静的入力のみ、全ページのレイアウト証明は未達。CSS の小数・HTML コメント・限定した rel、物理方向 border shorthand に対応。関連単体テスト 65 件成功。全 gate と Firefox を含むブラウザ照合は未実施のため、修正はローカルコミットに留める。

再現: portfolio の `node scripts/verify-veriss.mjs --capture` で入力を保存し、`node scripts/verify-veriss.mjs --veriss ../veriss` で同じ入力を再検査する。過去の取得済み入力は `--snapshot qa/evidence/veriss-trial` を指定する。次回は gate の準備・実行と push、残る time/noscript 要素、hover 子孫セレクター、padding の clamp を最小再現へ切り出す。
