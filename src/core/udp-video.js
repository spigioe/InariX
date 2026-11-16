'use strict';
// InariX UDP videóátvitel (LAN): csomagolás, XOR FEC, NACK alapú szelektív újraküldés, ütemezett küldés.
// Miért nem SCTP/TCP: ott egy elveszett csomag MINDEN utána jövőt feltart (head-of-line blocking) → szaggatás.
// Itt csak az érintett kocka vár; egyetlen csomag elvesztése paritásból azonnal javítható.
const dgram = require('dgram');
const crypto = require('crypto');

const MAGIC = 0x47;              // 'G'
const T_DATA = 1, T_PARITY = 2, T_NACK = 3, T_HELLO = 4, T_KEYREQ = 5, T_STATS = 6, T_PING = 7, T_PONG = 8;
const HDR = 28;
const PAYLOAD = 1150;            // biztonságosan MTU (1500) alatt
const GROUP = 8;                 // ennyi adatcsomagra jut egy paritáscsomag (alapérték; a host menet közben állítja)
const RING = 180;                // ennyi kockát tart meg a host újraküldéshez (~3 mp)
const DEADLINE_MS = 50;          // eddig várunk egy hiányos kockára, utána eldobjuk (nagy késésnél nő, lásd deadline())
const DEADLINE_MAX = 160;
const DEFAULT_PORT = 47802;

function header(type, flags, session, frameId, index, count, frameLen, ts, groupSize = GROUP) {
  const b = Buffer.alloc(HDR);
  b.writeUInt8(MAGIC, 0); b.writeUInt8(type, 1); b.writeUInt8(flags, 2); b.writeUInt8(groupSize, 3);
  b.writeUInt32BE(session >>> 0, 4); b.writeUInt32BE(frameId >>> 0, 8);
  b.writeUInt16BE(index, 12); b.writeUInt16BE(count, 14); b.writeUInt32BE(frameLen >>> 0, 16);
  b.writeDoubleBE(ts || 0, 20);
  return b;
}
function parse(buf) {
  if (buf.length < HDR || buf.readUInt8(0) !== MAGIC) return null;
  return {
    type: buf.readUInt8(1), flags: buf.readUInt8(2), group: buf.readUInt8(3), session: buf.readUInt32BE(4),
    frameId: buf.readUInt32BE(8), index: buf.readUInt16BE(12), count: buf.readUInt16BE(14), frameLen: buf.readUInt32BE(16),
    ts: buf.readDoubleBE(20), payload: buf.subarray(HDR),
  };
}
const xorInto = (dst, src) => { for (let i = 0; i < src.length; i++) dst[i] ^= src[i]; };

// ======================= HOST: küldő =======================
class UdpVideoSender {
  constructor({ port = DEFAULT_PORT, log = () => {} } = {}) {
    this.port = port; this.log = log;
    this.session = crypto.randomInt(1, 0xffffffff);
    this.secret = crypto.randomBytes(16);
    this.peer = null; this.frameId = 0;
    this.group = GROUP;
    this.ring = new Map();
    this.queue = []; this.queueBytes = 0; this.flushing = false;
    this.onKeyRequest = () => {}; this.onStats = () => {};
    this.stats = { sent: 0, resent: 0, frames: 0 };
  }

  start() {
    return new Promise((resolve, reject) => {
      this.sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.sock.on('error', (e) => { this.log(`[udp] hiba: ${e.message}`); reject(e); });
      this.sock.on('message', (msg, rinfo) => this.onMessage(msg, rinfo));
      this.sock.bind(this.port, '0.0.0.0', () => {
        try { this.sock.setSendBufferSize(4 * 1024 * 1024); } catch { /* nem támogatott */ }
        resolve(this.port);
      });
    });
  }

  credentials() { return { port: this.port, session: this.session, secret: this.secret.toString('hex') }; }

