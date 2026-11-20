# CSS の操作状態・複合状態・時間領域の検証 — 詳細設計

Status: Proposed / 未実装の設計。2026-11-20。
基準: fork main 722fbfd。特定製品の CSS ではなく、一般の HTML/CSS と有限 UI 状態を対象にする。

## 1. ゴールと現行機能との境界

同じ環境の全 viewport と、宣言された範囲で生じ得る操作状態および遷移の途中について、
指定したレイアウト契約を検証する。状態の列挙漏れ、未対応の CSS、途中のはみ出しを
静止時の成立で隠さない。既存の二状態間の契約と数学的な矩形モデルを再利用する。

| 機能 | 現行/別担当の状況 | 本設計の差分 |
| --- | --- | --- |
| 単純な hover | main: length-only の state custom property の依存閉包、独立 DOM の re-layout、fit/shift の義務 | subject 以外の状態、関係 selector、複合状態の完全被覆 |
| 状態グラフ/関係述語 | [relational/1](layout-contract-ir.md)、明示 StateIR、EnvironmentIR、EvidenceIR、ObligationIR | CSS 操作状態を抽出して既存の到達グラフへ束縛する。状態の根拠と到達性の被覆を分離 |
| 状態間の矩形比較 | [noshift/1](layout-transitions.md): main: 端点の存在と矩形同値 | 中間時刻のモデルを CSS から導出し、範囲を指定して既存の述語を検査 |
| CSS 幅遷移 | 別ブランチ automatic-width-transition の ea45f7d (公開済み)、ローカル 4b8b1ff (未 push): shared-affine 補間と狭い closed CSS の幅遷移検査 | 既存成果を統合してから拡張。別実装の追加はしない |
| Lean | lean-certificate-checker 616318f: supplied geometry/linear relational predicate の被覆、矛盾、正負証明書 | 到達性・端点対応・時間セルと CSS 抽出の根拠。Lean 実装は別担当と調整 |
| TypeScript | typescript-migration 2680b60 (確認時点): 移行中、engine-state-shifts.mts 等に関心分離あり | 移行済みの型・ファイルに接続。旧 .mjs を本設計のために再実装しない |

仕様正本は上記の既存文書。本書は将来の実装設計と受入条件であり、新しい API の現行仕様ではない。
ADR-0001 の Scene/Frame/Observation の責務、ADR-0019 の共通関係述語、ADR-0020 の既存基盤再利用を維持する。
既存の CLS 診断、layoutRect の不動、painted rect の収容、操作可能性は別の性質。
ゲーム、ポートフォリオ、業務アプリに特化した selector や URL はコアに入れない。

## 2. 全体の設計と保証

```text
HTML/box tree + CSS + 閉じた環境 + 有限アプリ状態の証拠
    ↓ (adapter: 状態ごとの DOM、永続 identity、明示イベント)
DOM identity / 関係 selector / 状態のガード / 依存関係
    ↓ (CSS core: 契約を知らずに解析)
有限の style 状態別 cascade → 既存 layout solver → state-bound LayoutIR/EvidenceIR
    ↓ (状態の被覆、端点、変更宣言を検査)
既存 StateIR/EnvironmentIR + Edge coverage + 時間区間/進捗の幾何モデル
    ↓ (ContractIR と結合して義務を再構築)
既存 ObligationIR / Z3・厳密領域計算 → 判定と反例
    └→ 任意の Lean 証明書検算 (コア runtime とは独立)
実ブラウザー観測 ───────→ 別の sampled result / 差分テスト
```

検証要求は独立して与える。実装の観察値を契約の閾値、事前条件、到達不能の根拠にしない。
証明の形は次の通り。

- 静的状態: 対象環境 e のすべての実行で生じる CSS 操作状態が列挙集合 S(e) に含まれ、
  対応する各状態の幾何モデルが実装を包含することを前提に、全 s ∈ S(e) で要求 P(e,s) が成り立つ。
- 遷移: 許された実行が edge 集合に含まれ、各 edge の全時刻/進捗が時間セルの合併に含まれ、
  各セルの幾何が実際の座標を包含することを前提に、全 (e,edge,progress) で P が成り立つ。
