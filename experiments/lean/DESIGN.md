# Lean 検証基盤: 状態・合成・CSS 意味論の詳細設計

- Status: Proposed — 以下は次段階の設計であり、実装済みの保証ではない。
- Date: 2026-11-20
- Base: Lean 研究ブランチ 616318f、既存 production IR 722fbfd、参照した TypeScript 移行作業ツリー 4f21594。
- 現行実装・再現手順・実測結果: [README.md](README.md)。
- 既存仕様: [layout-contract-ir.md](../../docs/layout-contract-ir.md)、[component-lint.md](../../docs/component-lint.md)、ADR [0017](../../docs/adr/0017-prior-art-css-formalization.md)、[0019](../../docs/adr/0019-relational-ui-contracts.md)、[0020](../../docs/adr/0020-reuse-verification-infrastructure.md)。

## 0. 全体設計と完了条件

目的は、既存 veriss の Verified を無条件に信用せず、何を前提に何を証明したのかを第三者が独立に再検査できること。既存の TypeScript 解析器、Z3、区分 affine 計算、framework adapter を証拠生成側として再利用する。Lean に別のブラウザー、JS 実行系、CSS solver を作らない。npm 実行経路への Lean 必須化、型移行ブランチへの編集も行わない。

現行の `VerissLean.lean` は二変数 affine 半平面の矛盾・被覆、`VerissLeanRelation.lean` は Boolean 述語と矩形の健全性・反例、`VerissLeanReport.lean` は元レポートから明示した state/profile/contract を選ぶ処理を持つ。次に欠けているのは「そのケースを全て選んだか」「子の証明を親へ持ち込めるか」「その矩形が CSS の意味を表しているか」の三点である。各証明は既存の健全性定理に接続する。

### 0.1 保証の層と信頼境界

| 層 | 検査する命題 | 検査しても残る前提 |
|---|---|---|
| M: 数理モデル | 全領域被覆、寸法非負、重複一致、契約真偽 | 入力モデルの由来と意味 |
| S: 状態 | 宣言グラフの全到達ケースを検査したこと | 実装状態がグラフに含まれること |
| C: 合成 | 子の有効な保証を親の条件へ移せること、親の要求への含意 | 子をその実装・配置に接続できる根拠 |
| X: 抽出 | 対応 CSS 断片の形式意味論に対してモデルが精密化/過大近似であること | parser/環境/UA/browser の意味論との一致 |
| O: 実測 | 指定環境・点・操作での観測 | 未観測の環境・状態・操作 |

S/C/X は別々の証拠種別であって単一の「認証レベル」ではない。certificate が存在しても元実装との同一性を保証しなければ M に留まる。O は M/S/C/X を昇格させない。

最終的な合成命題（概念式）:

    sourceRefinesStateGraph(I, G, α)
    ∧ sourceRefinesGeometry(I, E, G, M, β)
    ∧ coversReachableCases(G, E, C, obligations)
    ∧ allObligationsProved(M, C)
    → ∀ reachable concrete configuration q, permitted env e,
         applies(C, α(q), e) → C(β(q,e))

ここで α は状態抽象化、β は対象 DOM の border rectangle 抽出。refines の仮定を Lean に入力して無条件に証明済みと呼ばない。閉じた有限プログラム／CSS 断片でそれぞれの refines を別に導く。JS と browser の任意の挙動を含む完全性は目標外。

### 0.2 共通データ・結果

- canonical input は既存 StateIR/EnvironmentIR/EvidenceIR/RelationalContractIR または RelationalObligationIR。ケース、対象リスト、生成済み predicate、solver の結果は信頼せず checker で再構築する。将来 .mts の実装が変わっても wire schema を基準に接続する。
- 研究用 proof envelope の案（公開 API の確定ではない）:

```typescript
type ProofEnvelope = {
  version: 1;
  checkerRevision: string;
  semanticsRevision: string;
  kind: 'state-model' | 'composition' | 'css-extraction';
  inputRef: { sha256: string; schema: string };
  dependencies: readonly ProofReference[];
  certificate: unknown; // kind ごとに厳密な decoder
};
type ProofReference = {
  inputDigest: string; certificateDigest: string;
  claimId: string; profile: string; caseId: string;
};
```

実際の proof は参照先のデータを読んで canonical content と照合し、再検査する。ハッシュ/署名/キャッシュの命中のみでは数学的な証明としない。どのソースを入力したかの真正性は配布・ビルド側の責務。UA、DPR、font、scrollbar、mediaFeatures、safeArea、scripting、scroll、状態、CSS style source order 等を省略して cache reuse しない。人間向け assumptions の自然言語を数式へ自動変換しない。必要な前提は型のある明示条件と由来を持たせる。

