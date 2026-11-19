# TODO

CSS × DOM の静的検査パターンを、**カテゴリごとに洗う**。実装したものは [docs/static-check-checklist.md](docs/static-check-checklist.md) に F 番号で移す。
モジュール分割の計画は [ADR-0016](docs/adr/0016-module-decomposition.md)(下の「構成の作業」)。

各パターンの完了条件:

- Chromium / Firefox / WebKit で挙動を実測する e2e(`e2e/layout-css-mistakes.spec.mjs`)。中身や条件を変えた複数の場合で測る(F97 の取り違えから)
- 単体テスト(`packages/veriss/test/css-mistakes.test.mjs`)
- 解析が Unknown を成功に変えないこと(判定できない値は Unknown のまま)
- lint の説明(新しいコードのとき `packages/adapter-core/src/lint.mjs`)とチェックリストの行

## 進み具合(カテゴリごと)

「観点」はそのカテゴリで調べる切り口。済 = 実測して実装したか、効いていると確かめて外したもの。

| カテゴリ | 済 / 観点 | 状態 |
|---|---|---|
| 1. 宣言ごと捨てられる値(構文) | 11 / 11 | 済 |
| 2. at-rule(`@media` ほか) | 8 / 8 | 済 |
| 3. 親の表示形式で効かない宣言(block / inline / flex / grid / positioned) | 9 / 10 | ほぼ済 |
| 4. 表 | 9 / 9 | 済 |
| 5. テキストと折り返し | 8 / 9 | ほぼ済 |
| 6. リスト・マーカー・カウンター | 4 / 5 | ほぼ済(1 つ保留) |
| 7. transform・重なり・描画 | 5 / 6 | ほぼ済 |
| 8. フォーム部品・置換要素 | 4 / 8 | 進行中 |
| 9. セレクタ × DOM(状態・構造) | 8 / 8 | 済 |
| 10. ブラウザで結果が違うもの | 1 / 5 | 着手 |
| 合計 | 67 / 79(85%) | |

観点を足したら分母が増える。カテゴリの中で新しい観点が見つかったら、表と下の一覧の両方に足す。

### 1. 宣言ごと捨てられる値(構文)

- [x] calc の `+` / `-` の空白(F89)
- [x] `!important` の綴り(F86)
- [x] 単位のない長さ(F93)
- [x] `font-family` の名前・`font` ショートハンド(F99、F100)
- [x] grid のトラック(F101)
- [x] grid-template-areas(F52)
- [x] 未定義の custom property / `var()` の不正(既存 `W_CSS_VAR_INVALID`)
- [x] 色の関数(F107。健全性の修正も)
- [x] `transition` / `animation` の不正な値(F114)
- [x] `url()` の引用符のない空白、`background` ショートハンドの `/` の位置(F115)
- [x] プロパティが受け付けないキーワード(F109: `position: center`、`display: flexbox` など)

### 2. at-rule

- [x] `@media` の `var()`、単位のない長さ、`and(`(F78、F79、F87)
- [x] `@import` の位置(既存 `W_CSS_IMPORT_IGNORED`)
- [x] `@keyframes` の `!important`、存在しない名前(既存)
- [x] `@container` の当たらない query(既存)
- [x] `@supports` の不正な条件(F110: `and(` / `or(` / `not(`。括弧のない条件などはもともと Unknown)
- [x] `@layer` の順序と、層の外の規則(F112: 詳細度で勝つのに層で負ける宣言)
- [x] `@font-face` の不正な宣言(F113)
- [x] `@property` の不正な `syntax` / `initial-value`(F111。健全性の修正も)

### 3. 親の表示形式で効かない宣言

- [x] flex / grid の子の項目プロパティを block の子に(既存)
- [x] block コンテナの `gap`(F92)
- [x] inline の箱の幅・高さ・縦の margin・transform(既存、F36)
- [x] inline 系の箱の `margin: auto`(F103)
- [x] `display: contents` の箱のプロパティ(F30 ほか)
- [x] position: static の inset、z-index(既存)
- [x] absolute の `float`、`margin: auto`(F77、F38)
- [x] `columns` を flex / grid に、段組の外の `column-span`(F34、F81)
- [x] `aspect-ratio` を表と inline に(F98)
- [ ] absolute / fixed の子の flex 項目プロパティ(`order`、`flex-grow`)。現状は解析が Unknown

