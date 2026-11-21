# ADR-0019: 文字幅を型として扱い、Z3 のモデルに入れる

状態: 提案(第一段を実装)

## 背景

文字を含む箱の大きさは、どのフォントで描かれるかで変わる。`font-family: sans-serif` や `system-ui` の解決先は OS とブラウザーで違い、
同じ Linux の上でも違う(この環境で測った: Chromium は `sans-serif` を Liberation Sans、Firefox と WebKit は Inter に解決する。
「The quick brown fox jumps over the lazy dog」16px は 316.6px と 339.8px)。一つのフォントで測った幅を確定値として配置すると、
ほかの環境での崩れを見逃す。

文字幅の出所は三つある。

1. MoonBit の `mizchi/font`(`packages/veriss/text-metrics`)でフォントファイルを測る。同じファイルなら WebKit と完全に一致し、
   Chromium と 0.008px、Firefox と 0.1px 以内(Firefox は 1/60px に丸め、組み方も少し違う。この環境で測った)
2. ブラウザーの E2E で実際の幅を取り出す(`tools/text-widths.mjs`)。どのフォントに解決したかと一緒に記録する
3. Rust の parley(第二段。ツールの導入が要る)

この環境で測った 3 つの出所の比較(フォント 20 種、文字列 13、16px。`tools/text-widths.mjs`):

| ブラウザー | MoonBit との最大の差 | parley との最大の差 |
|---|---|---|
| Chromium 156 | 0.0156px(1/64px の丸め) | 0.0156px |
| Firefox 157 | 0.465px(Caladea「Hello, world」) | 0.465px(同じ) |
| WebKit 27.2 | 0.640px(FreeSerif「— “quotes” & (brackets)」) | 0.640px(同じ) |

MoonBit と parley は同じ値を出す。ブラウザーとの差はブラウザー側の組み方(Firefox)と、フォントにない文字を代わりのフォントで描くこと
(WebKit)から来るので、parley に替えても縮まない。記録のある文字列は E2E の値をそのまま使い、記録のないものは MoonBit の値に許容を
足す(parley はもう一つの照合として記録する)。

## 判断

### 文字幅の型(`models/text/width.mjs`)

`TextWidth = { min: [lo, hi], max: [lo, hi], sources }`。min は min-content(折り返せない最長の区切りの幅)、max は max-content
(全体を一行にした幅)。どちらも px の有理数の閉区間で、どのフォントの組み合わせで描かれても、実際の幅がこの区間に入ることを主張する。

- 一つのフォントファイル: MoonBit で測った幅 `w` を、`[w − a, w + a]` にする(a はブラウザーの丸めと組み方の差の許容。測った最大の差から
  決める: 0.1% + 1/32px)
- 総称の family(`system-ui`・`sans-serif`・`serif`・`monospace`): `models/text/system-fonts.mjs` の表で、対象の OS × ブラウザーごとの
  解決先を引き、それぞれを測った区間の和(最小の lo と最大の hi)
- 自由な文字列: `min = [0, ∞)`、`max = [0, ∞)`(上限なし)。上限のない区間を使う検査は、その方向の主張を示せない(Unknown)
- 測れない組み合わせ(フォントのファイルも E2E の記録もない、例: この環境での Windows の Segoe UI): 型を作らず Unknown

### system font の表(`models/text/system-fonts.mjs`)

`{ OS: { ブラウザー: { 総称: [フォント名] } } }`。Linux の行はこの環境で 3 ブラウザーを測って埋めた(版を記録)。Windows・macOS・
iOS・Android の行は、各社の既定のフォント名を書くが、ファイルも E2E の記録もないので、測れるまでその組み合わせは Unknown。

### Z3 のモデル(L1 の Flex、ADR-0018 の拡張)

Flex の項目に `text: TextWidth` を書ける。項目の `min-width` を書かなければ、自動の最小幅は文字の min-content(CSS Flexbox §4.5 の
content size suggestion。`width` を書かないので specified size suggestion はない)。仕様はこれを変数 `tmin_k ∈ [lo, hi]` として宣言する。

min が basis を超えうるので、伸び縮みを一般の形にする(どちらも「共通の水位」で、§9.7 の凍結の繰り返しの結果と同じ):

- 仮の大きさ `h = max(basis, min)`。`Σ h ≤ T` なら伸びる、そうでなければ縮む
- 伸びる: ある `u ≥ 0` で `size = max(min, basis + grow × u)`、`Σ size = T`(grow がすべて 0 なら `size = h`)。grow の和は 0 か 1 以上
- 縮む: ある `t ≥ 0` で `size = max(min, basis − shrink × basis × t)`、`Σ size = T`。届かなければ `size = (shrink × basis > 0 ? min : h)`

これで Z3 は、コンテナの幅 W と文字幅(どのフォントで描かれるか)を同時に探す。「どのフォントでも並びがはみ出さない」は、はみ出す
`(W, tmin)` がなければ UNSAT。

### 記録のない OS の近似(安全な側)

記録のない OS(この環境では Windows・macOS・iOS・Android)の既定のフォントは、幅を合わせて作られた互換フォントで近似し、区間を
広げる。Arial → Liberation Sans、Times New Roman → Liberation Serif、Courier New → Liberation Mono、Calibri → Carlito、Cambria →
Caladea は advance の幅が同じに作られている(kerning とその OS の組み方は違いうるので 2% + 0.5px 広げる)。Helvetica・Times・Courier
(macOS)は Arial・Times New Roman・Courier New に近いが同じではないので 4% + 1px 広げる。互換フォントのない Segoe UI・SF Pro・
Consolas・Menlo は、記録するまで Unknown(何も主張しない)。

### Windows と macOS の記録(GitHub Actions)

`.github/workflows/text-widths.yml` を手動で回す(Actions → text-widths → Run workflow、runner は windows-latest・macos-latest・両方)。
各 runner は、文字幅を記録し(`tools/text-widths.mjs`)、モデルと照らし合わせる(`tools/check-text-widths.mjs`: 既定のフォント、
MoonBit と各ブラウザー、互換フォントと本物、近似のモデルの区間に描いた幅が入るか)。結果は job の summary に出て、合わなければ job が
失敗する。記録(`<platform>-widths.json`)は artifact になるので、モデルに使うときはそれを `models/text/` に commit する(そうすると、
その OS では近似ではなく記録が使われる)。Windows の WebKit(Playwright)は Safari ではないので、記録はするが数えない。

## 検証

- `tests/check-text-widths.test.mjs`: 互換フォントどおりに描く見せかけの Windows の記録で確認が通り、Arial を 5% 広げた記録や解決先の違う記録で落ちる
- `tests/text-width.test.mjs`: MoonBit の幅と E2E で記録したブラウザーの幅の差が許容の中、system font の区間が表のとおり、文字を
  含む Flex の仕様で「フォントによってはみ出す」が SAT になり、その反例のフォントで実際にはみ出す
- `e2e/layout-text-width.spec.mjs`: 3 ブラウザーで、文字を含む Flex の項目の大きさが、そのブラウザーが解決したフォントの幅で解いた仕様と一致

## 第二段以降

parley で測る、ほかの OS の値を E2E で記録する(その OS のブラウザーが要る)、`flex-basis: auto`(basis が max-content になり、
`shrink × basis × t` が非線形になる)、折り返す文字(行数が幅で変わる)、Grid の項目。
