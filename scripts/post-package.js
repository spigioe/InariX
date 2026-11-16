'use strict';
// Csomagolás utáni lépés: telepítő szkriptek bemásolása (CRLF), útmutató, zip.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'InariX-win32-x64');
if (!fs.existsSync(path.join(out, 'InariX.exe'))) { console.error('Nincs csomagolt app: dist/InariX-win32-x64'); process.exit(1); }

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const copy = (from, to) => fs.writeFileSync(to, crlf(fs.readFileSync(from, 'utf8')));

fs.mkdirSync(path.join(out, 'installer'), { recursive: true });
copy(path.join(root, 'installer', 'install.ps1'), path.join(out, 'installer', 'install.ps1'));
copy(path.join(root, 'installer', 'uninstall.ps1'), path.join(out, 'installer', 'uninstall.ps1'));
copy(path.join(root, 'installer', 'Telepites.cmd'), path.join(out, 'Telepites.cmd'));
copy(path.join(root, 'installer', 'Eltavolitas.cmd'), path.join(out, 'Eltavolitas.cmd'));
copy(path.join(root, 'installer', 'update.ps1'), path.join(out, 'installer', 'update.ps1'));
copy(path.join(root, 'installer', 'Frissites.cmd'), path.join(out, 'Frissites.cmd'));

const pkg = require(path.join(root, 'package.json'));

// Build azonosító: rendezhető időbélyeg + git commit. A frissítő ez alapján dönt.
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const buildId = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
let commit = 'ismeretlen';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim()) commit += '+';
} catch { /* nincs git */ }
const build = { name: 'InariX', version: pkg.version, build: buildId, commit, builtAt: d.toISOString() };
fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify(build, null, 2));
fs.writeFileSync(path.join(out, 'OLVASS_EL.txt'), crlf(`InariX ${pkg.version}

TELEPITES
  1. Csomagold ki a zipet barhova.
  2. Inditsd el a Telepites.cmd fajlt (rendszergazdai jog nem kell).
     Az app a %LOCALAPPDATA%\\Programs\\InariX mappaba kerul, parancsikon az asztalra es a Start menube.
  3. Az elso inditaskor a varazslo vegigvezet a beallitason (laptop vagy gaming PC).

FRISSITES (halozaton, a fejleszto / gaming PC-rol)
  A forras gepen: npm run update-server
  A laptopon: telepitesi mappa -> Frissites.cmd  (vagy: Frissites.cmd 192.168.1.20)

ELTAVOLITAS
  Telepitesi mappa (%LOCALAPPDATA%\\Programs\\InariX) -> Eltavolitas.cmd
  Visszaallitja a fedel beallitast es kiveszi az automatikus inditasbol.

Reszletes leiras: README.md a forraskodban.
`));

const zip = path.join(root, 'dist', 'InariX-win32-x64.zip');
if (fs.existsSync(zip)) fs.unlinkSync(zip);
console.log('Zip készítése…');
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });
// Frissítési manifest a zip mellé (a hash a letöltés ellenőrzéséhez)
const sha256 = require('crypto').createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
const manifest = { ...build, file: path.basename(zip), size: fs.statSync(zip).size, sha256 };
fs.writeFileSync(path.join(root, 'dist', 'update-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Kész: ${zip} (${(manifest.size / 1048576).toFixed(0)} MB) · build ${buildId} · ${commit}`);