### 4. 表

- [x] `overflow`、`padding`(collapse)、`gap`、`border-spacing`(F31、F60、F25)
- [x] セルの min/max-height、固定表の min/max-width(F43)
- [x] collapse の `border-radius`、行・行グループの `border-radius`(F59、F94)
- [x] collapse の `empty-cells`(F82)
- [x] 固定表の 1 行目以外の `width`(F96)
- [x] `table > tr`(tbody の挿入、F26)
- [x] 行・行グループの padding・margin・border・overflow(既存)
- [x] セルの `max-width`(自動表では効くと確かめて見送り)
- [x] `<col>` / `<colgroup>` に効かないプロパティ(F108)

### 5. テキストと折り返し

- [x] nowrap / pre の `overflow-wrap`(F80)
- [x] タブを潰す `white-space` の `tab-size`(F84)
- [x] 1 行のままの `word-break` / `line-break` / `hyphens` / `text-wrap-style`(F106)
- [x] inline の `text-align` / `text-indent`(F45)
- [x] `text-overflow` の条件(既存)
- [x] `text-decoration: none` で祖先の線は消えない(F58)
- [x] `letter-spacing` / `word-spacing` の不正: 3 ブラウザで `%` は有効、単位のない数は F93 で報告済み、と確かめた
- [x] `letter-spacing` / `word-spacing` の `auto`(F109 で報告)
- [ ] `text-wrap: balance` が `white-space: nowrap` を打ち消す(折り返しが戻る)ことの知らせ

### 6. リスト・マーカー・カウンター

- [x] list-item でない要素の `list-style-type` / `-position` / `-image`(既存、F88、F104)
- [x] 読まれないカウンター(F102)
- [x] `::marker` に効かないプロパティ(既存)
- [x] summary のマーカー(既存 `W_A11Y_SUMMARY_INDICATOR`)
- [ ] `li` の display を変えてマーカーが消える(F95、保留)

### 7. transform・重なり・描画

- [x] transform のない `transform-origin`(F83)
- [x] 祖先の後ろに回る負の z-index(F72)
- [x] `perspective`(重なり順が変わると確かめて見送り)
- [x] `transform-style: preserve-3d` が grouping property で平らになる・inline で効かない、fixed の子を閉じ込める(F117)。`backface-visibility` は受け付けるだけ(3D の transform は Unknown のまま)
- [ ] `isolation` / `mix-blend-mode` の組み合わせ
- [x] `will-change` の不正な値(`auto` や `all` を含むリスト、カンマなし)(F116)。知らない名前は有効で、効かないだけ(判定しない)

### 8. フォーム部品・置換要素

- [x] appearance auto の checkbox / select の背景・枠・行の高さ(F42、F75)
- [x] `input type=hidden`、`datalist`、置換要素の擬似要素(F68、F69、F32)
- [x] `object-fit` / `object-position`(既存、F39)
- [x] canvas の引き伸ばし(F71)
- [ ] `select` / `input` の `padding`・`text-align` のブラウザ差(実測では 3 ブラウザとも効いた。差の出る条件を探す)
- [ ] `<option>` のスタイル(閉じた select では描かれない)
- [ ] `<br>` の `margin`(Firefox だけ効く)
- [ ] `<img>` / `<video>` の `width` / `height` 属性と CSS の優先

### 9. セレクタ × DOM

- [x] 状態の擬似クラス(`:placeholder-shown`、`:required`、`:read-write`、`:link`、`:focus-within` など、F35〜F63)
- [x] 構造の擬似クラス(`:empty`、`:last-child`、`:nth-child(of S)`、F29、F33、F70)
- [x] 当たらないセレクタ、親子関係の破綻(既存)
- [x] DOM のプロパティを属性で書いた、効かない属性(F64〜F67)
- [x] `hidden` 属性の上書き(既存 `W_A11Y_HIDDEN_OVERRIDDEN`)
- [x] `:visited` で効かないプロパティ(既存)
- [x] 重複した `id`(既存 `E_A11Y_DUPLICATE_ID` で検出済みと確かめた)
- [x] `:has()` の中の状態(解析は Unknown で健全。当たらない `:has()` は既存の `W_CSS_SELECTOR_UNMATCHED`)