- 過大近似上だけの反例は候補 (Unknown + abstract witness)。実際に許された状態・edge と
  精確な幾何を使った反例、または独立の観測反例と区別する。観測は静的証明の完全性を与えない。
- 各 case ごとに coverage、geometry、predicate、reachability/source provenance を分ける。
  不足、timeout、未知、非空でない要求、境界穴、未対応の依存、モデル矛盾は verified にしない。
  過大近似で全件成立する場合はその包含根拠の範囲で成立とできるが、単なるサンプル集合では不可。
- 外部宣言グラフの範囲内の成立と、実装の全到達性の成立は別。グラフを利用者が承認した仮定として明記。
  数理証明の成功をブラウザー意味論の無条件の正しさに読み替えない。

## 3. 関係 selector と操作状態

### 3.1 問題と責務

`.menu:hover .item`、`.field:focus-within > .hint`、`.toggle:checked + .body` は
状態を持つ要素 (carrier) と宣言を受ける要素 (subject) が異なる。現行の matches の
subject 単位の Set と related/compoundMatches の状態なし再帰では安全に表現できない。
`:is()` / `:where()` 内部の状態も拒否している。

DOM 上の identity を基準とし、レイアウト用の匿名箱や折り畳んだ text run を
selector の要素にしない。display:none の要素も DOM に存在する。
既存 parser/tree が selector 評価に必要な DOM 関係を失うケースは、
元 DOM の対応を復元できるまで Unknown。Shadow DOM、slot、portal、
複数文書、未提供祖先、閉じていない CSS に跨る評価は別途対応する。

### 3.2 内部型案

以下は TypeScript での設計例。公開 API として固定するのは移行完了後のレビュー時。
新しい汎用 DSL は作らない。

```ts
type ElementId = string;  // 同一 snapshot 内で一意、path/DOM identity の対応を保持
type Truth = "yes" | "no" | "unknown";
type ActionAtom =
  | "hover" | "focus" | "focus-visible" | "focus-within"
  | "active" | "checked" | "placeholder-shown";

type InteractionFacts = Readonly<{
  hoverTarget: ElementId | null;
  focusTarget: ElementId | null;
  focusVisible: boolean | "unknown";
  activeTarget: ElementId | null; // 初版は明示事実、押下の全意味論を推定しない
  checked: Readonly<Record<ElementId, boolean | "unknown">>;
  placeholderShown: Readonly<Record<ElementId, boolean | "unknown">>;
}>;

type MatchContext = Readonly<{
  dom: DomIndex;          // parent/children/previous siblings と element identity
  facts: InteractionFacts;
  profileKey: string;
}>;
// 既存 Selector AST の各 compound に状態条件を保持し、subject/関係/関数の
// 全評価へ同じ context を渡す。特別な CSS 文字列への置換で対応しない。
function matchSelector(
  selector: CompiledSelector, subject: ElementId, ctx: MatchContext
): Truth;
```

DomIndex は既存の tree に必要な補助索引を作る最小限の役割。
一時的な style 値や layout box の path を state identity の正本にしない。
別 snapshot 間の identity は既存 target/key binding で明示する。path の一致だけで
別要素・再 mount を同一としない。

### 3.3 評価規則と cascade

- 既存 compileSelector の compound、chain、specificity を維持し、state を全 compound に保持する。
  descendant / child / adjacent / general sibling の候補を既存 neighbors 相当で列挙する。
  各候補に対してその要素での条件を評価し、関係の存在量化と compound の論理積を合わせる。
- `:is()` / `:where()` は枝の OR、`:not()` は否定。Unknown の否定は Unknown。
  `:has()` は関係の候補集合を subject から辿って存在を評価する。初めは既存 relative selector の範囲内。
  selector が判定不能でも、別枝で確実に成立する OR 等は通常の三値論理で扱える。
  forgiving list の文法的に無効な枝と有効だが未モデル化の枝を区別。後者を削除しない。
- specificity はマッチした枝の specificity ではなく、構文上の規則で計算。:where はゼロ。
  元の cascade (origin、importance、layer、specificity、scope proximity、source order、
  inline style、論理側の解決、var() の computed-value 時点) を再利用する。
