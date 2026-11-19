# TODO

CSS × DOM の静的検査パターンの候補。実装したものは [docs/static-check-checklist.md](docs/static-check-checklist.md) に F 番号で移す。

各パターンの完了条件:

- Chromium / Firefox / WebKit で挙動を実測する e2e(`e2e/layout-css-mistakes.spec.mjs`)
- 単体テスト(`packages/veriss/test/css-mistakes.test.mjs`)
- 解析が Unknown を成功に変えないこと(判定できない値は Unknown のまま)
- lint の説明(新しいコードのとき `packages/adapter-core/src/lint.mjs`)とチェックリストの行

## 候補

「現状」は今の解析器の結果。

- [ ] **F99. 引用符のない `font-family` の不正な名前**(`Font Awesome 5 Free`、`3D Bar`、`a.b`): 数字(や `-` と数字)で始まる語や `.` を含む名前は識別子にならず、宣言ごと捨てられる。リストの 1 項目だけでも同じ(3 ブラウザで 14 通り実測)。現状: verified のまま適用していて、`font: 16px Font Awesome 5 Free` では font-size を 16px として計算する(**健全性のバグ**)
- [ ] **F100. size か family のない `font` ショートハンド**(`font: 16px`、`font: bold Arial`、`font: italic 16px`): 宣言ごと捨てられる(3 ブラウザで実測)。現状: Unknown
- [ ] **F101. grid の不正なトラック**(`repeat(auto-fill, 1fr)`、`minmax(1fr, 100px)`): auto-fill の繰り返しは固定の大きさ、minmax の最小は fr 不可で、宣言ごと捨てられる(3 ブラウザで実測)。現状: Unknown
- [ ] **F102. どこからも読まれない `counter-increment` / `counter-reset`**: `counter()` / `counters()` で読むものがなければ見た目は変わらない(3 ブラウザで実測)。現状: 警告なし
- [ ] **F103. inline-block の左右の `margin: auto`**: 0 になり中央に寄らない(3 ブラウザで実測)。現状: inline の行は Unknown。`text-align: center` を親に、と案内する
- [ ] **F104. list-item でない要素の `list-style-image`**: F88 と同じ(3 ブラウザで実測)。現状: 警告なし
- [ ] **F105. block の子の `justify-self`**: Chromium と WebKit は寄せるが Firefox は寄せない(実測)。現状: Unknown(健全)。ブラウザごとの違いとして警告する


## 保留

判断を保留しているもの。実装しない(候補から外した)わけではなく、決めることが決まったら候補に戻す。

- **F91. 段組の外の `break-before` / `break-after` / `break-inside`**: 画面では効かないが印刷では効く。
  - 保留の理由: 解析は画面(screen)だけを対象にしていて、印刷(`@media print` と改ページ)を対象にするかが決まっていない。対象外のまま「効かない」と警告すると、印刷用に書いた宣言を誤検知する。
  - 再開の条件: 印刷を扱うか決める。扱わないなら「画面では効かない」という警告にする。扱うならページ分割のモデルが要る。
- **F95. `display` を変えた `li` のマーカー**(`li{display:flex}` で箇条書きの点が消える):
  - 保留の理由: `list-style-type` が none でないままならマーカーが消えるが、ナビゲーションのように意図して消すことが多く、誤検知になりやすい。
  - 再開の条件: 警告する条件を決める(例: `list-style` をどこにも書いていない場合だけ、など)。

## 見送り

- **表のセルの `max-width`**(F97 として候補にしていた): 自動レイアウトの表では効く。折り返すテキストや幅のある箱が中にあるとき、列の幅の上限になる(3 ブラウザで実測)。最初の実測が 1 文字のセルで、差が出なかったので誤って候補にした。固定レイアウトの表では効かず、こちらは F43 で扱っている
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
- F96. 固定レイアウトの表で 1 行目以外のセルの `width`
- F98. 表のセル・行と inline 要素の `aspect-ratio`
