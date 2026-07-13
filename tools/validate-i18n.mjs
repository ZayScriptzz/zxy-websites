// i18n validator for websites.html — run: node tools/validate-i18n.mjs
// 1. en/fr dict key parity  2. every data-i18n / data-i18n-attrs key exists in BOTH dicts
// 3. static drift check: EN markup leaf text byte-matches en dict value
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'websites.html'), 'utf8');

// --- extract the I18N object literal (brace-matched, string-aware) ---
const start = html.indexOf('var I18N');
if (start === -1) { console.error('FAIL: I18N not found'); process.exit(1); }
const braceStart = html.indexOf('{', start);
let depth = 0, i = braceStart, inStr = null;
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) {
    if (c === '\\') { i++; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) break; }
}
const I18N = vm.runInNewContext('(' + html.slice(braceStart, i + 1) + ')');

let fail = 0;
const en = I18N.en, fr = I18N.fr;

// 1. parity
for (const k of Object.keys(en)) if (!(k in fr)) { console.error(`PARITY: "${k}" in en, missing in fr`); fail++; }
for (const k of Object.keys(fr)) if (!(k in en)) { console.error(`PARITY: "${k}" in fr, missing in en`); fail++; }

// 2. markup key coverage — scan live markup only (no HTML comments, no script bodies)
const markupOnly = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
const usedKeys = new Set();
for (const m of markupOnly.matchAll(/data-i18n="([^"]+)"/g)) usedKeys.add(m[1]);
for (const m of markupOnly.matchAll(/data-i18n-attrs="([^"]+)"/g))
  for (const pair of m[1].split(',')) usedKeys.add(pair.split('=')[1]);
for (const k of usedKeys) {
  if (!(k in en)) { console.error(`COVERAGE: markup key "${k}" missing in en dict`); fail++; }
  if (!(k in fr)) { console.error(`COVERAGE: markup key "${k}" missing in fr dict`); fail++; }
}

// 3. static drift: leaf element text must byte-match en dict
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
for (const m of markupOnly.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
  const [, key, raw] = m;
  if (!(key in en)) continue; // already reported
  const markup = decode(raw);
  if (markup !== en[key])
    { console.error(`DRIFT: "${key}"\n  markup: ${JSON.stringify(markup)}\n  en    : ${JSON.stringify(en[key])}`); fail++; }
}

const nEn = Object.keys(en).length, nFr = Object.keys(fr).length;
if (fail) { console.error(`\n${fail} problem(s). en=${nEn} fr=${nFr} keys.`); process.exit(1); }
console.log(`i18n OK — en=${nEn} fr=${nFr} keys, ${usedKeys.size} used in markup, drift clean.`);