- `::before/after` は originating element の操作状態と擬似箱の指定を分ける。
  generated content 自体の存在の変化は geometry/presence で評価する。
  view-transition pseudo tree や未対応 pseudo は通常 DOM に紛れ込ませない。
- :hover は対象から既知の祖先へ伝播。:focus は対象だけ、:focus-within は既知の祖先を含める。
  :focus-visible は :focus から一律真にせず、両方の可能性か明示事実。focus target の排他は単一文書前提。
  checked は現在の control 状態であり checked 属性だけでは決めない。radio の排他性は form owner/name/
  control type が完全に分かる場合だけ使う。placeholder-shown は入力状態として与える。
  :active、:visited、UA 依存の focus-visible の全推定は初版外。入力媒体の (hover:none) だけで
  :hover の全可能性を削除しない。primary capability と実際の操作状態は別である。
- media/container 条件は CSS rule の既存 guard として状態条件と積を取る。
  container サイズが状態に依存する場合は従来の region 分割で再計算する。
  未知 matcher が cascade の勝敗、外部の変数、レイアウト、契約に必要な可視性を変え得れば Unknown。
  無条件スキップや false への丸めは不可。

### 3.4 影響解析と局所縮約

最初は全 DOM と全 CSS を状態別に評価する。差分最適化は必須ではない。
rule → carrier 候補 → subject 候補 → 宣言 → var()/継承/レイアウト依存という順で
may-affect の索引を作り、stateVariableDependencies の token 化済み参照と fallback を再利用。
状態により `--size` が変わり、別の子孫の height を経由して兄弟の位置が変わる例を覆う。
未対応・inline text・keyframes/starting-style・@property・style 属性・外部依存は落とさない。

既存 partial-geometry の独立矩形抽出が状態に依存する selector を切り捨てることを禁止。
無関係と判定する場合は元の全 DOM/CSS と全状態に対して影響がない根拠を持つ。
純色のみの影響を layout のみの契約から除けても、contrast/visibility/action に流用しない。
強い pruning より先に完全再解析の正しさを確立する。

## 4. 複合状態・到達性と有限被覆

### 4.1 状態の正本

アプリの構造状態 (StateIR と adapter の DOM snapshot) と、CSS の InteractionFacts を分ける。
環境は既存 EnvironmentIR/profileKey。state 候補は (appState, interaction, profile, 構造 identity)。
pseudo-state を class の独自書換えとしてユーザー DOM に埋め込むのではなく、
抽出内部で明示する。アプリ状態、DOM の現在属性、環境、ユーザー操作の出所を保存する。

初版は固定 DOM の条件下の hover slot × focus slot × focusVisible の有限積。
各 slot は null と影響のある実 element ID を候補とする。祖先の hover 条件が同じに見えても、
子孫・兄弟の selector や DOM 状態を含めて同値と証明するまではまとめない。
focus-visible は focus が null のとき false。click、keyboard、input、checked などは
adapter の明示 edge/facts を次段階で使用する。
DOM に一意な hover hit target があるという仮定を採るのは初版の単一ポインタ/閉文書 profile に限定。
複数 pointer、touch 特有の残留 hover、top layer、描画による hit-test feedback、
hover により対象が消える/移動しつづけて静止状態が決まらない場合は被覆の根拠がなければ Unknown。
要素を hover できないことを DOM だけで決めて除外しない。

### 4.2 列挙・検証手順

1. DOM/selector の参照を inventory 化し、identity と構造 state の対応を検査。
2. profile ごとに、既存 StateIR の initial から実行可能と宣言された event edge を探索する。
   アプリグラフがない場合に勝手に JavaScript の遷移を推測しない。閉 DOM の固定構造 profile と明示する。
3. CSS state の候補積を生成して、構文・既知の排他規則だけから矛盾する候補を除く。
   除外理由を記録し、未証明の排他や hit-test 不可能性は仮定しない。
   appState ごとに全候補について cascade/geometry を独立 DOM で解く。
4. 端点ごとの領域分割を保存し、必要な target の存在、被覆、重複値の整合性、非負性を検査。
   state の違いを viewport の OR として潰さない。
