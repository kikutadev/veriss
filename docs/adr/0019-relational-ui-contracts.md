# ADR-0019: 汎用 UI 契約の関係述語プロファイル
Status: Accepted (fork); supersedes ADR-0018.

## 背景
ゲーム固有の検査器を増設したため、既存 ContractIR/LayoutIR/ObligationIR と
責務が重複した。用途ではなく保証の種類と抽出可能なモデルで境界を引く。

## 決定
既存 /contracts API に relational/1 を加える。SafeGrid/PositionedGrid は
親割当と収容を扱う既存 profile として維持する。関係述語 profile は
StateIR (有限到達グラフ)、EnvironmentIR (閉じた viewport と実行条件)、
EvidenceIR (既存 LayoutIR 由来または明示モデル) を受け取り、状態/環境/契約別の ObligationIR を生成する。
検証は純粋コア内。HTML 抽出・ブラウザー観測は adapter/CLI の責務。
式は型付けされた JSON AST とし、任意の JS コールバックを証明器に入れない。
既存の領域演算を共有し、論理述語は線形半平面、面積は専用の二次式判定を用いる。
子契約の再利用は述語と target binding の合成であり、子の proof を無条件に移植しない。
実測を証明に昇格させず、被覆不足は Unknown。既存ゲーム評価は汎用 API の利用例に移す。

## 代替と影響
新たな汎用 DSL/solver を別パッケージに作る案は既存 IR との分断が増えるため不採用。
SafeGrid の制約を緩和してすべてを一つの profile にする案は既存の収容保証を損なうため不採用。
一般 JS の到達性・局所境界の自動証明・任意の描画意味は別課題として残す。
