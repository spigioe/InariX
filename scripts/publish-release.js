'use strict';
// Kiadás feltöltése a GitHub repóba (spigioe/InariX) a gh paranccsal: a dist csomag + update-manifest.json.
// A kliensek ebből frissítenek. Előfeltétel: `gh auth login` (írási joggal a repóhoz), előtte `npm run package`.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const REPO = 'spigioe/InariX';
const root = path.join(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'update-manifest.json'), 'utf8'));
const zip = path.join(root, 'dist', m.file);
if (!fs.existsSync(zip)) { console.error(`Nincs csomag: ${zip} – előbb: npm run package`); process.exit(1); }
const tag = `v${m.version}`;
const gh = (args) => spawnSync('gh', args, { stdio: 'inherit' });
const exists = spawnSync('gh', ['release', 'view', tag, '--repo', REPO], { stdio: 'ignore' }).status === 0;
const setup = path.join(root, 'dist', `InariX-Setup-${m.version}.exe`);
const files = [zip, path.join(root, 'dist', 'update-manifest.json'), ...(fs.existsSync(setup) ? [setup] : [])];
const notes = `InariX ${m.version} (build ${m.build}, commit ${m.commit})

Telepítés: töltsd le és futtasd az InariX-Setup-${m.version}.exe fájlt.`;
const r = exists
  ? gh(['release', 'upload', tag, ...files, '--clobber', '--repo', REPO])
  : gh(['release', 'create', tag, ...files, '--repo', REPO, '--title', `InariX ${m.version}`, '--notes', notes, ...(/-/.test(m.version) ? ['--prerelease'] : [])]);
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Kiadás kész: ${tag} (${m.build})`);
