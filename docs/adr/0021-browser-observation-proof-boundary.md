# ADR-0021 (Proposed): ログイン後UIのブラウザ観測と静的証明を分離する

Status: Proposed — 詳細設計。今回のコード/API削除は未実施。
Date: 2026-11-23
Related: [ADR-0019](0019-relational-ui-contracts.md)（accepted: 観測と証明の分離）、[ADR-0020](0020-reuse-verification-infrastructure.md)（Playwright / XState 等の既存基盤再利用）、[layout-contract-ir](../layout-contract-ir.md)、[実測結果](../product-real-ui-evidence.md)

## 目的と判断

ユーザーが既存のログイン済み Playwright E2E から **UIの破綻を見つけられる**ことと、veriss が **閉じたHTML/CSS/状態で連続幅にわたる制約を証明できる**ことを両立する。現行の`Observation.passed`に汎用E2Eの真偽値を詰め替えるだけの回り道は縮小する。一方、既存の記号的な `domGeometry → GeometryEvidence → verifyUI` は削らない。新たなブラウザ、独自SMT、状態管理DSL、URLを受けるWorker等は作らない。

既存ADR-0019の「実測は証明に昇格させない」を**実際のAPI境界に徹底する**設計であり、静的証明の実装自体を廃止・改造する決定ではない。実装の採否は後続の小さい検証で決める。

## 現状の正確な経路・問題点（2026-11-23、fork main `3a25ae1`）

| 現行の責務 | 実装/使用箇所 | 保持すべき価値・重複・不足 |
| --- | --- | --- |
| 自動ログインを含まない画面操作 | `e2e/external-authenticated-ui.spec.mts` | Playwright が公開デモへ明示的にログイン、状態遷移、画面幅変更。必要。 |
| 矩形の点観測 | `tools/capture-snapshots.mts` の `captureUIObservation`、`packages/adapter-core/src/browser-observations.mts` の `captureViewport` | 両者に `page.evaluate/getBoundingClientRect` がある。前者は任意のIDの矩形、後者はroot横幅/`main`/候補8件。完全な重複ではないが幾何の測定経路を重複管理している。 |
| DOM状態のスナップショット | `tools/capture-snapshots.mts` の `captureSnapshot` | **document全体のouterHTMLを返す**。静的実験には有用だが、認証済み利用者の画面にそのまま使うと本文・フォーム・個人データが混入し得る。公開SDKの自動取得機能へ転用しない。 |
| メニュー・モーダル・権限の独自observer | `browser-observations.mts` | 独自メニュー/モーダルのTab検査は固有の補助価値がある。権限可否の数え上げや単なる`passed`の判定はPlaywrightのLocator/expectと重複。 |
| `verifyUI({model,observations})`だけの自己遷移 | `e2e/external-authenticated-ui.spec.mts`、README のモーダル/権限例 | `event:'role-controls-match'`、`state → same state` を手書きし、既に計算した真偽値を照合しているだけ。**独立に権限仕様を推論していない**。計測成功を静的Verifiedにしてはいない点は正しい。 |
| 静的な幾何の抽出・証明 | `adapter-core/src/ui-contracts.mts` の `domGeometry`、`veriss/src/relational-contract.mts` の `verifyUI` | 一致したHTML/CSS/環境・部分幾何の独立性が成立すれば複数幅の契約を証明/反例取得できる。**製品の主軸であり維持**。不完全ならUnknown。 |
| 状態の導出（限定対応） | React/Vue/Svelte adapter の `derive*State`、`verifyFiniteUI`、XState取込実験 | boolean/静的なハンドラ等の限定範囲を既に実装。一般のJS状態導出器を新たに作らない。外部props、effect、非同期、動的CSS等はUnknown。 |

実際の権限E2Eでは、Admin `Edit` が8/8有効、`Suspend/Reactivate`が7/8有効、Manager/Viewerはともに0/8有効と数えている。一方、Adminの後者の契約は `some-enabled`（**1/8でも通る**）。E2Eには7/8を別の`expect`で確認する行はなく、7/8が6/8へ変わっても契約は見逃す。`expect(statuses.blocked).toBeGreaterThan(0)`も上限を固定しない。このズレはライブラリの観測で正しいと証明したかのように見せるべきではない。

