# ADR-0020: 既存検証基盤の再利用と veriss の責務

Status: Proposed (fork)
Date: 2026-11-20
Base: 01bc749 (relational/1 と viewport-dependent spacing を含む)

## 背景と目的

ADR-0017 は CSS 形式化の先行研究を既に調べている。ADR-0019 の汎用関係述語を追加した後、
JavaScript 状態解析、コンポーネント証明の合成、描画、契約生成を新たに拡張する案が出た。
既に解決済みの部分を作り直さず、現代的な CSS/DOM の連続領域検証とソース診断に集中できる境界を確認する。
この ADR は既存仕様を変更するものではない。採用候補と再現実験、次の採用判定を記録する。

## 調査結果と判断

### CSS 形式化とモジュール証明

- [Cassius (OOPSLA 2016)](https://doi.org/10.1145/2983990.2984010)、
  [VizAssert (PLDI 2018)](https://doi.org/10.1145/3192366.3192407)、
  [Troika (OOPSLA 2019)](https://doi.org/10.1145/3360577) は
  [同じ公開リポジトリ](https://github.com/uwplse/Cassius) に実装されている。
  確認した HEAD は [60dad9e9](https://github.com/uwplse/Cassius/tree/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824)
  (2022-12-24)、MIT。README の実行条件は Racket、Z3、Firefox/Geckodriver、Selenium。
  CSS 2.1 の block/inline/float 等を中心とし、現在の veriss の Flex/Grid や状態別 adapter をそのまま置換できない。
- [ソースの assertions.rkt](https://github.com/uwplse/Cassius/blob/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824/src/assertions.rkt)
  と [assertion examples](https://github.com/uwplse/Cassius/blob/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824/bench/assertions/assertions.vizassert)
  は箱の探索、関係述語のコンパイル、性質のカタログの参考にできる。
  既存 relational/1 は固定 target に対する有限の線形述語であり、Visual Logic の selector/量化/描画木の探索等を全部実装したわけではない。
  汎用 DSL を再度設計し直さず、必要な述語だけを既存 IR に追加する。
- Troika 論文 §4–6 と [proofs.rkt](https://github.com/uwplse/Cassius/blob/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824/src/proofs.rkt)、
  [verify.rkt](https://github.com/uwplse/Cassius/blob/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824/src/verify.rkt)、
  [modularize.rkt](https://github.com/uwplse/Cassius/blob/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824/src/modularize.rkt)、
  [prune.rkt](https://github.com/uwplse/Cassius/blob/60dad9e9b2b4de3b13451ce54cdc1bd55ca64824/src/prune.rkt)
  を確認した。独立した component specification と、仕様群がページの要求を含意するかの検査を分離する。
  cache は HTML/CSS/対象/環境/性質の完全な一致を基本とし、検査器ごとに安全な pruning を行う。
  実測や admit を使う proof step もあるので、すべての成功結果が無条件の静的証明とは限らない。
  現在の veriss の SafeGrid/PositionedGrid は親子 binding と割当要求を扱うが、
  親ページ由来の LayoutIR で再帰的に検査しており、独立した証明済み summary を任意の親へ輸入する機能とは違う。
  relational/1 の named predicate 展開も証明再利用ではない。
- **判断:** Troika の合成原則・キャッシュ設計を採る候補とする。Racket エンジンの全面移植、別の SMT solver の開発は見送る。
  共通断片での独立比較を行う余地はある。コードを調査したのみで、Cassius を実行して veriss と速度・精度の比較は行っていない。
  調査ホストに Racket は未導入。直接ソースコピーもしていない。

### 利用できる外部基盤

| 技術 (参照) | 採用判断と保証の限界 |
| --- | --- |
| [Z3](https://github.com/Z3Prover/z3) | 既存 z3-solver を利用し続ける。親子の含意・被覆・独立した検算に使う。現在の区分 affine な region/cell 計算は証拠抽出と反例領域に必要であり、直ちに全部置き換えない。 |
| [XState v5 graph](https://stately.ai/docs/xstate/v5/graph) | 既存モデルを持つ利用者が、探索結果を StateIR へ変換できる。下記の実験で確認。veriss core の依存に加えず、利用側/任意 adapter に責務を置く。 |
| [TAJS](https://github.com/cs-au-dk/TAJS) (Apache-2.0) | アーカイブ済み。ES3/ES5 の部分モデルと DOM 等の既知の不完全性があり、現代 SPA の到達性保証の基盤には採らない。 |
| [Jelly](https://github.com/cs-au-dk/jelly) (BSD-3-Clause) | Node.js の call graph/points-to 解析を中心とし、README 自身が健全性を意図的に弱めていると説明。候補抽出への試用は別途判断し、これを完全な StateIR として証明しない。 |
| [Playwright](https://playwright.dev/docs/actionability) | 既存の実測基盤を使う。クリックの receives-events 判定、試行 click、スクロールや動作の再現。点の観測なので全 viewport・全状態の無条件の証明には使わない。 |
| [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0) | 一般 a11y の実行時検査への任意連携候補。既存の静的な全域の幾何/a11y 検査とは保証が異なり、削除の根拠にはしない。 |
| [Web Platform Tests](https://github.com/web-platform-tests/wpt) | 既存 fixture を pin してモデルの差分照合に再利用する。対応する testharness/reftest を選ぶ。ブラウザー実測と Unknown を別集計。 |
| [ReDeCheck](https://github.com/redecheck/redecheck)、[Viser](https://github.com/redecheck/viser) (MIT) | DOM サンプリングによる崩れの探索と視覚確認。旧ベンチマーク・欠陥パターンの参考。veriss の連続領域の保証を置き換えない。 |
| [Taffy](https://github.com/DioxusLabs/taffy)、[Yoga](https://github.com/facebook/yoga) | 具体的なレイアウト計算器。共通断片の点の照合には使えるが、連続入力の記号的な被覆と反例を得られるわけではない。ブラウザ同値性を仮定してエンジンを移植しない。 |
| [Daikon](https://plse.cs.washington.edu/daikon/) | 実行トレースから不変条件の候補を得る考え方を参考にする。現実装から導いた不変条件を承認なしに製品の仕様へ昇格させない。 |

### 接続実験: XState の StateIR への変換

XState 5.33.4 (MIT) の公開 API `getAdjacencyMap` を使い、boolean context と guard を持つ保存フォームで
状態グラフの列挙を実施した。Context の区別を落とすと、未変更時 SAVE と変更あり SAVE の遷移が混同される。
状態 ID は snapshot の value/context の組から割り当て、イベントを遷移へ対応させる。
本例では5状態、9辺（自己遷移を含む）。未変更で SAVE はガード拒否の自己遷移であり、操作の成功と解釈しない。
保存中を含む DOM の状態は試験側が独立に供給したもので、実際のアプリから自動抽出したわけではない。
既存 `domGeometry` と `verifyUI` のみを使い、全証拠で verified、保存中だけ高さ48→40pxで violated、
保存中の証拠を欠落させると unknown。幅320–1280、高さ400–900。反例800×650。
min-size は5状態、stable は SAVE の2遷移を検査。

再現 (追加の production dependency なし。ダウンロードした package は再取得できる一時物):

```sh
test_dir=$(mktemp -d)
npm pack xstate@5.33.4 --ignore-scripts --pack-destination "$test_dir"
tar -xf "$test_dir/xstate-5.33.4.tgz" -C "$test_dir"
node experiments/xstate-contract-import.mjs "$test_dir/package"
rm -rf "$test_dir"
```

npm registry の integrity は sha512-eGNMu3BNqU0Z85P+ouYG5OCZqIABU+QsW6vUieFt9p9gOGs3C+BL10Exg7XdRPSXPQKlP6XoYpYf93r9VmW8mQ==。
探索結果の輸入は、それだけで実装の到達性の完全性を保証しない。
イベント payload の有限ドメイン、context/actor の状態同一性、時刻や非同期イベント、外部参照と副作用を明示する必要がある。
状態の直列化で区別を落とす、探索上限で中断する、未知のイベントを省略する場合を合格にしない。
外部 actor の実行や任意コードの評価を veriss の静的 core に入れない。
利用側の明示した閉じたモデル、外部から渡した StateIR、観測由来のグラフは区別する。

## 次に実装する場合の採用順と完了条件

1. 部分証明/独立 summary の設計を ADR-0017 / Troika と合わせる。
   親の配置が子の requires を満たすこと、子が宣言対象の全環境で独立に成立すること、
   親の局所事実と各子の保証が全体の要求を含意することを別の obligation にする。
   CSS cascade・継承・containing block・query・フォント、環境と状態の同一性を根拠に含める。
   現状の手書き局所モデルの仮定だけで独立性を自動承認しない。
   既存の SafeGrid 親子境界・進行中の部分幾何の取り組みを再利用し、重複実装を避ける。
   正常・割当不足・外部 CSS 侵入・被覆不足を区別できることが受入条件。
2. summary とキャッシュは同一の検証器 version、実装・契約・環境・依存関係が一致する場合から始める。
   unknown・観測 pass・証拠なしの自己申告を証明済みとして輸入しない。
   循環的な契約依存を仮定で成立させず、個別証明が可能な非循環の合成から始める。
   pruning は安全な依存解析ができるまで行わず、誤った再利用と未変更の再計算時間を比較する。
3. 状態の輸入を小さな任意 adapter に留める。XState で guard/context/イベント payload と不完全な列挙をテストする。
   現在の framework adapter の有限テンプレート分岐を活用し、任意 JavaScript 抽象解釈器は作らない。
   自動抽出が必要な個別ケース（有限 reducer など）が実サイトで現れた場合に限定して設計する。
4. WPT と実ブラウザを比較用の正本とし、実サイトで支障が出た CSS から対応を拡大する。
   hit test・描画の無条件の証明を目標にせず、列挙可能な幾何条件と実測を分ける。
5. 契約生成は型を持つ既存 adapter と DOM/ARIA/明示ポリシーを使い候補だけを出す。
   実装の現在値を唯一の正解にしない。ポリシーと製品固有の意図を分離する。
   反例からの再現テストは既存 Playwright API を利用する。

## 不採用の選択肢と影響

- 先行研究の全機能のポート、Web ブラウザー同等のレイアウト/ペイントエンジンの内製、
  JS の汎用 abstract interpreter の内製は、現状の目的に対して過大であり採らない。
- 既存の CSS solver を全面廃棄する案も採らない。現代 CSS から区分的な実装証拠を抽出する機能は veriss の中心。
- この調査は実装範囲の再評価であり、外部ソフトウェアの導入判断・可搬性・性能・ライセンス遵守を網羅的に検証したわけではない。
  XState 以外は公開文書とソースの比較を主とする。相互運用の E2E や新規依存の追加は未実施。

## 実装判断追記: native composition / incremental session

目的: 既存の relational/1 を用い、証明済みの局所契約を独立の保証として再利用。
完了条件: (1) 不変な証拠と環境・述語に対する case-level cache、変更した根拠だけを無効化、
(2) 既存の独立幾何の根拠と明示 target binding を照合した子保証から親述語への含意を Z3 で確認、
(3) 不一致・循環・未証明は通常の検証へ戻すか Unknown、含意の反例は実装違反と混同しない、
(4) 正常・欠落・改変・複数状態のテスト、独立 SMT 照合と時間測定。
本段階では同じ座標系・同じ state/profile の完全一致を入口とし、任意の親割当への証明の移植はしない。
既存の region 演算を高速経路として残し、汎用的な含意判定を Z3 へ委ねる。
cache はプロセス内の session を所有者とし、外から供給した proof を信頼しない。

### 実測結果と仕様

実装の正本は [layout-contract-ir.md](../layout-contract-ir.md#証明セッションと条件付きの合成)。
`node experiments/bench-relational-proof.mjs` で同じ合成データ (32契約、各8区分) を11回計測。
Apple Silicon, Node v26.12.1、中央値: 通常26.75ms、初回 cache 有り23.12ms、
全一致3.49ms、1対象の変更4.70ms。前処理済み ObligationIR を検証する時間であり、
実際の CSS パースや幾何抽出を含まない。合成だけで常に高速化するとは主張しない。
同じ証拠の一致から始め、一般の parent allocation への証明移植は未実装。

補足測定 (単発、合成データ): 12対象、各8区分、幅または高さの異なる境界を持つ。
各対象の width >= 44 から合計 width >= 528 を導く試験。
通常経路は比較 budget 超過で Unknown (798ms)、合成は Verified (177ms)、
同じ含意の再利用は Verified (7.13ms)。これは異なる方式の単回比較であり一般的な速度保証ではない。
HTML/CSS の12個の操作部品 (Grid 1/2/3列、400/600px境界) を用いた別試験では、
9回の中央値で幾何抽出174.56ms、通常証明5.47ms、再利用1.39ms。
現実の反復開発では幾何抽出の差分化が次の性能課題となる。

統合版 da05940 の gate は exit 0。全6単体テスト群失敗0、component-lint 4回差分なし、
Chromium/Firefox/WebKit E2E 360件成功、QA supervisor 647 PID追跡・残留0。
旧 main 上でのゲートは並行変更との統合に伴い意図的に中断し、統合版で全件再試行した。

## 次段階: 幾何抽出の差分再利用

目的: 証明より重い HTML/CSS → LayoutIR を再利用し、変更後の反復を短縮する。
既存の独立矩形 projection を毎回新しい原文に対して成立させ、その縮約 HTML/CSS と
全解析環境が一致する場合だけ解析結果を再利用する。DOM/CSS の非依存性を単なる
文字列差分や class 名だけで推測しない。全体解析は原文と全 options の完全一致に限定する。
同一 session のメモリ内で再利用し、永続 cache は別課題。
通常ルートの判定は維持し、独立矩形を優先する明示設定は projection が失敗したら全体へ戻す。
完了条件: cold/warm の同一結果、独立要素変更/祖先変更/未知の selector/
環境・font/box の変更、不完全 geometry/キャッシュの改変を検査する。
複数状態の manifest と CLI から再利用可能とし、抽出を含む計測と3ブラウザーの回帰を行う。

実装と API の正本は [幾何抽出セッション](../layout-contract-ir.md#幾何抽出セッション)。
`node experiments/bench-incremental-geometry.mjs` (arm64, Node v26.12.1、各9回の中央値) の結果:
通常 Grid 12対象で未キャッシュ239.14ms、同一入力0.33ms、変更時220.98→239.73ms。
独立した12対象・120無関係ルールで312.64→10.50ms、1対象変更で309.68→37.89ms。
独立矩形優先モードは全体解析の前処理も省くため、速度差は cache 単独の効果ではない。
通常 Grid の CSS 変更時は全体解析を省けず、cache 登録のコストが加わる。
実サイトの性能保証ではなく合成 HTML/CSS fixture の測定。

実サイトの確認: 保存済み portfolio HOME の HTML/CSS (従来の監査と同様 loading node を除去) は
既存3契約とも Unknown。View Transition selector、native/foreign element 等の未対応依存により
geometry cache の hit は0。判定も従来と一致した。合成データでの高速化を実サイトの高速化と混同しない。
c5a83d5 の gate は exit 0、6単体テスト群失敗0、component-lint 4評価不変、
Chromium/Firefox/WebKit E2E 363件成功、QA supervisor 638 PID追跡・残留0。

## 完成条件の残り: 配置の移植、永続再利用、有限状態

- 移植: 子の局所 viewport へ親の幅/高さから affine 変換し、配置原点も affine で与える。
  親の全範囲が子の証明範囲内、非サイズ環境が一致、変換した子の矩形と親の現在の証拠が
  全範囲で等しいことを既存 region 演算で検証。子述語を親座標/環境に置換して含意を確認。
  自己申告の割当や翻訳だけを根拠に親を Verified にしない。非線形/未被覆を拒否。
- 永続化: Node CLI の明示的なローカルキャッシュ。解析器ソース/依存/ランタイムが同じこと、
  入力同一性、認証したキャッシュ内容を確認する。ローカルの同一ユーザーによる生成物のみ信頼、
  他者から配布された証明や未署名データを輸入しない。破損・異版・過大・Unknown は再計算。
- 有限状態: 既存 framework parser/展開器を利用し、閉じた boolean UI の初期値と click 更新を
  導出する限定プロファイルから開始。外部 props/effect/任意関数/非同期/未対応構文を Unknown。
  状態の到達性と DOM 変種の一意な対応を検査し、既存 relational/1 に接続。
  既存の自由なテンプレート列挙を実行到達性の完全証明とは扱わない。
- 正常と反例、欠落、browser 境界、永続データ改変、実行結果との比較を試験。
  既存 gate と fork main 統合を行う。任意 JavaScript の全状態/全 CSS の証明は完成条件に含めない。
