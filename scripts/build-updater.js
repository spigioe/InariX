'use strict';
// A frissítéskezelő (src/updater/InariXUpdater.cs) fordítása a Windows beépített .NET fordítójával → updater/InariX-Updater.exe
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const fw = path.join(process.env.WINDIR || 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const csc = path.join(fw, 'csc.exe');
if (!fs.existsSync(csc)) { console.error('Nem található a .NET fordító (csc.exe)'); process.exit(1); }
fs.mkdirSync(path.join(root, 'updater'), { recursive: true });
const args = ['/nologo', '/target:winexe', '/optimize+', `/out:${path.join(root, 'updater', 'InariX-Updater.exe')}`,
  `/win32icon:${path.join(root, 'assets', 'icon.ico')}`,
  '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
  path.join(root, 'src', 'updater', 'InariXUpdater.cs')];
const r = spawnSync(csc, args, { encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (r.status !== 0) process.exit(r.status || 1);
console.log('Frissítéskezelő kész: updater/InariX-Updater.exe');