5. state ID/edge を既存 StateIR に束縛し、relational/1 の ObligationIR を構築する。
   固定 viewport を横断した条件付き edge が必要なら、既存 profile と区分 region の guard を
   拡張して対応するまでは over-approx 又は Unknown。ガードを黙って捨てない。
6. 明示 edge の before/after を検査し、geometry 契約は全到達候補で検査する。
   単独の hover/focus 診断の通過を複合状態成立へ転用しない。

例: 親の content width を320px、通常 block の row を content-box とする独立 fixture。

```css
.row { box-sizing: content-box; width: auto; padding: var(--pad, 0px); }
.panel:hover .row { --pad: 20px; }
.panel:focus-within .row { width: 90%; }
```

row の横 border box は通常320px、hover のみ320px (auto 幅から左右 padding 分を引く)、
focus のみ288px、両方で328px。右辺が親を8px超える。(border/margin は0、focus は子の
focusable control、その他の条件は固定。) 正常対照は width:90% と border-box の組。
この数値は設計上の期待値で、実装時の実測で照合する。
hover だけ、focus だけで適合しても両方で全幅を超える組を検査する。
複合条件が成立しないと証明できない限り、両方の状態があり得る側で評価する。

### 4.3 被覆の分類・キャッシュ・計算量

| 規則 | 内容 |
| --- | --- |
| closed-model | 利用者が指定した有限モデルの全候補・辺。実装との対応の根拠は別 |
| conservative | CSS 状態集合が実際の操作状態を包含する根拠付き。候補反例は到達確認が必要 |
| observed | Playwright 等で観測した状態と辺。回帰確認用で、完全被覆の証拠ではない |
| incomplete | 不明な操作/DOM/外部イベント/上限・欠落。関連する契約は Unknown |

被覆記録は state inventory、初期候補、生成規則 version、列挙済み候補、排除理由、
未解決集合、必要な edge 集合と照合結果、source/profile fingerprint を持つ。
複数 initial が本質的に必要な場合は実際の initial 集合を表現するよう既存 StateIR を改訂。
架空の描画初期状態や存在しないイベントを追加して既存契約の対象にしない。

state 数と edge 数の直積爆発を避けるため、完成済み既存上限 state64/edge256/profile16/
region256 を初期予算の既定として再利用する (別上限を黙って増やさない)。
予算には matcher 候補探索、変数閉包、layout work、幾何行数、義務数も合算。
被覆不足が判明したら残りを省いて verified としない。影響が独立と証明できる別契約だけは成立を維持する。
初期実装で初期候補から一意に同じ cascade が得られた state も別 identity のまま保持。
同じ style・region・依存 graph と full profile であることを確かめた後に geometry の計算だけ共有する。

既存 geometry/proof session へ state signature、DOM identity mapping、carrier facts、dependency/projection、
profile、solver/schema version をキーとして渡す。名前の一致、同じ静止矩形、別 profile の証明では再利用しない。
状態を除去した古い証拠の再ラベルを拒否する。state/edge の被覆は cache hit でも再評価。
合成は state mapping・親側の実際の binding・割当・依存境界の一致を確認し、
既存 compose の前提を弱めない。時間契約の proof transfer は初版外。

## 5. 遷移中の幾何学的検証

### 5.1 端点との違いと対象

CSS transition の進捗に伴う width/height、gap/padding/margin、位置等の変化を
既存の関係述語 (収容、重なり、最小サイズ、指定座標の不変など) に接続する。
端点の安定/fit をそのまま全途中の成立にしない。時間に依存する不変条件と
レイアウト不変 (noshift) と実際の描画 frame/CLS を区別する。

初版の CSS 自動導出は別ブランチの verifyCSSWidthTransition を再利用し、
閉じた DOM、対応する長さの幅遷移、固定 viewport、対応済みアンカー/レイアウト、
開始/終了値と transition の仕様を確定できる場合のみ。汎用化前に元の
width 実装の条件 (同傾きの min/max、単調性、閉じた cascade) と証明根拠を監査する。
min/max の途中の切替を共通アフィン矩形と呼べるかは別に確認し、単に端点範囲内なら
envelope として扱う。特定要素構造での成立を全 Flex/Grid に拡張しない。

### 5.2 中間モデル (内部データ案)

