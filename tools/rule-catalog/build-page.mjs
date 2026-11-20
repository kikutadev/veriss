// Builds the web page of docs/rule-catalog.md (published to GitHub Pages by .github/workflows/pages.yml).
//   node tools/rule-catalog/build-page.mjs <out dir>     writes <out>/index.html and <out>/img/*.png
import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const here = fileURLToPath(new URL('.', import.meta.url)), docs = fileURLToPath(new URL('../../docs/', import.meta.url));
const outDir = process.argv[2] ?? '_site';
const md = readFileSync(join(docs, 'rule-catalog.md'), 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`)
  .replace(/(^|[\s:])(https:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(#([^)]+)\)/g, '<a href="#$2">$1</a>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a href="https://github.com/mizchi/veriss/blob/main/docs/${u}">${t}</a>`);
const verdict = s => {
  const kinds = [['検査可', 'ok'], ['一部', 'part'], ['仕様のみ', 'spec'], ['差を報告', 'diff'], ['Unknown', 'unk'], ['拒否', 'unk']];
  const k = kinds.find(([w]) => s.startsWith(w));
  if (!k) return inline(s);
  const rest = s.slice(k[0].length).replace(/^[((](.*)[))]$/, '$1');
  return `<span class="v v-${k[1]}">${k[0]}</span>${rest ? `<span class="vnote">${inline(rest)}</span>` : ''}`;
};
const lines = md.split('\n');
let out = [], i = 0, sections = [], intro = true;
const slug = t => t.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/ /g, '-').toLowerCase();
while (i < lines.length) {
  const l = lines[i];
  if (l.startsWith('# ')) { i++; continue; }
  if (l.startsWith('## ')) { const t = l.slice(3); const id = slug(t); if (/^\d+\./.test(t)) sections.push({id, t}); out.push(`${intro ? '' : '</section>'}<section id="${id}"><h2>${inline(t)}</h2>`); intro = false; i++; continue; }
  if (l.startsWith('|')) {
    const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
    const cells = r => r.slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim());
    const head = cells(rows[0]); const vcol = head.findIndex(h => h === '判定');
    out.push(`<div class="tw"><table class="${head.length > 4 ? 'wide' : ''}"><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map(r => `<tr>${cells(r).map((c, j) => `<td>${j === vcol ? verdict(c) : inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    continue;
  }
  const img = /^!\[([^\]]*)\]\(rule-catalog\/([^)]+)\)/.exec(l);
  if (img) { out.push(`<figure><img src="img/${img[2]}" alt="${esc(img[1])}" loading="lazy"><figcaption>${esc(img[1])}</figcaption></figure>`); i++; continue; }
  if (l.startsWith('- ')) { const items = []; while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('  '))) { if (lines[i].startsWith('- ')) items.push(lines[i].slice(2)); else items[items.length - 1] += ' ' + lines[i].trim(); i++; } out.push(`<ul>${items.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`); continue; }
  if (l.trim() === '' || l.trim() === '---') { i++; continue; }
  const para = [l]; i++; while (i < lines.length && lines[i].trim() && !/^[#|!-]/.test(lines[i])) para.push(lines[i++]);
  out.push(`<p>${inline(para.join(''))}</p>`);
}
out.push('</section>');
const body = out.join('\n');
const tpl = readFileSync(join(here, 'page-template.html'), 'utf8');
mkdirSync(join(outDir, 'img'), {recursive: true});
for (const f of readdirSync(join(docs, 'rule-catalog'))) if (f.endsWith('.png')) copyFileSync(join(docs, 'rule-catalog', f), join(outDir, 'img', f));
writeFileSync(join(outDir, 'index.html'), tpl.replace('<!--NAV-->', sections.map(s => `<a href="#${s.id}">${inline(s.t)}</a>`).join('')).replace('<!--BODY-->', body));
console.log(`${outDir}/index.html: ${sections.length} sections`);
