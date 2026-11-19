# ADR-0017: CSS 形式化の先行研究と、veriss が採り入れるモデル

- 状態: Proposed(調査と採用方針。この文書の述語・構文はまだ実装していない)
- 日付: 2026-11-19

## 背景

veriss は CSS の閉じた部分集合を、viewport の幅・高さを変数とする有理数の区分線形式に落とす。
領域を凸多角形の cell に分け(`layout/region.mjs`、`layout/linear.mjs`)、契約の検査には Z3 を使う
(`layout/smt.mjs`)。判定できないものは Unknown とし、成功にはしない。
同じ方向の先行研究があるかを調べ、採り入れられるモデルを選ぶ。

## 調べたもの

| 研究 | 何を形式化したか | 手法 |
| --- | --- | --- |
| [Cassius](https://dl.acm.org/doi/10.1145/2983990.2984010)(Panchekha & Torlak, OOPSLA 2016) | CSS 2.1 の block / inline / float / 行の高さの断片 | 量化子なし線形実数算術(QF-LRA)に落とし、Z3 で解く |
| [VizAssert](https://dl.acm.org/doi/10.1145/3192366.3192407)(Panchekha ほか, PLDI 2018) | Cassius を広げ、**visual logic**(箱についての主張)を足したもの | 全称量化された主張を QF-LRA に落とす。行の高さ・マージンの相殺・float は有限の状態に畳む |
| [Troika](https://dl.acm.org/doi/10.1145/3360577)(Panchekha ほか, OOPSLA 2019) | component 単位の仕様(事前条件と事後条件)と、ページ全体への合成 | 証明支援系。仕様の結合が全体の主張を含意するかを Z3 で確かめる |
| Genevès / Layaïda / Quint(WWW 2012)、Hague / Lin / Ong(OOPSLA 2015)、SatCSS([CSS Minification via Constraint Solving](https://dl.acm.org/doi/10.1145/3310337), TOPLAS 2019) | selector とカスケード | 木の論理、木の書き換え、selector の交差を整数線形算術で解く。冗長な規則・決して当たらない規則・順序に依存する規則を見つける |
| Meyerovich & Bodik(WWW 2010、PPoPP 2013)、[Conflict-Driven Synthesis for Layout Engines](https://dl.acm.org/doi/10.1145/3591246)(PLDI 2023) | レイアウトを属性文法として書く | 走査の順序を合成し、並列化・差分の再計算をする |
| CCSS(UIST 1999)、Cassowary、GSS | 制約で書く CSS | 線形制約ソルバー。CSS の意味論の形式化ではなく、別の言語 |
| [ReDeCheck](https://doi.org/10.1109/ASE.2015.31)(ASE 2015 ほか) | responsive の崩れ | 幅をサンプリングした実ブラウザーでの試験。網羅はしない |

### VizAssert の要点

- **visual logic。** 主張は描画木の箱についての全称量化 `∀b, b ∈ $(sel) ⇒ …` で書く。
  - 箱の辺は margin / border / padding / content の各領域の top / right / bottom / left。
  - `ancestor`・親・兄弟・子をたどれる。
  - 算術は線形だけ。
  - 14 の accessibility 主張(画面内に収まる、重ならない、文字の大きさ、コントラストなど)を書いた。
- **有限化(本研究の中心)。**
  - 行の高さは baseline の上と下の running max。
  - マージンの相殺は、正と負それぞれの最大を持つ 6 個の実数と、bool 1 個に畳む。
  - float は除外領域 (Y, L, R) の列にする。長さは上限 k の正規形にし、足りなければ k を増やしてやり直す。
- **パラメーター。** window の幅・高さと、既定の font size(16 から 32)。
- **妥当性の確認。** W3C の適合試験(10.8 行の高さ、8.3 マージン、9.5 float)を Firefox と 1/6 px の精度で比べた。
- **評価。** 62 ページで 64 件の誤りを見つけ、誤検知は 13 件だった。
- **対象外。** vertical-align、右から左の文字、表、SVG、JavaScript。

### Troika の要点

- **component。** HTML の部分木(穴あき)と、その要素の**記号的な computed style** の組。
  記号的な computed style は、パラメーターについての線形不等式を guard にした値の候補の列で表す。
  component は selector で根を指定し、ページを重なりなく分割する。
- **整合性の検査。** 仕様 Pc がすべて成り立てば全体の主張 Q が成り立つ(⋀Pc ⇒ Q)ことを確かめる。
  これはレイアウトの意味論を使わずに確かめられる。
- **independently-true。** その部分木と computed style を含む**どのページでも**仕様が成り立つこと。
  事前条件が文脈の代わりになる。component は使い回せ、別々にキャッシュでき、並列に検査できる。
- **component をまたぐ相互作用の述語。**
  - マージンの相殺は `collapsed-margin` と `non-negative-margins`。
  - float は `starts-float-free(b, R)`、`ends-float-free(b, R)`、`no-floats-enter`、`float-flow-across`。
- **検査器。** 仕様ごとに選べる:
  - `random-test` と `model-check`(実ブラウザー、健全でない)。
  - `whole-page`(VizAssert)。
  - `component-smt`(部分木だけで決める)。
  - `admit`。
- **キャッシュ。** 検査器が使わない部分(component の外、当たらない規則・font・class)を
  保守的に削り、それを鍵にする。

## veriss との対応

すでに同じ考え方のもの:

- **主張の形。** viewport の変数についての線形算術で、誤り・保証・Unknown を出す。
  VizAssert の「すべての描画について主張が成り立つか」と同じ形。
- **区別。** 健全な検査器と、実ブラウザーで測った事実(e2e)を区別している。Troika の `model-check` と `whole-page` の区別にあたる。
- **component 契約。** noshift と ADR-0014/0015 の契約は、Troika の component 仕様に近い。

違い:

- **解き方。** veriss は SMT で探すのではなく、領域を厳密な凸 cell に分けて具体的な式を持ち回る
  (反例の領域がそのまま出せ、説明 ADR-0002 に使える)。VizAssert はレイアウト全体を Z3 に渡す。
  veriss の方式は Z3 なしで動き、決定的。代わりに、場合分けが爆発すれば Unknown に倒す。
- **対象。** VizAssert は block / inline / float が中心。veriss は flex・grid・subgrid・positioned・table の部分集合を持ち、
  float は禁止(E_LAYOUT_FLOAT)。マージンの相殺は隣接兄弟と、padding・border のない最初(最後)の子を通るものだけ。
- **主張の書き方。** veriss には利用者が書く主張の言語がなく、規則(rules/)が固定の主張を持つ。
- **妥当性の確認。** veriss は、警告ごとに 3 ブラウザーで対照つきの e2e を書く。
  VizAssert はモデル全体を W3C 適合試験で確かめた。

## 判断(提案)

### 採り入れる

1. **visual logic を、規則の内部表現と、利用者が書く主張にする。**
   - 主張の形は `∀b ∈ $(sel). 線形の主張` に揃える。
     - 箱の辺は margin / border / padding / content に、`parent`・`ancestor` を足す。
     - 新しい規則(重なり、画面外、tap 領域の大きさなど)はこの形の主張と、その評価器に分ける。
   - 評価器は既存の領域分割をそのまま使い、反例の cell を出す。
   - 主張は量化子なしの線形に限る。これで常に決定可能に保つ。
2. **マージンの相殺を、VizAssert の 6 実数 + bool の状態で一般化する。**
   - 正と負の最大を別に持てば、負のマージンと、空の箱を通る相殺も同じ式で扱える。
   - 今 Unknown にしている「container を通る相殺」「空の子を通る相殺」を順に判定へ移せる。
   - 妥当性は W3C の適合試験 css2.1 §8.3 を 3 ブラウザーで流して確かめる。
3. **W3C 適合試験(web-platform-tests)を、モデル全体の回帰試験にする。**
   - 警告ごとの e2e とは別に、対応する部分集合の reftest を veriss で解く。
   - 結果は「判定と一致」「Unknown」「不一致」の三つに分ける。不一致はゼロに保つ。
   - 被覆率(Unknown の割合)を、部分集合が広がった指標として記録する。
4. **component 仕様を、Troika の independently-true の意味で定義する。**
   - 契約(ADR-0014/0015)が保証するのは「この部分木と、この記号的な computed style を含むどのページでも成り立つ」こと。
   - 文脈への依存は事前条件(親の幅の範囲、float が入ってこない、相殺したマージンが非負など)として書く。
   - ページ全体の主張は ⋀Pc ⇒ Q の形で確かめる。これはレイアウトを解かずに Z3 で確かめられる(`layout-z3`)。
   - component ごとに結果をキャッシュし、鍵は使われた規則だけに削る。
5. **記号的な computed style を、style 段の出力の形として明示する。**
   - style 段の値は、すでに領域によって分かれる。これを「guard(線形不等式)と値の組の列」として型にする。
   - layout 段と rules がこの型だけを読むようにする。ADR-0016 の stage 間の境界になる。
6. **既定の font size をパラメーターに加える。**
   - VizAssert は 16 から 32 を変数にした。veriss の zoom-font は既定 font size の変化を一部扱っている。
   - これを第三の変数として cell に入れれば、拡大した文字での崩れ(Cassius の healthcare.gov の例)を網羅できる。
   - ただし変数が増えると cell は 3 次元になる。region.mjs は 2 次元の多角形なので、ここは別に設計する。

### 参考にするが、今は採らない

- **レイアウト全体を SMT に渡す方式。** 決定性と反例の説明しやすさを優先し、領域分割を保つ。
  場合分けが大きいところ(float の配置など)だけ、局所的に SMT へ渡す余地は残す。
- **float の除外領域の有限化。** float は今は禁止の方針。float を許すときに、この表現(k で打ち切ってやり直す)を使う。
- **selector の木の論理(Genevès、Hague、SatCSS)。**
  - 当たらない selector と冗長な規則は、今は具体的な DOM の上で判定している(selector-usage)。
  - component のテンプレートが**取り得るすべての DOM** について判定するときに、この方式が要る。
    ADR-0014 のテンプレートと結び付けるときに改めて検討する。
- **属性文法と走査の合成(Meyerovich、PLDI 2023)。** 性能が問題になったときの差分再計算の参考にする。意味論のモデルとしては採らない。

### 採らない

- **CCSS / Cassowary / GSS。** CSS の意味論ではなく、別の言語を作るもの。ADR-0015 の案の比較の範囲。
- **ReDeCheck のようなサンプリング試験。** 網羅しないので保証にはならない。veriss の e2e は観測の確認にだけ使う。

## 未決の点

- visual logic の構文を、契約の at-rule(ADR-0015 案 B)に載せるか、別ファイルにするか。
- 3 変数にしたときの cell の表現。多面体の頂点を列挙するか、Fourier–Motzkin か、SMT に任せるか。
- web-platform-tests のどの部分集合から始めるか。候補は css2.1 の §8.3 と §10.8、css-flexbox、css-grid。

## 検証(実装する場合)

- visual logic の評価器は、既存の規則(重なり、画面外)をこの形に書き直して、出力が同じになることを確かめる。
  component-lint の eval が変わらないことも確かめる。
- マージンの相殺の一般化は、Unknown が減った件数と、3 ブラウザーの e2e(負のマージン、空の箱)で確かめる。
