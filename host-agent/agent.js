#!/usr/bin/env node
'use strict';
// Önálló InariX host agent (Electron nélkül, csak Node.js kell).
// Használat a gaming PC-n:  node host-agent/agent.js   (vagy: npm run agent)
// A beállítások: %APPDATA%\InariX-Agent\config.json
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createAgent, newToken } = require('../src/core/agent-server');

const dir = path.join(process.env.APPDATA || os.homedir(), 'InariX-Agent');
const file = path.join(dir, 'config.json');
fs.mkdirSync(dir, { recursive: true });

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { /* első indítás */ }
cfg = { name: os.hostname(), port: 47800, token: newToken(), steamApiKey: '', customGames: [], ...cfg };
if (process.argv.includes('--new-pin')) cfg.token = newToken();
const portArg = process.argv.find((a) => a.startsWith('--port='));
if (portArg) cfg.port = Number(portArg.split('=')[1]) || cfg.port;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2));

const agent = createAgent(() => cfg);
agent.start().then((port) => {
  console.log('');
  console.log('  InariX host agent fut');
  console.log(`  Gép neve : ${cfg.name}`);
  console.log(`  Port     : ${port}`);
  console.log(`  PIN      : ${cfg.token}`);
  console.log(`  Konfig   : ${file}`);
  console.log('');
  console.log('  A laptopon: InariX → Gépek → Keresés a hálózaton, majd add meg a PIN-t.');
  agent.games(true).then((g) => console.log(`  ${g.length} telepített játék található.`));
}).catch((e) => {
  console.error(`Nem sikerült elindítani: ${e.message}`);
  process.exit(1);
});

process.on('SIGINT', () => agent.stop().then(() => process.exit(0)));