- exact rational は既存 wire format の文字列を保持。分母正、係数長、列数、AST 深さ、データ総量を bounded decoder で検査。既存 JS 数値の decimal→rational 変換は exponents/丸めを含め仕様を照合し、対応外は Unknown。
- `verified`: 入力有効、対象ケースが空でなく、全ケース必要な証拠があり、全契約成立。
- `violated`: 許されたケース・点で実際にモデル上の要求が偽。実ソースへの反例は X の等価性や状態実現性を別途要求する。
- `unknown`: 証拠不足、未対応、矛盾、未被覆、無効入力、空ケース、予算超過、timeout、例外。
- aggregate: 有効な違反証拠が一つでもあれば violated、なければ空集合/Unknown が一つでもあれば unknown、残りが全て verified なら verified。観測失敗は別欄。無効な入力や不完全な全体モデルに対して全体成功を返さない。
- 証明結果には claimScope (declared-model / closed-fragment / source-linked-model)、証明種別、入力の同一性、前提、未検査項目、case identity、反例に対応する状態列などを付ける。既存 report.status の書換えではなく独立結果として出力する。
- 既存上限 (64 states, 256 edges, 16 profiles, 128 contracts, 32768 cases, 128 rows, 64 constraints, predicate 256 nodes 等) を超えて黙って切り詰めない。Lean 固有の予算は別記し、縮小を成功にしない。失敗は保存・再現できる構造化 reason にする。

---

## 3. 状態の到達可能性・状態間契約

### 3.1 現行との差分

`reachableIn`、`createRelationalObligationIR` は profile ごとの到達状態と対象辺をすでに生成する。現 Lean checker は利用者が指定した単一インスタンスを検査するだけなので、state report の到達性、event、to、stable、全件集約は未保証。最初にここを閉じる。一般 JavaScript の到達性決定問題には手を出さない。

StateIR v1:

```typescript
type StateIR = {
  version: 1; kind: 'state';
  initial: string;
  states: readonly string[];
  transitions: readonly {
    from: string; event: string; to: string;
    profiles?: readonly string[];
  }[];
};
```

EnvironmentProfile の viewport は固定した実行条件の下での実数矩形領域。profile が切り替わる resize/orientation change は現 StateIR v1 の event edge の意味には含めない。

### 3.2 状態の意味論と到達性検査

一つの profile p で有効な辺だけを用いる有限のラベル付き遷移系。複数の同一 event の行き先を許し、非決定的な全辺を検査。自己遷移は排除しない。無効 profile ID、重複状態/辺、未知 endpoint、空/過大 graph、initial 不在を拒否する。profile list を省略した edge は全 profile。有効 profile が異なる辺は統合しない。

Lean 側 module 案: `VerissLeanState.lean` と report decoder への接続。既存 IR を Lean の StateId, ProfileId, Edge の有限 index に正規化する。帰納的 Reach を定義し、決定手続きは BFS/閉包を再計算（最大64状態なので別 solver は不要）。

証明したい定理（擬似 Lean、以下の signature は設計案）:

```lean
inductive Reach (g : Graph) (p : ProfileId) : StateId → Prop
  | initial : Reach g p g.initial
  | step : Reach g p s → EnabledEdge g p s event t → Reach g p t

theorem reachable_spec (valid : ValidGraph g) :
    s ∈ reachable g p ↔ Reach g p s
```

実装の候補は fuel = 状態数の単調な閉包、または既存 BFS と等価な worklist。
soundness は initial と辺を辿る帰納法、completeness は探索終了集合が initial を含み全有効辺について閉じていることから導く。集合内の各頂点に到達パスを保持すれば独立証拠としても利用可。全辺閉包を確認できない燃料切れは Unknown。閉包の過大近似だけを許す場合は soundness/completeness とは別の theorem 名にする。

### 3.3 必須 obligation の再生成

```text
for profile in environment.profiles:
  reached = reachable(state, profile)
  for contract in contracts applicable to profile:
    if event absent:
      for s in reached filtered by contract.states: require state case
    else:
      for (s,event,t) in enabledEdges from reached:
        if event matches and s satisfies contract.states: require edge case
```

canonical CaseKey = (contractId, profileId, from, event?, to?)。case は契約の適用範囲とグラフから構築。report の cases や reachability、claimed verified は比較対象でしかない。target key は (endpoint, target) から (state, profile, target) へ解決し、before/from と after/to を混同しない。自己遷移でも before/after を区別し、同一 settled snapshot と扱ってよい根拠は closed normalized state の一意な geometry に限定する。

以下は静止状態 contract と event contract を相互に除外。state-only predicate に endpoint を付けるなど現 profile と矛盾する入力を拒否する。名前付き述語は canonical expanded ContractIR を入口にし、元 definitions からの展開正当性は後続の lemma で扱う。

```text
theorem cases_complete:
  obligationKeys g env contracts = exactlyApplicableReachableCases g env contracts

theorem state_verified:
  validGraph ∧ everyRequiredCaseHasCheckedProof ∧ nonemptyApplicableCases
  ⇒ all applicable reachable state/edge predicates hold over all permitted viewports
```

複数 contract のうち一つも適用ケースを持たない contract を vacuous success にしない（現行 veriss と同じ）。欠落/重複/余分な certificate を記録し、欠落があれば Unknown。CaseKey の衝突を許さない。

### 3.4 状態間の幾何と操作の意味

- `stable` は同一 viewport/profile における before/after 四座標の等値。線形 equality の conjunction に lower する。位置だけでなく寸法も対象。
- event付き predicate は既存 AST の before/after と環境値を展開し、両状態の区分の共通部分で全域を検査する。各 endpoint の geometry の total/unique を既存 `Problem.model_sound` に接続。異なる viewport を同一視しない。
- cross product の実現不能な組は矛盾証拠で除去し、全入力域を覆ったことを別に証明。予算不足を黙って drop しない。missing axis、DOM 消滅で必要 target がない場合は Unknown。
- `action` のクリック成功等は StateIR の edge が存在することとは別。到達パス、event の dispatch、実操作の成功、hit-testing の4つを分離。初版は action を Unknown + observations として保持、既存観測を形式証明へ昇格しない。
- motion 中間値は settled endpoints ではない。既存 `interpolation_within` の bounded/shared progress 前提を別 evidence として必要にする。resize 中・複数非同期進捗・一般アニメーションは今回の状態グラフの外。