既存 TransitionIR は端点用で意味を維持する。時間を扱う拡張データを同じ /transitions の
実装境界内に置く。以下は型の意図であり新 profile の公開名を決めるものではない。

```ts
type Progress = { id: string; min: Exact; max: Exact };
type MotionCell = {
  edgeId: string;
  profileKey: string;
  viewportGuards: readonly AffineConstraint[];
  progressGuards: readonly ProgressConstraint[];
  // 一つの共通進捗、独立進捗の外側近似、又は保守的な矩形 bound
  model: "shared-affine" | "independent-affine" | "envelope";
  rows: readonly MotionGeometryRow[];
  provenance: MotionDerivation;
};
type MotionEvidence = {
  edgeId: string;
  sourceState: string;
  targetState: string;
  sourceProfileKey: string;
  destinationProfileKey: string;
  progress: readonly Progress[];
  cells: readonly MotionCell[];
  coverage: "complete" | "incomplete";
  assumptions: readonly string[];
};
```

MotionGeometryRow は境界・存在・座標種別 (layout/painted)、target identity、各セルの値または
下限/上限を持つ。MotionDerivation は computed-value pair、変更 property、依存した CSS rule、
interpolation kind、timing/duration/delay、geometry が当該 property とどう関係するか、
被覆の導出規則を持つ。不透明な自由文だけで complete を認定しない。
全データは有限の JSON、厳密有理数、既存 affine/region を使い freeze。
呼び出し側の補間仮定と自動導出された事実を provenance で区別する。

### 5.3 CSS から導出するアルゴリズム

1. edge の同一 viewport/profile、同一の target identity、前後の DOM、computed style を抽出。
   変化した longhand を shorthand 展開後に同定 (var()、inherit、!important、state の関係を含む)。
   raw CSS の文字列差だけでは transition の実効対象を決めない。
2. 実効 transition-property/duration/delay/timing/behavior と before/after-change style を評価。
   複数リストの対応、重複 longhand、all、starting-style、登録済み変数の型、keyframe の cascade は
   仕様通りに導出できるものだけ。単純な許可リストの段階でそれ以外は Unknown。
   CSS Transitions/Animations/Values/Selectors の解釈は実装着手時に対象仕様版を固定し WPT と照合。
3. 一定の viewport で、各 property の補間を数式又は包含区間として表す。
   CSS の property progress と矩形の progress を同一と仮定しない。
   used value、% 基準、min/max/clamp、box sizing、flow、flex/grid の拘束、
   transform の基準サイズが変化するならそれを含めた導出が必要。
4. 単一 progress の対応済み線形式は既存 verifyInterpolatedPredicate 相当へ渡す。
   複数 progress は初版では独立 [0,1] の保守的外側近似。時間同期が証明できない限り
   同一 progress に縮約しない。beyond bounds easing は外側近似を健全に導けるときだけ許可。
5. 切替境界 (media、min/max の比較、離散 property、keyframe) はセルに分けて
   被覆と全域の評価を行う。セルの境界で最大値や違反を落とさない。
   DOM 消失/出現は明示 presence とし、矩形がない状態を 0 の矩形に置換しない。
6. 端点と途中を含む義務を独立に作り、要求が時間の全域で成り立つか検査。
   snapshot の stateKey と motion evidence の edgeKey を必ず照合する。

### 5.4 数学的な扱い (Z3 を無理に非線形化しない)

同一 viewport e で線形比較 L(R,e) ≤ 0 を考える。R(p,e)=(1-p) R0(e)+p R1(e)、
p ∈ [0,1] が **全参照座標について**成立するなら、
L(R(p,e),e)=(1-p)L(R0(e),e)+p L(R1(e),e)。
等号・厳密不等号と線形比較の conjunction も端点で成立すれば途中で成立する。
R0/R1 が異なる viewport cell を持つ場合は共通領域を交差し、各端点の被覆を先に検査する。
この補題は viewport における bilinear term (p×width) を SMT の QF_LRA に入れずに使える。
ただし shared progress の導出自体が必要である。

