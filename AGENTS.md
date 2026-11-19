# veriss の開発

ユーザーには日本語で答える。

veriss は、CSS と DOM(HTML、box tree、コンポーネントの状態)から、すべての viewport 幅にわたる配置・アクセシビリティ・
CSS の書き間違いを、ページを描かずに静的に検査するライブラリ。[mizchi/isle](https://github.com/mizchi/isle) はその利用者の一つ。

## 原則

- 健全さを最優先する。未対応、被覆不足、上限超過、timeout、ブラウザーで違う挙動は Unknown にし、成功へ変えない。
- 警告(W_*)を足すときは、Chromium・Firefox・WebKit で実測してから入れ、`e2e/` に同じ判定を比べる検査を置く。
  ブラウザーで結果が違うものは報告しないか Unknown にする。
- 新しい検査は `docs/static-check-checklist.md` に、何を測ったかと一緒に書く。
- `packages/veriss/src/` は Isle、ProgramIR、compiler、playwright を import しない(`tests/veriss-package.test.mjs`)。
- TDD で進める。探索 → Red → Green → Refactoring。

## ツールと検証

- Node.js 24+、pnpm 12。`pnpm install --frozen-lockfile` が通る状態を保つ。
- `pnpm test`: すべての package の単体テスト。`pnpm test:e2e -- --project chromium|firefox|webkit`: ブラウザーとの照合。
- `packages/veriss/text-metrics` と `oracle` は MoonBit(`pnpm build:text-metrics`、`pnpm build:oracle`)。text-metrics の
  build 出力(`font_ffi.js`)は git 依存の利用者のために commit しておく。変えたら作り直して commit する。
- 利用者(isle)は `github:mizchi/veriss#<commit>&path:packages/veriss` で依存する。package 間の依存は peerDependencies
  (workspace 内では devDependencies の `workspace:*`)にする。git 依存では `workspace:` が解決できない。
