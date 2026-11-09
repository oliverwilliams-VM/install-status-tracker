import fs from 'node:fs/promises';
import {build} from 'esbuild';

const result = await build({
  entryPoints: ['src/readiness/apps-script-portal.jsx'],
  bundle: true,
  minify: true,
  write: false,
  outdir: 'dist',
  jsx: 'automatic',
  define: {'process.env.NODE_ENV': '"production"'},
});
const find = suffix => result.outputFiles.find(file => file.path.endsWith(suffix)).text;
let script = find('.js');
for (const name of ['Subway.png', 'Vita Mojo_Primary_Dark.png']) {
  const data = await fs.readFile('public/' + name);
  script = script.replaceAll('/' + name, 'data:image/png;base64,' + data.toString('base64'));
}
const css = find('.css');
const html = '<!doctype html><html lang="en"><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Subway installation readiness</title><style>' + css + '</style></head><body><div id="root">Loading…</div><script>' + script.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
await fs.mkdir('dist', {recursive:true});
await fs.writeFile('dist/ReadinessPortal.html', html);
