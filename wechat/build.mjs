// Builds the WeChat mini-game project into wechat/minigame/ (open that folder in WeChat DevTools).
//   node build.mjs            (from wechat/)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'minigame');
const SITE = path.join(HERE, '..', 'site');
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

// site/ imports local modules as './x.js?v=N' (cache busting) and three as a bare import-map name
const stripQuery = {
  name: 'strip-query',
  setup(b) {
    b.onResolve({ filter: /\?/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?.*$/, '')) }));
  },
};

await esbuild.build({
  entryPoints: [path.join(HERE, 'src', 'entry.js')],
  outfile: path.join(OUT, 'game.js'),
  bundle: true, format: 'iife', minify: true, target: ['es2019'], charset: 'utf8', legalComments: 'none',
  nodePaths: [path.join(HERE, 'node_modules')],
  plugins: [stripQuery],
  logLevel: 'warning',
});

fs.copyFileSync(path.join(SITE, 'assets', 'kit.glb'), path.join(OUT, 'assets', 'kit.glb'));
fs.writeFileSync(path.join(OUT, 'assets', 'game.js'), '// subpackage entry: only carries kit.glb\n');
fs.writeFileSync(path.join(OUT, 'game.json'), JSON.stringify({
  deviceOrientation: 'landscape',
  showStatusBar: false,
  networkTimeout: { request: 10000, downloadFile: 10000 },
  subpackages: [{ name: 'assets', root: 'assets/' }],
}, null, 2));
const pc = path.join(OUT, 'project.config.json');
if (!fs.existsSync(pc)) fs.writeFileSync(pc, JSON.stringify({
  description: '钢翼先锋 Iron Vanguard WeChat mini-game prototype',
  compileType: 'game',
  appid: 'touristappid',
  projectname: '钢翼先锋 Iron Vanguard',
  setting: { es6: true, minified: false, postcss: false, enhance: false },
  libVersion: 'latest',
  packOptions: { ignore: [] },
}, null, 2));

const size = (p) => fs.statSync(p).size / 1048576;
const main = size(path.join(OUT, 'game.js'));
const sub = size(path.join(OUT, 'assets', 'kit.glb'));
console.log(`main package game.js ${main.toFixed(2)} MB (limit 4 MB)`);
console.log(`subpackage assets/   ${sub.toFixed(2)} MB`);