異なる p_i で R = R0 + Σ p_i D_i という affine-in-progress が証明でき、
progress box と viewport 領域が独立なら、各固定 e で線形述語の最大は progress box の
頂点にある。全 corner 義務は既存 affine region/Z3 へ落とせる。
頂点数 2^k の予算超過で Unknown。複数 property の相互作用が bilinear-in-progress となるときも
multi-affine と証明済みで rectangular 独立領域なら corner bound が使えるが、初版では未対応。
時間と viewport の guard が混ざるセル、非線形変換、非凸の feasible progress 領域への拡大は
原則 envelope を使う。包含根拠がない端点外挿や粗いサンプリングは認めない。

矩形の上下限からみた健全な bound (interval/affine envelope) で線形述語を成立させられる場合は
保守的に成功してよい。bound が要求を満たさないだけでは違反を確定しない。
OR/NOT/NE、disjoint、面積比は一般に凸不変条件でない。述語の論理を変えず、
全時間セルの充足を示せる手続きが入るまで Unknown。
例えば A が B の左から右へ移動する場合、両端で disjoint でも中間で重なる。
異なる時間進捗で A の右辺と B の左辺が動く場合も、共通 progress と誤認してはいけない。
具体例: A の右辺=40+100p、B の左辺=60+100q。共通 p=q では常に20px離れる。
独立進捗 p=1、q=0 では A の右辺が B の左辺を80px越える。同期の根拠がなければ前者の証明は使えない。
disjoint の対照では A/B の縦区間が重なっていることも固定する。
後段で必要性を確認してから、既存領域演算/SMT 経由で符号が一定なセル等の扱いを追加する。
任意の QF_NRA を solver fallback にして成功判定する方針は採らない。

### 5.5 時間境界と対象外

- delay/negative delay、duration 0、離散切替、steps、overshoot、reversal、途中の interruption、
  keyframe 欠損、iteration/direction/fill、prefers-reduced-motion を明示的に分類。
  初版は単一完了 edge の bounded easing、それ以外は安全な包含を導出できなければ Unknown。
- easing の進捗範囲を証明できれば、時刻そのものが不要な不変条件には全 [0,1] を使える。
  しかし 100ms 時点等の時刻指定、同期、event dispatch、反転短縮、CSS animation-composition の
  合成規則は別問題。時間を近似して到達確定の witness にしない。
- viewport resize/スクロールと同時の変化、動的 image/font load、DOM mutation、JS animation、
  View Transition API、WAAPI、transform での任意回転/3D、clip/hit-testing は未対応。
  paint-only として除去可能な明示 property も契約の座標種別・表示性と依存を確認。
- 仕様上の不変条件を満たすことと、ブラウザーの非連続な丸めや frame タイミングの完全再現は別。
  整数 CSS px の browser differential は妥当性検証であり、実数全域の証明でも frame の保証でもない。

## 6. Lean と証明書の接続

Lean 側は 616318f の実装を前提に、既存の relational certificate を拡張する設計とする。
独立の runtime や別 DSL を production に増やさない。Lean は任意利用の独立検算。
Lean が証明した normalized model と、TypeScript が DOM/CSS から抽出するモデルの健全性は分ける。

| 定理/検査 (提案) | 内容 |
| --- | --- |
| selector_eval_sound | 対応する selector fragment の意味論に対し yes/no が正しく、Unknown は制約を追加しない |
| state_enumeration_covers | 対応する操作状態生成規則、有限候補、排除規則から全 concrete state の包含 |
| reachable_closed | 初期 state が含まれ、許された edge で閉じる集合の被覆。逆方向は path witness を検算 |
| cascade_derivation_sound | 対応 rule、rank、var() 参照/継承、論理条件から computed style が導出される |
| geometry_bridge_sound | 対応 fragment の実際の幾何意味論から抽出した係数・行・guard の等価/包含 |
| motion_coverage | edge の progress domain の非空性、区間/セルの被覆、端点と identity の束縛 |
| motion_invariant | 共通 progress 補間、独立 affine progress の corner bound、保守的 envelope の含意 |
| compose | 親割当、状態写像、環境、依存境界が成立するときのみ子契約を根拠として利用 |

