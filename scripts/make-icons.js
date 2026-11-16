'use strict';
// Ikon generálás függőség nélkül: assets/icon.png (256) és assets/icon.ico (16/32/48/256 PNG bejegyzések).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Lekerekített négyzet lila->cián gradienssel, benne fehér "play" háromszög és gyűrű.
function draw(size) {
  const S = 4; const buf = Buffer.alloc(size * size * 4);
  const r = 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
      const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (dx * dx + dy * dy > r * r) continue;
      const t = (u + v) / 2;
      let col = [124 + (34 - 124) * t, 58 + (211 - 58) * t, 237 + (238 - 237) * t];
      const cx = u - 0.5, cy = v - 0.5, d = Math.sqrt(cx * cx + cy * cy);
      const ring = d > 0.30 && d < 0.355;
      // play háromszög
      const px = u - 0.42, py = v - 0.5;
      const tri = px > -0.06 && px < 0.2 && Math.abs(py) < (0.2 - px) * 0.62;
      if (ring || tri) col = [255, 255, 255];
      acc = [acc[0] + col[0], acc[1] + col[1], acc[2] + col[2], acc[3] + 255];
    }
    const n = S * S, a = acc[3] / n;
    const i = (y * size + x) * 4;
    if (a > 0) { buf[i] = acc[0] / (acc[3] / 255); buf[i + 1] = acc[1] / (acc[3] / 255); buf[i + 2] = acc[2] / (acc[3] / 255); }
    buf[i + 3] = a;
  }
  return png(size, buf);
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
const sizes = [16, 32, 48, 256];
const pngs = sizes.map(draw);
fs.writeFileSync(path.join(out, 'icon.png'), pngs[3]);
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12); offset += pngs[i].length;
  return e;
});
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log('Ikonok kész: assets/icon.png, assets/icon.ico');
