import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const editor = resolve(process.argv[2] ?? resolve(root, '../mxwl-editor'));
const imageDir = resolve(root, 'public/images');
mkdirSync(imageDir, { recursive: true });
const copies = {
  'resources/icons/icon_32.png': 'icon-32.png',
  'resources/icons/icon_128.png': 'icon-128.png',
  'resources/icons/icon_256.png': 'icon-256.png',
  'resources/logo.png': 'brand.png',
  'docs/assets/mxwl-review.png': 'mxwl-review.png',
  'docs/assets/mxwl-agent-fleet.png': 'mxwl-agent-fleet.png',
  'docs/assets/mxwl-project-hosts.png': 'mxwl-project-hosts.png',
  'docs/assets/mxwl-github.png': 'mxwl-github.png',
};
for (const [source, destination] of Object.entries(copies))
  copyFileSync(resolve(editor, source), resolve(imageDir, destination));
const guides = JSON.parse(readFileSync(resolve(root, 'src/data/guides.json'), 'utf8'));
const sourceToRoute = new Map(
  guides.filter((guide) => guide.source).map((guide) => [guide.source, `/docs/${guide.slug}/`]),
);
const repository = 'https://github.com/KerryRitter/mxwl-editor';
for (const guide of guides) {
  if (!guide.source) continue;
  let markdown = readFileSync(resolve(editor, guide.source), 'utf8').replace(/^# .+\r?\n/, '');
  markdown = markdown.replace(
    /(!?\[[^\]]*\])\(([^)\s]+)([^)]*)\)/g,
    (match, label, target, suffix) => {
      if (/^(https?:|mailto:|#)/.test(target)) return match;
      const [file, fragment] = target.split('#');
      const source = resolve(dirname(resolve(editor, guide.source)), file).slice(editor.length + 1);
      const anchor = fragment ? `#${fragment}` : '';
      if (source.startsWith('docs/assets/'))
        return `${label}(/images/${source.split('/').at(-1)}${anchor}${suffix})`;
      const route = sourceToRoute.get(source);
      return `${label}(${route ? route + anchor : `${repository}/blob/main/${source}${anchor}`}${suffix})`;
    },
  );
  const frontmatter = `---\nlayout: ../../layouts/Doc.astro\ntitle: ${JSON.stringify(guide.title)}\ndescription: ${JSON.stringify(guide.description)}\nsource: ${JSON.stringify(guide.source)}\n---\n`;
  writeFileSync(resolve(root, `src/pages/docs/${guide.slug}.md`), frontmatter + markdown);
}
copyFileSync(resolve(editor, 'LICENSE'), resolve(root, 'LICENSE'));
const version = JSON.parse(readFileSync(resolve(editor, 'package.json'), 'utf8')).version;
const productPath = resolve(root, 'src/data/product.ts');
writeFileSync(
  productPath,
  readFileSync(productPath, 'utf8').replace(/version: '[^']+'/, `version: '${version}'`),
);
console.log(
  `Synced mxwl ${version}: ${Object.keys(copies).length} brand/product assets and ${guides.filter((guide) => guide.source).length} guides.`,
);
