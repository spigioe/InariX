'use strict';
// Hálózat: host felderítés (UDP broadcast), Wake-on-LAN, HTTP kliens a host agenthez.
const dgram = require('dgram');
const os = require('os');

const AGENT_PORT = 47800;
const DISCOVERY_PORT = 47801;
const DISCOVER_MSG = 'INARIX_DISCOVER_V1';

function localMacs() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && a.mac && a.mac !== '00:00:00:00:00:00') out.push({ iface: name, ip: a.address, mac: a.mac });
    }
  }
  return out;
}

function broadcastAddrs() {
  const set = new Set(['255.255.255.255']);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      set.add(ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...set];
}

// Kliens: hostok keresése a helyi hálózaton
function discover(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', () => { try { sock.close(); } catch {} resolve([...found.values()]); });
    sock.on('message', (msg, rinfo) => {
      try {
        const j = JSON.parse(msg.toString());
        if (j.inarix) found.set(rinfo.address, { ...j, address: rinfo.address });
      } catch { /* ignore */ }
    });
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const buf = Buffer.from(DISCOVER_MSG);
      for (const b of broadcastAddrs()) sock.send(buf, DISCOVERY_PORT, b, () => {});
      setTimeout(() => { try { sock.close(); } catch {} resolve([...found.values()]); }, timeoutMs);
    });
  });
}

// Host: válasz a felderítő üzenetekre
function startDiscoveryResponder(getInfo) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', (e) => console.error('[discovery]', e.message));
  sock.on('message', (msg, rinfo) => {
    if (msg.toString() !== DISCOVER_MSG) return;
    const info = Buffer.from(JSON.stringify({ inarix: 1, ...getInfo() }));
    sock.send(info, rinfo.port, rinfo.address, () => {});
  });
  sock.bind(DISCOVERY_PORT);
  return () => { try { sock.close(); } catch {} };
}

function wakeOnLan(mac) {
  return new Promise((resolve, reject) => {
    const hex = String(mac || '').replace(/[^0-9a-f]/gi, '');
    if (hex.length !== 12) return reject(new Error('Érvénytelen MAC cím'));
    const macBuf = Buffer.from(hex, 'hex');
    const pkt = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i++) macBuf.copy(pkt, 6 + i * 6);
    const sock = dgram.createSocket('udp4');
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const targets = broadcastAddrs();
      let n = 0;
      for (const b of targets) for (const port of [9, 7]) {
        sock.send(pkt, port, b, () => { if (++n === targets.length * 2) { sock.close(); resolve({ ok: true }); } });
      }
    });
  });
}

// HTTP kliens a távoli agenthez
async function agentRequest(host, method, urlPath, body, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`http://${host.address}:${host.port || AGENT_PORT}${urlPath}`, {
      method, signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'X-InariX-Token': host.token || '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A gép nem válaszol (időtúllépés)');
    if (e.cause && /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(e.cause.code || '')) throw new Error('A gép nem érhető el');
    throw e;
  } finally { clearTimeout(t); }
}

module.exports = { AGENT_PORT, DISCOVERY_PORT, discover, startDiscoveryResponder, wakeOnLan, agentRequest, localMacs };
