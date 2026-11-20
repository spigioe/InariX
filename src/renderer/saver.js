'use strict';
// Képernyőkímélők: 20 vászon-alapú animáció a téma kiemelő színeivel (--a1, --a2), ~30 fps-sel (kímélő).
// Saver.start(id | 'random', canvas) · Saver.stop() · Saver.LIST
const Saver = (() => {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const css = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || d;
  const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); const v = m ? parseInt(m[1], 16) : 0x22d3ee; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // egyszerű, gyors 2D zaj (az áramlás / lávalámpa / plazma alapja)
  const noise = (x, y, t) => Math.sin(x * 1.7 + t) * Math.cos(y * 1.3 - t * 0.7) + Math.sin((x + y) * 0.9 + t * 0.4) * 0.5;

  const LIST = [
    { id: 'clock', name: 'Lebegő óra', init(s) { s.x = 0.3; s.y = 0.4; s.vx = 0.00006; s.vy = 0.00004; }, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      s.x += s.vx * dt; s.y += s.vy * dt; if (s.x < 0.12 || s.x > 0.88) s.vx *= -1; if (s.y < 0.15 || s.y > 0.85) s.vy *= -1;
      const d = new Date(), fs = Math.min(w, h) * 0.16;
      const g = c.createLinearGradient(s.x * w - fs, 0, s.x * w + fs, 0); g.addColorStop(0, rgba(s.A)); g.addColorStop(1, rgba(s.B));
      c.fillStyle = g; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `200 ${fs}px "Segoe UI", sans-serif`;
      c.fillText(d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }), s.x * w, s.y * h);
      c.fillStyle = '#4b5563'; c.font = `600 ${fs * 0.13}px "Segoe UI", sans-serif`;
      c.fillText(d.toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase().split('').join(' '), s.x * w, s.y * h + fs * 0.62);
    } },
    { id: 'stars', name: 'Csillagmező', init(s) { s.p = Array.from({ length: 420 }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(0.05, 1) })); }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, w, h);
      for (const p of s.p) {
        p.z -= dt * 0.00018; if (p.z < 0.02) { p.x = rnd(-1, 1); p.y = rnd(-1, 1); p.z = 1; }
        const x = w / 2 + (p.x / p.z) * w * 0.35, y = h / 2 + (p.y / p.z) * h * 0.35, r = 0.6 + (1 - p.z) * 3.2;
        c.fillStyle = rgba(mix(s.B, [255, 255, 255], 1 - p.z), Math.min(1, 1.25 - p.z * 0.6)); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      }
    } },
    { id: 'matrix', name: 'Mátrix eső', init(s, w) { s.fs = 18; s.cols = Array.from({ length: Math.ceil(w / s.fs) }, () => rnd(-10, 50)); s.chars = 'アイウエオカキクケコサシスセソ0123456789INARIX'; }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, w, h); c.font = `${s.fs}px Consolas, monospace`;
      s.cols.forEach((y, i) => {
        c.fillStyle = Math.random() < 0.08 ? '#fff' : rgba(s.B); c.fillText(s.chars[(Math.random() * s.chars.length) | 0], i * s.fs, y * s.fs);
        s.cols[i] = y * s.fs > h && Math.random() > 0.95 ? 0 : y + dt * 0.02;
      });
    } },
    { id: 'aurora', name: 'Sarki fény', init() {}, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,6,.25)'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        for (let x = 0; x <= w; x += 12) { const y = h * (0.35 + 0.08 * k) + Math.sin(x * 0.004 + t * 0.0004 * (k + 1)) * h * 0.08 + Math.sin(x * 0.011 - t * 0.0007) * h * 0.03; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.lineTo(w, h); c.lineTo(0, h); c.closePath();
        const g = c.createLinearGradient(0, h * 0.2, 0, h); g.addColorStop(0, rgba(k % 2 ? s.A : s.B, 0.18)); g.addColorStop(0.5, rgba(k % 2 ? s.B : s.A, 0.05)); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    } },
    { id: 'bubbles', name: 'Buborékok', init(s, w, h) { s.p = Array.from({ length: 50 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(8, 60), v: rnd(0.02, 0.08), o: rnd(0, TAU) })); }, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#02030a'; c.fillRect(0, 0, w, h);
      for (const p of s.p) {
        p.y -= p.v * dt; if (p.y < -p.r) { p.y = h + p.r; p.x = rnd(0, w); }
        const x = p.x + Math.sin(t * 0.001 + p.o) * 20;
        const g = c.createRadialGradient(x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, x, p.y, p.r); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, rgba(p.r > 35 ? s.A : s.B, 0.12));
        c.fillStyle = g; c.beginPath(); c.arc(x, p.y, p.r, 0, TAU); c.fill(); c.strokeStyle = rgba(s.B, 0.35); c.stroke();
      }
    } },
    { id: 'fireflies', name: 'Szentjánosbogarak', init(s, w, h) { s.p = Array.from({ length: 90 }, () => ({ x: rnd(0, w), y: rnd(0, h), a: rnd(0, TAU), ph: rnd(0, TAU) })); }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, 0, w, h);
      for (const p of s.p) {
        p.a += rnd(-0.08, 0.08); p.x = (p.x + Math.cos(p.a) * dt * 0.03 + w) % w; p.y = (p.y + Math.sin(p.a) * dt * 0.03 + h) % h;
        const b = (Math.sin(t * 0.002 + p.ph) + 1) / 2;
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14); g.addColorStop(0, rgba(mix(s.B, [255, 255, 180], 0.5), b)); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 14, 0, TAU); c.fill();
      }
    } },
    { id: 'bounce', name: 'Pattogó logó', init(s, w, h) { s.x = w / 3; s.y = h / 3; s.vx = 0.18; s.vy = 0.14; s.size = Math.min(w, h) * 0.18; s.col = 0; s.img = new Image(); s.img.src = '../../assets/inarix-mark.svg'; }, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < 0 || s.x + s.size > w) { s.vx *= -1; s.col = 1 - s.col; s.x = Math.max(0, Math.min(w - s.size, s.x)); }
      if (s.y < 0 || s.y + s.size > h) { s.vy *= -1; s.col = 1 - s.col; s.y = Math.max(0, Math.min(h - s.size, s.y)); }
      c.save(); c.shadowColor = rgba(s.col ? s.A : s.B); c.shadowBlur = 40;
      if (s.img.complete && s.img.naturalWidth) c.drawImage(s.img, s.x, s.y, s.size, s.size);
      else { c.fillStyle = rgba(s.col ? s.A : s.B); c.fillRect(s.x, s.y, s.size, s.size); }
      c.restore();
    } },
    { id: 'plasma', name: 'Plazma', init(s) { s.g = document.createElement('canvas'); s.g.width = 96; s.g.height = 54; s.gc = s.g.getContext('2d'); s.img = s.gc.createImageData(96, 54); }, frame(c, w, h, t, dt, s) {
      const d = s.img.data, T = t * 0.0006;
      for (let y = 0; y < 54; y++) for (let x = 0; x < 96; x++) {
        const v = (Math.sin(x * 0.12 + T) + Math.sin(y * 0.15 - T * 1.3) + Math.sin((x + y) * 0.08 + T * 0.7) + Math.sin(Math.hypot(x - 48, y - 27) * 0.18 - T * 2)) / 4;
        const col = mix(s.A, s.B, (v + 1) / 2), i = (y * 96 + x) * 4, k = 0.35 + 0.35 * (v + 1);
        d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
      }
      s.gc.putImageData(s.img, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(s.g, 0, 0, w, h);
    } },
    { id: 'waves', name: 'Hullámok', init() {}, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.lineWidth = 2;
      for (let k = 0; k < 14; k++) {
        c.strokeStyle = rgba(mix(s.A, s.B, k / 13), 0.25 + 0.5 * (k / 13)); c.beginPath();
        for (let x = 0; x <= w; x += 8) { const y = h / 2 + Math.sin(x * 0.006 + t * 0.0008 + k * 0.35) * h * 0.18 * Math.sin(t * 0.0002 + k * 0.2) + (k - 7) * 10; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke();
      }
    } },
    { id: 'network', name: 'Hálózat', init(s, w, h) { s.p = Array.from({ length: 80 }, () => ({ x: rnd(0, w), y: rnd(0, h), vx: rnd(-0.05, 0.05), vy: rnd(-0.05, 0.05) })); }, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#03040a'; c.fillRect(0, 0, w, h);
      for (const p of s.p) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      const R = Math.min(w, h) * 0.18;
      for (let i = 0; i < s.p.length; i++) for (let j = i + 1; j < s.p.length; j++) {
        const a = s.p[i], b = s.p[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < R) { c.strokeStyle = rgba(s.B, (1 - d / R) * 0.5); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
      }
      c.fillStyle = rgba(s.A); for (const p of s.p) { c.beginPath(); c.arc(p.x, p.y, 2.5, 0, TAU); c.fill(); }
    } },
    { id: 'rain', name: 'Eső', init(s, w, h) { s.p = Array.from({ length: 260 }, () => ({ x: rnd(0, w), y: rnd(0, h), l: rnd(10, 30), v: rnd(0.6, 1.2) })); }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,2,8,.35)'; c.fillRect(0, 0, w, h); c.strokeStyle = rgba(mix(s.B, [200, 220, 255], 0.5), 0.45); c.lineWidth = 1.2;
      c.beginPath(); for (const p of s.p) { p.y += p.v * dt; p.x -= p.v * dt * 0.15; if (p.y > h) { p.y = -p.l; p.x = rnd(0, w * 1.15); } c.moveTo(p.x, p.y); c.lineTo(p.x - p.l * 0.15, p.y + p.l); } c.stroke();
    } },
    { id: 'snow', name: 'Hóesés', init(s, w, h) { s.p = Array.from({ length: 220 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(1, 4), v: rnd(0.02, 0.07), o: rnd(0, TAU) })); }, frame(c, w, h, t, dt, s) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#02030a'); g.addColorStop(1, rgba(mix([0, 0, 0], s.A, 0.25))); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (const p of s.p) { p.y += p.v * dt * p.r * 0.6; p.x += Math.sin(t * 0.0008 + p.o) * 0.4; if (p.y > h) { p.y = -5; p.x = rnd(0, w); } c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
    } },
    { id: 'fireworks', name: 'Tűzijáték', init(s) { s.p = []; s.next = 0; }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, w, h);
      if (t > s.next) { s.next = t + rnd(500, 1200); const x = rnd(w * 0.15, w * 0.85), y = rnd(h * 0.15, h * 0.55), col = Math.random() < 0.5 ? s.A : s.B; for (let i = 0; i < 90; i++) { const a = rnd(0, TAU), v = rnd(0.05, 0.25); s.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col }); } }
      c.globalCompositeOperation = 'lighter';
      s.p = s.p.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.00012 * dt; p.life -= dt * 0.0008; c.fillStyle = rgba(p.col, Math.max(0, p.life)); c.fillRect(p.x, p.y, 2.5, 2.5); return p.life > 0; });
      c.globalCompositeOperation = 'source-over';
    } },
    { id: 'lava', name: 'Lávalámpa', init(s) { s.g = document.createElement('canvas'); s.g.width = 80; s.g.height = 45; s.gc = s.g.getContext('2d'); s.img = s.gc.createImageData(80, 45); s.b = Array.from({ length: 7 }, () => ({ x: rnd(10, 70), y: rnd(5, 40), r: rnd(6, 11), vx: rnd(-0.01, 0.01), vy: rnd(-0.012, 0.012) })); }, frame(c, w, h, t, dt, s) {
      for (const b of s.b) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < 5 || b.x > 75) b.vx *= -1; if (b.y < 3 || b.y > 42) b.vy *= -1; }
      const d = s.img.data;
      for (let y = 0; y < 45; y++) for (let x = 0; x < 80; x++) {
        let v = 0; for (const b of s.b) v += (b.r * b.r) / ((x - b.x) ** 2 + (y - b.y) ** 2 + 1);
        const k = Math.min(1, v / 2.2), col = mix([8, 6, 14], mix(s.A, s.B, y / 45), k > 0.55 ? 1 : k * 0.6), i = (y * 80 + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
      s.gc.putImageData(s.img, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(s.g, 0, 0, w, h);
    } },
    { id: 'tunnel', name: 'Alagút', init() {}, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.lineWidth = 3;
      const cx = w / 2 + Math.sin(t * 0.0005) * w * 0.08, cy = h / 2 + Math.cos(t * 0.0004) * h * 0.08;
      for (let k = 0; k < 26; k++) {
        const z = ((k + (t * 0.0012) % 1) / 26), r = Math.pow(z, 2.2) * Math.hypot(w, h) * 0.7;
        c.strokeStyle = rgba(mix(s.A, s.B, (k % 6) / 5), z); c.beginPath(); c.arc(cx + (w / 2 - cx) * z, cy + (h / 2 - cy) * z, r, 0, TAU); c.stroke();
      }
    } },
    { id: 'lissajous', name: 'Lissajous', init(s) { s.a = 3; s.b = 4; }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(0, 0, w, h); c.lineWidth = 2;
      const ph = t * 0.0003, R = Math.min(w, h) * 0.4;
      c.strokeStyle = rgba(mix(s.A, s.B, (Math.sin(t * 0.0005) + 1) / 2), 0.8); c.beginPath();
      for (let i = 0; i <= 400; i++) { const u = (i / 400) * TAU, x = w / 2 + Math.sin(s.a * u + ph) * R, y = h / 2 + Math.sin(s.b * u) * R; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    } },
    { id: 'covers', name: 'Játékborítók', init(s) {
      const games = ((window.S && S.lib && S.lib.games) || []).filter((g) => g.store === 'steam' || g.artFromSteam).slice(0, 30);
      s.imgs = games.map((g) => { const im = new Image(); im.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.store === 'steam' ? g.storeId : g.artFromSteam}/library_hero.jpg`; return im; });
      s.i = 0; s.t0 = 0;
    }, frame(c, w, h, t, dt, s) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const ok = s.imgs.filter((im) => im.complete && im.naturalWidth);
      if (!ok.length) return;
      const D = 9000, k = ((t - s.t0) % D) / D, cur = ok[Math.floor((t - s.t0) / D) % ok.length], prev = ok[(Math.floor((t - s.t0) / D) + ok.length - 1) % ok.length];
      const draw = (im, a, z) => { const sc = Math.max(w / im.naturalWidth, h / im.naturalHeight) * z; c.globalAlpha = a; c.drawImage(im, (w - im.naturalWidth * sc) / 2, (h - im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc); };
      if (k < 0.15 && ok.length > 1) draw(prev, 1, 1.12);
      draw(cur, k < 0.15 ? k / 0.15 : 1, 1 + k * 0.12); c.globalAlpha = 1;
      const g = c.createLinearGradient(0, h * 0.6, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    } },
    { id: 'flow', name: 'Áramlás', init(s, w, h) { s.p = Array.from({ length: 700 }, () => ({ x: rnd(0, w), y: rnd(0, h) })); }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,0,0,.035)'; c.fillRect(0, 0, w, h); c.lineWidth = 1.6;
      for (const p of s.p) {
        const a = noise(p.x * 0.004, p.y * 0.004, t * 0.0002) * Math.PI, nx = p.x + Math.cos(a) * dt * 0.06, ny = p.y + Math.sin(a) * dt * 0.06;
        c.strokeStyle = rgba(mix(s.A, s.B, p.y / h), 0.75); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(nx, ny); c.stroke();
        p.x = nx; p.y = ny; if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) { p.x = rnd(0, w); p.y = rnd(0, h); }
      }
    } },
    { id: 'pipes', name: 'Csövek', init(s, w, h) { s.grid = 28; s.p = Array.from({ length: 5 }, (_, k) => ({ x: Math.floor(rnd(0, w / 28)), y: Math.floor(rnd(0, h / 28)), d: 0, col: k % 2 })); s.n = 0; }, frame(c, w, h, t, dt, s) {
      if (s.n === 0) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); }
      if (++s.n > 2400) s.n = 0;
      const G = s.grid, D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      c.lineCap = 'round'; c.lineWidth = G * 0.45;
      for (const p of s.p) {
        if (Math.random() < 0.25) p.d = (p.d + (Math.random() < 0.5 ? 1 : 3)) % 4;
        const nx = p.x + D[p.d][0], ny = p.y + D[p.d][1];
        if (nx < 0 || ny < 0 || nx > w / G || ny > h / G) { p.d = (p.d + 2) % 4; continue; }
        const g = c.createLinearGradient(p.x * G, p.y * G, nx * G, ny * G); g.addColorStop(0, rgba(p.col ? s.A : s.B)); g.addColorStop(1, rgba(mix(p.col ? s.A : s.B, [255, 255, 255], 0.3)));
        c.strokeStyle = g; c.beginPath(); c.moveTo(p.x * G, p.y * G); c.lineTo(nx * G, ny * G); c.stroke(); p.x = nx; p.y = ny;
      }
    } },
    { id: 'ripples', name: 'Vízcseppek', init(s) { s.r = []; s.next = 0; }, frame(c, w, h, t, dt, s) {
      c.fillStyle = 'rgba(0,3,10,.2)'; c.fillRect(0, 0, w, h);
      if (t > s.next) { s.next = t + rnd(250, 700); s.r.push({ x: rnd(0, w), y: rnd(0, h), r: 0, col: Math.random() < 0.5 ? s.A : s.B }); }
      c.lineWidth = 2;
      s.r = s.r.filter((q) => { q.r += dt * 0.08; const a = Math.max(0, 1 - q.r / (Math.min(w, h) * 0.35)); for (let k = 0; k < 3; k++) { c.strokeStyle = rgba(q.col, a * (1 - k * 0.3)); c.beginPath(); c.arc(q.x, q.y, Math.max(0, q.r - k * 14), 0, TAU); c.stroke(); } return a > 0; });
    } },
  ];

  // ================= Jelenetek: háttér + élő adatokat mutató komponensek =================
  // scene = { name, bg: kímélő id | 'black', widgets: [{ type, pos, size, anim, color, text? }] }
  const WIDGETS = {
    clock: { name: 'Óra' }, date: { name: 'Dátum' }, weather: { name: 'Időjárás' }, music: { name: 'Most szól' },
    hosts: { name: 'Gépek állapota' }, library: { name: 'Könyvtár (utoljára játszott)' }, news: { name: 'Játékhírek' },
    battery: { name: 'Akkumulátor' }, text: { name: 'Saját szöveg' }, cover: { name: 'Játékborító (váltakozó)' },
  };
  const POS = { tl: 'Bal felső', tc: 'Fent középen', tr: 'Jobb felső', ml: 'Bal közép', mc: 'Közép', mr: 'Jobb közép', bl: 'Bal alsó', bc: 'Lent középen', br: 'Jobb alsó' };
  const SIZE = { s: 'Kicsi', m: 'Közepes', l: 'Nagy', xl: 'Óriás' };
  const ANIM = { none: 'Nincs', drift: 'Lassú vándorlás', float: 'Lebegés', pulse: 'Lüktetés', fade: 'Elhalványuló', slide: 'Beúszás', glow: 'Ragyogás' };
  const COLOR = { theme: 'Téma színátmenet', white: 'Fehér', accent: 'Kiemelő szín', muted: 'Halvány' };
  // beépített dinamikus jelenetek
  const SCENES = [
    { id: 'dyn-info', name: 'Információs pult', bg: 'aurora', widgets: [{ type: 'clock', pos: 'mc', size: 'xl', anim: 'float', color: 'theme' }, { type: 'date', pos: 'bc', size: 'm', anim: 'none', color: 'muted' }, { type: 'weather', pos: 'tr', size: 'm', anim: 'none', color: 'white' }, { type: 'music', pos: 'bl', size: 'm', anim: 'slide', color: 'white' }] },
    { id: 'dyn-music', name: 'Zenelejátszó', bg: 'waves', widgets: [{ type: 'music', pos: 'mc', size: 'xl', anim: 'float', color: 'white' }, { type: 'clock', pos: 'tr', size: 's', anim: 'none', color: 'muted' }] },
    { id: 'dyn-hosts', name: 'Gépek és hálózat', bg: 'network', widgets: [{ type: 'hosts', pos: 'mc', size: 'l', anim: 'none', color: 'white' }, { type: 'clock', pos: 'tl', size: 'm', anim: 'none', color: 'theme' }, { type: 'battery', pos: 'tr', size: 's', anim: 'none', color: 'muted' }] },
    { id: 'dyn-library', name: 'Játékkönyvtár', bg: 'covers', widgets: [{ type: 'library', pos: 'bl', size: 'l', anim: 'slide', color: 'white' }, { type: 'clock', pos: 'tr', size: 'm', anim: 'none', color: 'white' }] },
    { id: 'dyn-news', name: 'Játékhírek', bg: 'flow', widgets: [{ type: 'news', pos: 'mc', size: 'l', anim: 'fade', color: 'white' }, { type: 'clock', pos: 'tl', size: 'm', anim: 'none', color: 'theme' }, { type: 'date', pos: 'tr', size: 's', anim: 'none', color: 'muted' }] },
  ];

  let wTimer = 0, layer = null, tick = 0;
  const wCache = {};
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function widgetHtml(w) {
    const d = new Date();
    try {
      switch (w.type) {
        case 'clock': return `<b class="sw-big">${d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</b>`;
        case 'date': return `<span class="sw-cap">${esc(d.toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' }))}</span>`;
        case 'text': return `<b class="sw-mid">${esc(w.text || 'InariX')}</b>`;
        case 'battery': return S.battery ? `<span class="sw-mid">${S.battery.charging ? '⚡' : '🔋'} ${Math.round(S.battery.level * 100)}%</span>` : '';
        case 'weather': {
          if (!S.state || !S.state.settings.ui.weatherCity) return '<span class="sw-cap">Időjárás: a Beállításokban adj meg várost</span>';
          if (!wCache.wx || Date.now() - wCache.wxAt > 600000) { wCache.wx = await gamo.weather().catch(() => null); wCache.wxAt = Date.now(); }
          const x = wCache.wx; return x ? `<b class="sw-mid">${esc(x.icon)} ${esc(x.temp)}°</b><span class="sw-cap">${esc(x.city)}</span>` : '';
        }
        case 'music': {
          const np = typeof nowPlayingAny === 'function' ? await nowPlayingAny().catch(() => null) : null;
          if (!np) return '<span class="sw-cap">Most nem szól semmi</span>';
          return `<div class="sw-np">${np.art ? `<img src="${esc(np.art)}" alt="">` : ''}<div><span class="sw-cap">${esc(np.src)}${np.playing ? '' : ' · szünetel'}</span><b class="sw-mid">${esc(np.title)}</b><span class="sw-sub">${esc(np.sub || '')}</span></div></div>`;
        }
        case 'hosts': {
          const hs = (S.lib && S.lib.hosts) || [];
          const info = (S.state && S.state.hostInfo) || {};
          return `<div class="sw-list">${hs.map((x) => `<div><i class="${x.local || x.online ? 'on' : 'off'}"></i><b>${esc(x.local ? 'Ez a gép' : x.name)}</b><span>${x.local ? 'helyi' : x.online ? `online${info[x.id] && info[x.id].ping ? ` · ${info[x.id].ping} ms` : ''}` : 'offline'}</span></div>`).join('')}</div>`;
        }
        case 'library': {
          const all = (S.lib && S.lib.games) || [];
          const g = all.filter((x) => x.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 4);
          const n = all.filter((x) => x.sources && x.sources.length).length;
          return `<span class="sw-cap">${n} telepített játék · utoljára játszott</span><div class="sw-covers">${g.map((x) => `<img src="${esc(x.cover || x.coverFallback || '')}" alt="">`).join('')}</div>`;
        }
        case 'news': {
          if (!wCache.news) { const n = await gamo.homeNews().catch(() => null); wCache.news = (n && n.news) || []; }
          const L = wCache.news; if (!L.length) return '<span class="sw-cap">Nincs friss hír</span>';
          const it = L[Math.floor(tick / 3) % L.length];
          return `<span class="sw-cap">${esc(it.game)}</span><b class="sw-mid">${esc(it.title)}</b>`;
        }
        case 'cover': {
          const L = ((S.lib && S.lib.games) || []).filter((x) => x.cover);
          if (!L.length) return '';
          const g = L[Math.floor(tick / 2) % L.length];
          return `<img class="sw-cover" src="${esc(g.cover)}" alt=""><span class="sw-cap">${esc(g.name)}</span>`;
        }
        default: return '';
      }
    } catch { return ''; }
  }
  async function renderWidgets(sc) {
    if (!layer) return;
    tick++;
    const items = sc.widgets || [];
    while (layer.children.length < items.length) layer.append(document.createElement('div'));
    while (layer.children.length > items.length) layer.lastChild.remove();
    await Promise.all(items.map(async (w, i) => {
      const el = layer.children[i];
      const cls = `sw sw-${w.type} sw-pos-${w.pos || 'mc'} sw-size-${w.size || 'm'} sw-anim-${w.anim || 'none'} sw-col-${w.color || 'white'}`;
      if (el.className !== cls) el.className = cls;
      const html = await widgetHtml(w);
      if (el._html !== html) { el._html = html; el.innerHTML = html; }
    }));
  }

  let raf = 0, cur = null, state = null, last = 0, canvas = null, ctx = null, clockEl = null, scene = null;
  function size() {
    const k = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * k); canvas.height = Math.round(innerHeight * k);
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - last < 32) return; // ~30 fps
    const dt = Math.min(80, last ? ts - last : 33);
    last = ts;
    const k = canvas.width / innerWidth;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    try { cur.frame(ctx, innerWidth, innerHeight, ts, dt, state); } catch { /* egy kímélő hibája ne állítsa meg a többit */ }
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }
  // id: kímélő id | dinamikus jelenet id | 'random' · vagy jelenet objektum (saját) · wl: a komponensek rétege
  function start(id, cv, clock, wl) {
    stop();
    canvas = cv; ctx = canvas.getContext('2d'); clockEl = clock || null; layer = wl || null;
    scene = typeof id === 'object' && id ? id : SCENES.find((x) => x.id === id) || null;
    if (!scene && id === 'random' && Math.random() < SCENES.length / (SCENES.length + LIST.length)) scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const bgId = scene ? scene.bg : id;
    cur = bgId === 'black' ? { id: 'black', init() {}, frame(c, w, h) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); } } : LIST.find((x) => x.id === bgId) || LIST[Math.floor(Math.random() * LIST.length)];
    size();
    state = { A: hexRgb(css('--a1', '#7c3aed')), B: hexRgb(css('--a2', '#22d3ee')) };
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    cur.init(state, innerWidth, innerHeight);
    if (clockEl) clockEl.classList.toggle('hidden', cur.id === 'clock' || !!scene);
    if (layer) { layer.replaceChildren(); if (scene) { renderWidgets(scene); wTimer = setInterval(() => renderWidgets(scene), 5000); } }
    last = 0;
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', size);
    return cur;
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; clearInterval(wTimer); wTimer = 0; window.removeEventListener('resize', size); state = null; if (layer) layer.replaceChildren(); }
  return { LIST, SCENES, WIDGETS, POS, SIZE, ANIM, COLOR, start, stop };
})();