また、`aria-disabled=true`を見てPlaywrightの `toBeDisabled` / `isDisabled` は「disabled」と判定する（[Playwright公式仕様](https://playwright.dev/docs/api/class-locatorassertions#tobedisabled)）。これは *ブラウザのnative disabledによる強制停止の保証* や *バックエンドの権限* を意味しない。現行observerの「ARIAのみは不確定」という保守的な方針には意味があるが、権限テストの代替検証器を増築して正当化するのではなく、アプリ固有の意図をPlaywrightで検証する。

### 実コード上の追加リスク

- `captureClosedScopeTabFocus`は呼び出し側が「closed」を宣言するだけで、対象が本当に閉じていることを調べない。フォーカスの見えなさの解釈にはアプリ固有の状態が必要。
- モーダルは最大指定Tab回数の**前進**しか測っていない。Shift+Tab、Escape、背景操作、長いフォーカス循環を完全検証していない。ネイティブdialogで`BODY`を観測した場合は不確定にする。
- `captureViewport`の`overflowElements`は最大8件の構造パスだけで、元のCSSルール・ビルド中のcomponentの識別子を持たない。動的CSSやShadow DOMを含めて静的入力へ逆変換できない。
- `captureControlAvailability`は「非表示」をblockedに数えるが、期待が非表示かdisabledかは別契約。選択要素が0件なら不確定であり、権限によってメニューごと消えるアプリにはそのまま使えない。ネイティブ要素以外はuncertainになる。実際の`click`の副作用/サーバ認可は未確認。
- 3ブラウザと2幅（または8回Tab）の通過は、同一ブラウザの他の幅・ロール・DOM状態での保証ではない。外部デモは任意の時点で変更されるため正式なオフラインgateとは分離する現行方針が正しい。

## 推奨する責務境界

```text
利用者が所有する Playwright E2E（既存のログイン・操作・待機）
   ├─ [E2Eの正本] locator/expect/keyboard + 最小限のfocus/scroll補助
   │       → sampled: pass / fail / inconclusive（どの画面、幅、UAか）
   └─ [調査の手掛かり] 安定した対象IDと問題の条件・再現操作
            │  ※browser observationを証明済みソースに変換しない
            ▼
利用者のソース/ビルドから独立に用意する閉じた状態別manifest
   ├─ 画面状態ごとの実装由来HTML（必要なら明示したテストデータ）
   ├─ 作者CSSの完全なcascade、順序、font/media/UA等の条件
   ├─ state/profile/target bindingの整合性と入力のハッシュ
   └─ 明示の契約（仕様を現状の画面から自動生成しない）
            ▼
既存 domGeometry / projectIndependentGeometry → GeometryEvidence
            ▼
既存 verifyUI / relational/1 → verified / violated(+witness) / unknown
            │
            └── E2Eの点観測と照合（不一致ならモデル差または計測差を報告）
```

**境界:** `sampled fail`だけでも利用者へ破綻の再現結果を出せる。静的入力を閉じられなければそこで止め、proofは`unknown`。`verified`は閉じた**対象状態/領域/環境**についてのみ述べる。画面全体・全JS到達状態・権限保証に拡大しない。`verifyUI`は本来の幾何・状態関係の証明と、同じ根拠に対する実測の照合に使用する。

### 機能の置き場所（移行後）

| 機能 | 判断 | 具体的な移行 |
| --- | --- | --- |
| `verifyUI` / `GeometryEvidence` / StateIR、`domGeometry` / 独立幾何 | **維持** | 本来の静的証明のAPI。点観測の`passed`で証明被覆を埋めない。 |
| `captureSnapshot` | **実験/明示的なfixture限定** | `tools/`に残す。認証済みページからHTML全文を自動保存する公開APIにはしない。 |
| `captureUIObservation` と `captureViewport` | **測定部分だけを整理** | 両者のID付き矩形・documentWidth・main矩形の意味を統一。`captureViewport`を壊さず、既存ツールが公開adapterの単一矩形測定関数へ委譲できるかを、小さな差分で検証。大型の新型/DSLは作らない。 |
| `captureClosedScopeTabFocus` / `captureModalTabFocus` | **必要な部分だけ残す** | Tabの実操作はPlaywrightに任せ、focus位置の取得を薄い補助にする。状態の`closed/open`と期待値はE2Eが定義する。UIの真偽を`verifyUI`へ包み直す自己遷移は削る。 |
| `captureControlAvailability` / `controlAvailabilityObservation` | **公開汎用APIからの縮小候補** | まず既存RBAC E2EをPlaywright Locator/expectと正確なロール仕様に移す。独立価値が消えたら関数・型・README例・対応テストをまとめて削除。単なるBooleanラッパーとして残さない。 |
| `Action`観測自体と既存state graph | **削除しない** | Playwrightから宣言の到達辺を照合する研究・有限状態の接続には用途がある。権限/モーダルを無理に自己遷移で表すのをやめるだけ。 |
| 独自ログイン/クロール/Worker/全JS状態抽象解釈/別SMT | **不採用** | Playwrightと既存framework/finite-state adapter/SMTで済む機能を再実装しない。 |

## ブラウザで見つけた破綻を静的検査へつなぐ最短ルート

1. **実測を正確に再現する。** 既存Playwrightでログイン、対象状態に遷移、描画完了を待つ。対象とviewportを決め `documentElement.scrollWidth`、`main` / 操作要素の矩形などを観測する。読み取りのみ。必要な場合だけrole名・ブラウザ・viewport・DOM構造上の安定したlocatorを記録。サーバデータ、トークン、入力値、全文HTMLは残さない。
2. **同じ意味の実装スナップショットを独立に作る。** 対象サイトの**確認したソースコミット/ビルド成果**（Reactなら対応可能なadapter/状態展開、ほかは開発者が指定した静的テストfixture）を使い、状態ごとのHTMLとCSSを用意。認証後画面の実ユーザーデータをコピーして「ソース」と呼ばない。CSS/JS注入順、`@import`、外部sheet、動的class、font、viewport/meta、safe area、各ブラウザUA、media feature、scrollbar条件の閉包を検証。不明な依存が関連対象にあればUnknown。サイトのsource commitと観測時のdeployが一致しない場合も「同じ実装の再現」と主張しない。
3. **既存manifestとsolverを使う。** `tools/ui-check.mjs manifest.json` または `domGeometry({state,profile,html,css,targets,bindings})` → `verifyUI({model,evidence})`を使う。`--independent-first`は元CSS/DOMから安全な依存削減が成立する場合だけ採用。`#panel.inlineEnd <= safeRight`と`root.scrollWidth <= viewport`は**異なる性質**。特定パネルの局所fitを証明しただけでページ全体のスクロール量の正しさを主張しない。
4. **点で実測照合する。** 同一state/UA/viewportで既存の`captureUIObservation`等と証明モデルの対象矩形を比較。少なくとも正常・壊した対照、境界の直前/直後、各3ブラウザで確認。ずれた場合はソース/モデル/UA条件の不一致として切り分け、**実装が安全と断定しない**。ブラウザ点測定の合致だけで静的証明の閉包を承認しない。
5. **ユーザーへ返す値:** `observed`（再現する点の実測結果）、`static`（対象の契約がverified/violated/unknown）、`scope`（対象状態/幅・高さ領域/UA/環境、前提、source revision）、`witness`（静的違反がある場合の反例点）、`gap`（Unknownの具体的原因）。無根拠に「どの幅まで壊れるか」と範囲を生成しない。**現行verifyUIのviolatedは反例点を返すが、失敗幅の最大連続区間を出す機能ではない。** 区間表示が必要なら閉じた区分境界を使って領域全体で判定できる段階で追加する。

### 最初に成立性を測る対象

- **基準となる正例:** 既存の`e2e/layout-product-real-ui.spec.mts`はDUOのピン留め済み作者CSS/HTMLから`#game-shell`の横軸のみ `verified` を得て、意図的な`width:700px`改変が`violated`になり、幅境界周辺を3ブラウザで照合済み。まずこれを**新しいソルバやスナップショット形式を増やさず**再利用し、CLIへ必要なstate/profile/targetを渡せるか確認する。
- **ログイン後アプリへの適用:** RBACデモの1画面/1対象（またはReact-admin Ordersの横はみ出し）を選び、実ソース・ビルド・実測の紐付けが成立するかを先に審査。RBACのTailwind出力/React状態やReact-adminの動的スタイルは、現時点で静的なCSS閉包が確認されていない。**最初からVerifiedを完了条件にしない**。閉包がなければUnknownと依存理由、実ブラウザでの問題再現が成果。
- **重要:** RBACの権限制御はDOMの可否とサーバ認可であり、CSSの連続幅証明の対象ではない。まずE2Eのロール別仕様を正確に検証し、Staticに無理に載せない。

## 実装の順序、Go/No-Goの条件

1. **P0: 無意味なラッピングの除去（最初の変更）**
   - 既存の外部E2E計15件（うちRBAC権限の新規分9件）を基準として保管し、Admin/Editは全8、Admin/Statusは「自分自身だけ無効、他は有効」という**対象単位の期待**をPlaywrightで明示する。識別子は公開デモの安定したテストデータかテスト用IDを使い、個人情報をログに出さない。Manager/Viewerは全対象が操作できないことを確かめる。ボタンが消える場合とdisabledの場合は仕様に応じて別の期待にする。サーバ認可の証拠にはしない。
   - モーダル・閉じたdrawerもPlaywrightの操作と有限回のfocus観測として残す。`passed: true`の自己遷移を再送して`verifyUI`を呼ぶ**観測専用経路を削る**。横はみ出しの検出や3ブラウザで再現した実問題は維持。
   - 旧APIが完全に未使用になった後、`controlAvailabilityObservation`等を削除/縮小し、公開READMEはPlaywrightの`expect`で書き直す。証明器のcore、既存の意味ある`verifyUI`テストには触れない。
   - **受入:** 既知の2つの実不具合の検出継続、意図的にViewerのEditを有効化した負例が失敗、AdminのStatus 7/8→6/8等の意図しない回帰を必ず検出。通常gate552を不変に、オフライン9/外部15の必要な意義を維持。外部サイト変化は製品gateと分離する。
2. **P1: 既存の矩形観測を統合する**
   - `tools/capture-snapshots`内の点矩形採取と公開 `captureViewport` の重複を最小変更で整理。フォーカス補助も`page.evaluate`の細部を共有する必要があるときだけ共有し、汎用プラグインDSLは作らない。
   - **受入:** 元と同じ数値（許容丸め差を明示）、既存CLI/テスト維持、機密のDOM本文が新たに記録されない。
3. **P2: 1状態・1対象の実装ソース由来静的証明（実行可能性ゲート）**
   - まず既存のDUO正/負例でsource→`domGeometry`→`verifyUI`と点の照合を再利用。その後、**ログイン後実アプリの1ターゲット**でソースrevision/ビルド由来DOM/CSSの閉包判定を試す。静的に推論可能なら証明＋反例、無理ならUnknownの不足依存を出す。
   - **受入:** source/UA/font/外部CSSを変えた負例、未対応CSS、未対応JS状態はUnknownへ倒れる。証明条件が閉じた場合のみ対象の契約がVerifiedまたはViolatedとなり、witnessをサンプル点の推測と混同しない。3ブラウザでモデルの範囲/前提との差を明示。
4. **P3: 自動化の拡大は価値が出た後**
   - P2で本当に独立した証明/反例を発見できた場合のみ、既存manifestを生成する小さなbuild連携を検討。XStateや限定状態adapter以外の一般JS状態自動列挙は対象外。幅区間の正確な出力も根拠となる領域計算が成立した場合だけ検討。

### 途中で止める判定

- P0がPlaywrightの標準APIより複雑になるなら削除設計を見直す。
- P2の実アプリでCSS閉包を得られない場合は解析エンジンを緩めてVerifiedを捏造しない。Unknown理由を示し、実際のログイン後UIのE2E価値だけ維持する。RBAC認可・フォーカス・クリック可能性を幅の幾何証明で代用しない。
- いずれの段階でも、新たなURL取得サーバ/Worker、Playwrightの代替、任意JS状態を実行する独自解析器を導入しない。

## 採らない案と影響

- **全部`verifyUI`へ通す:** 統一した報告形式の利点より、booleanラッピングと偽の状態遷移が多い。静的に独立した根拠を増やさないため採らない。
- **全部Playwrightへ置き換える:** 現行`domGeometry`/`verifyUI`には連続幅の証明・静的反例があり、これを捨てるのは製品価値の後退。採らない。
- **DOMスナップショットをそのまま静的入力にする:** CSSの依存閉包・状態同一性・個人データ混入を保証できない。検査根拠の自動昇格には採らない。
- **既存の検査機能を別製品/別DSLに移す:** 専用の認証や設定基盤が新たに増える。実E2Eと既存CLIへの追加で足りるため採らない。

## 設計検証の結果

- 現行の`packages/adapter-core/test/partial-geometry.test.mjs`と`browser-observations.test.mjs`を再実行し、計23件成功。独立幾何の成立、関連CSSの未知依存、位置と幅に対する部分証明、ブラウザ観測の変換を確認。
- `e2e/layout-product-real-ui.spec.mjs`の「pinned game CSS closure proves horizontal fit and detects injected overwidth」をChromium/Firefox/WebKitで再実行し、3件成功。これは**ログイン後実アプリの証明ではなく**、既存の静的→ブラウザ照合経路の健全性確認。
- 本ADRで定義した「不要なE2E wrapperの削除」および「ログイン後サイトのCSS閉包/ソース対応」自体はまだ実装・実証していない。

## 変更・受入の現状

このADRは**提案・詳細検討のみ**。既存SDK、テスト、公開サイトの実装・画面を変更していない。実装でP0/P1を通してから、実証済みの規則だけをAcceptedにする。静的Proofの範囲は既存仕様のまま。

## P0 実装（2026-11-23）

- `e2e/external-authenticated-ui.spec.mts` のモーダル/権限/閉じたdrawerの純粋E2E結果から`verifyUI`への擬似action自己遷移を削除。root/mainの幾何実測と`verifyUI`の照合は残す。
- ランタイムobserverの戻り値はモーダル/閉じたdrawerについて`{steps,passed}`に単純化。旧権限API `captureControlAvailability`, `controlAvailabilityObservation`、不要な真偽値→`Observation`変換 `focusObservation`, `modalFocusObservation`、対応型と例を削除。権限は利用側E2Eの `expectRbacUserActions` が対象ごとの厳密な期待で判定する。
- 独立した静的 `domGeometry` / `verifyUI` と汎用state/action契約そのものは変更しない。`captureViewport`の幾何観測は維持。P1とP2の設計は未実装。