反例 certificate: CaseKey、initial から from までの有効辺の列、対象 event edge（静止ケースならなし）、有理数 W,H、既存の ViolationCertificate。経路がその profile で有効、終点が from、edge 対象/値が一致、点が domain 内で predicate が偽であることを検査。抽象 may-edge を使うなら model witness と明示し、実装でその経路が実行可能とは断定しない。

### 3.5 実装由来 StateIR の健全性（3B、3A の後）

既存 deriveReactState/deriveVueState/deriveSvelteState の有限 boolean 断片を利用。adapter の AST 列挙を再実装せず、型付き boolean state machine の正規形と証拠を追加する。
入力: boolean 変数・初期値、guard/否定、literal assignment、有限 event domain、state ごとの render variant 対応。現行最大6変数・64状態。イベント context と effect を落とさない。閉じた単一 dispatch・settled render の意味論だけ定義する。

- Concrete/normalized 状態を同一視できない場合は abstraction α を明示。全初期状態を含み、全具体 step を有効な抽象辺へ写す（forward simulation、stutter を扱う意味論を採る場合も契約が失われない条件が必要）。
- 全 boolean valuations と有効 event を有限列挙し、正規化した evaluator と graph の遷移先を比較。初期値や反転結果の改変、ガード false の edge、漏れた自己遷移を拒否。
- DOM variant の一意性・対応状態、handler attachment、存在条件を拘束。JS source→normalized finite program は後続の validation または信頼前提。任意の JS から derive した結果を無条件に証明と呼ばない。
- XState の既存 export を使う場合も payload/context/actor/外部 event の閉包が明示できる時のみ。実装モデルの全到達性は観測トレースでは証明できない。props、effect、非同期、任意関数、外部入力、探索打切りは Unknown。

### 3.6 受入条件・実装順

| ID | 作業 | 受入条件 |
|---|---|---|
| S1 | decoder + Reach + 閉包定理 | 1状態、cycle、self-edge、unreachable、同 event 複数先、profile別 edge、探索結果が有効辺で閉じていない場合、無効 ID。64状態の境界 |
| S2 | CaseKey/required cases と完全性/集約 | 一件削除・追加・重複・profileすり替え・空適用を拒否。保存済み46ケースを再現し全体判定と照合 |
| S3 | stable/event predicate | 2状態のサイズ/位置差、before/after 取り違え、self-edge、狭い viewport 領域違反、部分軸不足を検査 |
| S4 | path witness | 正しい反例と無効経路/点/別profile witness を区別。違反を実装の実現性と混同しない |
| S5 | finite normalized machine | 既存 XState 実験および3 framework の有限 fixture、削除された event・context・render variant を検出 |

S1–S4 が 3A 完了、S5 が 3B 完了。既存 browser fixture が示す実挙動との比較は必須だが theorem とは別。新たな警告を出す場合だけ現行 veriss の3 UA要件を満たす。3A の初版は現行 Lean の明示インスタンス API を温存し、全ケース検査を追加する。

---

## 4. コンポーネント証明の合成

### 4.1 現行との差分・基本方針

現行 `createRelationalProofSession().compose` は子 obligation を再検証し、証拠同一性か AllocationTransfer で現在の親の幾何との等価性を確認、`verifyPredicateImplication` で Z3 に含意を問い合わせる。Lean の目的はこの手順を独立検査すること。子の proof.status、component 名、cache hit を証拠にしない。

第1段階 C1 は同一座標系で現行 schema を再利用、第2段階 C2 は親 viewport→子局所割当の affine 写像、source-backed の拡張 C5 は CSS 非干渉性/境界契約を証明できる場合だけ親全体の子内部 geometry を省略する。C5 は工程5に依存し、先に実装しない。

### 4.2 子 summary の意味

```text
Child theorem:
  ∀ eChild, stateChild, rChild,
    Requires(eChild, stateChild) ∧ ChildSemantics(IChild,eChild,stateChild,rChild)
    → Guarantees(rChild,eChild,stateChild)
Parent theorem:
  ∀ eParent, stateParent, rParent,
    ParentSemantics(...) ∧ LocalFacts(...) ∧ transportedChildGuarantees(...)
    → ParentGoal(...)
```

child requires は既存の閉じた viewport/profile と適用状態を基本にする。新しい任意 assume DSL は導入しない。明示の外部前提は親側で根拠を示せるか、親の assumptions として残る。require の成立、child model/guarantee の成立、結合の一致、含意は別々の obligation。precondition の不成立を vacuous child guarantee で成功にしない。