  onMessage(msg, rinfo) {
    const p = parse(msg);
    if (!p || p.session !== this.session) return;
    if (p.type === T_HELLO) {
      if (!p.payload.equals(this.secret)) return; // csak a jelzéscserében kapott titokkal
      if (!this.peer || this.peer.address !== rinfo.address || this.peer.port !== rinfo.port) {
        this.peer = { address: rinfo.address, port: rinfo.port };
        this.log(`[udp] kliens: ${rinfo.address}:${rinfo.port}`);
        this.onKeyRequest();
      }
      return;
    }
    if (!this.peer || rinfo.address !== this.peer.address || rinfo.port !== this.peer.port) return;
    if (p.type === T_PING) { // késésmérés: azonnal visszaküldjük (a küldési sort megkerülve)
      this.sock.send(Buffer.concat([header(T_PONG, 0, this.session, 0, 0, 0, 0, 0), p.payload.subarray(0, 8)]), this.peer.port, this.peer.address);
      return;
    }
    if (p.type === T_NACK) {
      const pkts = this.ring.get(p.frameId);
      if (!pkts) return;
      for (let i = 0; i + 1 < p.payload.length; i += 2) {
        const idx = p.payload.readUInt16BE(i);
        if (pkts[idx]) { this.enqueue(pkts[idx], true); this.stats.resent++; }
      }
    } else if (p.type === T_KEYREQ) this.onKeyRequest();
    else if (p.type === T_STATS) { try { this.onStats(JSON.parse(p.payload.toString())); } catch { /* hibás */ } }
  }

  // FEC sűrűség: ennyi adatcsomagonként egy paritás (kisebb = több védelem, több sávszél)
  setGroup(n) { this.group = Math.max(2, Math.min(16, Math.round(n) || GROUP)); }

  // Egy kódolt kocka küldése: darabolás + paritás + ütemezett küldés
  sendFrame(data, key, ts) {
    if (!this.peer) return false;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const id = ++this.frameId;
    const count = Math.max(1, Math.ceil(buf.length / PAYLOAD));
    const flags = key ? 1 : 0;
    const pkts = [];
    for (let i = 0; i < count; i++) {
      const part = buf.subarray(i * PAYLOAD, Math.min((i + 1) * PAYLOAD, buf.length));
      pkts.push(Buffer.concat([header(T_DATA, flags, this.session, id, i, count, buf.length, ts, this.group), part]));
    }
    const GROUP = this.group; // eslint-disable-line no-shadow
    // paritás csoportonként (XOR a teljes hosszra kiegészített adatokból)
    const parity = [];
    for (let g = 0; g * GROUP < count; g++) {
      const acc = Buffer.alloc(PAYLOAD);
      for (let i = g * GROUP; i < Math.min(count, (g + 1) * GROUP); i++) xorInto(acc, pkts[i].subarray(HDR));
      parity.push(Buffer.concat([header(T_PARITY, flags, this.session, id, g, count, buf.length, ts, GROUP), acc]));
    }
    // a paritásokat a csoport utolsó adatcsomagja után küldjük
    const all = [];
    for (let g = 0; g < parity.length; g++) {
      for (let i = g * GROUP; i < Math.min(count, (g + 1) * GROUP); i++) all.push(pkts[i]);
      all.push(parity[g]);
    }
    this.ring.set(id, pkts);
    if (this.ring.size > RING) this.ring.delete(this.ring.keys().next().value);
    for (const p of all) this.enqueue(p);
    this.stats.frames++;
    return true;
  }

  enqueue(pkt, urgent = false) {
    if (urgent) this.queue.unshift(pkt); else this.queue.push(pkt);
    this.queueBytes += pkt.length;
    if (!this.flushing) { this.flushing = true; setImmediate(() => this.flush()); }
  }

  // Ütemezés: körönként legfeljebb 24 csomag, így a nagy kulcskocka sem egyetlen löketben megy ki
  flush() {
    if (!this.sock || !this.peer) { this.queue = []; this.queueBytes = 0; this.flushing = false; return; }
    let n = 0;
    while (this.queue.length && n < 24) {
      const p = this.queue.shift();
      this.queueBytes -= p.length;
      this.sock.send(p, this.peer.port, this.peer.address);
      this.stats.sent++; n++;
    }
    if (this.queue.length) setImmediate(() => this.flush()); else this.flushing = false;
  }

