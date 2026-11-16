'use strict';
// Ikon az InariX logóból (assets/inarix-mark.svg): Electronnal rajzoljuk ki, majd PNG + ICO (16/32/48/256) készül.
const { spawnSync } = require('child_process');
const path = require('path');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(require('electron'), [path.join(__dirname, 'render-icons-main.js')], { stdio: 'inherit', env });
process.exit(r.status || 0);
