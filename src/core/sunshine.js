'use strict';
// Sunshine webes API (a host gépen, https://localhost:47990, önaláírt tanúsítvány).
// Ezzel a host agent automatikusan be tudja írni a Moonlight párosító PIN-t.
const https = require('https');

function sunshineRequest({ user, pass, port = 47990 }, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      host: '127.0.0.1', port, path: apiPath, method,
      rejectUnauthorized: false, // a Sunshine önaláírt tanúsítványt használ, csak localhostra kapcsolódunk
      timeout: 6000,
      headers: {
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('Hibás Sunshine felhasználónév vagy jelszó'));
        if (res.statusCode >= 400) return reject(new Error(`Sunshine hiba: HTTP ${res.statusCode}`));
        let j = null;
        try { j = JSON.parse(txt); } catch { j = txt; }
        resolve(j);
      });
    });
    req.on('timeout', () => req.destroy(new Error('A Sunshine nem válaszol')));
    req.on('error', (e) => reject(/ECONNREFUSED/.test(e.message) ? new Error('A Sunshine nem fut ezen a gépen') : e));
    if (data) req.write(data);
    req.end();
  });
}

// PIN beküldése (Sunshine 0.21+: { pin, name })
async function submitPin(creds, pin, name = 'InariX') {
  if (!creds || !creds.user || !creds.pass) throw new Error('NOCREDS: Nincs megadva Sunshine felhasználó/jelszó a host gépen');
  const r = await sunshineRequest(creds, 'POST', '/api/pin', { pin: String(pin), name });
  const ok = r === true || r === 'true' || (r && (r.status === true || r.status === 'true'));
  if (!ok) throw new Error('A Sunshine elutasította a PIN-t (lejárt vagy nem vár párosítást)');
  return { ok: true };
}

async function checkCreds(creds) {
  await sunshineRequest(creds, 'GET', '/api/config');
  return { ok: true };
}

module.exports = { submitPin, checkCreds };
