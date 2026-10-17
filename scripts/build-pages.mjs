// Stamps the shared header and footer into the legal pages.
//   node scripts/build-pages.mjs          rewrite the pages
//   node scripts/build-pages.mjs --check  exit 1 if any page is out of date (used by the tests)
// Edit frontend/partials/header.html or footer.html, run `npm run build:pages`, commit the result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGES = ['disclaimer', 'imprint', 'legal_notice', 'privacy_policy'];
const LINK_ACTIVE = 'text-sams-gold font-bold inline-block py-1';
const LINK_NORMAL = 'hover:text-sams-gold transition-colors inline-block py-1';

const partial = (name) => fs.readFileSync(path.join(root, 'frontend/partials', name + '.html'), 'utf8').replace(/\r\n/g, '\n').trimEnd();

export function render(page, html) {
  const crlf = html.includes('\r\n');
  let out = html.replace(/\r\n/g, '\n');
  for (const name of ['header', 'footer']) {
    let body = partial(name);
    body = body.replace(/\{\{link:([a-z_]+)\}\}/g, (_, key) => (key === page ? LINK_ACTIVE : LINK_NORMAL));
    const re = new RegExp(`(    <!-- @include ${name} -->)[\\s\\S]*?(\\n    <!-- @end include -->)`);
    if (!re.test(out)) throw new Error(`${page}.html has no "@include ${name}" marker`);
    out = out.replace(re, (_, a, b) => a + '\n' + body + b);
  }
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const page of PAGES) {
    const file = path.join(root, page + '.html');
    const current = fs.readFileSync(file, 'utf8');
    const next = render(page, current);
    if (next !== current) {
      stale++;
      if (!check) fs.writeFileSync(file, next);
      console.log(`${check ? 'out of date' : 'updated'}: ${page}.html`);
    }
  }
  if (check && stale) { console.error('Run: npm run build:pages'); process.exit(1); }
  if (!stale) console.log('all pages up to date');
}
