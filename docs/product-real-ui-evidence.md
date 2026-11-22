# Phase 2: 実UIのオフライン検証記録（2026-11-22）

## 結論

veriss の CLI を**ポートフォリオ / ブラウザゲーム / 第三者 UI の3種類**の静的 HTML・CSS に適用した。いずれも `UNKNOWN` で、**実UIのレイアウト破綻を実際に検出・修正できた実証はまだない**。一方、同じ入力に対する Chromium・Firefox・WebKit の5幅×3種＝**45点観測**では、文書の水平スクロール幅が viewport を超えるケースは0だった。

検出した `E_` 13件は全て `E_CSS_SHORTHAND_CONFLICT`。長短ハンドを同一規則内で組み合わせる記述への静的エラーであり、**レイアウト破綻13件ではない**。書き手が意図した上書きかどうかは特定していない。`UNKNOWN` に含まれる未対応をエラーや成功に読み替えない。

| 対象 | 取得元 | CLI | Error | Warning | Unknown | 5幅×3ブラウザの水平はみ出し |
| --- | --- | --- | ---: | ---: | ---: | --- |
| portfolio-about | <https://kikuta.dev/about/> | `UNKNOWN` | 3 | 13 | 33 | 0/15 |
| duo-game-title | `../game/duo-breaker/index.html` + `src/style.css` | `UNKNOWN` | 5 | 3 | 6 | 0/15 |
| bootstrap-album | <https://getbootstrap.com/docs/5.3/examples/album/>（Bootstrap公式サンプル） | `UNKNOWN` | 5 | 27 | 437 | 0/15 |

「Unknown診断の件数」は**未対応箇所の報告件数**であり、CSSルールや画面の何％を証明したかではない。現状で割合を被覆率として示すことはできない。Bootstrap はCSS約234KBで複雑なカスケード・変数・セレクタを持ち、`U_LAYOUT_CSS` 328件と `U_LAYOUT_SELECTOR` 94件が Unknown の大半を占める。ポートフォリオは主に `U_LAYOUT_SELECTOR` 20件、ゲームは `U_LAYOUT_CSS` 5件。

## ブラウザ側で実際に観測できたこと

- 各ブラウザで **320×600、390×844、768×768、1024×768、1280×800px** を計測。検査対象はローカル保存した同一の初期HTML・CSSで、外部ネットワーク要求を遮断し、JSは実行しない。CSSの外部 `@import`、外部フォント、画像は再現しない。
- ポートフォリオ: `.about-document` の幅は各ブラウザで320px viewport時288px、390px時350px、1280px時1090px。画面幅超過は観測なし。文字の高さはブラウザ間で異なり、テキスト寸法の同一性までは主張しない。
- DUO瓦割り: `#game-shell` は狭い幅でviewport幅に一致し、768〜1280pxでは `max-width:560px` に従い中央配置。15点とも期待どおり。タイトル操作のクリック成功・JSで生成する画面・画面高さが小さい条件は**この評価では未測定**。
- Bootstrap Album: カードは320/390pxでは1列、768/1024/1280pxでは3列になり、3ブラウザ間で同じ行の配置を観測。これは**5幅での実測**であり、連続する全幅の静的証明ではない。

## 入力の固定と再実行

- `tests/fixtures/product-real-ui/{portfolio-about,duo-game-title,bootstrap-album}.{html,css}` は実際のページ/リポジトリから収集。`*.source.json` に取得元とSHA-256を保存。HTML は script/style/stylesheet-link の読込ノードを除き、CSS は取得した元の著者規則を順番に連結する（CSS自体の勝手な再記述はしない）。各対象のHTML/CSSは1対で、JS実行後のDOMを代表しない。
- `node --test tests/product-real-ui.test.mjs` でハッシュ・CLIのステータス／終了コードを検証。CLIの単独実行例（他の2件は同名ファイルを替える）:

  ```sh
  node packages/veriss/bin/veriss.mjs check --html tests/fixtures/product-real-ui/duo-game-title.html --css tests/fixtures/product-real-ui/duo-game-title.css --min-width 320 --max-width 1280 --json
  ```
- `node tools/gate-guarded.mjs --product-e2e` で3ブラウザの全45点観測とファイル入力E2Eを実行。検証器出力とブラウザ計測は別物として扱い、点観測を証明に変換しない。
- **再取得が必要な場合のみ** `node tools/capture-product-real-ui.mjs --capture`。ポートフォリオ・Bootstrapは開発マシンから直接公開ページにアクセスし、DUOは隣接するゲームのソースを参照する。再取得によりソースが変わり得るので、比較時は事前のSHA-256を照合する。Workerは使用しない。
- Bootstrap部分は第三者の実例としてのオフライン評価資料であり、当フォークの作例や独自成果とは称しない。

## 製品価値への判断と次の課題

1. **未達:** 実ページから「verissでのみ発見してブラウザで再現し、修正後に反例が消えた」実例はまだ0件。既存のGrid NG→OKは、意図して作った製品デモであり実サイトでの発見実績ではない。
2. **最優先:** `E_CSS_SHORTHAND_CONFLICT` の判定・重大度を「実際に壊れる」表示と混同しない。一般的な上書きの正常例と意図しないミスの対照を3ブラウザで調べ、誤検知・有効検出を確定する。
3. **次点:** 3件の Unknown 主要因から、小さくても健全に証明できる局所モデル・入力準備の改善点を抽出する。ただし未対応を黙って成功にしない。
4. **使い始める導線:** 公開Webデモはブラウザの File API によるHTML/CSSファイル読込を追加。25,000文字超は無理にメインスレッドで実行せず、完全なCSSを渡せるCLIへ案内する。**Cloudflare Workerは不要**。

本レポートは Phase 2 の **実UIデータ収集・実測段階** の完了記録であり、検出精度の製品価値実証が完了したことを意味しない。
