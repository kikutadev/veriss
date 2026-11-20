// The examples drawn in docs/rule-catalog.md (one per role). mark: the box the finding points at.
const type = 'font-family:sans-serif;font-size:16px;line-height:20px;';
const button = 'appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;color:inherit;font:inherit;';
const label = {minInlineSize: 1, intrinsicBlockSize: 20};
const page = `.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:52px;row-gap:12px;padding:16px;background:#fff;color:#111;${type}}`;
export const examples = [
  // 1. syntax
  {id: 'syntax', html: '<main class="page"><div class="bar a">calc(100%-80px)</div><div class="bar b">calc(100% - 80px)</div></main>',
    css: page + '.bar{background:#1d4ed8;color:#fff;padding:6px}.a{width:calc(100%-80px)}.b{width:calc(100% - 80px)}', boxes: {'.bar': label}, shot: 480,
    mark: '.a', caption: '上: 空白なしの calc は宣言ごと捨てられ、幅 auto(全幅)のまま。下: 空白ありの対照'},
  // 2. inert declaration
  {id: 'inert', html: '<main class="page"><div class="box a">border-width: 4px</div><div class="box b">border: 4px solid</div></main>',
    css: page + '.box{padding:8px;background:#f3f3f3}.a{border-width:4px;border-color:#d33}.b{border:4px solid #d33}', boxes: {'.box': label}, shot: 480,
    mark: '.a', caption: '上: border-style がないので線は描かれず幅も 0。下: border-style ありの対照'},
  // 3. at-rule
  {id: 'atrule', html: '<main class="page"><div class="card">@media (min-width:600px) and(max-width:2000px)</div></main>',
    css: page + '.card{padding:12px;background:#eee}@media (min-width:600px) and(max-width:2000px){.card{background:#ffd34d}}', boxes: {'.card': label}, shot: 800,
    mark: '.card', caption: '800px 幅でも黄色にならない: and( が関数として読まれ、query 全体が不正'},
  // 4. selector x DOM
  {id: 'selector', html: '<main class="page"><table class="t"><tr class="r"><td>.t &gt; .r</td><td>当たらない</td></tr></table></main>',
    css: page + '.t td{border:1px solid #999;padding:6px;width:140px;height:36px}.t > .r{background:#ffd34d}', accessibility: false, shot: 480,
    mark: '.t', caption: 'HTML の解析が tbody を補うので .t > .r は当たらず、行は塗られない(表の配置は Unknown でも、この警告は出る)'},
  // 5. state unreachable
  {id: 'state', html: '<main class="page"><div class="chip">div:focus は来ない</div></main>',
    css: page + '.chip{height:40px;padding:10px;background:#eee}.chip:focus{outline:3px solid #d33}', boxes: {'.chip': label}, shot: 480,
    mark: '.chip', caption: 'tabindex のない div はフォーカスされないので :focus の規則は決して当たらない'},
  // 6. HTML structure
  {id: 'html', html: '<main class="page"><p class="p">段落<div class="d">p の中の div</div></p></main>',
    css: page + '.p{border:2px solid #d33;padding:8px}.d{background:#eef}', boxes: {'.p': label, '.d': label}, accessibility: false, shot: 480,
    mark: '.p', caption: '<p> の中の <div> は段落を閉じる。赤枠の外に div が出て、</p> は空の段落になる'},
  // 7. layout overflow
  {id: 'overflow', html: '<main class="grid"><div class="c">A</div><div class="c">B</div><div class="c">C</div></main>',
    boxes: {'.c': label}, css: '.grid{display:grid;grid-template-columns:repeat(3,160px);gap:8px;padding:8px;background:#fff}.c{height:60px;background:#7aa7ff}', accessibility: false, shot: 375,
    mark: '.grid', caption: '375px 幅: 160px×3 の固定トラックが viewport をはみ出し、横スクロールになる'},
  // 8. occlusion
  {id: 'occluded', html: '<main class="panel"><button class="go" aria-label="送信"></button><div class="cover"></div></main>',
    css: `.panel{display:grid;grid-template-columns:120px minmax(0,1fr);grid-template-rows:48px;position:relative;background:#fff;padding:0}.go{${button}background:#2b6cff}.cover{position:absolute;top:0;left:80px;inline-size:120px;block-size:48px;background:rgba(255,120,120,.85)}`, shot: 480,
    mark: '.go', caption: '青いボタンの右側を、後から描かれる赤い箱が覆い、クリックを奪う'},
  // 9. contrast
  {id: 'contrast', html: '<main class="card"><p class="t">薄いグレーの本文</p></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px;background:#fff;color:#aaa;${type}padding:0 8px}.t{font-size:16px}`, boxes: {'.t': label}, shot: 480,
    mark: '.t', caption: '#aaa と #fff は 2.32:1 で、本文に要る 4.5:1 に届かない'},
  // 10. focus visible
  {id: 'focus', html: '<main class="bar"><button class="b" aria-label="設定"></button></main>',
    css: `.bar{display:grid;grid-template-columns:48px;grid-template-rows:48px;background:#fff;padding:0}.b{${button}background:#ddd}.b:focus{outline:none}`, shot: 240, focus: '.b',
    mark: '.b', caption: 'フォーカスしても outline が消え、ほかに何も変わらない(画像はフォーカス中)'},
  // 11. target size
  {id: 'target', html: '<main class="row"><button class="i1" aria-label="A"></button><button class="i2" aria-label="B"></button><button class="i3" aria-label="C"></button></main>',
    css: `.row{display:flex;column-gap:2px;block-size:32px;padding:8px}.i1,.i2,.i3{${button}flex:none;width:16px;height:16px;background:#2b6cff}`, shot: 240,
    mark: '.i2', caption: '16×16px のボタンが 2px 間隔で並ぶ(24×24px に届かない)'},
  // 12. hover shift
  {id: 'shift', html: '<main class="list"><div class="card"><div class="inner">ホバーで高くなるカード</div></div><div class="next">下の要素が動く</div></main>',
    css: `.list{display:grid;grid-template-columns:minmax(0,1fr);padding:8px;row-gap:8px;background:#fff;color:#111;${type}}.card{display:grid;grid-template-columns:minmax(0,1fr);height:60px;padding:10px;background:#dbe6ff}.inner{height:20px}.card:hover{height:100px}.next{height:40px;background:#ffd34d;padding:10px}`, boxes: {'.inner': label, '.next': label}, accessibility: false, shot: 320, hover: '.card',
    mark: '.next', caption: '左: 通常、右: ホバー中。カードの高さが変わり、黄色い箱が 40px 押し下げられる(入力なしのレイアウトシフト)'},
  // 13. browser dependent
  {id: 'browser', html: '<main class="page"><div class="blk"><div class="x">justify-self: center</div></div></main>',
    css: page + '.blk{display:block}.x{justify-self:center;background:#7aa7ff;color:#fff;padding:8px}', accessibility: false, shot: 480,
    mark: '.x', caption: 'Chromium では中央に寄って縮む(この画像)。Firefox は無視して全幅のまま → Unknown + 警告'},
  // 14. unknown
  {id: 'unknown', html: '<main class="page"><p class="p">最初の文字だけ大きくする</p></main>',
    css: page + '.p{display:block}.p::first-letter{font-size:40px;color:#d33}', boxes: {'.p': label}, accessibility: false, shot: 480,
    mark: '.p', caption: '::first-letter で変わる行の高さは解析しない。ブラウザーでは行が高くなるが、veriss は Unknown を返し成功にしない'},
  // 15. ARIA spec tier
  {id: 'aria', html: '<main class="bar"><div class="sw" role="switch" tabindex="0" aria-label="通知"></div></main>',
    css: `.bar{display:grid;grid-template-columns:48px;grid-template-rows:28px;background:#fff;padding:0}.sw{background:#2b6cff;border-radius:14px}`, shot: 240,
    mark: '.sw', caption: '描画は正常に見えるが、role="switch" に aria-checked がない(マークアップの適合性の誤り)'},
];
