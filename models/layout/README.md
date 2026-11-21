# 座標計算サブセット L1 の参照仕様(Z3)

[ADR-0018](../../docs/adr/0018-coordinate-subset.md) の座標計算サブセット L1(Grid、Flex の row・nowrap)の、engine から独立した
参照仕様。設定(JSON)を、コンテナの内容幅 `W` の QF_LRA の式(SMT-LIB2)にする。どの箱の border box も `W` の区分線形な式で
一意に決まる。L1 の外の設定は `outside L1` で拒む(近似しない)。

- `spec.mjs`: `spec(config)` → `{ smt, facts, count }`。`x_k`・`y_k`・`w_k`・`h_k`(項目 k の border box、コンテナの内容 box が原点)と
  `ok_k`(位置が L1 の中か)を宣言し、等式で定める。入力の算術はすべて SMT の有理数で行う(JavaScript の浮動小数を使わない。
  `20 / 60` を double にすると 1/3 にならず、engine との照合で Z3 が差を見つけた)。`toCSS` / `toHTML` は同じ設定の CSS と HTML
- `solve.mjs`: `boxesAt(spec, W)` で幅 W の箱を厳密な有理数で、`counterexample(spec, claim, range)` で範囲の中の反例を Z3 に探させる
- `random.mjs`: L1 の中のランダムな設定(seed で再現できる。Grid の項目は重ならない領域に置く)

## 照合

```sh
node --test tests/layout-spec.test.mjs                               # 手計算、engine との範囲全体の一致、壊した仕様が捕まること
npx playwright test -c playwright.layout.config.mjs e2e/layout-spec.spec.mjs --trace off   # 3 ブラウザーとの一致
```

- engine との照合: engine が出す領域(viewport 幅 1〜800px を分けた区間)ごとに、engine の箱のアフィン式と仕様の式が違う幅を Z3 に
  探させ、UNSAT なら区間全体で一致。ランダムな Grid・Flex 40 個ずつで一致。fr の配り方を壊した仕様は SAT になる
- ブラウザーとの照合: ランダムな 60 個ずつを 5 つの幅(0・37・120・333・640px)で描き、Chromium 156・Firefox 157・WebKit 27.2 の
  `getBoundingClientRect` と 0.05px まで一致。壊した仕様(fr の和の扱い、shrink を basis に掛けない)では食い違いが出る
- 位置を比べないのは `ok_k` が偽の箱(はみ出す center・end の揃え。既定の overflow alignment を測るまで L1 の外)

この仕様は CSS 全体や engine 全体の正しさを示すものではない。L1 の中で、engine・仕様・3 ブラウザーの三者が同じ座標を出すことを示す。