  close() { try { this.sock && this.sock.close(); } catch { /* zárva */ } this.sock = null; this.peer = null; this.ring.clear(); this.queue = []; this.queueBytes = 0; }
}

// ======================= KLIENS: fogadó =======================
class UdpVideoReceiver {
  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.frames = new Map();
    this.next = 0;              // következő átadandó kocka azonosítója
    this.needKey = true;
    this.onFrame = () => {};
    this.stats = { pkts: 0, fecFixed: 0, nacks: 0, lost: 0, frames: 0 };
    this.rtt = { last: 0, srtt: 0, base: 0, samples: [] }; // ms, a videócsatornán mérve
  }

  // Ennyit várunk egy hiányos kockára: legalább 50 ms, nagy késésnél annyi, hogy egy újrakérés még visszaérjen
  deadline() { return this.rtt.srtt ? Math.min(DEADLINE_MAX, Math.max(DEADLINE_MS, this.rtt.srtt * 1.4 + 12)) : DEADLINE_MS; }

  ping() { const b = Buffer.alloc(8); b.writeDoubleBE(performance.now(), 0); this.send(T_PING, b); }
  onPong(payload) {
    if (payload.length < 8) return;
    const now = performance.now();
    const r = now - payload.readDoubleBE(0);
    if (!(r >= 0 && r < 5000)) return;
    const R = this.rtt;
    R.last = r;
    R.srtt = R.srtt ? R.srtt * 0.85 + r * 0.15 : r;
    R.samples.push([now, r]);
    while (R.samples.length && now - R.samples[0][0] > 10000) R.samples.shift();
    R.base = Math.min(...R.samples.map((x) => x[1])); // az utolsó 10 mp legkisebb értéke ≈ terhelés nélküli késés
  }

  start(host, creds) {
    this.host = host; this.port = creds.port; this.session = creds.session; this.secret = Buffer.from(creds.secret, 'hex');
    return new Promise((resolve, reject) => {
      this.sock = dgram.createSocket('udp4');
      this.sock.on('error', (e) => { this.log(`[udp] hiba: ${e.message}`); reject(e); });
      this.sock.on('message', (msg) => this.onMessage(msg));
      this.sock.bind(0, () => {
        try { this.sock.setRecvBufferSize(8 * 1024 * 1024); } catch { /* nem támogatott */ }
        this.hello();
        this.helloTimer = setInterval(() => this.hello(), 1000); // életjel (tűzfal / NAT állapot frissen tartása)
        this.tickTimer = setInterval(() => this.tick(), 5);
        this.ping();
        this.pingTimer = setInterval(() => this.ping(), 200);
        resolve();
      });
    });
  }

  send(type, payload = Buffer.alloc(0), frameId = 0) {
    if (!this.sock) return;
    this.sock.send(Buffer.concat([header(type, 0, this.session, frameId, 0, 0, 0, 0), payload]), this.port, this.host);
  }
  hello() { this.send(T_HELLO, this.secret); }
  requestKey() { this.needKey = true; this.lastKeyReq = performance.now(); this.send(T_KEYREQ); }
  sendStats(obj) { this.send(T_STATS, Buffer.from(JSON.stringify(obj))); }

  onMessage(msg) {
    const p = parse(msg);
    if (p && p.session === this.session && p.type === T_PONG) { this.onPong(p.payload); return; }
    if (!p || p.session !== this.session || (p.type !== T_DATA && p.type !== T_PARITY)) return;
    this.stats.pkts++;
    if (p.frameId < this.next) return; // már átadott / eldobott kocka
    let f = this.frames.get(p.frameId);
    if (!f) {
      f = { id: p.frameId, count: p.count, len: p.frameLen, key: (p.flags & 1) === 1, ts: p.ts, data: new Array(p.count), parity: new Map(), got: 0, first: performance.now(), nacked: 0, lastNack: 0, group: p.group || GROUP };
      this.frames.set(p.frameId, f);
      if (!this.next) this.next = p.frameId;
    }
    if (p.type === T_DATA) { if (!f.data[p.index]) { f.data[p.index] = Buffer.from(p.payload); f.got++; } }
    else f.parity.set(p.index, Buffer.from(p.payload));
    this.recover(f);
    this.deliver();
  }

  // FEC: ha egy csoportból pontosan egy adatcsomag hiányzik, a paritásból visszaállítjuk
  recover(f) {
    for (const [g, par] of f.parity) {
      const from = g * f.group, to = Math.min(f.count, (g + 1) * f.group);
      let missing = -1, n = 0;
      for (let i = from; i < to; i++) if (!f.data[i]) { missing = i; n++; }
      if (n !== 1) continue;
      const acc = Buffer.from(par);
      for (let i = from; i < to; i++) if (i !== missing) xorInto(acc, f.data[i]);
      const len = missing === f.count - 1 ? f.len - (f.count - 1) * PAYLOAD : PAYLOAD;
      f.data[missing] = acc.subarray(0, len); f.got++;
      this.stats.fecFixed++;
    }
  }

  // Sorrendben adjuk át a kockákat; hiányosra legfeljebb DEADLINE_MS-ig várunk
  deliver() {
    for (;;) {
      const f = this.frames.get(this.next);
      if (!f) {
        // ha már későbbi kockák is jöttek, de ez egyáltalán nem, és lejárt az idő → kihagyjuk
        const later = [...this.frames.keys()].filter((k) => k > this.next);
        if (later.length && performance.now() - this.frames.get(Math.min(...later)).first > this.deadline()) { this.skip(); continue; }
        return;
      }
      if (f.got >= f.count) {
        this.frames.delete(f.id); this.next = f.id + 1;
        if (this.needKey && !f.key) continue; // kulcskockáig nem dekódolható
        if (f.key) this.needKey = false;
        this.stats.frames++;
        this.onFrame({ key: f.key, ts: f.ts, data: Buffer.concat(f.data, f.len) });
        continue;
      }
      if (performance.now() - f.first > this.deadline()) { this.skip(); continue; }
      return;
    }
  }

  skip() {
    this.frames.delete(this.next);
    this.next++;
    this.stats.lost++;
    if (!this.needKey) this.requestKey(); // megszakadt a referencia lánc → új kulcskocka kell
  }

  // NACK: a hiányzó (paritással nem javítható) csomagokat újrakérjük, kockánként legfeljebb 3-szor
  tick() {
    const now = performance.now();
    const gap = Math.max(12, this.rtt.srtt * 1.1); // újrakérés csak ha az előző válasza már megjöhetett volna
    // ha a kért kulcskocka is elveszett, újrakérjük (különben a kép befagyna)
    if (this.needKey && this.stats.pkts > 0 && now - (this.lastKeyReq || 0) > 300) this.requestKey();
    for (const f of this.frames.values()) {
      if (f.got >= f.count || f.nacked >= 3 || now - f.first < 6 || now - f.lastNack < gap) continue;
      const missing = [];
      for (let i = 0; i < f.count; i++) if (!f.data[i]) missing.push(i);
      if (!missing.length) continue;
      const b = Buffer.alloc(missing.length * 2);
      missing.forEach((m, k) => b.writeUInt16BE(m, k * 2));
      this.send(T_NACK, b.subarray(0, Math.min(b.length, 1200)), f.id);
      f.nacked++; f.lastNack = now; this.stats.nacks++;
    }
    this.deliver();
  }

  close() {
    clearInterval(this.helloTimer); clearInterval(this.tickTimer); clearInterval(this.pingTimer);
    try { this.sock && this.sock.close(); } catch { /* zárva */ }
    this.sock = null; this.frames.clear();
  }
}

module.exports = { UdpVideoSender, UdpVideoReceiver, DEFAULT_PORT, PAYLOAD, GROUP, _test: { parse, header } };
