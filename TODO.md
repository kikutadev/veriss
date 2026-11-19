# TODO

CSS × DOM の静的検査パターンの候補。実装したものは [docs/static-check-checklist.md](docs/static-check-checklist.md) に F 番号で移す。

各パターンの完了条件:

- Chromium / Firefox / WebKit で挙動を実測する e2e(`e2e/layout-css-mistakes.spec.mjs`)
- 単体テスト(`packages/veriss/test/css-mistakes.test.mjs`)
- 解析が Unknown を成功に変えないこと(判定できない値は Unknown のまま)
- lint の説明(新しいコードのとき `packages/adapter-core/src/lint.mjs`)とチェックリストの行

## 候補

「現状」は今の解析器の結果。

- [ ] **F84. 空白を詰める `white-space` の下の `tab-size`**(normal / nowrap / pre-line ではタブは空白 1 つに潰れる)。現状: Unknown
- [ ] **F90. 変形された子のない要素の `perspective`**: 3D 変形する子孫がなければ効かない。現状: Unknown
- [ ] **F91. 段組の外の `break-before` / `break-after` / `break-inside`**: 画面では効かないが印刷では効く。印刷を考えるかどうかを決めてから扱う(要検討)
- [ ] **F92. flex / grid / 段組でない箱の `gap`**: 間隔を空ける子の並びがないので効かない。現状: verified、警告なし
- [ ] **F93. 単位のない長さ**(`width: 100`): 0 以外は不正で宣言ごと捨てられる。現状: Unknown

## 見送り

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