入力は既存 `RelationalCompositionImport`:
```typescript
{
  obligation: childObligation,
  contract: 'fit',
  bind: { control: 'left-control' },
  transfer?: {
    profile: 'child', state: 'ready',
    width: LayoutAffine, height: LayoutAffine,
    inlineStart: LayoutAffine, blockStart: LayoutAffine
  }
}
```
依存 edge は親 case、子 case、binding、transfer、子 input/certificate digest を持つ。全依存を DAG として検査し topological order で評価、cycle/missing ref/Unknown child を拒否。child proof の成立条件に parent goal や未証明 sibling を仮定として入れない。依存は最大32 import を初期上限とし、無制限再帰は行わない。

### 4.3 C1 — 同一座標系の合成

1. 子契約を工程3で選んだ該当 state/profile に対し再検査する。最初は eventなしの state-invariant linear predicate のみ。
2. 全 referenced target を明示 bind。未束縛・余剰・存在しない target を拒否。同一 target への多対一 mapping はこの初版では拒否（既存 API より狭い安全側の subset。将来 alias semantics を定義する場合のみ緩和）。
3. 親の同一 state/profile/座標系と子の環境・証拠を照合。初版は canonical value の完全一致。異なる row 分割でも全交差で等値が証明されれば将来可。partial axes は必要な軸の等値が取れる場合だけ後続対応; 初版は現行 full rectangle に合わせる。
4. 子述語を親 target へ rename し、全ての保証を premise にする。型のある local facts を加える場合は独立した親証拠が必要。文字列 assumptions から premise を組み立てない。
5. 既存の `Problem.checkVerified` を利用できる具体的 affine geometry の場合は直接再検証。抽象 rectangle について一般に含意を証明する場合は次節の抽象 implication checker を使う。
6. どれかが成立しなければ通常の親直接検証、または Unknown。含意の SAT は「この前提だけでは親契約を導けない」であり、実装違反ではない。

### 4.4 C2 — 親割当・座標系の移植

親の W,H と写像 T=(w(W,H),h(W,H),ox(W,H),oy(W,H))。初版は全て exact affine、回転・scale 座標・skew・時間・viewport依存の非線形写像は未対応。親の全域で w,h が正かつ子の閉区間内であることを既存2D checker で証明。将来 piecewise transfer なら各 guard と被覆を先に証明する。

child affine a(u,v)=a_x*u+a_y*v+a_c の代入:
    sub_T(a) = a_x*w + a_y*h + a_c

子の start は親へ持ち込む時に ox/oy を加える。size は変えない。end は start+size。guard にも同じ代入（strict flag を保持）。
子述語の operand を親述語に移すとき、parent global start/end から ox/oy を引く。width/height は w/h、safeLeft/safeTop は child の inset、safeRight/safeBottom は w/h から child inset を引く。二重に原点を足し引きしない。

```lean
-- 仕様スケッチ
theorem substitute_eval :
    eval (substitute T a) W H = eval a (w W H) (h W H)

theorem transfer_predicate_meaning :
    evalChildPredicate P rChild childEnv ↔
    evalParentPredicate (rewrite T bind P) rParent parentEnv

theorem composition_sound :
    childVerified → allocationInDomain → environmentsCompatible →
    geometryBindingCorrect → transferCorrect → implicationVerified →
    parentGoalHolds
```

座標原点だけの一致は不足。border/content/padding/allocated box の別、CSS viewport / containing block / query container の別を保持。子の profile 残余環境は現行と同様にサイズと ID 以外 canonical 同一性を求める。特に vw/vh や viewport media query を「親から割当された幅」と同義に扱うのは禁止。現行 T は数学的に表現された局所モデルの移植であり、CSS 単位の意味が局所化されたことは別の lemma が必要。
child/current parent の evidence を全交差で等値検査する。各々の total/unique、guard の被覆、dimensions を確認。未対応部分を消して等価としない。子が実際に存在する DOM path と state 対応も照合。

### 4.5 一般 implication と証明書（solver を再実装しない）

現の2D Affine (W,H) だけで任意の抽象矩形の含意は表現できない。必要になった段階で任意有限変数上の sparse integer coefficient vector を追加し、非負重みで半平面を合成して矛盾を検査する既存 `combine_sound` / `refute_sound` を一般化する。q=(W,H,各 rectangle field) の有限次元、denominator 正規化、zero coefficient の完全な相殺、strict flag を定義。変数割当は Lean が決定、producer が任意の変数 ID を混ぜられないようにする。2D への埋込が既存数学的意味と等価であることを証明し、既存高速経路は維持する。

抽象 proof obligation は次式の UNSAT と、前提が空でないことから成る。

    domain ∧ nonnegativeSizes ∧ importedGuarantees ∧ localFacts ∧ ¬parentGoal

前提の充足可能性は exact rational witness で検査。Boolean 分岐は既存 TruthTree の一般化で全分岐を検査する（または既存 solver の proof certificate を対応できる範囲で変換）。Z3 は既存の含意探索を継続し、UNSAT 文字列を Lean の theorem とせず、検査可能な不等式の重み/Boolean tree を生成する。Z3 が利用可能な証拠を返さない場合は小規模 linear fragment の Farkas/Motzkin 証拠生成を既存 Python producer から利用する。一般 SMT proof 全形式への対応や高次元 Fourier–Motzkin の無制限展開は行わない。予算/証明不能の場合は Unknown 又は直接検証。cvc5/Alethe 等の導入は実測に基づく別判断。

