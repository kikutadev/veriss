// Layout-shift cases on the L1 reference: a state change (hover, focus, an opened panel, an inserted badge) that is
// expected not to move anything. `shift` cases are broken (an item does move for some width in 320–1920px: Z3 finds the
// width); `stable` cases are their corrected or harmless counterparts (Z3 proves no width moves an item: unsat).
const row = (items, rest = {}) => ({ display: 'flex', height: 60, gap: 10, justify: 'flex-start', ...rest, items });
const grid = (columns, rows, items, rest = {}) => ({ display: 'grid', columns, rows, columnGap: 10, rowGap: 0, ...rest, items });
const item = (id, basis, rest = {}) => ({ id, basis, grow: 0, shrink: 1, ...rest });
const cell = (id, column, rowLine, rest = {}) => ({ id, column, row: rowLine, ...rest });
const set = (c, id, patch) => ({ ...c, items: c.items.map(it => String(it.id) === id ? { ...it, ...patch } : it) });

const nav = row([item('home', 100), item('docs', 100), item('blog', 100)]);
const accordion = grid([{ fr: 1 }], [{ px: 40 }, { px: 0 }, { px: 40 }], [cell('head', [1, 2], [1, 2]), cell('panel', [1, 2], [2, 3]), cell('next', [1, 2], [3, 4])]);
const toolbar = row([item('icon', 40, { shrink: 0 }), item('title', 200, { grow: 1 }), item('menu', 40, { shrink: 0 })]);
const sidebar = grid([{ px: 200 }, { fr: 1 }], [{ px: 300 }], [cell('side', [1, 2], [1, 2]), cell('main', [2, 3], [1, 2])]);

export const shiftCases = [
  // Broken: the change moves something.
  { name: 'nav-bold-hover', expect: 'shift', why: 'ホバーで太字になったリンクが 4px 広がり、後ろのリンクが右へ動く',
    before: nav, after: set(nav, 'home', { basis: 104 }) },
  { name: 'nav-border-on-focus', expect: 'shift', why: 'フォーカスで 2px の枠を足した分だけ箱が広がり、兄弟が動く(outline なら動かない)',
    before: nav, after: set(nav, 'docs', { basis: 104 }) },
  { name: 'accordion-open', expect: 'shift', why: '開いたパネルの行が 0px から 120px になり、下の見出しが押し下げられる',
    before: accordion, after: { ...accordion, rows: [{ px: 40 }, { px: 120 }, { px: 40 }] } },
  { name: 'badge-inserted', expect: 'shift', why: '通知のバッジ(20px)が項目の前に差し込まれ、後ろの項目が右へ動く',
    before: row([item('a', 80), item('b', 80)]), after: row([item('a', 80), item('badge', 20), item('b', 80)]) },
  { name: 'centered-group-grows', expect: 'shift', why: '中央寄せの並びで 1 つが広がると、前の項目も含めて全体が左へ動く',
    before: row([item('a', 60), item('b', 60), item('c', 60)], { justify: 'center' }), after: set(row([item('a', 60), item('b', 60), item('c', 60)], { justify: 'center' }), 'b', { basis: 80 }) },
  { name: 'end-aligned-last-grows', expect: 'shift', why: '右寄せの並びで最後の項目が広がると、前の項目がすべて左へ動く',
    before: row([item('a', 60), item('b', 60)], { justify: 'flex-end' }), after: set(row([item('a', 60), item('b', 60)], { justify: 'flex-end' }), 'b', { basis: 90 }) },
  { name: 'space-between-middle-grows', expect: 'shift', why: '両端揃えの真ん中の項目が広がると、真ん中の開始位置が動く',
    before: row([item('a', 60), item('b', 60), item('c', 60)], { justify: 'space-between' }), after: set(row([item('a', 60), item('b', 60), item('c', 60)], { justify: 'space-between' }), 'b', { basis: 100 }) },
  { name: 'toolbar-title-pushes-grow', expect: 'shift', why: '伸びるタイトルの basis が増えると、狭い画面で縮み方が変わり、右のメニューの位置が動く',
    before: toolbar, after: set(toolbar, 'menu', { basis: 60 }) },
  { name: 'sidebar-widens', expect: 'shift', why: '固定幅のサイドバーが 200px から 240px になり、fr の本文の開始位置が動く',
    before: sidebar, after: { ...sidebar, columns: [{ px: 240 }, { fr: 1 }] } },
  { name: 'row-gap-on-expand', expect: 'shift', why: '展開の状態で行の間隔を 0 から 8px にすると、2 行目が下へ動く',
    before: accordion, after: { ...accordion, rowGap: 8 } },
  { name: 'align-center-height', expect: 'shift', why: '交差軸の中央に揃えた項目の高さが変わると、その項目の上端が動く',
    before: row([item('a', 60, { align: 'center', height: 20 })]), after: row([item('a', 60, { align: 'center', height: 40 })]) },
  { name: 'shrinking-sibling-grows', expect: 'shift', why: '前の項目の basis が増えると、後ろの縮まない項目の開始位置がどの幅でも動く(狭い画面では縮み方も変わる)',
    before: row([item('a', 200, { min: 0 }), item('b', 200, { shrink: 0 })]), after: row([item('a', 220, { min: 0 }), item('b', 200, { shrink: 0 })]) },
  // Stable: nothing moves, for every width in the range.
  { name: 'color-only-hover', expect: 'stable', why: 'ホバーで色だけ変える(配置は同じ)', before: nav, after: nav },
  { name: 'last-item-grows-no-shrink', expect: 'stable', why: '左寄せの並びの最後の項目が広がっても、縮まない並びなら前の項目は動かない',
    before: row([item('a', 60, { shrink: 0 }), item('b', 60, { shrink: 0 })]), after: row([item('a', 60, { shrink: 0 }), item('b', 90, { shrink: 0 })]) },
  { name: 'reserved-space', expect: 'stable', why: '中身の最小幅が変わっても basis の 120px に収まるので、何も動かない(場所を予約した)',
    before: row([item('a', 120, { shrink: 0 }), item('b', 80)]), after: row([item('a', 120, { shrink: 0, min: 100 }), item('b', 80)]) },
  { name: 'grid-fixed-row-start-aligned', expect: 'stable', why: '固定の行の中で上に揃えた項目の高さが変わっても、上端は動かない',
    before: grid([{ px: 100 }], [{ px: 80 }], [cell('a', [1, 2], [1, 2], { align: 'start', height: 40 })]), after: grid([{ px: 100 }], [{ px: 80 }], [cell('a', [1, 2], [1, 2], { align: 'start', height: 60 })]) },
  { name: 'accordion-overlay', expect: 'stable', why: 'パネルの行を最初から 120px で予約しておけば、開いても下の見出しは動かない',
    before: { ...accordion, rows: [{ px: 40 }, { px: 120 }, { px: 40 }] }, after: { ...accordion, rows: [{ px: 40 }, { px: 120 }, { px: 40 }] } },
  { name: 'flex-start-aligned-height', expect: 'stable', why: '上に揃えた項目の高さが変わっても、上端と兄弟の位置は動かない',
    before: row([item('a', 60, { align: 'flex-start', height: 20 }), item('b', 60)]), after: row([item('a', 60, { align: 'flex-start', height: 50 }), item('b', 60)]) },
];
