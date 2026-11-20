# 引き継ぎ(2026-11-19)

isle から切り出した CSS 検証器(veriss)を、別のマシンで続けて開発するための文書。今どこにいて、何をどう続けるか。

## 今どこにいるか

- `main` に全部入っている(このセッションの作業も)。isle は veriss を git 依存で使う利用者になった(isle の `package.json` の `@mizchi/veriss` が commit を指す)
- **静的検査のパターン**: [docs/static-check-checklist.md](static-check-checklist.md) に F1〜F106(このセッションで F79〜F106)。カテゴリごとの進み具合と残りの観点は [TODO.md](../TODO.md)(52 / 77)
  - 保留: F91(段組の外の `break-*`。印刷を対象にするか未決)、F95(`li{display:flex}` でマーカーが消える。警告の条件が未決)
  - 見送り(実測したら効いていた): flex の `text-indent`、`perspective`、表のセルの `max-width`
  - 健全性の修正: F89(`calc(100%-10px)` を 100%−10px として計算していた)、F99(引用符のない不正な `font-family` を適用していた)
- **モジュール分割**: [ADR-0016](adr/0016-module-decomposition.md)。M1〜M5 が済み、M6 から
  - M1 `src/color/`(色の数学。依存なし)
  - M2 `test/module-boundaries.test.mjs`(import の向きの検査)
  - M3 構文の段の結果を `notes[]` に(`src/rules/syntax-notes.mjs` が文言)
  - M4 捨てた宣言を `style.$dropped[]` に(`src/layout/dropped.mjs`)
  - M5 CSS の誤りの検査を `src/rules/css-mistakes.mjs` の `createCssMistakes({ report, facts, tools })` に
- **実験**: [experiments/style-language/](../experiments/style-language/README.md)(ADR-0014・0015 の構文案 A〜E と、今の veriss での扱い)

## 始め方

```sh
git clone https://github.com/mizchi/veriss && cd veriss
pnpm install
npx playwright install chromium firefox webkit   # e2e は 3 ブラウザで測る
tools/gate.sh                                     # push の前に毎回。20〜30 分かかる(eval が長い)
```

- ブラウザーが既定の場所にないときは `PLAYWRIGHT_BROWSERS_PATH` を指定する
- 1 つのパターンだけの e2e: `npx playwright test -c playwright.layout.config.mjs --trace off e2e/layout-css-mistakes.spec.mjs -g F106 --project=chromium --project=firefox --project=webkit`
- 解析器の読み方を見る: `node tools/probe.mjs '<css>' ['<html>']`
- 宣言が効くかを 3 ブラウザで比べる: `node tools/browser-diff.cjs '<css>' '<css + 宣言>' '<html>'`

## パターンを足す手順

1. 候補を 3 ブラウザで実測する(`tools/browser-diff.cjs`)。**中身と条件を変えて何通りも測る**(1 文字のセルで差が出ず、効く宣言を候補にしたことがある)。対照(効く場合)も一緒に測り、比較が空振りでないことを確かめる
2. 解析器の今の扱いを見る(`tools/probe.mjs`)。verified なのに値がブラウザーと違えば健全性のバグ(最優先)
3. 単体テストを先に書く(`packages/veriss/test/css-mistakes.test.mjs`)。落ちることを確かめる
4. 実装する。置き場所は検査の種類で決まる:
   - 宣言が文法上不正でブラウザーが捨てる → `css.mjs` の宣言の読み込みで `note('W_…', {...})` して宣言を捨て、`src/rules/syntax-notes.mjs` に文言を足す
   - computed style を作るときに捨てる(効かないので解に入れない) → `css.mjs` で `drop(values, reason, property, value)`、文言は `src/rules/css-mistakes.mjs`
   - box と祖先の style から判る → `src/rules/css-mistakes.mjs`(必要な事実は `createCssMistakes` の引数で受ける)
   - 判定できない値は **Unknown のまま**(成功に変えない)
