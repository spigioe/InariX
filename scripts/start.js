'use strict';
// Electron indítása tiszta környezettel (pl. VS Code-ból az ELECTRON_RUN_AS_NODE be lehet állítva).
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const p = spawn(electron, [path.join(__dirname, '..'), ...process.argv.slice(2)], { stdio: 'inherit', env });
p.on('exit', (code) => process.exit(code ?? 0));