```text
theorem implication_sound:
  ValidContext Γ
  ∧ checkedUnsatProof(Γ ∧ ¬goal)
  ⇒ ∀ assignment, satisfies(assignment,Γ) → satisfies(assignment,goal)
```

抽象 implication 反例の充足代入は親の実装違反にはならない。親 geometry へ戻って検査し、有効な具体モデル反例を得た場合のみ violated。

### 4.6 キャッシュと証明の再利用

証明再利用と同じ問いへの memoization を区別する。再利用単位は claim/context/certificate の組であり、sourceProfileだけで key にしない。checker と semantics version、正規化 IR、binding/transfer、環境、証明済み requires、全 transitive dependency を key に含める。untrusted cache の内容をモデル/証拠として再検査できること。状態/環境/CSS/子 contract の変更は必要な依存を無効化。現行 trustedStorage と外部証明 certificate の権限を混同しない。

C5 の source-backed 形式では、子内部を opaque にできるのは次の証拠が揃う場合に限る:
- 子の閉じた style/tree に対する独立定理。
- parent→child actual interface の割当・state・環境・存在条件を証明。
- 外部 CSS/継承/containing block/query/font/overflow 等の非干渉を工程5で証明。
- parent が見ない内部座標について、child guarantee のみで parent predicate を導ける。

適合しない場合は現在の親 geometry が必要な C1/C2 に戻る。ある DOM の局所 proof を他の DOM に移植するための「似ている」heuristic を作らない。

### 4.7 受入条件・実装順

| ID | 作業 | 受入条件 |
|---|---|---|
| C1 | 子証明束・identity binding・DAG | 親子合成と通常直接検証の一致。証拠変更、欠落、cycle、違う state/UA、改変 digest を拒否 |
| C2 | affine 代入・原点・requires 検査 | W/2,固定H,(20,30) 等、非ゼロ safe insets、斜め境界、厳密端点、局所領域外を検出 |
| C3 | 一般有限変数 implication checker | 独立 Z3 と比較。複数 child の保証から親を導く。矛盾前提・非含意・未知 proof を成功にしない |
| C4 | 依存 cache と実例評価 | cold/warm・子1個変更、親変更、環境変更、proof 改変。既存 bench-relational-proof / persistent-ui を比較基準にする |
| C5 | opaque child / summary-only | 工程5で証明した閉境界に限定。子内部再計算なしでも同じ親契約、外部 CSS 侵入時は拒否 |

C1–C4 が現行 compose を独立検査できる完了範囲。C5 は追加の source-backed 合成で X の後。一般の実装・論理含意を有限次元の checker で無条件に解くことは目標外。

---

## 5. CSS から幾何モデルへの変換の健全性

### 5.1 何を証明するか

現行 LayoutIR は `analyzeHTML/analyzeLayout → createLayoutIR → layoutGeometry`、部分幾何は `projectIndependentGeometry → analyzeProjectedGeometry`。CSS parser、カスケード、長さ解決、レイアウト、領域分割を producer 側が行う。現 Lean はこの出力の数学的意味だけを検査している。

採用案は **変換検証 (translation validation)**。producer を信頼せず、元入力と結果、選択したルールの導出証拠を checker が照合する。既存 TS を逐行翻訳して同じバグを再現しない。形式化した CSS subset の独立した宣言的意味論を先に定義する（W3C 仕様の対象版/節を固定し、曖昧な UA 挙動は対応外）。

二種類の theorem を区別:
- overapprox: 許可された source layout の全てが model に含まれる。model 全域で契約が成立なら source でも成立。
- exact/refinement: model が total/unique かつ形式意味論と等価。反例もその形式意味の source layout に対応。

```text
theorem extraction_sound:
  checkExtraction(source,profile,proof,model) = true
  ⇒ ∀ e ∈ profileDomain, b,
      CSSMeaning_subset(source,e,b) → ModelMeaning(model,e,b)

theorem extraction_total:
  accepted(source,profile) → ∀ e ∈ profileDomain, ∃ b, CSSMeaning_subset(source,e,b)

theorem extraction_exact (unique/total model and matching derivations):
  CSSMeaning_subset(source,e,b) ↔ ModelMeaning(model,e,b)
```

存在・totality が欠ける場合、一方向の含意が空の source relation に対して成立してしまう。そのため source admissibility、layout existence、model coverage は別検査する。subset 意味論を browser の実装が全て満たす定理は別課題。WPT/3 UA 差分で検証するものの無限の実ブラウザー挙動を証明したことにはしない。整数px丸め、テキスト raster、描画 overflow 等は対象外を明示。誤差を導入するなら exact モデルとは別の区間保証を用いる（実測 tolerance で proof を合格させない）。

### 5.2 ソースから証拠までの境界

```text
source bytes + complete environment
    ↓ parser / build (TCB 初版)
closed DOM/CSS typed AST
    ↓ cascade / specified→computed value derivation
ComputedStyle | explicit Unknown
    ↓ used values / layout derivation
per-node semantic layout (symbolic affine pieces)
    ↓ assembly/region/target identity checks
LayoutIR / EvidenceIR
    ↓ M + S + C
contract theorem
```

