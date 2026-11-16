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
const notes = `InariX ${m.version} (build ${m.build}, commit ${m.commit})`;
const r = exists
  ? gh(['release', 'upload', tag, zip, path.join(root, 'dist', 'update-manifest.json'), '--clobber', '--repo', REPO])
  : gh(['release', 'create', tag, zip, path.join(root, 'dist', 'update-manifest.json'), '--repo', REPO, '--title', `InariX ${m.version}`, '--notes', notes, ...(/-/.test(m.version) ? ['--prerelease'] : [])]);
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Kiadás kész: ${tag} (${m.build})`);
