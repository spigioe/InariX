'use strict';
// Moonlight kliens kezelése (stream indítás, párosítás, telepítés wingettel).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { run } = require('../core/util');

const CANDIDATES = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Moonlight Game Streaming', 'Moonlight.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Moonlight Game Streaming', 'Moonlight.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Moonlight Game Streaming', 'Moonlight.exe'),
];

function findMoonlight(configured) {
  if (configured && fs.existsSync(configured)) return configured;
  return CANDIDATES.find((c) => c && fs.existsSync(c)) || null;
}

function splitArgs(s) {
  return (String(s || '').match(/"[^"]*"|\S+/g) || []).map((a) => a.replace(/^"|"$/g, ''));
}

function stream(exe, host, app, extraArgs) {
  const args = ['stream', host, app || 'Desktop', ...splitArgs(extraArgs)];
  return spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
}

// Párosítás előre megadott 4 jegyű PIN-nel. A Promise a Moonlight kilépési kódjával tér vissza (0 = siker).
function pairWithPin(exe, host, pin, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const p = spawn(exe, ['pair', host, '--pin', String(pin)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve({ code: -1, out: `${out}\nIdőtúllépés` }); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: e.message }); });
    p.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

function openGui(exe) {
  const p = spawn(exe, [], { stdio: 'ignore', detached: true });
  p.unref();
}

function installWithWinget() {
  return run('winget', ['install', '-e', '--id', 'MoonlightGameStreamingProject.Moonlight',
    '--accept-package-agreements', '--accept-source-agreements', '--silent'], { timeout: 10 * 60 * 1000 });
}

module.exports = { findMoonlight, stream, pairWithPin, openGui, installWithWinget, splitArgs };
