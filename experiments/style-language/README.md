# 実験: 静的検査できるスタイル記述(CSS のスーパーセットとサブセット)

- 状態: 実験(提案の構文の置き場。どれもまだ実装していない)
- 出典: isle で書いた [ADR-0014](../../docs/adr/0014-component-style-language.md) と [ADR-0015](../../docs/adr/0015-checkable-style-languages-and-portable-layout.md)(veriss に移した)。設計の理由と比較は ADR にあり、ここには各案の構文の例と、今の veriss がそれをどう扱うかを置く

## 置いてあるもの

| ファイル | 案 | 種類 | 今の veriss の扱い(`tests/experiments-style-language.test.mjs` で固定) |
|---|---|---|---|
| [a-checked-profile.css](a-checked-profile.css) | A. 検査済みの CSS サブセット(profile) | 標準の CSS | そのまま解析できる(verified) |
| [b-contract-at-rules.css](b-contract-at-rules.css) | B. 契約を書く at-rule(`@contract`、`@assume`) | CSS のスーパーセット(ブラウザーは知らない at-rule を読み飛ばす) | `@contract` を扱えず Unknown(`Unsupported @contract`) |
| [c-component.style](c-component.style) | C. テンプレートと結び付いた component 言語 | 新しい言語 | 読む front-end がない |
| [d-typed-values.tsx](d-typed-values.tsx) | D. 型付きのスタイル値 | TypeScript の API のスケッチ | 読む front-end がない |
| [e-layout-ir.txt](e-layout-ir.txt) | E. 共有のレイアウト IR | 中間表現 | [ADR-0016](../../docs/adr/0016-module-decomposition.md) の `StyleFacts`(箱と計算値の表)が、これにいちばん近い |

## 試すときの順番(ADR-0015 の「判断(提案)」から)

1. 案 A: veriss が決められる範囲を profile として名前で固定する。Unknown を profile 違反として前に出す
2. 案 B: `@contract` / `@assume` を構文の段(ADR-0016 の syntax)で読み、今の `boxes` オプションと `data-noshift` に変換する。実装したら上の表とテストの期待値を変える
3. 案 E: ADR-0016 の M9 で、style の段が出す事実(`StyleFacts`)を公開の IR にする。案 C・D はこの IR に落とす front-end として作る

## 決まり

- ここに置くのは提案の構文と、その扱いを固定するテストだけ。`packages/` のコードはここを import しない
- 構文を変えるときは、元の ADR も同じ変更にする(ADR が正、ここは例)
