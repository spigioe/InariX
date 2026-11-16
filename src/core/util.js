'use strict';
// Közös segédfüggvények: registry olvasás, VDF parser, parancs futtatás.
const { execFile, spawn } = require('child_process');

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout || 20000, ...opts },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

// `reg query KEY` kimenet feldolgozása -> { values: {name: data}, subkeys: [fullPath] }
async function regKey(key) {
  const r = await run('reg', ['query', key]);
  const out = { values: {}, subkeys: [] };
  if (r.code !== 0) return null;
  const norm = key.toLowerCase();
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^HKEY_/i.test(line)) {
      if (line.trim().toLowerCase() !== norm.replace(/^hklm/, 'hkey_local_machine').replace(/^hkcu/, 'hkey_current_user')) {
        out.subkeys.push(line.trim());
      }
      continue;
    }
    const m = line.match(/^\s{4}(.+?)\s{4}(REG_\w+)(?:\s{4}(.*))?$/);
    if (m) out.values[m[1]] = m[3] !== undefined ? m[3] : '';
  }
  return out;
}

async function regValue(key, name) {
  const k = await regKey(key);
  return k && name in k.values ? k.values[name] : null;
}

// Valve KeyValues (VDF/ACF) parser
function parseVdf(text) {
  const tokens = [];
  const re = /"((?:\\.|[^"\\])*)"|([{}])|\/\/[^\n]*/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) tokens.push({ s: m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"') });
    else if (m[2]) tokens.push({ b: m[2] });
  }
  let i = 0;
  function obj() {
    const o = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.b === '}') return o;
      if (t.s === undefined) continue;
      const key = t.s;
      const nx = tokens[i++];
      if (!nx) break;
      if (nx.b === '{') o[key] = obj();
      else if (nx.s !== undefined) o[key] = nx.s;
    }
    return o;
  }
  return obj();
}

// URI megnyitás (steam://, com.epicgames.launcher:// stb.) a Windows shellen keresztül
function openUri(uri) {
  const p = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', uri], { detached: true, stdio: 'ignore', windowsHide: true });
  p.unref();
}

function startExe(exe, args = [], cwd, env) {
  const p = spawn(exe, args, { cwd: cwd || undefined, detached: true, stdio: 'ignore', env: env ? { ...process.env, ...env } : undefined });
  p.on('error', () => {});
  p.unref();
}

module.exports = { run, regKey, regValue, parseVdf, openUri, startExe };
