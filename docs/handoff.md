# 引き継ぎ(2026-11-20)

isle から切り出した CSS 検証器(veriss)を、別のマシンで続けて開発するための文書。今どこにいて、何をどう続けるか。

## 今どこにいるか

- `main` に全部入っている(このセッションの作業も)。isle は veriss を git 依存で使う利用者になった(isle の `package.json` の `@mizchi/veriss` が commit を指す)
- **静的検査のパターン**: [docs/static-check-checklist.md](static-check-checklist.md) に F1〜F133。カテゴリごとの進み具合と残りの観点は [TODO.md](../TODO.md)(89 / 90)
  - F26 の見逃しを直した(PR #2): 補われた tbody をセレクタの途中で飛ばす `.t > .r > td` も報告する(3 ブラウザーで照合済み)
  - F126 の健全性の修正: `clip` の横のスクロール値で `clip` が `hidden` になるのは Firefox・WebKit だけ(Chromium 156 は `clip`)。解析は Unknown
  - F133: container のない軸の `cqw` / `cqh` は `svw` / `svh` になる
  - 保留: F91(段組の外の `break-*`。印刷を対象にするか未決)、F95(`li{display:flex}` でマーカーが消える。警告の条件が未決)
  - 見送り(実測したら効いていた): flex の `text-indent`、`perspective`、表のセルの `max-width`
  - 健全性の修正: F89(`calc(100%-10px)` を 100%−10px として計算していた)、F99(引用符のない不正な `font-family` を適用していた)
- **モジュール分割**: [ADR-0016](adr/0016-module-decomposition.md)。M1〜M5 が済み、M6 から
  - M1 `src/color/`(色の数学。依存なし)
  - M2 `test/module-boundaries.test.mjs`(import の向きの検査)
  - M3 構文の段の結果を `notes[]` に(`src/rules/syntax-notes.mjs` が文言)
  - M4 捨てた宣言を `style.$dropped[]` に(`src/layout/dropped.mjs`)
  - M5 CSS の誤りの検査を `src/rules/css-mistakes.mjs` の `createCssMistakes({ report, facts, tools })` に
- **座標計算サブセット L1**: [ADR-0018](adr/0018-coordinate-subset.md)。Grid と Flex(row・nowrap)の座標を、engine から独立した
  Z3 の仕様(`models/layout/spec.mjs`)として定義し直した。engine の領域ごとの式と幅の範囲全体で一致(`tests/layout-spec.test.mjs`)、
  3 ブラウザーとランダムな設定で一致(`e2e/layout-spec.spec.mjs`)。次の段は TODO.md の「座標計算サブセット L1」
- **CLS の壊れた例**: `models/layout/shift-cases.mjs`(壊れた 12、正しい 6)。2 つの状態を同じ幅で Z3 に解かせ(`shift.mjs`)、
  3 ブラウザーで確かめた(`e2e/layout-shift.spec.mjs`)
- **クリティカル CSS**: `packages/veriss/src/critical.mjs`([docs/critical-css.md](critical-css.md))。engine の `sizes` の行に `display`
  と `float` を足した(block コンテナは内部で 1 列の grid として配置するが、行には block と書く)
- **文字幅の型**: [ADR-0019](adr/0019-text-width-type.md)。`models/text/width.mjs` の `textWidth` が、総称の family を OS × ブラウザーの
  表(`system-fonts.mjs`)で解決し、E2E の記録(`linux-widths.json`、`tools/text-widths.mjs`)か MoonBit の値 ± 許容で区間にする。
  L1 の Flex の仕様で、文字の min-content を区間の中の変数にした。parley(`tools/parley-widths`、Rust)は MoonBit と同じ値を出した
- **Lean**: この環境で Lean を入れる操作(インストール用のスクリプトの実行)が安全確認で止められた。L1 の Lean 版は未着手
- **検査ルール一覧**: [docs/rule-catalog.md](rule-catalog.md)(Web 版 https://mizchi.github.io/veriss/、README からリンク)。約 420 のコードを
  13 の役割に分け、「検査可 / 一部 / 仕様のみ / 差を報告 / Unknown」を表にし、役割ごとに NG / OK の実例の画像(`docs/rule-catalog/*.png`)を付けた
  - 実例は `tools/rule-catalog/examples.mjs`。`run.mjs all` で判定、`shoot.mjs` で画像、`build-page.mjs <出力先>` で Web 版
  - main に push すると `.github/workflows/pages.yml` が Pages に出す(画像は CI では作らない。例を変えたら手元で作り直して commit)
  - 新しい検査を足したら、一覧の役割の表にも行を足す
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

- **eval の基準**: `evals/results/component-lint/` は Chromium 156(Playwright 1.64.1)で記録した。結果の `browser` が記録した版。別の版では文字の組み方の差で狭い幅の判定が動くので、gate で eval が変わったら、まず `browser` の行(gate が並べて出す)を見る
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
- ブラウザーが Playwright の期待する場所にない環境(クラウドのセッションなど)では、e2e も `tools/eval-component-lint.mjs` も起動の時点で
  失敗する(「Executable doesn't exist」。eval は結果を書かないので、`git status evals/` だけ見ると変わっていないように見える)。
  e2e は `launchOptions.executablePath` を設定した一時の config で、eval は `chromium.launch` を差し替える `node --import <フック>` で回す
- e2e の F26 のように「ブラウザーで当たらない」と「警告が出る」を 1 つの印で比べる表には、「当たらないが警告も出ない」組
  (tbody を書いた表の `.t > .r > td`)を入れられない。そういう対照は単体テストに置く
- 撮影(`tools/rule-catalog/shoot.mjs`)でページを使い回すと、前の撮影のホバーやフォーカスが残る。撮影ごとに新しいページを開く
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

第六段階の方針: 残る solve の grid/block-flow 計算の責務を分け、内部の割当・祖先・子状態の型を統一する。strict な再帰境界まで接続することを目標に、既存判定を比較して Unknown を緩めない。全体の完了条件は変更しない。

### Sixth migration checkpoint

- Extracted typed block-flow margin collapse, column planning, grid item allocation, child collection, out-of-flow allocation, block-size resolution, and intrinsic row measurement. Shared recursive boundaries are in engine-solver-types.mts.
- Remaining handwritten engine.mjs: 563 lines (previous checkpoint 1,064; original 4,370). 69/70 original implementation modules have been migrated completely; the engine itself is still transitional. The strict-check trial on the unannotated remaining engine produced 440 diagnostics, and the trial file was removed rather than weakening the type checks.
- Validation: build:ts, check:ts, and all 867 unit tests passed (no failures/skips). Compared the complete JSON reports for 129 inputs against e98f09a: all 129 matched (82 verified, 18 violated, 29 unknown). This is regression evidence, not a proof of equivalence for all inputs.
- Next: unify SolverStyle/FinishStyle, recursive allocation and diagnostic boundaries; migrate the remaining solve/analyzeBoxTree implementation and remove the transitional declaration. Remaining test/spec and ancillary migrations, full browser gate, performance comparison, and Git-pinned consumer installation still need confirmation before declaring the migration complete.
- Main and remote remain unchanged.

第七段階の方針: engine.mts を正本にし、型検査のエラーからモジュール境界を統合する。CSSの未確定値は検証済み値と区別し、例外と診断の実データを型に反映する。strict を維持し、単体テストと旧実装比較を通した変更だけを保存する。

### Seventh migration checkpoint (2026-11-20)

- Implementation `700ff55`: engine.mts is now the canonical implementation; engine.mjs and engine.d.mts are generated by tsc. All 70 original runtime implementation modules have migrated; scanning tracked package src .mjs files found no missing .mts counterparts.
- Unified recursive box, computed style, ancestor, available-size, child-state and result types. Removed stale imports and replaced the temporary structural declarations in flex, intrinsic, table, inline, finalizer, and CSS mistake checks with shared types. Rules retain injected runtime dependencies; shared layout types are type-only imports.
- Required computed CSS values are checked at the cascade boundary. Unknown errors are normalized with validated diagnostic geometry and metadata. The public report types now represent actual warning/exemption shapes and witnesses that do not carry size comparisons; internal focus comparisons retain private exact geometry without adding serialized fields. No compiler bypass was added.
- Verification: pnpm build:ts, typecheck, check:ts, test and git diff --check passed. All 869 unit tests passed (29 root, 744 verifier, 66 adapter-core, 12 React, 6 Vue, 12 Svelte), zero failures/skips; two new error-boundary tests. Compared 134 input cases against e98f09a: complete JSON reports matched 134/134 (84 verified, 19 violated, 31 unknown) before the final import cleanup and restoration of the original a11y axis iteration order. Differential coverage is not a general equivalence proof.
- Remaining: 36 tracked test/spec files without .mts counterparts, plus auxiliary scripts; full gate on the final tree, browser cleanup verification, performance comparison, and Git-pinned dependency installation. No main merge or remote push. The runtime migration is complete; the entire repository migration is not yet complete.

第八段階: 残る test/spec と補助スクリプトを strict TypeScript に移す。テストの入力・期待値・ブラウザー計測の型を統一し、アサーションや検査対象を減らさない。実装の型に不足があれば実際の出力を確認して修正する。移行済み正本を増やし、生成一致と単体検証を行う。最終 gate、性能・Git依存確認という完了条件は維持する。

### Eighth migration checkpoint (2026-11-20)

- Implementation commits `8463faa` and `39e4828`: migrated 11 ordinary unit suites, four Playwright suites (React, Vue, Svelte, UA profiles), and the CSS oracle differential test. Also migrated every remaining tracked handwritten .mjs/.cjs auxiliary script (CSS oracle and explanation/transition evaluations). The tracked .mjs/.cjs scan now leaves 20 test/spec files (10 verifier, two root, eight E2E). Original runtime implementation remains 70/70 migrated.
- Shared animation/carousel diagnostics with the report schema, consolidated E2E affine geometry evaluation and finite repeat input validation. UA-profile comparisons evaluate at the actual viewport (400 × 300); no tolerance was broadened. Independent oracle input now checks decoded row shapes, duplicate paths, non-finite numbers and missing property evidence; invalid input is rejected, not treated as agreement.
- Final `pnpm build:ts`, `pnpm typecheck`, `pnpm check:ts`, `pnpm test` and `git diff --check` passed. All 871 ordinary unit tests passed (29 root, 746 verifier, 66 adapter-core, 12 React, 6 Vue, 12 Svelte), zero failures/skips. New oracle-boundary tests: 2. The oracle generator matches baseline e98f09a for seeds 0–4999 exactly. The explanation evaluation passed 5/5, static no-shift evaluation passed 9/9. Existing tracked evaluation reports were not replaced by incidental migration-run results; the no-shift unknown-transform diagnostic differs from the older archived report, while its verdict remains unknown.
- Four migrated E2E suites: 66/69 passed across Chromium, Firefox and WebKit. Three WebKit UA-profile failures reproduced with the same measured/model values at baseline e98f09a (input width 114/106, textarea width 112/106, button height 29/33). This is a pre-existing geometry mismatch on the test environment, not an identified TS regression; UA values/expectations were not adjusted to force passes. Both QA worktrees verified clean of browser processes after supervised exits.
- Actual MoonBit oracle differential suite could not start: compiled mizchi/css oracle missing and moon unavailable. Generator parity and boundary tests do not establish independent cascade agreement. Full final gate, all remaining test/spec migrations, resolution of existing WebKit failures, independent oracle execution, Git-pinned consumer installation and performance comparison remain open. Main and remote unchanged.

### MoonBit environment verification (2026-11-21)

- Installed official macOS arm64 MoonBit toolchain in the host's `~/.moon`; `moon`, `moonc`, `moonrun` are available via `~/.local/bin`. Versions: moon 0.1.20261119 (738607b), moonc v0.10.22+124d61d05. After `moon update`, `pnpm build:oracle` (mizchi/css 0.8.2) and `pnpm build:text-metrics` (mizchi/font 0.8.0) both succeeded.
- Independent CSS oracle suite with CSS_ORACLE_SEEDS=5000: 15/16 tests passed; corpus test failed at seed 4. A full comparison of seeds 1–5000 against the same actually compiled MoonBit oracle found 4985 matching cases and 15 differing cases (33 overflow-x and 33 overflow-y rows). The complete comparison JSON matched baseline e98f09a for all 5000 cases. Example seed 4: display: unset computes inline; verifier returns visible for overflow:clip (F57 deliberately normalizes inert inline overflow to its effective layout value), while the independent oracle returns computed clip. The comparison boundary needs distinguishing CSS computed values from effective layout values; do not silence these differences or count them as proof. Mutation and explicit regression tests passed.
- Rebuilt font FFI passed 36 targeted font/text tests. The generated JS changed under the newly installed compiler despite unchanged MoonBit source; restored the existing tracked FFI to avoid introducing an unrelated compiler upgrade into this branch. No runtime source or dependency version changes. Independent oracle is now runnable; its existing 15 corpus differences remain open.

第九段階: CSSオラクルが比較する計算値とレイアウト用の補正値を分離し、既存15件の差分を検証する。差分を例外扱いにせず、継承・軸間のoverflow計算・変異検出もテストする。レイアウト判定の挙動は維持する。残存テストの型付けも継続する。

### Ninth migration checkpoint

- `2f1dd88`: split the shared computed-value comparison path from the layout-only normalization in computeStyle; use the same overflow cross-axis rule in both paths, retain computed overflow in oracle inheritance, and leave normal layout evaluation order unchanged. No exception list or relaxed comparison. Added explicit inline overflow/inheritance tests, an overflow mutation counterexample, and a unit test that distinguishes computed and effective overflow values. Independent oracle build already installed; CSS_ORACLE_SEEDS=30000 differential test passed all 18 tests (no reported differences, existing coverage thresholds satisfied). The oracle validates only the shared property subset, not layout geometry or every CSS value.
- `26ba23a`: migrated core, flex-contents, inert-declarations, real-site-input, text-font, transitions and root finite-ui suites (7 files). All tracked executable .mjs/.cjs now have TypeScript sources except 13 test/spec files (5 unit, 8 browser). Full ordinary unit suite passed 872/872, zero fail/skip; build:ts, check:ts and git diff --check passed.
- Inline-align and root css-text-metrics were inspected but not migrated yet: TextMetrics.resolveBoxes reports Record<string,object> and resolveOptions incorrectly types the result as the original input. The API output/provenance types should be corrected first, without asserting away missing evidence. Remaining unit suites: accessibility, css-mistakes, inline-align, relational-contract and root css-text-metrics. WebKit UA mismatches, full gate, Git-pinned consumer install and performance comparison remain unverified/unresolved as above. No main merge or remote push. The previous implementation's effective overflow inheritance is not redesigned by the oracle refactoring.

第十段階: text API の入力・解決済み契約の型を分離し、実際の provenance を型で表す。残存の unit/E2E の移行を続ける。生成物の一致、全単体テスト、差分オラクルを再確認する。UA差分や最終gateを完了扱いにしない。

### Tenth migration checkpoint (2026-11-21)

- `49f32c1`, `1503626`: introduced TextBoxInput and ResolvedTextOptions, returning actual LayoutBoxContract records from resolveBoxes and correctly typing resolved options (including partial options and recursive textRuns). Added explicit TextFontProvenance and a nonmutation/recursive resolution regression test. Adapter font measurement uses typed fixed-content/domain inputs; unsupported overflow-wrap returns unmeasurable rather than constructing an unsupported text contract. This changes the reason for some unsupported input, not the accepted CSS subset. Typed APIs do not replace runtime validation of arbitrary JSON.
- Migrated inline-align, css-text-metrics, relational-contract, css-mistakes (`d013537`), layout-animation-easing and layout-integrity (`a66a881`): six existing test/spec files. Added the actual counter field to the warning schema and typed animation sampling/external integrity-oracle decoding. Assertions/tolerances were not relaxed.
- Validation: build:ts, typecheck, check:ts, git diff --check, full ordinary unit suite 873/873 (root 30, verifier 747, adapter-core 66, React 12, Vue 6, Svelte 12; no skips/failures). CSS warning suite 117/117; selected new E2E suites 42/42 across Chromium/Firefox/WebKit. Supervised exit tracked 268 processes, remaining zero; project browser cleanup check clean. Incidental generated evaluation HTML changes restored. Independent MoonBit oracle rerun at 5000 seeds passed 18/18.
- Seven tracked handwritten JavaScript test/spec files remain: accessibility.test, layout-accessibility, layout-cls-facts, layout-css-mistakes, layout-finite-ui, layout-partial-geometry, layout-real-site-input. Original implementation modules remain 70/70 migrated. Existing three WebKit UA-profile disagreements remain unresolved. Final full gate, Git-pinned consumer installation and performance comparison remain open. No main merge or remote push.

第十一段階: 残り7テストのうち、有限状態UI・実サイト入力・部分幾何のブラウザー照合を優先して移行し、残る大規模a11y/CSS/CLSテストもstrictで型付けする。検査条件・許容誤差を緩和しない。既存のWebKit UA差分は実測してから原因を切り分ける。

### Eleventh migration checkpoint (2026-11-21)

- Source migration complete for all 271 tracked .mjs/.cjs files (each has a .mts/.cts source). Migrated the final seven test/spec files: finite UI and real-site inputs (4b7a991), partial geometry (0aafe07), accessibility unit suite (74c0236), CSS differential E2E (df7261a), CLS facts (4689bcf), accessibility E2E (d667157). Runtime modules 70/70 remain migrated. Existing JS build outputs and declaration files are generated and retained for the current package interface.
- Typed browser measurements, proof evidence, fixture options and diagnostic details. Discrete accessibility obligations may carry a numeric threshold rather than the affine expression used by geometry obligations; verifyOneModel evaluates a required affine witness only when it has geometry evidence. Added a regression for a discrete contrast violation (threshold 4.5). Root devDependencies explicitly resolve already-used esbuild/vue/svelte/z3-solver versions; added @types/pngjs 6.0.5 for the existing optional PNG decoder. The Vue compiler lock resolution also selected an already-present newer @babel/parser patch. No assertion thresholds or browser baseline expectations were relaxed.
- Full unit suite passed 874/874 (root 30, verifier 748, adapter-core 66, React 12, Vue 6, Svelte 12). Final typecheck, build:ts, check:ts and git diff --check passed. Frozen installation passed before the final type-only dependency addition.
- Browser comparisons: finite UI + real site 54/54, partial geometry 33/33, CSS mistakes 318/318. CLS suite 171 passed / 9 failed / 33 skipped. All nine unexpected failures reproduced on the older e98f09a worktree using the same targeted tests: font swap (Chromium), classic scrollbar (all three), inert inline aspect-ratio (all three), discrete display transition (Firefox), inert text-overflow (WebKit). These are not demonstrated new migration regressions; do not claim the CLS suite passes. Accessibility E2E selected cases 8 passed / 10 pre-existing oracle skips, followed by 3/3 PNG-path rechecks of the same behind-background test. The complete accessibility E2E suite has not been rerun.
- Both QA worktrees clean of remaining browser processes. Restored incidental result-file rewrites. Final integration gate, full accessibility E2E, resolution of the existing CLS and WebKit UA-profile differences, Git-pinned consumer install and performance comparison remain open. No main merge or remote push.

第十二段階: 型移行完了後の受入。旧実装でも再現したCLS・UA差分を分類し、証明の健全性を弱めず修正できるものを修正する。パッケージ利用者の型・実行互換性、同一入力での性能比較、最終gateを検証する。mainの並行変更に無断上書きしない。

### Twelfth migration checkpoint (2026-11-21)

- c4b5ad6: F98 no longer drops aspect-ratio on blockified grid/flex items; text-run inert warnings use dropped declaration evidence rather than only the effective value. Added fail-first unit regression, grid/flex differential E2E and retained the existing inline-span test. All three browsers agree. Three of the nine previously reproduced CLS failures are fixed; the default stretched flex-row ratio remains Unknown.
- 1fdf48a: isolated TypeScript consumer initially failed because declarations resolving relative .mjs imports picked packaged .mts sources and lacked the workspace-only css-tree/utils declaration. All five package manifests now ship generated ESM/declarations and existing distribution assets rather than handwritten TS and development tests, and all adapters specify the types export explicitly. Packed five-package consumer checks strict TypeScript and executes HTML, Z3, relational contracts, noshift, and React/Vue/Svelte expansion. Actual local git+file pinned installs with commit and path:packages/... passed for all five packages, including strict consumer compile and runtime execution; HTTPS GitHub install is not separately tested. Frozen install passed.
- Full gate at 1fdf48a: all package/root failures zero (875 ordinary unit tests), all four component-lint evals unchanged, 408 required E2E passed across Chromium/Firefox/WebKit, supervisor exit 0 and 716 tracked processes / zero remaining. Pushed this validated commit to origin/typescript-migration. main untouched.
- Performance measured with Node 26.12.1 on the host: 43 HTML/CSS cases (grid/flex/block x three widths x three settings, five grid track cases, five responsive/animation/pseudo cases, six a11y cases); JSON serialization included, accessibility and integrity enabled, viewport 320–800 x 600–900; compared to pre-migration 5665aa1 using the same dependencies. All 43 full reports identical. Initial median ~602 vs 834 ms (5 alternating rounds). CPU profiles implicated copying the style result and eagerly creating CSS keyword snapshots. In a separate archive experiment, eliminated the final object spread using Object.assign into the locally owned map while retaining required-property checks, built initial values lazily, and used the original per-property UA value before assignment for revert. 80 additional CSS-wide keyword/var cases (10 properties x eight values) matched current reports exactly. Six rotated repetitions of 43-case workload, median 649 ms pre-migration / 875 ms before optimization / 555 ms optimized; sample not a general speed guarantee. Background QA was running during measurements, so timing is indicative. All 749 core unit tests and 5000-seed independent CSS oracle passed in the candidate.
- 863adb0: incorporated the exact tested optimization into .mts source; generated JS differs from measured candidate only in comments. Full 875 ordinary unit tests, strict build/check:ts, independent MoonBit CSS oracle 5000 seeds (18/18), targeted E2E 12/12 in three browsers passed. Full gate must be rerun on optimized HEAD before pushing; published branch is still 1fdf48a. No validation or tolerances removed. Remaining six CLS differences (font-swap, classic scrollbar x3, Firefox discrete display, WebKit text-overflow), three WebKit UA-profile disagreements, and complete accessibility E2E remain open. Do not treat those as resolved or widen proof coverage on their basis.

第十三段階（2026-11-21）受入続行: 最適化版 863adb0 以降を固定してアクセシビリティE2E全件と残余CLS/UAの実測分類を行う。検査条件を緩めて通した扱いにはしない。最終的に frozen install、型・生成一致、unit・オラクル、全gateを通過させた同一コミットをforkのTypeScriptブランチにpush。mainは他の作業が進行しているので、相手の変更と整合を検証してから統合する。


## 操作状態と時間領域の次期設計 (2026-11-20)

[詳細設計](interactive-state-and-motion-design.md) — 関係 selector、複合操作状態の被覆、
遷移中の幾何を既存 IR・solver・Lean へ接続する提案。TypeScript 移行/幅遷移/Lean の
並行成果を統合してから着手する。未実装。実装順序・各段階の受入条件はリンク先を正とする。

## mainの状態依存変数検証をTypeScriptに統合 (2026-11-21)

main で追加された hover・CSS変数の推移的依存関係、hover時の独立ツリー再検証、
操作時の容量制約のZ3への引き渡し、上限超過時のUnknownを .mts 正本へ移植。
main側の回帰テストと3ブラウザE2Eを TypeScript から再生成して引き続き使う。

## Upstream同期とフォーク版ルールカタログ公開 (2026-11-21)

**目的**: 上流 `mizchi/veriss` の変更を TypeScript 正本に移し、Lean と状態検証等のフォーク独自拡張を保持した上で、`kikutadev/veriss` の検査ルール一覧をブラウザーで閲覧できる公開ページとして届ける。
**完了条件**: 上流コミットの取り込み、上流新規テストの TypeScript 化、生成 JS 一致、検証ゲート、最新 fork `main` への統合、GitHub Actions を使用しない静的ページ配布、公開 URL で表示・検索・リンク・スマホ幅を確認すること。
**方針**: ルールデータ・NG/OK 画像・ページ生成器は上流の実装を活用。追加機能は独立したフォーク拡張を明示し、未検証の Lean の範囲は証明済みと表示しない。公開ファイルは `gh-pages` ブランチに生成物のみを置き、CI / GitHub Actions は追加しない。
**現在**: 変更の一次移植とブラウザー差の復元が完了。上流・並行 `main` の統合、Webページのフォーク向け調整、三ブラウザー検証と公開作業が残る。

## Lean独立証明チェッカーのTypeScript mainへの統合とFirefox修復（2026-11-21）

- main の TypeScript 移行完了コミット `0c2e0c5` を第1親として、
  `lean-certificate-checker` の研究成果を競合なく統合。研究コードは
  `experiments/lean/` にあり、証明/仕様/検証手順の正本は
  [README](../experiments/lean/README.md) と DESIGN.md。既存
  TypeScript runtime の判定を Lean 経由へ勝手に置き換えていない。
- macOS 27 / Playwright Firefox 157 が headless で
  `Could not find profile folder` となる問題を再現。作業用
  `-profile` の欠落ではなく、OSに保護される共有 Firefox app-data
  への依存だった。個別 `MOZ_APP_DATA` と
  `MOZ_LOCAL_APP_DATA` を `tools/firefox-app-data.mts` で作成し、
  `playwright.layout.config.mts` と Lean のブラウザ試験から適用。
  終了時に作業用領域を回収し、ユーザーのFirefoxプロファイルを触らない。
  `.mts` を正本、`.mjs` / `.d.mts` を生成して追跡する。
- 連続性の保証は分離: Lean の定理は閉じたCSS文法/正規化された
  幾何モデルに対するものであり、全CSS・任意JS・描画結果そのものの
  完全証明ではない。TypeScript本体とのIR自動連携、多子証明合成など
  は元の研究計画の未完了項目として残す。
- Chromeを含む長時間 gate の実行には `node tools/gate-guarded.mjs`
  を使い、専用プロセスグループと独立監視でrunner強制終了時にも
  そのgateだけを回収する。ChromeはPlaywrightによってさらに別の
  プロセスグループで起動されるため、監視側で **gateの子孫だった
  Chrome本体のPID** を別途記録する。プロセス名による一括停止は禁止し、
  PID・起動オプションを再検証してからそのChromeグループだけ停止する。
  実際のChromiumを起動したrunnerをSIGKILLした試験で、
  Chrome本体＋子プロセスの回収成功・別プロセスへの作用なしを確認した。
- 統合後の受入（2026-11-21）: `pnpm build:ts` と `pnpm run check:ts`
  成功。Lean既存/新規177件成功、独立カーネルで具体的証明書38件成功。
  形式CSSとの実測はChromium 49/49、Firefox 49/49、WebKit 49/49
  （誤差は各々0.0125、0.00000611、0.0125 CSS px、許容差0.03125px）。
  `tools/gate.sh` exit 0、ルートと5パッケージのテスト失敗0、component-lint
  eval 4回変化なし、必須の3ブラウザE2E 411/411成功。終了後の
  Playwright Chrome 残留は検査対象プロジェクトで0。

### Browser quality follow-up (2026-11-21)

Goal: resolve the 7 accessibility E2E, 6 CLS E2E, and 3 WebKit UA-profile discrepancies left by the previous migration, without changing verdicts to Verified on unsupported evidence or relaxing assertions. Work against the newest TypeScript main, classify each difference with exact browser measurements and an independent prior-commit comparison, then change implementation or test-oracle assumptions only where the model is demonstrably wrong. Red → Green → refactor; keep .mts as canonical source and regenerate .mjs; run targeted three-browser checks, unit tests, MoonBit oracle if relevant, and tools/gate.sh before publishing. Outstanding browser-specific variance must remain explicit and Unknown if proof coverage differs. Do not overwrite concurrently advanced main without first syncing.

#### Browser quality first corrections (2026-11-21)

- The Chromium accessibility E2E `invalid-fields-and-messages` failure was a faulty pixel oracle: sampling immediately below the topmost input also sampled text from the following row. The oracle now prefers a vertical edge's outside backdrop; the unchanged static E_A11Y_FIELD_BOUNDARY verdict matches Chromium (1/1) without changing a warning threshold.
- The three WebKit UA-profile mismatches were OS-specific defaults, not a failure of the geometry solver. Playwright WebKit 27.2/macOS reported text input padding (2,5,2,5), textarea (2,5,2,5), button (0,6,1,6), unlike the existing Linux WebKit profile. Retained the Linux profile unchanged and used the already supported explicit `ua` overrides for macOS. The 15 standard control geometry E2E cases across three browsers passed (15/15). See docs/css-baseline.md.
- Still pending: remaining WebKit accessibility navigation/AX differences, CLS font loading/overlay scrollbar/discrete display/text-overflow differences; do not count the current partial corrections as completion of those suites.

#### Browser quality follow-up, second checkpoint (2026-11-21)

- Full correction of the **7 formerly failing accessibility E2E cases**, individually remeasured: one Chromium screenshot pixel oracle sampled another row's error text, and six WebKit failures were macOS Safari's Tab/Option+Tab navigation policy (links are focused by Option+Tab). Kept the static findings and bounds intact, and also cross-checked accessible names through Playwright's cross-browser role oracle plus Chromium CDP. The six link/navigation cases passed 18/18 across Chromium, Firefox and WebKit. Full 414-case accessibility suite still pending rerun.
- **CLS differences**: Chromium's original `Roboto,sans-serif` fallback shifted by only 2px, below Layout Instability's event threshold, so replaced only the test fixture with measured `Roboto,monospace` (44px movement, score 0.0073333); the sound negative cases stayed zero (1/1). The native scrollbar test now uses the measured gutter: Mac headless Chrome/Firefox/WebKit all report zero (overlay). Three browsers passed; positive classic gutter remains covered by existing unit tests and not falsely claimed as browser-verified on Mac.
- **Remaining browser-specific behavior** measured explicitly: Firefox 157 does not run a display transition even with `allow-discrete` (other two engines do); WebKit 27.2 paints ellipsis on a clipped grid container, Chromium/Firefox do not. Changed the latter from an unsound universal W_LAYOUT_DECLARATION_INERT to `U_LAYOUT_TEXT_OVERFLOW_BROWSER` (Unknown). Added fail-first unit regression; the full targeted inert-declarations suite passes 46/46 and both browser differential cases pass 6/6. Static unsupported cases are not silently Verified. See docs/css-baseline.md for measurements.
- Still required before publishing: full accessibility and CLS suites, all ordinary package tests, existing gate on frozen HEAD, clean generated reports, and comparison against latest concurrent origin/main.

### Fork site correction (2026-11-21)

- User-facing acceptance condition: the fork URL must expose the fork verifier's **real behavior**, not only reuse the original site's static tables/screenshots with a fork badge. The previous published version did the latter and was not an adequate implementation of the request.
- Implemented a browser-bundled static verifier on the first screen with editable HTML/CSS, warnings/Unknown status, NG/OK presets (including upstream F116/F129/F133), and sandboxed visual preview. Original 13-category table and 15 representative images remain as reference. TypeScript migration and Lean checker descriptions are separate from actual runtime diagnostics.
- Site generation now requires the `esbuild` dev dependency to emit `demo.js` alongside `index.html` and images. The Pages `gh-pages` branch is manually published: no GitHub Actions. Before declaring done, test actual browser interactions on the **public URL**, including repair eliminating a finding, an unresolved/Unknown case, and a narrow mobile viewport.

## 残存ブランチ統合（2026-11-22、検証完了）

目的: fork/main の strict TypeScript 正本と既存検証の健全性を維持して、
残存の幅遷移・汎用幾何レビュー・TS 条件境界修正・検証基盤再利用調査、および
型移行ブランチで完成したブラウザ品質改善を集約する。
`gh-pages` は公開物のみを持つ独立履歴なので main にマージしない。

完了条件: 取り込み対象の機能・テスト・文書が main の現行型契約に適合、
旧 `.mjs` の直接移植で `.mts` 正本を壊さず、単体・ブラウザ差分・
`tools/gate.sh` と `pnpm check:ts` が成功する。最新 main に対して
非強制 Push、リモート SHA と未統合一覧を再確認。

手順: (1) ブランチ祖先・機能差分・既存実装の重複を監査。
(2) 完了済み TypeScript ブラウザ品質修正を取り込み。
(3) 未導入の幅遷移検査を閉じた CSS 文法＋厳格な Unknown として
型付きで移植し、回帰テスト/3 UA の比較を追加。
(4) 条件分岐・レビュー系の差分は中身が現行 main にあるかを照合して
必要なものだけ採用。旧枝の履歴を解決する際も検証済みの現行実装を
戻さない。(5) 完全 gate/リモート確認。

#### Full browser acceptance and main synchronization (2026-11-21)

- Complete focused Playwright suite across Chromium, Firefox, WebKit on 7715427: **663 total, 453 passed / 210 existing baseline skips, zero unexpected failures**; supervised exit 0, 992 process records tracked / zero remaining. Includes complete accessibility, CLS facts and UA-profile suites. The previously failing 7 accessibility, 6 CLS and 3 WebKit UA-profile cases now pass or have explicit Unknown for the WebKit grid-text-overflow case; known browser variation was not silently reclassified as verified.
- Full ordinary unit suite on 7715427: root 33, veriss 782, adapter-core 66, React 12, Vue 6, Svelte 12 — **911 passed, zero failures**. Strict TypeScript compile/build-output parity check passed; independent MoonBit CSS oracle with 5000 seeds passed 18/18.
- d36d974 merges the concurrently advanced origin/main rule-catalog demo into this TypeScript branch. The sole conflict was the handoff document; preserved both the catalog publication notes and this browser-quality record; library source/test files did not conflict. Working tree clean. Re-run the full mandatory gate on the merged HEAD before pushing either branch; fetch again to preserve later main changes. This checkpoint does not claim native classic scrollbars were measured on a Mac, or that Firefox implements display transitions with allow-discrete.

### 幅遷移の型付き移植（実装・個別検証済み、2026-11-22）

- 旧 JavaScript の `verifyInterpolatedPredicate` と CSS から閉じた幅遷移を導出する
  `verifyCSSWidthTransition` を現行の `.mts` に実装し、生成 `.mjs` と公開型も再生成。
  既存の relational/1、幾何抽出、CSS lexer、easing 領域判定を再利用する。
- 固定 viewport、単一の data-attribute 変化、全枝の単調な幅、同一 bounded progress、
  非幾何 CSS の固定、overlay gutter などを守れない入力は Unknown。
  任意 JS・コンテナ依存・異なる timing・複数アニメーションは証明外。
- 旧枝のアプリ別 hash 固定の island audit runner は、旧スナップショット/ビルドに
  依存する研究用再生プログラムとして履歴に保存する。新 main の汎用 API に
  依存させず、各プロジェクトが現行ビルドで再監査する。横幅の汎用
  モデルと複数アプリの JSON 契約例は移植した。

- 2026-11-22 個別受入: CSS幅遷移6件、関係契約を含む16件、
  adapter部分幾何16件を確認。追加ブラウザE2EはChromium・Firefox・
  WebKitそれぞれ4件、計12/12成功。未対応CSS/異なる進捗/変動する
  クロス軸をUnknownにする負例は維持。TypeScript strict、
  build:tsとcheck:tsも成功。後記の正式gateで統合版を受け入れた。
- 旧 `automatic-width-transition` の履歴には汎用レビュー、旧
  island監査と追加テストも含む。現行 `.mts` に役立つロジック・
  テストを取り込み、`-s ours` で旧JSツリーを上書きせず祖先を記録。
  `ts-contracts` の不正media条件の排除、および
  `verification-reuse-review` の再利用調査はすでにmainの
  現行コード/ADRに反映されていたので、旧内容に戻さず祖先のみ追加した。
  `gh-pages` は配信成果物専用であり mainへ統合しない。

### Upstream verification coverage expansion (2026-11-22, in progress)

- Goal: not merely restyle the fork catalog. Incorporate new validation **subjects** from upstream `ee4cb5a` (first-view critical CSS extraction; independent L1 Grid/Flex geometry + shift model; cross-platform text-width checks), and show the corresponding capabilities/limits on the fork's site.
- Accept only actual merged source and runnable checks, including negative/unknown controls. Retain TypeScript runtime as canonical, no false Verified from omitted layout evidence, 3-browser measurements and full gate before pushing. Never copy upstream GitHub Actions into the fork.
- Next: merge upstream, resolve strict TypeScript boundaries, run upstream new suites in addition to existing gate, manually deploy and test the public URL. A new rule count is **not** implied by these model/feature additions; report separately from F-code diagnostics.

#### Integration acceptance details

- Upstream `ee4cb5a` adds four *subject areas* (critical first-view CSS, standalone L1 geometry, state-change L1 shift, text-width/platform model), not new F134+ warnings. This fork must distinguish them from the existing F116–F133 warning catalogue. The first-view extractor is part of the package's browser-capable TypeScript canonical runtime, and the public fork demo uses that actual code.
- Important environment boundary: the upstream Linux text-width record references Linux font paths that do not exist on macOS. The reference record and L1 text Z3 tests still run, but the MoonBit-vs-browser live calibration is explicitly skipped when no reference fonts are loadable; an unrecorded text string stays `Unknown`. `e2e/layout-text-width.spec.mjs` must not compare Linux widths to macOS browsers without a macOS record. The reference remains Linux-only until separately recorded on the target OS.
- Deployment and gate results must be appended only after they actually pass.

#### Verified gate and publication boundary (2026-11-22)

- The merged TypeScript source and generated ESM passed `pnpm build:ts`, `pnpm typecheck` and `pnpm check:ts`. The guarded `tools/gate.sh` returned 0: root and all five package test groups had zero failures; all four component-lint eval outputs were unchanged; the old four and new four E2E suites completed with **537 passed** across Chromium, Firefox, WebKit. The text-width suite explicitly skips unrecorded macOS browser-width comparisons, rather than using Linux widths on macOS. The root runner had 47 passed and one skipped Linux-font-file calibration case; the skipped case is not included as a verified claim.
- `pnpm test` as a combined workspace invocation fails before the recursive stage because this QA worktree's `node_modules` is a symlink and pnpm 12 refuses the unsafe task-run state path (`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`). The actual root and package tests were executed directly by the gate and had zero failures. The symlink was not replaced or modified.
- The live fork catalog has 19 examples, including a genuinely executed first-view CSS split. The public site must be checked separately after the static-only `gh-pages` push (and is not changed by this merge commit alone).

### 残存ブランチ統合と最新mainの最終受入（2026-11-22）

- `automatic-width-transition`、その祖先の `generalization-review`、
  `island-state-audit`、`ts-contracts`、`verification-reuse-review`、
  `typescript-migration` のコミット履歴をmain統合候補の祖先として
  確定。旧JavaScriptのままではなく新規幅遷移API/契約/テストを
  strict TypeScriptへ移植し、focus paint/非活性アニメーションの
  独立幾何と6件のアプリモデルJSONを補完。
- さらに進行中の並行作業で更新されたfork/main `2037adb`（
  上流のcritical CSS、L1レイアウトシフト、font-widthの差分を含む）を
  保存したまま競合なく組み合わせ、型付き生成物の一致を再検査。
- 旧main相当の必須ゲートは474/474 E2E成功。その後、追加上流分を
  含む統合HEADでも正式 `tools/gate.sh` はexit 0、rootと全5 package
  単体テストの失敗0、component-lint eval4回差分なし、
  Chromium/Firefox/WebKitの8 E2Eスイート合計549/549成功。
  追加幅遷移12/12も個別検証済み。終了後に検証worktreeの
  Playwright Chrome残留0、ホスト全体でも残留0を確認。
- `gh-pages` は本体ソースではなく公開成果物のみを持つ独立履歴。
  GitHub Actionsを使わずに別途公開を管理する。旧hash固定の
  ポートフォリオ島監査実行器は古いスナップショットに依存し、
  元ブランチの履歴に残すが現行の汎用TS経路へは組み込まない。


## veriss 製品化：初回で価値が分かるWeb体験＋CLI（2026-11-22、作業中）

- 製品価値とPhase 0–3、明示的な完了条件の正本は [product-value-plan.md](product-value-plan.md)。420ルールの増加より、狭い画面幅だけの反例発見と修正確認、利用側ファイルによるCLI利用を優先する。
- 既存のTypeScriptエンジンとZ3をそのまま使用。公開サイトの初期例を固定幅Gridオーバーフローへ変更し、反例幅/エラー件数とNG→OKを表示。検証幅の変更、Unknown/critical CSS、390px画面、編集後再検査をegoブラウザで実測。
- `packages/veriss/bin/veriss.mts` に `veriss check --html --css --min-width --max-width --json` を実装。exit: verified=0、violated=1、unknown=2、input/runtime=3。6本の追加回帰テスト成功。別プロジェクトへのpnpm pack tarball導入後の実行も成功。
- 完成境界: 正式gate成功、fork main へのfast-forward統合、gh-pages静的公開、公開URLでのNG→OK・Unknown・スマホ検証は別途完了結果を記録する。3種類以上の実UI評価とフレームワーク・Leanの自動連携は次段階。

- 2026-11-22 release gate: `pnpm build:ts`, `pnpm check:ts`、新規CLI/デモ6件成功。guarded `tools/gate.sh` はexit 0、root＋全5 package fail=0、component-lint eval4回差分なし、3ブラウザーの対象E2E **549 passed**（7.7分）、作業プロジェクトのChrome残留0。公開ページのQAは別に記録する。

- 2026-11-22 publication acceptance: fork `main` `93bacf0`, Pages `gh-pages` `50dde81` へfast-forward push。実公開URLでNGのエラー1+警告1・443.5px反例、修正後0件、Unknown1件、critical CSS 2保持/1分離、390pxでページ横溢れ0を確認。別プロジェクトへのGit-pinned installとCLIのZ3 VERIFIEDも成功。現行リリースの範囲はPhase 0/1で、実アプリ3件評価・Leanの自動結合は未完了。

### Phase2 実UI3件の評価とローカルファイル読込（2026-11-22）

- ポートフォリオ About / DUO瓦割りタイトル / Bootstrap Album の静的HTMLと元CSSを固定。CLIは3件ともUnknown、エラー13件はすべてshorthand競合でありレイアウト不具合13件とは言えない。3ブラウザ×5幅×3件＝45点の実測では水平はみ出し0。再現、限界と次に取り組む誤検出・検出不足は `docs/product-real-ui-evidence.md`。
- 公開デモへローカルHTML/CSSファイルのブラウザ内読込（各25,000文字以内）と外部リソースを遮断したプレビューを追加。Workerは使用しない。型チェック・ローカルE2E 15/15成功。正式ゲート・公開版QAは別途実施し、完了後だけ報告する。

#### Phase2データの正式ゲートと公開反映（2026-11-22）

- Phase2初回調査とWorker不要のローカルファイル読込を fork `main` `045f748`、GitHub Pages `gh-pages` `fcd13ed` に反映。`tools/gate.sh` exit=0、全単体失敗0、既存3ブラウザE2E549件成功、追加3ブラウザE2E18件成功。公開URLでNG→OK、実UI3件結果、390pxの横はみ出しなしを確認。
- 本物のレイアウト不具合を検出・修正した数は0。Unknownの上位原因とshort-hand競合の解釈は `docs/product-real-ui-evidence.md` を正本とし、次は実UIで証明可能な局所モデル／状態遷移の実効性を改善。Phase2完了とは記載しない。

### Phase 2 方針修正（2026-11-22）

- ユーザー指示によりWebのファイル検証UI（HTML/CSS選択）、読込処理と専用E2Eを撤去。追加の公開画面要素は増やさない。既存の直接入力デモ・CLI・実UI3件の評価と再生入力は維持。
- 本筋は、実UIの誤検出を独立ブラウザ実測で分類し、検査器の汎用性・有効な不具合検出実績を改善する。URL収集Workerも復活させない。

- 撤去後の個別受入: 実UI由来の負例（ゲームシェルを700px幅へ改変）を含め、3ブラウザの専用E2E12/12成功。Web UIのファイル選択が存在しないことを回帰テスト化。静的完全文書は改変を幾何エラーとして検出できずUnknown、モデルが安全だという主張はしない。

- 追加のPhase2知見: About のナビは初期 `inert` 状態で `W_CSS_STATE_UNREACHABLE` が10件、`inert`解除版スナップショットでは0件。実サイトのメニュー操作で同じ状態変化を確認。警告全消しではなく状態別契約が必要。`docs/product-real-ui-evidence.md` 参照。

#### Phase2 ファイルUI撤去版の公開検証（2026-11-22）

- fork main `beda8f9`、`gh-pages` `73900a5`。正式ゲートexit=0、全パッケージ単体失敗0、既存3ブラウザE2E549件、Phase2個別12件成功。公開ページでファイル入力0件、NG→VERIFIED→UNKNOWN、390pxで横はみ出し0、実UI3件の表を実操作で確認。成果と残課題は `docs/product-real-ui-evidence.md` に記録。

### Phase 2 実CSSの誤検出改善（2026-11-22）

- 正常な一括指定→個別指定のCSSカスケードを解析し、実UI3件に残っていた偽の`E_CSS_SHORTHAND_CONFLICT`を13件→0件に削減。方向依存の重複指定は確定エラーでなくUnknown。Bootstrapの疑似要素リセット由来ノイズも減り、警告27→2件。3件の全体判定はUnknownであり、レイアウト不具合を発見したとの主張はしない。
- 実装は fork main `41561bc`、公開 Pages `5cca38e`。正式ゲート exit 0、全unit fail 0、既存E2E 549 passed、追加E2E 18 passed。公開ページで3件の改修後値、NG→OK→Unknown、390px幅、ファイルアップロード/Worker未追加を実操作で確認。検証根拠・残る未証明は `docs/product-real-ui-evidence.md`。

### Phase 2 閉じた実ゲームCSSの横方向契約（2026-11-22）

- DUO瓦割りHTMLと現物CSSのGoogle Fonts `@import` を実取得した `@font-face` 632件で閉じた再現入力を固定（gzip CSS+SHAと取得UA/URLを `tests/fixtures/product-real-ui/` に保存）。通常は`#game-shell`の横方向契約がVerified、意図的な700px上書きはViolated。未解決@import、classic scrollbar、外部stylesheetはUnknown。全CSS・高さ・JS状態の検証ではない。
- 幅%+max-width(px)+auto marginとfaviconメタデータの独立幾何、body overflow伝播の横方向限定サロゲートを汎用的に改善。3ブラウザで実ゲーム正常/破壊版・汎用4種の予測矩形を照合。
- fork main `5508568`、GitHub Pages `5f4953c`。公式gate exit0、全unit fail0、3ブラウザ必須552 E2E、実UIの個別21 E2E成功。公開URLで実例記述・デモNG→OK→Unknown・390px・不要UI未復活を確認。実サイト由来未知バグ検出0件。詳細は `docs/product-real-ui-evidence.md`。
