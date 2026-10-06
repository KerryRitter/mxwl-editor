import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)],
  );
}
const pages = files(root).filter((file) => file.endsWith('.html'));
const failures = [];
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const pagePath = `/${relative(root, page).replace(/index\.html$/, '')}`;
  if (/zipper/i.test(html)) failures.push(`${pagePath}: unrelated product reference`);
  for (const match of html.matchAll(/<(?:a|img|script|link)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1].replaceAll('&amp;', '&');
    if (!value || /^(https?:|mailto:|data:|tel:)/.test(value)) continue;
    const url = new URL(value, `https://www.mxwl.work${pagePath}`);
    const path = decodeURIComponent(url.pathname);
    let destination = resolve(root, `.${path}`);
    if (path.endsWith('/')) destination = resolve(destination, 'index.html');
    if (!existsSync(destination)) {
      failures.push(`${pagePath}: missing ${value}`);
      continue;
    }
    if (url.hash && destination.endsWith('.html')) {
      const id = decodeURIComponent(url.hash.slice(1));
      const targetHtml = readFileSync(destination, 'utf8');
      if (!targetHtml.includes(`id="${id}"`)) failures.push(`${pagePath}: missing anchor ${value}`);
    }
  }
  for (const required of [
    '<title>',
    'name="description"',
    'rel="canonical"',
    'lang="en"',
    'id="main"',
  ])
    if (!html.includes(required)) failures.push(`${pagePath}: missing ${required}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `Verified ${pages.length} pages: local links, anchors, assets, metadata, and product scope.`,
);
