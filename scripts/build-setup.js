'use strict';
// Telepítő és eltávolító fordítása a Windows beépített .NET fordítójával.
//   node scripts/build-setup.js uninstaller  → InariX-Uninstall.exe a programcsomagba (dist/InariX-win32-x64), a zip előtt
//   node scripts/build-setup.js setup        → dist/InariX-Setup-<verzió>.exe (a kész zipet beágyazva)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const csc = path.join(process.env.WINDIR || 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const icon = path.join(root, 'assets', 'icon.ico');
const refs = ['/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Core.dll'];
function compile(src, out, extra = []) {
  const r = spawnSync(csc, ['/nologo', '/target:winexe', '/optimize+', `/out:${out}`, `/win32icon:${icon}`, ...refs, ...extra, src], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status !== 0) process.exit(r.status || 1);
}
const mode = process.argv[2];
if (mode === 'uninstaller') {
  const out = path.join(root, 'dist', 'InariX-win32-x64', 'InariX-Uninstall.exe');
  compile(path.join(root, 'src', 'setup', 'InariXUninstall.cs'), out);
  console.log('Eltávolító kész:', path.relative(root, out));
} else if (mode === 'setup') {
  const zip = path.join(root, 'dist', 'InariX-win32-x64.zip');
  if (!fs.existsSync(zip)) { console.error('Nincs dist/InariX-win32-x64.zip – előbb a csomagolás'); process.exit(1); }
  const out = path.join(root, 'dist', `InariX-Setup-${pkg.version}.exe`);
  compile(path.join(root, 'src', 'setup', 'InariXSetup.cs'), out, [`/resource:${zip},payload.zip`]);
  console.log(`Telepítő kész: ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1048576)} MB)`);
} else { console.error('Használat: node scripts/build-setup.js uninstaller|setup'); process.exit(1); }
