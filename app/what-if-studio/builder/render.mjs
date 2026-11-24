// Dung hinh cho Shot Builder bang Remotion (chay tren may ban, khong can AI):
//   node builder/render.mjs <project.json> board      -> out/<slug>/board/B1.png ...
//   node builder/render.mjs <project.json> video      -> out/<slug>/<slug>.mp4 (khong tieng)
// Chay tu thu muc what-if-studio.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const { bundle } = require('@remotion/bundler');
const { renderStill, renderMedia, selectComposition, openBrowser } = require('@remotion/renderer');

const [file, mode = 'board', ...only] = process.argv.slice(2);
if (!file) {
  console.log('Cach dung: node builder/render.mjs projects/<slug>/project.json board|video');
  process.exit(1);
}
const project = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const slug = (project.slug || 'tap').replace(/[^a-zA-Z0-9-_]/g, '-');
const outDir = path.resolve('out', slug);
fs.mkdirSync(outDir, { recursive: true });
const inputProps = { project };

// src/index.ts bi ghi de / hong (mat registerRoot): tu viet lai file chuan
const entry = path.resolve('src/index.ts');
let entrySrc = '';
try { entrySrc = fs.readFileSync(entry, 'utf8'); } catch (e) {}
if (!entrySrc.includes('registerRoot(')) {
  try { if (entrySrc) fs.copyFileSync(entry, entry + '.hong.bak'); } catch (e) {}
  fs.writeFileSync(entry, "import { registerRoot } from 'remotion';\nimport { Root } from './Root';\n\nregisterRoot(Root);\n", 'utf8');
  console.log('Da sua src/index.ts (thieu registerRoot).');
}
// goi bo sung boi canh / do vat: gop library/bo_sung/*.json thanh src/builder/kit/addonData.js
{
  const dir = path.resolve('library/bo_sung');
  const all = { sets: {}, props: {}, casts: {} };
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter(x => x.toLowerCase().endsWith('.json')).sort()) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, ''));
        for (const s of j.sets || []) if (s && s.id && s.svg) all.sets[s.id] = { name: s.name, hint: s.hint, actors: s.actors, svg: s.svg };
        for (const p of j.props || []) if (p && p.id && p.svg) all.props[p.id] = { name: p.name, w: p.w, h: p.h, svg: p.svg };
        for (const c of j.casts || []) if (c && c.id && c.look) all.casts[c.id] = { name: c.name, base: c.base, size: c.size, look: c.look };
      } catch (e) { console.log('Bo qua file bo sung hong: ' + f + ' (' + e.message + ')'); }
    }
  }
  const out = '// TU SINH boi builder/render.mjs tu library/bo_sung/*.json. Khong sua tay.\nexport const ADDONS = ' + JSON.stringify(all) + ';\n';
  const target = path.resolve('src/builder/kit/addonData.js');
  let old = '';
  try { old = fs.readFileSync(target, 'utf8'); } catch (e) {}
  if (old !== out) fs.writeFileSync(target, out, 'utf8');
  const n1 = Object.keys(all.sets).length, n2 = Object.keys(all.props).length, n3 = Object.keys(all.casts).length;
  if (n1 || n2 || n3) console.log('Goi bo sung: ' + n1 + ' boi canh, ' + n2 + ' do vat, ' + n3 + ' nhan vat.');
}
console.log('Dang dong goi du an Remotion...');
const serveUrl = await bundle({ entryPoint: entry, publicDir: path.resolve('public') });
// Mot trinh duyet dung chung cho ca lan dung (tranh loi "Target closed" khi Remotion dong/mo tab lien tuc).
const browser = await openBrowser('chrome');
const puppeteerInstance = browser;

if (mode === 'board') {
  const dir = path.join(outDir, 'board');
  fs.mkdirSync(dir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: 'BuilderBoard', inputProps, puppeteerInstance });
  const n = project.shots.length;
  const want = only.length ? only.map(Number) : Array.from({ length: n }, (_, i) => i + 1);
  for (const k of want) {
    await renderStill({ serveUrl, composition, frame: k - 1, output: path.join(dir, `B${k}.png`), overwrite: true, scale: 0.5, inputProps, puppeteerInstance });
    console.log(`PROGRESS ${k}/${n}`);
  }
  console.log('DONE board');
} else {
  const composition = await selectComposition({ serveUrl, id: 'Builder', inputProps, puppeteerInstance });
  const output = path.join(outDir, `${slug}.mp4`);
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: output,
    inputProps,
    puppeteerInstance,
    onProgress: ({ progress }) => process.stdout.write(`PROGRESS ${Math.round(progress * 100)}/100\n`),
  });
  console.log('DONE video ' + output);
}
try {
  await browser.close({ silent: true });
} catch (e) {
  // trinh duyet da dong: bo qua
}