5. e2e(`e2e/layout-css-mistakes.spec.mjs`)、新しいコードなら `packages/adapter-core/src/lint.mjs` の説明、チェックリストの行、TODO.md の観点を更新
6. `tools/gate.sh` が通ったら commit して push

## 次にやること

- **M6**: `solve` の中に残る「効かない宣言」の判定(`reasons` の一覧)を `rules/css-mistakes.mjs` に移す。layout の段は「親の display」「flow の中か」を事実として出す。レイアウトが Unknown のときに検査をやり直す `walkStyles` をなくす
- **M7**: `rules/contrast`(色の規則を `src/color/` の上に。祖先の塗りの鎖だけで判定し、後ろに重なる箱の判定だけ layout があるときに足す)
- **M8**: a11y を DOM の規則と幾何の規則に分ける。integrity と CLS も規則にする
- **M9**: 境界テストの許可が空になったら `packages/` に分ける
- **パターン**: TODO.md の残りの観点(色の関数の不正、`@supports` / `@layer` / `@font-face` / `@property`、`<col>`、`letter-spacing`、3D の transform、フォーム部品の差、重複した `id`、`:has()` の中の状態、ブラウザー差の測り方)
- **isle から移す候補(未移動)**:
  - `models/css_layout/`、`models/layout_contract/`(Z3 検査・契約検査を照合する独立した SMT 仕様)。isle のテストが読んでいる。veriss に置くなら `packages/veriss` の外では isle から読めないので、置き場所と isle のテストの参照を一緒に決める
  - `tests/types/css-verifier.mts`(veriss の型定義の検査)。veriss に TypeScript の検査を入れてから
  - isle の `package.json` が veriss の API を `@isle/prototype/layout/*` として公開し直している。残すか、利用者に veriss を直接使ってもらうか

## 落とし穴(このセッションで踏んだもの)

- ゲートの実行中に作業ツリーを変えると、結果がどの版のものか分からなくなる。ゲートの間はツリーの外(一時ディレクトリ)で準備する
- `css-mistakes.test.mjs` は 1 ファイルで 20 秒以上かかる(止まっているのではない)
- Playwright の `setContent` はページのグローバルを持ち越す: script の `const` はブロックで包む
- WebKit の `::selection` の基準には `::selection{--z:1}` の規則が要る。canvas は描かれるのを待ってから撮る
- div を `display: list-item` にしてもマーカーは箱の左外に描かれて写らない(`ul > li` で比べる)。グラデーションは固有の大きさがないので `list-style-image` の対照に使えない(SVG の data URL を使う)
- `perspective` は none 以外でスタッキングコンテキストを作る。`text-wrap` はショートハンドで `text-wrap-mode` を wrap に戻す(`nowrap` の後に `text-wrap: balance` を書くと折り返しが戻る)
- quirks モード(doctype なし)の WebKit は単位のない長さを px として受ける。解析は標準モードを前提にする
- a11y の e2e は `evals/results/layout-accessibility/` を書き換える(コミット済みの `report.json` は古い)。コミットに混ぜない
- pnpm の git 依存では `workspace:*` が解決しない(内部パッケージは peerDependencies `*`)。`font_ffi.js` のビルド結果は `.gitignore` の否定でコミットしている

## isle との関係

- isle は veriss を `github:mizchi/veriss#<commit>&path:packages/veriss` で使う。veriss を変えたら、isle の pin を上げて isle の照合テスト(`just css-verifier-check`、`just css-text-check`)を回す
- isle に残るのは isle の利用者側だけ: テンプレート → 箱の木(`lib/layout*`)、vite のビルド、`.isle` の例と eval、isle の構文(`layout SafeGrid { ... }`、`@noshift`)の文書

## fork: relational/1 (2026-11-20)

