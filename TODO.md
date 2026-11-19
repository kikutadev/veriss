# TODO

CSS × DOM の静的検査パターンの候補。実装したものは [docs/static-check-checklist.md](docs/static-check-checklist.md) に F 番号で移す。

各パターンの完了条件:

- Chromium / Firefox / WebKit で挙動を実測する e2e(`e2e/layout-css-mistakes.spec.mjs`)
- 単体テスト(`packages/veriss/test/css-mistakes.test.mjs`)
- 解析が Unknown を成功に変えないこと(判定できない値は Unknown のまま)
- lint の説明(新しいコードのとき `packages/adapter-core/src/lint.mjs`)とチェックリストの行

## 候補

「現状」は今の解析器の結果。

- [ ] **F96. 固定レイアウトの表で 1 行目以外のセルの `width`**: 列幅は 1 行目だけで決まる(3 ブラウザで実測)。現状: verified(列幅は正しく 1 行目から)、警告なし
- [ ] **F97. 表のセルの `max-width`**: 自動レイアウトの表では効かない(3 ブラウザで実測、`min-width` は効く)。現状: Unknown
- [ ] **F98. 表のセル・inline 要素の `aspect-ratio`**: 効かない(3 ブラウザで実測)。現状: Unknown

## 保留

判断を保留しているもの。実装しない(候補から外した)わけではなく、決めることが決まったら候補に戻す。

- **F91. 段組の外の `break-before` / `break-after` / `break-inside`**: 画面では効かないが印刷では効く。
  - 保留の理由: 解析は画面(screen)だけを対象にしていて、印刷(`@media print` と改ページ)を対象にするかが決まっていない。対象外のまま「効かない」と警告すると、印刷用に書いた宣言を誤検知する。
  - 再開の条件: 印刷を扱うか決める。扱わないなら「画面では効かない」という警告にする。扱うならページ分割のモデルが要る。
- **F95. `display` を変えた `li` のマーカー**(`li{display:flex}` で箇条書きの点が消える):
  - 保留の理由: `list-style-type` が none でないままならマーカーが消えるが、ナビゲーションのように意図して消すことが多く、誤検知になりやすい。
  - 再開の条件: 警告する条件を決める(例: `list-style` をどこにも書いていない場合だけ、など)。

## 見送り

- **変形された子のない要素の `perspective`**: none 以外はスタッキングコンテキストを作るので、子がなくても重なった兄弟との描画順が変わる(3 ブラウザで実測)。効かない宣言ではない
- **flex / grid コンテナの `text-indent`**: 継承されて item の行で効く(3 ブラウザで実測: item が字下げされる)ので誤検知になる

## 実装済み(最近)

- F79. media query の単位なし長さ・単位前の空白
- F80. `white-space: nowrap` / `pre` の下の `overflow-wrap`
- F81. 段組の外の `column-span`
- F82. `border-collapse: collapse` の表の `empty-cells: hide`
- F83. transform のない `transform-origin`
- F86. `!important` の綴り間違い
- F87. media query の `and(`
- F88. list-item でない要素の `list-style-position`
- F89. calc の `+` / `-` の両側の空白(健全性の修正)
- F92. block コンテナの `gap`(子のない block と inline-block)
- F93. 単位のない長さ
- F84. 空白を詰める `white-space` の下の `tab-size`
- F94. 表の行・行グループの `border-radius`