X0–X1 の初版は解析済みASTを入力とし parser correctness は明示 TCB。後続の source-binding 拡張（X0b）で、対応する restricted literal syntax の token/parser validation により source byte binding を狭める。X2 の長さ規則の追加とは独立に進める。parser に未知構文を drop させた AST を closed と認めない。AST には元ソース順序、rule/declaration index、node path、namespace、attr・text、inlined stylesheet source 参照を保持する。hashed bytes と AST を照合する範囲と信頼前提を分ける。

既存 IR の layout box path、region、border/content/padding/allocated 寸法、presence と profile を参照し、新しい UI DSL は作らない。変換 trace は「なぜその宣言が選ばれたか」「どの規則で used value を求めたか」を既存 IR に隣接する証拠として保持。証拠中の最終座標を前提に計算規則を成立させない。

proposal schema (既存公開 IR の変更は別レビュー):

```typescript
type ExtractionBundle = {
  version: 1;
  semantics: 'css-layout-subset/1';
  inputs: {
    sourceDigests: readonly string[]; domAst: unknown; cssAst: unknown;
    environment: EnvironmentIR; state: string;
    parserAssumptions: readonly string[];
  };
  claims: readonly {
    target: string; nodePath: string; axes: 'inline'|'block'|'both';
    layout: LayoutIR; evidence: GeometryEvidence;
    derivations: readonly Derivation[];
  }[];
};
type Derivation = {
  id: string;
  rule: string;       // closed enum, not executable string
  premises: readonly string[];
  region: readonly Halfspace[];
  conclusion: TypedFact;
  sourceRefs: readonly SourceLocation[];
};
```

DAG の全参照を解決し、topological に型と導出規則を検査。証明していない fact を追加する rule は作らない。初版では固定 subset の独立計算で済む場合は trace より再計算を優先。proof は大きな組合せを省くために必要な場合だけ追加。任意の JS コールバックや eval は入れない。

### 5.3 CSS 意味論の段階別仕様

X0: semantics と入力境界。水平書字(horizontal-tb/ltr)、standards mode、settled state、scroll=0、overlay scrollbar、確定した UA/profile/safe area、完全な author CSS、明示の root containing block。タグ/属性/スタイルが意味を変える場合は対応を明示。font/text intrinsic sizing、replaced elements、shadow DOM、iframe、external stylesheet、animation、unknown cascade layer、float、logical axis rotation 等は依存がある限り拒否する。閉じた DOM とは「CSS/DOMの全依存を供給済み」の意味であって、単に HTML 文字列が閉じていることではない。

X1: selector と cascade。対応は universal, type, id, class, static data/aria attribute equality, child/descendant。候補宣言の全列挙又は非一致証拠、specificity と順序、importance/inline style/UA initial/inheritance のうち対応範囲を定義。初版は author normal の明示規則に限定し、勝敗に影響する !important/layer/revert/未知 pseudo 等を拒否。複雑な selector を含む rule を「matchできなかったから無関係」としない。メディア条件は profile 定数・width/height の半平面のみ、境界を厳密に扱う。media active と cascade winner を region ごとに求め、全候補の勝者が一意に決まることを形式化する。valid/invalid CSSの回復は parser 前提が未証明なら Unknown を優先。
CSS custom properties、value substitution、shorthand 展開、継承と初期値は別規則として実装し、cycle、未定義 fallback、invalid-at-computed-value-time を勝手に 0px にしない。

X2: 長さ解決と box model。px、%（軸により実際の basis を明示）、vw/vh（global viewport）、限定 calc/min/max/clamp、単位換算の exact rational。affine となる条件のみ許す。未確定 basis、負値の clamp と invalid value の違い、min/max の優先順位を形式化。border/padding/margin/content/allocated を明示。content-box/border-box と margin auto の計算、borderが幅を超える場合の扱い。padding percent が width basis を持つ等の cross-axis を記録。safe-area env は profile 値。派生する区分は既存 halfspace checker を再利用する。端点の値だけ一致していても中間の min/max 切替が誤っていれば拒否する。

X3: 配置。最初は明示サイズの viewport-fixed/absolute with definite containing block、独立した左右/上下 anchor、非置換通常 block の definite content box。例えば子の水平収容は
    x_border = parent_content_x + used_margin_left
    w_border = used_content_width + padding_left/right + border_left/right
等を CSS subset semantics の導出規則として定義（実際の解決順を含む）。
固定配置の containing-block creator を持つ祖先を除外。親 auto height、margin collapse、intrinsic、overflow scrolling 等は初版の proof profile から外す。通常 flow は高さ・余白・先行 sibling が既知の独立ケースから。% height は definite parent が必要。aspect ratio/scrollbar が他軸に干渉する場合に一軸独立としない。

X4: 部分幾何の projection 正当性。`projectIndependentGeometry` の対象 ancestor chain、除去宣言、除去 DOM を証拠として検査。必要な依存（selector/cascade、containing block、intrinsic contribution、flow placement、scrollbar、font、media/query、pseudo/生成箱、transform、float、writing mode 等）の保守的閉包を計算し、除去したものが観測対象フィールドに影響しない定理を作る。
最初は fixed definite-size + 祖先に maker/transform/etcなし。次に普通 block の inline-only、fixed block-only。元 DOM における selector match と縮約後の match、および specificity が保存されることを検査する。root :has() の固定化は元 DOM の存在条件、marker absence、specificity の等値を義務とする。paint-only transition は all/未知 property/幾何変動/スタイルによる CB 変更を含めない。不要 axis は surrogate で補って公表しない。

