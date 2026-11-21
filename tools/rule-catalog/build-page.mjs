// Render the same rule catalog used by the upstream project, with fork-specific
// source links. The result is self-contained HTML + static images, no Actions.
//   node tools/rule-catalog/build-page.mjs <output-directory>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const here = fileURLToPath(new URL('.', import.meta.url));
const docs = fileURLToPath(new URL('../../docs/', import.meta.url));
const outDir = process.argv[2] ?? '_site';
const repo = 'https://github.com/kikutadev/veriss';
const markdown = readFileSync(join(docs, 'rule-catalog.md'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (dest) => {
    if (dest.startsWith('https://'))
        return dest;
    if (dest.startsWith('../'))
        return `${repo}/blob/main/${dest.slice(3)}`;
    return `${repo}/blob/main/docs/${dest}`;
};
// Markdown is repository-owned. Escape raw markup before adding approved HTML.
const inline = (value) => esc(value)
    .replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, txt) => `<strong>${txt}</strong>`)
    .replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_m, label, anchor) => `<a href="#${anchor}">${label}</a>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, dest) => `<a href="${esc(href(dest))}">${label}</a>`)
    .replace(/(^|[\s:])(https:\/\/[^\s<)]+)/g, (_m, leading, url) => `${leading}<a href="${url}">${url}</a>`);
const verdict = (s) => {
    const kinds = [['検査可', 'ok'], ['一部', 'part'], ['仕様のみ', 'spec'], ['差を報告', 'diff'], ['Unknown', 'unk'], ['拒否', 'unk']];
    const kind = kinds.find(([label]) => s.startsWith(label));
    if (!kind)
        return inline(s);
    const [label, className] = kind;
    const note = s.slice(label.length).replace(/^[((](.*)[))]$/, '$1');
    return `<span class="v v-${className}">${label}</span>${note ? `<span class="vnote">${inline(note)}</span>` : ''}`;
};
const slug = (s) => s.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/ /g, '-').toLowerCase();
const lines = markdown.split('\n');
const out = [], sections = [];
let i = 0, inSection = false;
while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('# ')) {
        i++;
        continue;
    }
    if (line.startsWith('## ')) {
        const title = line.slice(3), id = slug(title);
        sections.push({ id, title });
        out.push(`${inSection ? '</section>' : ''}<section id="${id}"><h2>${inline(title)}</h2>`);
        inSection = true;
        i++;
        continue;
    }
    if (line.startsWith('|')) {
        const raw = [];
        while (i < lines.length && lines[i].startsWith('|'))
            raw.push(lines[i++]);
        const cells = (row) => row.slice(1, -1).split(/(?<!\\)\|/).map(s => s.trim());
        const headings = cells(raw[0] ?? '| |');
        const vcol = headings.indexOf('判定');
        const tr = (row) => cells(row).map((c, j) => `<td>${j === vcol ? verdict(c) : inline(c)}</td>`).join('');
        out.push(`<div class="tw"><table class="${headings.length > 4 ? 'wide' : ''}"><thead><tr>${headings.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${raw.slice(2).map(row => `<tr>${tr(row)}</tr>`).join('')}</tbody></table></div>`);
        continue;
    }
    const img = /^!\[([^\]]*)\]\(rule-catalog\/([^)]+)\)/.exec(line);
    if (img) {
        out.push(`<figure><img src="img/${esc(img[2])}" alt="${esc(img[1])}" loading="lazy"><figcaption>${esc(img[1])}</figcaption></figure>`);
        i++;
        continue;
    }
    if (line.startsWith('- ')) {
        const items = [];
        while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('  '))) {
            const item = lines[i++];
            if (item.startsWith('- '))
                items.push(item.slice(2));
            else if (items.length)
                items[items.length - 1] = `${items[items.length - 1]} ${item.trim()}`;
        }
        out.push(`<ul>${items.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
        continue;
    }
    if (!line.trim() || line.trim() === '---') {
        i++;
        continue;
    }
    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^[#|!-]/.test(lines[i]))
        paragraph.push(lines[i++]);
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
}
if (inSection)
    out.push('</section>');
const template = readFileSync(join(here, 'page-template.html'), 'utf8');
mkdirSync(join(outDir, 'img'), { recursive: true });
for (const filename of readdirSync(join(docs, 'rule-catalog')))
    if (filename.endsWith('.png'))
        copyFileSync(join(docs, 'rule-catalog', filename), join(outDir, 'img', filename));
const nav = sections.map(({ id, title }) => `<a href="#${id}">${inline(title)}</a>`).join('');
const page = template.replace('<!--NAV-->', nav).replace('<!--BODY-->', out.join('\n'));
writeFileSync(join(outDir, 'index.html'), page);
console.log(`${outDir}/index.html: ${sections.length} sections, ${readdirSync(join(outDir, 'img')).length} images`);
