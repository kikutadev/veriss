# レイアウト契約の IR(ContractIR / LayoutIR / ObligationIR)

> isle の [`docs/layout-contract-language.md`](https://github.com/mizchi/isle/blob/HEAD/docs/layout-contract-language.md) のうち、書き方(isle の `layout SafeGrid { ... }` などの構文)によらない部分を移した。構文・Vite・CLI・親子の差し替えは isle の文書にある。

## 三つの境界

1. **ContractIR** は profile・必要な割当領域・保証を宣言します。CSS から逆算して契約を変更しません。
2. **LayoutIR** は component・CSS の解析結果です。ContractIR を受け取らず、配置・条件領域・到達候補・信頼する仮定を保存します。
3. **ObligationIR** は両者の照合結果です。必要条件の範囲で、入力の被覆と保証違反を別の query にします。

ソース宣言の参照と位置は LayoutIR の binding metadata に引き継ぎますが、その内容を寸法・到達領域を求める前提には使いません。

すべて JSON にできる immutable な build-only データです。検査器・IR・Z3 を生成アプリへ追加しません。数値の正本は rational string で、数値表示は近似値です。

## 実装の意味と保証

環境を e、到達可能状態を s、配置を b とします。契約の必要条件を R、外部の信頼仮定を A、保証を G、実装の抽象意味を M と置きます。

```text
Conforms(I, C):
  Admissible(I, C.profile)
  AND every permitted input/state has a defined model
  AND forall e, s, b:
    R(e) AND A(e, s) AND M(I, e, s, b) => G(e, s, b)
```

`R` は検査範囲を選びます。`G` は実装モデルへの仮定に追加せず、`R AND A AND M AND NOT G` で反例を探します。信頼仮定をラベルから数式として解釈したり、内容が収まるという宣言を自己証明に使ったりしません。

初版の外部仮定は既存解析の `LayoutIR.assumptions` から証明結果へ引き継ぎます。ContractIR から `assume` 文や任意の述語を入力する機能は未実装です。

LayoutIR は以下の寸法を区別します。

| 寸法 | 意味 |
| --- | --- |
| allocated | in-flowではGridからの割当。明示サイズのabsoluteではCSSが決めたused border rectangle。子の要求と照合する入力 |
| border | 実装 CSS が作る border box |
| padding | border を除いた padding box。absolute の局所座標系の基準 |
| content | padding・border・適用される scrollbar gutter を除いた content box |

既存 report の `inlineSize` / `blockSize` は border 寸法のままです。`allocatedInlineSize` / `allocatedBlockSize` と、常時記録する `contentInlineSize` / `contentBlockSize` を追加しました。auto row 等で割当高さが definite でなければ allocated.block はありません。その地点へ両軸の子契約を接続すると Unknown です。

## 被覆を先に検査する

適合性の数値 query の前に、別の query で次を検査します。

- requires の入力が空でないこと。
- 契約が要求する領域を、CSS を抽出した領域が覆うこと。
- 到達候補・scrollbar profile の各 case で、root の配置が定義されること。
- 各 box の存在条件で、その box の border/content の両軸と割当幅が定義されること。

被覆違反・未対応 CSS・解析不完全・solver 不明は Unknown です。部分的な領域の UNSAT を全体の成功にはしません。clip / scroll / visible など、既存 API で fit を弱めた解析結果も、この最初の profile では Unknown にします。既存 API 自体の各 overflow 方針を削除したわけではありません。

hostInset が20pxなら、割当幅160–640pxを調べるための viewport は180–660pxです。640pxまでしか抽出していなければ、被覆不足になります。

## API

```js
import { analyzeLayout } from '@mizchi/veriss';
import {
  createContractIR, createLayoutIR, createObligationIR,
} from '@mizchi/veriss/src/layout-contract.mjs';
import { verifyContractObligation } from '@mizchi/veriss/src/layout-contract-node.mjs';

const contract = createContractIR({
  component: 'Four',
  requires: {
    inlineSize: { min: 160, max: 640 },
    blockSize: { min: 40, max: 640 },
  },
});
const report = analyzeLayout(tree, { // tree: the box tree (an adapter, or analyzeHTML's input)
  css: '',
  viewport: { min: 80, max: 640, height: { min: 40, max: 640 } },
});
const implementation = createLayoutIR(report);
const obligations = createObligationIR(contract, implementation);
const result = await verifyContractObligation(obligations);
// result.coverage と result.proof を独立して確認できる。
```

Worker では `verifyObligationIR(obligations, z3API)` を使います。Node adapter は公式 bindings の初期化と thread の破棄を所有します。

## 根拠と今後の証明

[独立 SMT 仕様](https://github.com/mizchi/isle/blob/HEAD/models/layout_contract/contract.smt2) と CSS 由来の違反式を XOR で照合します。4箱・gap 8px・responsive の境界・子48pxの要求について UNSAT、40pxを41pxへ壊した実装では SAT になります。gap と159pxの故障した境界は Chromium で反例を再現し、184pxの割当・160pxの分岐へ修正した場合も実測します。

これらは定義した例の照合です。抽出器全体について必要な健全性、すなわち「許可した実ブラウザーの観測が M にすべて含まれる」の一般的証明は未実装です。到達状態・CSS parser・box model 抽出器を信頼し、text/font の bound・native scrollbar・host・ブラウザー丸め等の仮定も証明結果へ残します。

relational/1 に一般の関係述語 AST を導入しました。次は子 summary のインポート、部分集合の抽出の健全性と合成定理です。契約文法を増やす際も ContractIR と LayoutIR の独立性を維持します。

```sh
just layout-contract-check
```


## relational/1 汎用 UI 関係述語

設計判断は [ADR-0019](adr/0019-relational-ui-contracts.md)。コンポーネントへの割当と収容を保証する
SafeGrid/PositionedGrid は維持し、任意の UI の要素間の幾何関係・状態端点の関係を同じ /contracts API
の relational/1 profile に追加した。検証コアは HTML parser やブラウザーを呼ばず、
adapter が既存の LayoutIR から EvidenceIR を生成する。以前の用途別検証器と
snapshot の矩形比較もこの profile に統合した。

### IR と保証の境界

| IR | 正本 |
| --- | --- |
| ContractIR | 独立した意図。関係述語、適用状態・profile、定義と対象束縛。実装データから述語を逆算しない |
| LayoutIR | 既存 CSS の抽出結果。先に独立して構築する |
| StateIR | 一意の状態 ID、初期状態、from/event/to の有限遷移。環境ごとの遷移制約は任意 |
| EnvironmentIR | 証明要求の閉じた幅・高さの範囲、ブラウザー、DPR、scrollbar、safe-area、入力/フォントの仮定 |
| EvidenceIR | state/profile/target ごとの区分的 affine 矩形と出所。DOM, local-dom, scene, external |
| ObligationIR | 契約×適用 profile×到達する状態/遷移、必要な対象と端点の有限集合 |
| Proof/report | 被覆・整合性の判定、反例、証明の環境・状態グラフ、根拠・仮定、観測の別判定 |

すべての新 IR は有限の JSON データをコピーして freeze する。実行可能コードを含めない。
既存の Grid profile 用型名は維持し、TypeScript の全 profile は UIContractIR /
UIObligationIR / UIContractProof。createContractIR, createObligationIR, verifyObligationIR の overload が
profile を選ぶ。

StateIR の初期状態から profile ごとに到達グラフを列挙する。
transition の profiles は有効な profile の ID、未指定なら全 profile。
contract の states/profiles は適用範囲で、event がある場合は対象遷移の from で
states を評価する。ある要求 profile で該当状態/遷移がないときは Unknown。
このグラフと環境は独立した要求・抽象化であり、JS 実装から全到達性を自動抽出したと主張しない。

EvidenceIR の各 rows の rect は viewport 原点を基準とする未スクロール CSS px の
軸平行矩形、各座標は exact rational affine の coefficient × width + heightCoefficient × height + constant。
rows の constraints は affine >= 0、strict=true の場合 > 0。省略は全 profile。
対象の存在・一意性、有限領域の完全被覆、重複領域での値の一致、非負寸法を先に検査する。
証明対象でない別契約の Unknown を成功に変えない一方、独立した証拠による別契約の証明を妨げない。
契約は実装の外部仮定に混入させない。被覆後に「存在する環境 e で NOT predicate(e)」を検査し、
非空なら exact rational の witness を返す。予算超過・未対応は Unknown。
この証明はモデルを条件とするもので、ブラウザーそのものの意味論の証明ではない。

LayoutIR の geometryComplete は元の解析が verified・両軸・完全な構造であること。
SafeGrid 専用の complete（弱めた overflow policy を拒否する等）と別の記録とし、従来の判定を緩めない。
layoutGeometry は一構造/プラットフォーム case の LayoutIR しか受け入れず、
target は一意の要素 id、明示 target または paths による native path 対応。証拠の領域は元の report の
range と region を保存する。host inset 0、同一 origin が必要。
局所文書は独立 containing size、継承、閉じた cascade を生産者が確立し、
local.assumptions と必要なら origin（inlineStart,blockStart の affine 平行移動）を明記する。
外部モデルも生成元の根拠は信頼仮定。下記の制限付き自動切り出し以外の任意の DOM、手書き矩形と実装の同値性、
Canvas 内部の投影などを自動証明しない。LayoutIR 由来証拠は profile の署名を照合する。
受け取った LayoutIR から分からない UA/フォント等は生産者が環境を証明範囲に束縛する信頼仮定。
input / fontProfile は環境識別子で、未対応の pointer/hover media 分岐を勝手に成立させない。

### 自動部分幾何 (independent rectangle projection)

`domGeometry` は元の DOM/CSS 解析を先に行い、完全な矩形証拠が得られない対象ごとに
独立した幾何の自動抽出を試みる。`partial:false` で従来の全入力解析のみとする。
`bindings: {"surface":".viewport-canvas"}` のように、一意の単純な class/id へ名前を束縛できる。
束縛を指定した対象は自動抽出経路を使う。手書き local または boxes と自動抽出を混ぜない。

- 元の祖先チェーン、適用しうる規則とカスケード優先順位を維持する。
  3値のセレクター判定で関連を否定できない未知規則は拒否し、Unknown 発生箇所だけを理由に規則を消さない。
- 明示した寸法の通常ブロックと、両軸の基準位置およびサイズが決まる絶対/固定配置に限定。
  除外した兄弟・内容への依存、未解決の継承・含有ブロック・外部 stylesheet、動的選択子、
  geometry を変える animation、未対応の intrinsic sizing 等を拒否する。
  疑似要素は生成しないか、全適用候補で通常フローから独立すると確認できる場合だけ除く。
- 完全な standards-mode snapshot、閉じた author CSS、overlay scrollbar、初期スクロール位置、
  horizontal-tb/ltr、明示した環境の両軸を前提とする。自動抽出は最大32対象。
  残った縮約文書を既存の解析器で計算し、完全な LayoutIR の矩形と領域のみ relational/1 の証拠にする。
  元の全ページ report、他の契約、見た目・hit-test・アクセシビリティの検査結果は変更しない。
- 証拠は source=local-dom、仮定、被覆付き区分アフィン行または理由付き Unknown。
  この方式は万能な CSS 依存解析でなく、対応外の入力で証明を拒否するための限定プロファイルである。

ローカルビルドに対する繰返し確認（作業環境の browser supervisor 下で実行）:

```sh
node tools/eval-ui-build.mjs tools/ui-build-examples/sumi-no-tachi.json /path/to/dist /path/to/captures
```

JSON は model（状態・遷移・環境・契約）、points（実測点）、screens（state/click/wait/targets/event/from/settle）。
手計算の寸法や固定 CSS ハッシュは不要。各状態の初回 snapshot と CSS を保存し、
原本のハッシュ、契約、別の viewport 実測・比較を出力する。外部通信は遮断し、
失敗した単純な外部 import の除外は offline 環境の仮定に限定する。
同一状態の DOM と author cascade が全領域で不変、CSSOM mutation がないことは呼び出し側の前提。
異なる点で幾何が一致しなければその証拠を Unknown に戻す。action の実測成功を形式証明としない。
終了コード 0=全要求 verified、1=違反/実測失敗/捕捉エラー、2=Unknown。
座標比較は丸めの差を許容する観測照合であり、有理数モデルの厳密証明とは区別する。

### 述語 AST と合成

`kind: "predicate"` は次の JSON grammar。
- compare: relation lt/le/eq/ge/gt/ne と left/right の線形 operand
- all/any: items の論理積/論理和、not: item の否定
- use: name と bind（定義側 target 名 → 利用側 target 名）。
  definitions に定義を置き、展開時に未束縛・循環・予算超過を拒否する。

operand は rational string（"44", "1/2" 等）、{target,field,endpoint?}、
{environment}、{op:"add",items}、{op:"scale",factor,item}。
field は inlineStart/blockStart/inlineSize/blockSize/inlineEnd/blockEnd、
endpoint は before が既定、after を使う場合は event が必須。
environment は width/height/safeLeft/safeTop/safeRight/safeBottom（safeRight/Bottom は座標）。
比較式は半平面の分割へコンパイルし、all/any/not は領域交差・和集合・補集合として厳密に扱う。
複数の子の述語を同じ target と親の座標に束縛して再利用できるが、
別環境で得た子の証明結果をそのまま流用する仕組みではない。

within-viewport, contains, disjoint, min-size, stable はこの AST への糖衣構文。
接触は non-overlap とし、stable は遷移端点の矩形を比較する。
max-occupancy は target の矩形内の overlays の和集合面積 / target 面積の上限。
辺の順序で領域を分割し、各セルの二次式を exact rational の頂点・辺・内部停留点で最大化する。
開境界の反例は領域内の点を探索し、空 target や精度予算超過は Unknown。
この非線形述語は単独契約とし、v1 で任意の Boolean AST 内へは入れない。
action は実測で期待遷移へ進んだかを評価し、形式証明の status は Unknown のまま。

### API と CLI

実行できる通常のアカウント設定画面例: [packages/veriss/examples/relational.mjs](../packages/veriss/examples/relational.mjs)。

```js
import {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,
  createObligationIR,verifyObligationIR} from '@mizchi/veriss/contracts';

const contract = createContractIR({
  component: 'Settings', profile: 'relational/1',
  definitions: {control: {op:'compare',relation:'ge',
    left:{target:'item',field:'blockSize'},right:'44'}},
  contracts: [
    {id:'save-size',kind:'predicate',predicate:{op:'use',name:'control',bind:{item:'save'}}},
    {id:'stable-save',kind:'stable',target:'save',event:'submit'}
  ]
});
const state = createStateIR({initial:'editing',states:['editing','saving'],
  transitions:[{from:'editing',event:'submit',to:'saving'}]});
const environment = createEnvironmentIR([{id:'web',
  viewport:{min:320,max:1280,height:{min:400,max:1000}}}]);
// facts: layoutGeometry({state,profile,layout:createLayoutIR(report),targets}) の結果を集める
const evidence = createEvidenceIR(facts);
const proof = await verifyObligationIR(createObligationIR(contract,{state,environment,evidence}));
```

verifyUI({model,evidence,observations}) は同じ IR 構築手順の簡易 API。
model={version:1,component?,initial,states,transitions,profiles,definitions?,contracts}。
manifest={model,evidence?,observations?,documents?}、documents の各項目:
{state,profile,html,css,targets,bindings?,partial?,local?,boxes?,fonts?,defaultFontSize?}。
ファイルパスは manifest 相対。CSS は順序を維持した完全な閉じた author cascade。
fonts: {"Family":"font.ttf"} で boxes の既存テキスト契約を解決する。

```sh
node tools/ui-check.mjs manifest.json
node tools/css-lint.mjs --contracts --fail-on-unknown manifest.json
```

前者は詳細 JSON、後者は既存 lint 形式 (E_UI_CONTRACT, U_UI_CONTRACT, E_UI_OBSERVATION,
U_UI_OBSERVATION 等)。ui-check は verified=0, failed=1, unknown/不正入力=2。
lint は従来と同様 --fail-on-unknown で未検証を終了コード2にする。

観測は {state,profile,width,height,rects?}、rects は target ごとに {x,y,width,height}。
action は {state,profile,width,height,event,to?,passed}。観測側は
tools/capture-snapshots.mjs の captureUIObservation(page,{state,profile,targets}) で測定できる。
同一 viewport の端点の組が一意でなければ不明、self-transition の観測は別途対応が必要。
実測の状態や成功遷移が宣言グラフに存在しなければ E_UI_OBSERVED_STATE。
status は数理証明、observationStatus は sampled/failed/incomplete/not-run、
outcome は両者の結果（モデルが verified でも観測違反なら failed）。
observationCoverage は各到達 state/profile のサンプル数で、0も表示する。
実測の成功は未被覆を埋めない。

### 上限

state 64、遷移256、profile16、契約128、ObligationIR case 32768、evidence/observation 4096。
各証拠 rows 128、半平面64、処理内の領域256、AST 展開256ノード・深さ32。
契約×profile の処理予算30000、occupancy overlay 4。上限超過は Unknown または不正入力として拒否。
全 CSS、全 JS、描画・clip/hit testing・アニメーション中間状態まで一般に保証するものではない。