Lean で reachability を検査する場合、producer が「reachable」と書いた状態だけを採用しない。
有限 graph から checker が closure を再構築するか、初期包含・閉包・必要に応じて各 state の path を検査する。
抽象 graph の正しさと実 JavaScript の抽象化の健全性は分離する。
証明書で obligation の省略、state/edge/profile の取り違え、行の改変、異なる DOM の certificate 移植を
拒否する。source input digest、schema version、canonical state/edge/target mapping、
モデル行、全義務、progress/guard、仮定を結び付ける。checker が問題を再生成し producer の status を信頼しない。
正の証明は被覆と全域の含意、負の証明は正確な witness・領域所属・述語の偽・到達根拠を確認。
closure だけで実装にない辺を除外しない。時間の envelope は反例の実現性を保証しない。

段階は、既存 Lean の rational affine/linear predicate 検算 → state/edge 被覆と端点契約 →
既存 interpolation 定理の適用条件・motion certificate → 対応する selector/cascade/geometry fragment
の意味論と抽出の証明。数学定理を先に証明しても、未証明の CSS bridge は仮定として残す。
一般のブラウザエンジンを Lean 内で再実装することは目標にしない。
受入: trusted boundary の明記、sorry/native_decide/custom axiom で新たな証明逃げをしない、
元の入力に束縛された証明書の改変テスト。既存 Lean 実験と別の checker を作らない。

## 7. 実装の配置と順序

移行担当が作業中の .mjs/.mts の両方を同時に直さない。
以下のパスはモジュールの責務を示す (拡張子は TypeScript 移行後の実体に合わせる)。

| 段階 | 編集対象 (既存モジュール優先) | 完了条件 |
| --- | --- | --- |
| A0 | selectors、tree、engine-state-shifts、変数依存、報告の型 | main と TS/width/Lean の成果を整合。matcher と state test の現行挙動を pin。まず Red を追加 |
| A1 | layout/selectors、selector-scope、css、engine の style 解決 | 全 compound への context 伝播、関係 selector、三値論理、specificity/cascade の一致。単一 hover/focus の正常/違反/Unknown 対照 |
| A2 | state enumeration、engine-state-shifts、adapter-core finite-state/UI contracts | hover×focus の被覆、明示 native facts、state-bound LayoutIR と既存 relational obligation。全状態の fit と位置変化、上限/欠落拒否 |
| A3 | partial-geometry、geometry session、relational-contract/model | 既存 projection/cache/compose の state signature を監査し、不正な再利用を拒否。完全再解析との差分一致 |
| B1 | transitions、既存 width-transition と animation-extremes | width 証明の条件を監査・合流。CSS から自動導出された bounded motion と呼出側の仮定を区別。途中だけの反例を拒否/検出 |
| B2 | transitions の motion derivation、region/relational-predicate | 対応済み property/flow の共通 progress、独立 progress bound、切替セルの全被覆。非凸 predicate・中断は未対応なら明示 |
| L | experiments/lean の既存 certificate checker | 到達性・state/edge/source の束縛、端点、motion 義務の再構築と独立検算。抽出の部分定理は段階的に追加 |

A1 は matcher、A2 は state coverage、B1 は narrow motion の source admission、
L は同一 IR の数学的 checker が主責務。A1/A2 と B1/L は input/identity/schema を先に共有し、
同一 engine ファイルの並列上書きを禁止。A3 は A2 の結果を受けてから。
B2 の非線形拡張は B1 の反例と使用例から必要性を確認して設計の再レビュー。
現状の API/TS の移行を優先し、設計で未確定の型名や数値上限をそのまま外部公開しない。

## 8. テスト設計と完成条件

対象外のサイトに対しても同じ意味論が成立することを、独立 fixture と public WPT の pin で検査する。
既存の portfolio/game 用 fixture は回帰用。一サイトだけで成功する最適化は実装しない。

