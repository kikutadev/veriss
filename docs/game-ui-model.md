# Game UI verification model v1 (fork)

## ゴールと完了条件
既存の全ページ HTML/CSS 検証を維持し、ゲームの抽象状態・環境別に契約を独立検査する。
DOM の局所モデル、Canvas の実装由来矩形、HUD 占有率、遷移端点、操作観測を同じ報告に載せる。
実装・正常/違反/未被覆の回帰テスト・3ブラウザー照合・実ゲーム評価・全 gate・fork main 統合を行う。

## データ境界
- model: version=1, initial, states (一意の ID), transitions (from/event/to), profiles (一意 ID、閉じた幅/高さ範囲・safeArea)、contracts。
- evidence: state/profile/target ごとに独立した矩形モデル。座標系は viewport 原点の未スクロール CSS px。
  矩形の各成分は exact rational affine (w,h,constant)、有限の半平面で定義する区分。
  CSS の全ページモデル、独立した局所モデル、ゲーム側から供給した Canvas 幾何を区別する。
  局所・Canvas は出所と信頼仮定を明記し、ゲーム全体への無条件保証としない。
- observations: 具体的な state/profile/viewport で測定した矩形と操作結果。
  観測による pass は証明と別。観測で失敗する契約は反例候補として扱う。
- report: 契約別・状態/遷移別・環境別の判定、未被覆理由、反例、信頼仮定、到達状態と未観測状態。

## 意味
初期状態から宣言された遷移を BFS で列挙する。これは抽象グラフの到達可能性であり JS の完全性を証明しない。
各プロファイルの指定範囲全体で契約を検証する。プロファイルは互いに独立。
必要な対象の存在、一意性、有限領域の被覆、矩形の非負寸法、同一領域上の記述の整合を保証前に確認する。
未対応・矛盾・被覆不足・予算超過は Unknown。別契約の結果は失わない。
全状態が検査されていない、あるいは条件が一度も成立しない契約は Unknown。

## 契約
- within-viewport: safeArea 内の初期表示矩形
- contains / disjoint: border rectangles, 接触は許可
- min-size: 両軸の最小寸法
- stable: 指定 event の到達遷移端点で同じ矩形 (中間フレームは対象外)
- max-occupancy: playfield と HUD 矩形群の交差の和集合面積 / playfield 面積。重複を二重計上しない。
- action: 指定状態で実行した操作が期待状態へ到達すること。実測ラベルのみで静的な到達性を保証しない。

スクロール後のボタンへの到達は within-viewport と異なる。action 観測でクリック・期待遷移を測る。
Canvas は世界座標・投影・DPR を実装側で CSS px へ写像した矩形を受け取る。
非軸平行、3D、透明画素、任意ヒットテスト、ゲームロジックの正しさ、全 JS 状態の網羅は保証対象外。