```lean
theorem projection_sound :
    checkProjection original reduced targets requestedAxes certificate = true →
    ∀ env inDomain,
      projectFields (cssMeaning original env) targets requestedAxes =
      projectFields (cssMeaning reduced env) targets requestedAxes
```

厳密には存在する対応 layout の関係として定義し、非全域/非一意の意味論に関数等号を置かない。元/縮約の両側が対象に対し total/unique の場合のみ上式を導く。外部 CSS の侵入や祖先/兄弟の変更は再検査。単なる文字列一致や JS projector の whitelist をそのまま axiomatize しない。

X5: Flex/Grid と高度なケース。上記の proof profile を通過した後、有限な fixed tracks / definite gap / explicit flex-basis / flex の線形配分から開始。min/max freeze、track sizing の段階、非負・合計割当・解の一意性を個別の導出規則にする。auto/intrinsic/min-content/subgrid/cyclic percent は既存計算を出力するだけでは証明済みとしない。track freeze の全分岐を検査。非線形(面積、aspect比×未知、曲線 transform) は別の数学的意味論と certificate が必要。
実際に必要なCSSの追加を計測して優先順を決め、完全ブラウザーの再実装はしない。

### 5.4 ソースとユーザー契約を分離する

CSS semantics/抽出器は ContractIR を入力にしない。抽出した source model が overflow しても数学的に正しいならそのまま証明対象にし、後段で契約違反を検出する。CSS を「契約を満たすように」解釈してはいけない。source/domain invalid と genuine contract failure は別。overapprox の偽陽性は model candidate counterexample とし、exactな対応または別の実測による違反確認があるまで source-violated と断定しない。sample の成功で抽出証拠の欠落を補わない。

### 5.5 受入条件・実装順

| ID | 対象 | 最低限の肯定・否定対照 |
|---|---|---|
| X0 | source scope / theorem skeleton | standards, complete style sources, settled environment。未知 parser input/UA/scroll/未宣言ソースの拒否 |
| X1 | selector/cascade | 競合 specificity、同 specificity の source order、inline優先の対応又は拒否、条件付き media、未知 selector、候補 rule 削除 |
| X2 | exact values/box | border/content box、padding%、safeArea、calc/min/max 切替、負サイズ、欠落係数、狭い guard gap |
| X3 | fixed/absolute/block subset | 片/両 anchor、中心 auto margin、CB祖先変更、margin/overflow/intrinsic依存、正常と違反 |
| X4 | axis-independent projection | 祖先 selector、root :has、float sibling、generated content、aspect-ratio、非幾何 transition、unknown shorthand、片軸不足 |
| X5 | Flex/Grid | fixed/minmax tracks、freeze 分岐、gap/余白、複雑 dependency で Unknown、ブラウザー差の明示 |

各段階の完了条件:
1. Lean theorem と executable checker が Lake build で通り、`#print axioms` に sorryAx/独自公理なし。型付き解釈関数に対する正しさ（単なる checker の別実装との一致ではない）。
2. accepted proof の肯定対照、計算/guard/元 declaration/依存/環境の改変を拒否する否定対照。
3. pinned WPT の対応 fixture と既存 e2e を再利用して Chromium/Firefox/WebKit で比較。viewport境界・その隣・狭い反例と複数軸の組合せ。点観測の tolerance は区別し、CSS mismatch が出た規則の採用範囲を狭める。
4. ポートフォリオ/ゲームに限定しない通常の component fixture を少なくとも同時に検証する。保存済み実データを再生し、どの証拠種別が増えたか、Unknown の理由、環境、入力ハッシュ、件数、処理時間を記録。覆っていない CSS をカウントから隠さない。
5. X0–X4 を通過した subset だけを「CSS 意味論の抽出検証対応」と呼ぶ。X5 は対応規則単位で追加する。任意 HTML/CSS/JS の完全証明を完了条件にしない。

### 5.6 意味論と証明器の接続定理（横断作業）

JSON/AST の decoder を信頼する範囲を記録し、受理済み型付き IR について source 述語・数理モデルの意味が一致することを一貫して証明する。工程3/4/5共通で、独立した意味論と executable lowering を定義し、単なる二つの計算結果の一致を一般定理の代わりにしない。

- schema version/kind、field presence（省略と明示 null の扱い）、未知 field、重複 ID/JSON property、正の分母、source order を厳密に検査。JSON parser が重複を潰す場合は raw parser validation または明示 TCB。現研究用 decoder の仕様をそのまま production の契約にしない。
- 原文 AST→typed literal→affine/guard→operand→predicate の各 lowering の意味保存。現行の normalizeAffine_sound、Scaled.plus_sound、Scaled.mulLiteral_sound、compareFormula_sound を再利用し、AST 全体の構造帰納法と、名前付き述語展開の意味保存を追加。
- geometry row の結合は各 row の guard を AND し、全 candidate の cartesian product を含むか、除外した組の不可能性を証明する。単体の model validity と結合後の totality/correctness を接続する。
- canonical cases の検査を通した全 state/profile/edge と、source の state/render mapping とを結合する。state 情報のない snapshot は一状態の宣言モデルに限定し、動的実装の全状態を暗黙に保証しない。
- 受理した concrete certificate から直接 theorem を得る経路と、Lean interpreter の計算結果をログにする経路は区別。kernel reduction で確認する問題が元の入力から再構築された問題と同じであることを検査できる artifact を残す。

