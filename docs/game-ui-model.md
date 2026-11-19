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

## 具体的な入出力

`node tools/game-ui-check.mjs manifest.json` で JSON report を出す。
終了コードは outcome verified=0, failed=1, unknown/不正入力=2。
status は数理モデル上の証明結果、observationStatus は sampled/failed/incomplete/not-run。
outcome は両者を合わせた判定で、実測不一致があれば証明成功でも failed。
observationCoverage は到達状態×profile のサンプル数であり、0 も表示する。

```json
{
  "model": {
    "version": 1,
    "initial": "play",
    "states": ["play", "pause"],
    "transitions": [{"from": "play", "event": "pause", "to": "pause"}],
    "profiles": [{
      "id": "mobile",
      "viewport": {"min": 320, "max": 800, "height": {"min": 400, "max": 900}},
      "safeArea": {"top": 20}, "ua": "webkit", "dpr": 2
    }],
    "contracts": [
      {"id": "buttons", "kind": "disjoint", "target": "attack", "other": "move"},
      {"id": "size", "kind": "min-size", "target": "attack", "width": 44, "height": 44},
      {"id": "pause", "kind": "stable", "target": "attack", "event": "pause"},
      {"id": "hud", "kind": "max-occupancy", "target": "field", "overlays": ["attack", "move"], "max": "1/4", "states": ["play"]},
      {"id": "click", "kind": "action", "event": "pause"}
    ]
  },
  "documents": [
    {"state": "play", "profile": "mobile", "html": "play.html", "css": "play.css",
     "targets": ["attack", "move"]}
  ],
  "evidence": [
    {"state": "play", "profile": "mobile", "target": "field", "source": "scene",
     "assumptions": ["scene renderer covers viewport in CSS px"],
     "rows": [{"rect": {
       "inlineStart": {"coefficient": "0", "constant": "0"},
       "blockStart": {"coefficient": "0", "constant": "0"},
       "inlineSize": {"coefficient": "1", "constant": "0"},
       "blockSize": {"coefficient": "0", "heightCoefficient": "1", "constant": "0"}
     }}]}
  ],
  "observations": [
    {"state": "play", "profile": "mobile", "width": 390, "height": 844,
     "event": "pause", "to": "pause", "passed": true}
  ]
}
```

この例は pause の DOM 証拠が不足しているので Unknown。追加して初めて遷移契約を証明できる。
documents のファイルパスは manifest 相対。各文書は完全な HTML/CSS。別々の CSS を指定可能。
`boxes` と `fonts: {"Family":"font.ttf"}` で既存テキスト契約を解決する。
局所文書の `local: {assumptions: [...], origin: {inlineStart: affine, blockStart: affine}}`
は独立した文書から viewport への平行移動を指定する。省略時は同一原点。
局所 CSS は独立した containing size・継承・カスケードを呼び出し元が確立する必要がある。
自動の DOM 切り出しでこれを仮定しない。生成した DOM 証拠は profile の環境条件を照合する。

profile の幅・高さは viewport min/max と height min/max の閉区間。
ua は chromium (既定)/firefox/webkit、dpr は指定した単一値、scrollbar は既存の
{name,inlineSize,blockSize,thinInlineSize?,thinBlockSize?} (既定 overlay)。
ポインター・hover の CSS 分岐や動的 viewport を独自に仮定して Unknown を無視する機能はない。
せいぜい独立した実装由来 scene/局所モデルとして明示し、別プロファイルで試験する。
宣言された transition は全 profile に適用するため、profile により到達性が違う場合は
過大近似して検査するか別モデルで検証する。

## 領域アルゴリズムと計算量

証拠の rows は rect と constraints (affine >= 0、strict=true なら > 0)。
省略 constraints は全 profile。正規化した有理数を使い、profile から各領域を引いて空集合になること、
ペアの共通領域上で全矩形成分が一致すること、負寸法がないことを確認する。
契約はそれぞれ必要な矩形の領域の直積を交差し、反例半平面をクリップして witness を返す。
occupancy は全矩形辺の順序が変わる線で分割し、playfield 内かつ一つ以上の HUD に含まれる
小矩形の面積を加える。各凸領域で面積差 (union - max × field) は二次式となる。
頂点・辺上の停留点・内部停留点を exact rational で比較し、開境界に正値があれば内部点を求める。
空の playfield は Unknown。HUD は最大4矩形、rows 128、region 256、
契約×profile あたり30000処理の予算、state 64、edge 256、profile 16、contract 128。
予算超過は Unknown。全 CSS/全 JavaScript の証明を目的に予算を解除しない。

API は adapter-core の verifyGameUI({model,evidence,observations})・domGeometry(...)。
ブラウザー実測は tools/capture-snapshots.mjs の captureGameObservation(page,{state,profile,targets})。
実矩形は getBoundingClientRect の CSS px を小数6桁に正規化した点観測であり、スクロール状態・ブラウザー丸めを含む。
観測時の profile と state の設定、クリック後の期待状態の確認は呼び出し元が行う。
同一幅・高さの stable 観測に比較対象がない場合、複数あり一意でない場合は incomplete。