| 系列 | 正常例 | 失敗/Unknown の対照 |
| --- | --- | --- |
| 関係 matcher | ancestor/child/sibling、is/where/not、has の静的枝 | state carrier を別要素へ誤適用、AND/OR 入替、unknown 否定、外部祖先不足 |
| cascade | layer/important/scope/source order、inline style、登録済み変数、fallback | 高 specificity の非成立枝、遅延解決、継承 alias の誤再束縛、未対応 consumer |
| native state | 明示 checked と未チェック、focus-visible の両候補、radio group | attribute と現在値の混同、排他規則未証明、unknown を false にする改変 |
| 複合状態 | 単独も複合も fit、同値 style の再利用 | 単独成立・複合のみ overflow、必要な候補や edge を1つ欠落、異なる identity の混合 |
| 状態辺と被覆 | 閉じた有限 graph、guard 付き幅条件と初期集合 | 到達可能 state の除外、空 graph の vacuous pass、境界一点の欠落、予算超過 |
| 時間 | 同一 progress の線形不変、単調幅遷移、独立 progress の bound | 両端成立・中間重なり、overshoot、中断、独立 progress を同期と偽る、途中の存在消失 |
| 連続領域 | viewport 幅/高さの全域、clamp 境界、厳密比較 | 600〜600.5px だけ/境界一点だけの反例、同じ領域の矛盾する行 |
| 再利用と Lean | 同じ入力・状態・証拠で一致 | 変数/selector/DOM/edge/profile/進捗/証明行を一つずつ改変、未証明 child の輸入 |

TDD: 失敗例を先に追加し、対応済み fragment の正常/違反/Unknown をすべて比較。
単体は parser/matcher、状態被覆、型検査、義務再構築、境界、solver の exact witness。
E2E は Chromium/Firefox/WebKit で selector の matches と computed style と矩形を照合し、
実際に hover/focus/checked を操作する。モーションは対応済み WAAPI の currentTime 設定/停止等で
端点・切替直前直後・内部点を再現する (API で時刻を操作できない場合は実測の限界を明記)。
ブラウザーでの点比較は連続証明とは別集計。許容誤差は実測比較用だけで、数学的違反を丸めない。
同じ source/viewport/profile を pin した独立 UI (業務フォーム、一覧、タブ、メニューなど)
と既存複数製品を再解析し、既存の成立・違反・Unknown の差を根拠付きで記録する。
未対応数の削減自体を成功指標にしない。

各段階の受入は (1) 対象 fragment の被覆と保証の明記、(2) 独立対照と 3ブラウザーの一致・
差異の Unknown 化、(3) exact solver/Lean の反例と改変検査 (Lean は該当段階)、
(4) 既存 gate (全単体、eval 不変、3ブラウザー回帰)、(5) cache 無効/有効で結果同値。
実行時間/状態数/義務数/Unknown 原因を測り、前回比・対象入力を明記する。
推測の性能保証はしない。process QA は pj 共通 supervisor/独立 PID 確認を使う。
全 CSS、全 JS、全時刻の実ブラウザー描画を証明できた、とは称さない。

## 9. 設計判断と保留

採用案: 既存の selector AST、state/geometry/contract IR、区分 affine region、Z3、
端点・時間契約の仕組みに段階的に接続する。抽出、状態被覆、時間モデル、述語検証の根拠は分離。

不採用: CSS を全状態ごとに class へ文字列置換する方法 (specificity/継承/関係/取りこぼし)、
全 predicate に端点成立を流用する方法 (非凸/複数進捗/切替)、新 solver/ブラウザーの全面再実装、
実測を静的証明に昇格する方法。既存の領域演算と独立 Lean 検算を再利用する。

トレードオフ: 安全側候補の増加と Unknown を受け入れる。高速化は依存閉包とキャッシュの根拠を
確立した後に行う。初版の closed DOM・有限操作・bounded motion を超える対象には明示の制約が必要。
仕様のどの断片を追加するか、公開 API/schema の版、予算の調整、実装の完全な reachability
をどの adapter で保証するかは実装前レビューで決める。未成立の保証を現行仕様に書かない。

参照: [既存 IR](layout-contract-ir.md)、[端点と補間](layout-transitions.md)、
[ADR-0001](adr/0001-static-layout-instability-verification.md)、
[ADR-0019](adr/0019-relational-ui-contracts.md)、[ADR-0020](adr/0020-reuse-verification-infrastructure.md)。
別ブランチの基準: [幅遷移 ea45f7d](https://github.com/kikutadev/veriss/tree/ea45f7d)、
[Lean 616318f](https://github.com/kikutadev/veriss/tree/616318f/experiments/lean)。