### 10. ブラウザで結果が違うもの

- [x] block レイアウトの `justify-self` / `justify-items`(F105)
- [ ] `<br>` の `margin`(カテゴリ 8 と同じ)
- [ ] `::-webkit-scrollbar` と `scrollbar-width` / `scrollbar-color`(重ねて描くスクロールバーのヘッドレスでは測れない。測り方を決める)
- [ ] `-webkit-` だけの書き方(`-webkit-line-clamp` 以外)
- [ ] フォーム部品の既定の大きさ(UA プロファイルと突き合わせる)

## 構成の作業([ADR-0016](docs/adr/0016-module-decomposition.md))

- [x] M1. `color/` を切り出す(色の解析・重ね合わせ・輝度・比・`backdrop`)
- [x] M2. import の向きを調べる境界テスト
- [x] M3. 構文の検査の結果を `notes[]` にまとめる(28 の配列)
- [x] M4. 捨てた宣言を `dropped[]` にまとめる(11 の `$…Inert`)
- [x] M5. `rules/css-mistakes` を engine から出す(`cssMistakes` と周りの検査 560 行を `createCssMistakes({ report, facts, tools })` に。後追いの `walkStyles` は style の段が単独で事実を出せるようになる M6 以降に回す)
- [ ] M6. `solve` の中の「効かない宣言」の判定を規則に移す
- [ ] M7. `rules/contrast`(レイアウトなしでも判定する)
- [ ] M8. a11y を DOM の規則と幾何の規則に分ける
- [ ] M9. `packages/` に出す

## 先行研究から採る作業([ADR-0017](docs/adr/0017-prior-art-css-formalization.md))

- [ ] R1. 規則の主張を visual logic の形(`∀b ∈ $(sel). 線形の主張`)の内部表現と評価器に分ける(重なり・画面外を書き直し、eval 不変)
- [ ] R2. マージンの相殺を正負の最大(VizAssert の 6 実数 + bool)で一般化し、container・空の箱を通る相殺を判定へ
- [ ] R3. web-platform-tests の部分集合(css2.1 §8.3、§10.8)をモデル全体の回帰試験にする(一致・Unknown・不一致、不一致ゼロ)
- [ ] R4. component 契約を Troika の independently-true で定義し、⋀Pc ⇒ Q を Z3 で確かめる
- [ ] R5. style 段の出力を「guard と値の組の列」(記号的 computed style)として型にする(M6 と合わせる)
- [ ] R6. 既定の font size を第三の変数にする(3 次元の cell の表現を先に決める)

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
- F99. 引用符のない `font-family` の不正な名前(健全性の修正)
- F100. size か family のない `font` ショートハンド
- F104. list-item でない要素の `list-style-image`
- F101. grid の不正なトラック
- F102. どこからも読まれない CSS カウンター
- F103. inline 系の箱の左右の `margin: auto`
- F105. block レイアウトの `justify-self` / `justify-items`(ブラウザで違う)
- F117. `transform-style: preserve-3d` の平坦化と fixed の閉じ込め
- F116. 不正な `will-change`
- F115. 不正な `background` ショートハンド
- F114. 不正な `transition` / `animation`
- F113. 不正な `@font-face`
- F112. 層の順番だけで負ける宣言
- F111. 不正な `@property`(健全性の修正)
- F110. `@supports` の `and(` / `or(` / `not(`(健全性の修正)
- F109. プロパティが受け付けないキーワード
- F108. 表の列に効かないプロパティ
- F107. 不正な色(健全性の修正)
- F106. 1 行のままの `white-space` の下の `word-break` / `line-break` / `hyphens` / `text-wrap-style`