---

## 6. 実装ロードマップと担当境界

着手計画（2026-11-20）: 既存の研究ブランチ内で S1 の有限グラフ
閉包と S2 のケース再生成を先に実装し、閉包未成立・漏れ・空集合を
拒否する検算と kernel テストを追加する。次に S3/S4 の既存関係証明との
接続、CSS 幾何モデルの独立検算、連続時間領域の検算を進める。
時間は settled state と区別し、共有進捗の前提を明示する。
完了条件は元 IR からの義務再生成、健全性定理、正常・改変 fixture の
kernel 検査、未対応の Unknown、既存 checker 回帰の確認。
TypeScript 作業ツリーは変更しない。

| 順序 | 作業束 | 入力依存 | 完了成果 |
|---|---|---|---|
| 3A | S1–S4、全ケース checker | 現 M | graph + cases + cross-state + path witness の定理と実測レポート再生 |
| 3B | S5 有限 normalized state | 3A、既存有限 parser | dispatch-level forward simulation と state→DOM variant binding |
| 4A | C1/C2 | 3A、現 M | 既存 composition import の独立検査 |
| 4B | C3/C4 | 4A | 抽象 implication certificate、DAG依存、再利用比較 |
| 5A | X0–X3（並行可能な規則は分離） | 現 M、既存 CSS→LayoutIR schema | 閉じた CSS subset の形式意味論と抽出 checker（AST 入力） |
| 5A+ | X0b source-binding と 5.6 の意味保存 | 各 decoder / semantic lowering | parser TCB の縮小、source と証明対象の結合 |
| 5B | X4 | 5A | 部分幾何の対象軸同値性 |
| 4C | C5 | 4B,5B,必要なら3B | source-backed opaque child composition |
| 5C | X5 | 5A/5B | 対応する Flex/Grid 規則の追加 |
| 接続 | TypeScript IR export と Lean adapter | wire schema 合意、対象工程の受入 | 任意 opt-in の別プロセス検証、互換ドキュメント |

最優先は S1–S4 のまとまった完成。状態列挙器は Lean 内で再計算でき、既存の反例/被覆 checker を使える。C1/C2 はソース完全性に依存せずモデル上で証明可能。opaque child を先に作ると X4 が未保証のまま独立性を仮定するため順序を逆にしない。CSS 規則の数学的意味論・証拠データ設計は状態実装と独立に進められるが、同一 public IR の編集を並行で行わない。

既存の Lean module を無意味に分割しない。新規の責務がある場合に `VerissLeanState`, `VerissLeanComposition`, `VerissLeanCSS` 等へ分離、report/source decoder は境界に留める。実装に着手するとき個々の theorem 名、型、テスト fixture を本設計と照合して更新する。

### 6.1 テストと評価

- TDD: 失敗する fixture（省略・改変・未対応）→健全性定理→checker→正常/不正入力→kernel concrete proof→既存 IR との比較。
- 現 baseline の保存モデル35件、関係契約46件（28/4/14）は再生基準。数値は固定対象の回帰確認であり普遍的品質の指標ではない。入力更新時は source hash と dataset を区別する。
- 個別証明を `by decide` で再検査し、定理の axiom audit を継続。実際の report binding/JSON decoding の信頼境界を明記。証拠生成器が計算した Plan を直接 theorem の入力にするだけでは source lowering の証明ではない。
- 全体計測は proof generation / checker / serialization / Lean startup / cache を分け、同一入力同一環境の複数回中央値、サイズ/証明数/Unknown 数、ピーク負荷を記録。既存の15.43秒計測は単回 baseline、速度目標の保証ではない。
- 既存 production code の変更を伴う工程は `tools/gate.sh` と3 UAの差分試験。Lean 独立実装は Lake build と専用 test/replay、既存 gate の実行対象を明記。新しい warning は既存方針に従い、観測を定理へ昇格しない。GitHub Actions は使わない。
- TypeScript 側の作業完了後、現行 schema/declarations を読み直し、research branch の root が異なっても exported IR で接続できることを fixture で確認する。現状の .mjs/.mts ファイル名や関数実装に依存する binding を公開 API にしない。

## 7. 設計判断と非目標

採用候補: verissを証拠生成、Leanを独立検査、Z3を探索（既存 ADR-0019/0020 を延長）。証明検査の信頼計算基盤を小さく保ち、数理モデルから source に向かって信頼範囲を狭める。

比較して不採用: 全面 Lean 移植（既存 parser/solver/TypeScript adapter の重複）、Lean 内の汎用 JavaScript モデル検査器、全 CSS/描画実装の再構築、外部 SMT の UNSAT や署名された verified をそのまま theorem にする方式。既存機能の速い通常経路と厳密な任意検証経路を分ける。TLA+/XState 等を状態モデル出力として利用できるが、現段階で新たな必須依存は追加しない。

未解決: 現実の任意 JS の到達性、非同期イベント/resize の semantics、任意 CSS の動的 cascade/font/overflow/hit test、CSS parser/HTML parser/browser の全域同値性、一般 occupancy の非線形証明。これらの解決は本設計の仕様完了と混同しない。仕様拡張の判断は対応できる実例、健全性、実測コストを基に行う。