汎用 UI の関係述語 profile を既存 contracts API に統合した。現行仕様は [layout-contract-ir.md](layout-contract-ir.md#relational1-汎用-ui-関係述語)。以前の game-ui 専用 API と snapshot 別実装は共通コアへ移行。

- 検証: `ef4e2f8` (並行 CSS 改善 `ca45d91` との統合版), `tools/gate.sh` exit 0。6単体テスト群失敗0、component-lint 4回差分なし、3ブラウザー E2E 342件成功、QA supervisor 残留0。
- 独立した汎用モデルのゲートも exit 0 / Playwright passed を確認した (最初の標準出力ログは一時パスの誤削除で失われたため、統合版の完全なログを正とする)。
- 状態グラフと局所座標モデルの根拠は利用側が宣言する。観測は別判定であり、実測点だけで連続定義域を証明しない。名前付き述語の合成は可能だが、実装からの全状態導出や証明済み子コンポーネントの無条件合成は対象外。

## fork: TypeScript 全面移行 (typescript-migration)

目的: JavaScript 実装と手書き型宣言の乖離をなくし、検証器の内部表現と証拠境界を型で検査する。基点は 5665aa1。既存改善版の main は変更しない。別ブランチで進める。

完了条件:
- 自作 JavaScript 実装・adapter・CLI・テストを TypeScript ESM に移す。MoonBit と生成物・言語 fixture は除外。
- strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitReturns を有効化し、any / ts-nocheck による回避をしない。外部 JSON 等は実行時検証を保持する。
- 既存 Git 依存で使える ESM のパスと型を保つ。移行済み .mts を正本とし、.mjs と .d.mts は tsc で生成・追跡し、型チェック・生成差分を gate で検査する。最終的に二重の手書き宣言をなくす。
- 数理演算 → レイアウト/IR → relational/partial geometry → adapters → CLI/テストの順で移す。判定・数値・診断の変更は移行と分離する。
- 単体全群、既存 eval、3ブラウザー gate、依存導入・性能比較を確認してから移行完了とする。

移行第1段階:
- TypeScript 6.0.3 (既存依存の peer 解決を維持)、Node 24 型、strict の tsconfig を導入。
- .mts を正本にして既存 .mjs と .d.mts を生成。pnpm build:ts / typecheck / check:ts を追加。gate は別ディレクトリへの再生成物とのバイト照合を行う。
- 数理演算（linear, region, occupancy）、SMT (smt, model, layout-z3 と node adapter)、関係述語と含意、CSS の構文検査6項目と scrollbar 計算（実装16ファイル）を移行。軸・座標・係数、展開済み述語、solver 入出力を明示。線形/領域テストも移行し、型契約の負例を追加。
- 残り: layout engine/CSS、その他の core、契約 IR / partial geometry、全 adapters、CLI/実験/その他テスト。移行中の .mjs と型宣言をまだ持つモジュールは strict 検査対象外。生成された .mjs を直接編集しない。
- 未完了: 全体移行・全 gate・Git 依存/性能の最終比較。型の回避を使って拡張範囲を偽らない。

第1段階の検証: a4935e4。pnpm install --frozen-lockfile、check:ts、関連単体64件、git diff --check は成功。最終 gate はツール切断で完了結果を取得できず、fork main への統合とリモート push は行っていない。途中切断で生じた当 worktree の gate プロセス2系統を cwd/親PID で照合して回収し、Chrome プロセス残留0を確認した。sandbox 内単体実行では pnpm 署名のネットワーク確認が失敗するため、次回の gate はホスト上の監督ランナーで結果を保存して検証する。次は残りの core の型付けと既存 API 型宣言の統合、特に layout/engine と CSS 依存境界を進める。

### TypeScript migration, second checkpoint (2026-11-20)

- Branch: `typescript-migration`, based on the preserved improved JS baseline `5665aa1`. The independently advancing main is not modified by this migration.
- Integrated implementation checkpoint `dd725a6`: 69/70 original runtime source files have a TypeScript source counterpart. The remaining `packages/veriss/src/layout/engine.mjs` (2,996 lines at this checkpoint) has had its track allocation, transforms, intrinsic measurement, table lowering, responsive edges and flex container logic separated into strictly typed modules. Its temporary declaration is not a completed migration. The engine work is isolated in `ts-finish-engine`; only tested commits have been merged.
- 88/127 original `*.test.mjs` / `*.spec.mjs` suites have TypeScript counterparts. Remaining tests and auxiliary MoonBit differential/evaluation scripts are not counted as complete. Preserve intentional external fixture and generated JS files. Do not replace strict typing with `any`, `@ts-nocheck`, or broad unchecked casts to finish the migration.
- Latest integrated code `dd725a6`: `pnpm build:ts`, `pnpm check:ts` and `pnpm test` passed; all 860 existing tests passed with no failures (29 root, 735 verifier, 66 adapter-core, 12 React, 6 Vue, 12 Svelte). Frozen-lockfile installation was checked during this stage.
- The preceding integrated checkpoint `96fd2b6` completed `tools/gate.sh`: zero failures across all packages, component-lint evaluation unchanged, 405 Playwright tests passed across Chromium, Firefox and WebKit; supervised QA exit 0, remaining processes 0. The later CSS/accessibility/engine extraction integration has passed build, generated-file comparison and unit tests, but its full E2E gate has not been rerun. Do not describe the earlier gate as qualification of the later checkpoint.
- Before completion: migrate the remaining engine implementation itself, remove its temporary declaration, finish test/auxiliary source coverage, review type boundaries and generated output, run full gate on the final integrated tree and verify no QA browser leftovers. Do not push or merge to main until the final gate passes.

### TypeScript migration / engine refactoring (2026-11-20)

- 継続方針: 残る engine を責務単位で型付けする。実際の幾何・証明ロジックと診断・レポート組み立てを分離し、状態ごとの座標比較を共通化する。未対応領域の Unknown、出力順序、正確な有理数、既存の公開 API を維持する。
- 検証条件: 既存の全単体テスト、型検査・生成差分に加え、抽出した義務・状態比較について境界値の単体テストと旧実装との出力比較を行う。最終版の gate と Git 依存確認が済むまでは既存 main に統合しない。

第三段階の結果 (実装 4971965):
- 前回の未統合コミット a27078d を取り込み、クエリ・画像候補解決、包含ブロック・subgrid 幾何を型付きモジュールへ移した。
- 証明義務の生成・失敗領域・反例 (engine-obligations)、CSS/DOM 事前検査 (engine-preflight)、カルーセル状態列挙 (engine-carousel) を分離。状態変化の厳密な始点比較を engine-geometry に共通化し、説明情報の型を公開型と統一した。未決定の layoutRect:null は描画矩形で代替しない。元ツリーにカルーセルのスライドを対応付けられないときは Unknown とする。
- engine.mjs: 2996 → 2713 行。元の実装ファイルの移行数は依然 69/70 (分離先の追加は100%完了と数えない)。engine の残部は未移行。型付け済みテストは元の 88/127 に加え新規テスト7件。
- pnpm build:ts / check:ts / test / git diff --check 成功。全867件 (root 29, verifier 742, adapter-core 66, Vue 6, React 12, Svelte 12)、失敗・skip 0。
- e98f09a の既存 worktree と、現版の analyzeHTML を同一入力67件で比較。JSON 化したレポート全体が67/67一致 (verified 17, violated 14, unknown 36)。grid/flex・media/container query・カルーセル・hover/focus・アニメーション・a11y・未対応CSSを含む。今回の抽出を含む差分の回帰確認であり、ブラウザー照合や全入力に対する同値性証明ではない。
- 最終 gate (3ブラウザーE2E/既存eval)、Git依存導入、性能比較は今回未実施。main と remote は変更せず、全体移行は未完了。残る engine の solve/styles とレポート構築、未移行テスト/補助スクリプトを継続対象とする。

第四段階の方針: solve の外側に残る事後検査・レポート形成を、実際の幾何証拠を受け取る型付きモジュールへ分離する。診断順・未決定時の扱いを維持し、境界の型契約と回帰テストを増やす。残りのテストの移行も実装と整合する範囲で進める。

第四段階の結果 (実装 4f21594):
- engine-warnings / engine-coverage に事後警告と画像候補・container query の到達性診断、engine-state-shifts に hover / animation 再解析、engine-report に公開レポート構築を分離した。
- engine-style に条件付き CSS カスケード、HTML 固有サイズ、画像・SVG・フォーム要素と viewport 依存長の解決を分離した。engine-validate に対応範囲の判定、フォント契約と overflow 方針の検査を分離した。未知の計算済みフォント値を文字列として取り扱わず Unknown とする。文字計測の公開型を adapter-core と共有する。
- engine.mjs は 2713 → 1908 行 (805行減)。元の実装ファイルの完全移行数は69/70のまま。残る JavaScript は主に solve/finish、インライン幾何、markup による補完など。手書きの engine.d.mts はまだ必要であり、JavaScript 側からの呼び出し境界まで strict に検査済みという意味ではない。
- picture / content-box / grid-margins / selector-usage の既存22テストを .mts 正本へ移行した。現在、追跡されている .test.mjs/.spec.mjs のうち同名 .mts のないものは36ファイル (oracle 等を含む)。
- pnpm build:ts / check:ts / test / git diff --check 成功。全867件 (root 29, verifier 742, adapter-core 66, Vue 6, React 12, Svelte 12)、失敗・skip 0。
- e98f09a のクリーンな既存 worktree と analyzeHTML を同一入力69件で比較し、JSON 化した全レポートが69/69一致 (verified 29, violated 9, unknown 31)。grid/flex/block、media/container query、画像・picture、hover/focus、フォント、絶対配置、sticky、アニメーション、未対応CSS等の回帰確認であり、全入力の同値性証明やブラウザー照合ではない。
- 最終 gate (3ブラウザーE2E/既存eval)、Git依存導入、性能比較は今回未実施。既存 main を変更せず、remote へ push していない。残るエンジン本体・手書き宣言・テスト/補助スクリプトの移行が必要。

第五段階の方針: 残る engine のインライン境界・生成コンテンツ・幾何行の形成を優先して型付けし、計測プロファイルと内部座標を明示する。実測根拠のない補完をしない。再帰 solve/finish の型境界へつなげる。

第五段階の結果 (実装 b3f0062):
- engine-inline に生成テキスト、インラインの実測上下限、改行境界の幾何を分離し、計測証拠の型を公開スキーマに追加した。
- engine-settled-style に確定スタイルの警告を分離。engine-finish に finish 全体を移し、親子のサイズ制約・幾何行・RTL・変換・アニメーション・公開レポートの座標証拠を型付けした。$shown の非列挙属性は維持。
- engine-normalize に割合サイズと auto の解決、Flex の主軸サイズ、インライン折り畳みを分離。engine-fallback に Unknown 時のスタイル検査・マークアップアクセシビリティ検査を移した。
- engine.mjs は 1908 → 1064 行 (844行減)。元の実装70ファイル中69ファイルの完全移行という状況は変わらない。再帰 solve の主要ループと全体のオーケストレーション、手書き engine.d.mts が残る。JS 呼び出し側と TypeScript 境界の接続を完全な型検査にしたわけではない。従来の診断リストに含まれる placeholder 警告と公開診断型の差も、全体移行時に整理する。
- pnpm build:ts / check:ts / test / git diff --check 成功。全867件 (root 29, verifier 742, adapter-core 66, Vue 6, React 12, Svelte 12)、失敗・skip 0。
- e98f09a のクリーンな worktree と analyzeHTML を同一入力82件で比較し、JSON 化した全レポートが82/82一致 (verified 49, violated 15, unknown 18)。Grid/Flex/block、RTL、位置指定、変換、条件付きCSS、疑似要素、アクセシビリティと Unknown のフォールバックを含む。全入力での同値性やブラウザーとの照合を証明するものではない。
- 最終 gate、性能比較、Git 依存導入検証は未実施。main への統合・リモート push は行っていない。
