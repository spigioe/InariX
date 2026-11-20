'use strict';
// Képernyőkímélők: vászon-alapú animációk (köztük zenére reagálók) a téma színeivel, ~30 fps-sel,
// és jelenetek: háttér + szabadon elhelyezett, élő adatokat mutató komponensek.
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
    // ---------- zenére reagáló hátterek (s.au: a rendszerhang elemzése, lásd lent) ----------
    { id: 'spectrum', name: 'Spektrum', music: true, init(s) { s.pk = new Float32Array(48); }, frame(c, w, h, t, dt, s) {
      const a = s.au, n = a.bins.length, base = h * 0.8, bw = w / (n * 2 + 4);
      c.fillStyle = 'rgba(0,0,0,.38)'; c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, base, 0, w / 2, base, w * 0.6); g.addColorStop(0, rgba(s.A, 0.05 + a.beat * 0.12)); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const v = a.bins[i], bh = Math.max(3, v * h * 0.62), col = mix(s.A, s.B, i / n);
        s.pk[i] = Math.max(v, s.pk[i] - dt * 0.00035);
        for (const side of [-1, 1]) {
          const x = w / 2 + side * (i + 0.5) * bw - bw / 2;
          const gg = c.createLinearGradient(0, base - bh, 0, base); gg.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.35))); gg.addColorStop(1, rgba(col, 0.85));
          c.fillStyle = gg; c.fillRect(x + 1, base - bh, bw - 2, bh);
          c.fillStyle = rgba(col, 0.16); c.fillRect(x + 1, base + 4, bw - 2, bh * 0.35);
          c.fillStyle = '#fff'; c.fillRect(x + 1, base - Math.max(3, s.pk[i] * h * 0.62) - 6, bw - 2, 3);
        }
      }
    } },
    { id: 'radial', name: 'Kör spektrum', music: true, init(s) { s.rot = 0; }, frame(c, w, h, t, dt, s) {
      const a = s.au, n = a.bins.length, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.17 * (1 + a.bass * 0.22 + a.beat * 0.08);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, 0, w, h);
      s.rot += dt * (0.00005 + a.level * 0.0004);
      const g = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.2); g.addColorStop(0, rgba(s.B, 0.12 + a.beat * 0.25)); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.lineCap = 'round'; c.lineWidth = Math.max(2, (TAU * R) / (n * 2) * 0.55);
      for (let i = 0; i < n * 2; i++) {
        const k = i < n ? i : n * 2 - 1 - i, v = a.bins[k], ang = s.rot + (i / (n * 2)) * TAU, L = R * 0.08 + v * R * 1.5;
        c.strokeStyle = rgba(mix(s.A, s.B, k / n), 0.9);
        c.beginPath(); c.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); c.lineTo(cx + Math.cos(ang) * (R + L), cy + Math.sin(ang) * (R + L)); c.stroke();
      }
      c.strokeStyle = rgba(mix(s.B, [255, 255, 255], 0.5), 0.6 + a.beat * 0.4); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R * 0.94, 0, TAU); c.stroke();
    } },
    { id: 'scope', name: 'Oszcilloszkóp', music: true, init() {}, frame(c, w, h, t, dt, s) {
      const a = s.au, d = a.wave, n = d.length;
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(0, 0, w, h);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        c.strokeStyle = rgba(k === 1 ? s.B : s.A, k === 1 ? 0.9 : 0.35); c.lineWidth = k === 1 ? 2.5 : 7; c.shadowColor = rgba(s.B); c.shadowBlur = k === 1 ? 18 : 0;
        c.beginPath();
        for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * w, y = h / 2 + d[i] * h * (0.32 + a.beat * 0.08) + (k - 1) * 3; i ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke();
      }
      c.restore();
    } },
    { id: 'beatburst', name: 'Ütemrobbanás', music: true, init(s) { s.p = []; s.lb = 0; }, frame(c, w, h, t, dt, s) {
      const a = s.au, cx = w / 2, cy = h / 2;
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, 0, w, h);
      if (a.beatAt !== s.lb) { s.lb = a.beatAt; const col = Math.random() < 0.5 ? s.A : s.B; for (let i = 0; i < 70; i++) { const an = rnd(0, TAU), v = rnd(0.1, 0.45) * (0.6 + a.bass); s.p.push({ x: cx, y: cy, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: 1, col, r: rnd(1.5, 4) }); } }
      for (let i = 0; i < a.level * 6; i++) { const an = rnd(0, TAU), v = rnd(0.03, 0.12); s.p.push({ x: cx, y: cy, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: 0.7, col: s.B, r: 1.5 }); }
      if (s.p.length > 1800) s.p.splice(0, s.p.length - 1800);
      c.globalCompositeOperation = 'lighter';
      s.p = s.p.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; p.life -= dt * 0.0006; c.fillStyle = rgba(p.col, Math.max(0, p.life)); c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); return p.life > 0; });
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * (0.08 + a.bass * 0.12)); g.addColorStop(0, rgba(mix(s.B, [255, 255, 255], 0.6), 0.5 + a.beat * 0.5)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
    } },
    { id: 'bassrings', name: 'Basszus gyűrűk', music: true, init(s) { s.r = []; s.lb = 0; }, frame(c, w, h, t, dt, s) {
      const a = s.au, cx = w / 2, cy = h / 2, M = Math.hypot(w, h) * 0.6;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, w, h);
      if (a.beatAt !== s.lb) { s.lb = a.beatAt; s.r.push({ r: 10, col: s.r.length % 2 ? s.A : s.B, wdt: 3 + a.bass * 10 }); }
      s.r = s.r.filter((q) => { q.r += dt * (0.25 + a.level * 0.6); const al = Math.max(0, 1 - q.r / M); c.strokeStyle = rgba(q.col, al); c.lineWidth = q.wdt * al + 1; c.beginPath(); c.arc(cx, cy, q.r, 0, TAU); c.stroke(); return al > 0; });
      const R = Math.min(w, h) * (0.05 + a.bass * 0.09);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 3); g.addColorStop(0, rgba(mix(s.A, [255, 255, 255], 0.4), 0.9)); g.addColorStop(0.35, rgba(s.A, 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 3, 0, TAU); c.fill();
    } },
    { id: 'nebula', name: 'Lélegző köd', music: true, init(s) { s.b = Array.from({ length: 6 }, (_, i) => ({ ph: rnd(0, TAU), sp: rnd(0.00005, 0.00015), band: i % 3, col: i % 2 })); }, frame(c, w, h, t, dt, s) {
      const a = s.au, bands = [a.bass, a.mid, a.high];
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      for (const b of s.b) {
        b.ph += dt * b.sp * (1 + a.level * 3);
        const x = w / 2 + Math.cos(b.ph) * w * 0.28, y = h / 2 + Math.sin(b.ph * 1.3) * h * 0.25, r = Math.min(w, h) * (0.18 + bands[b.band] * 0.35);
        const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(b.col ? s.A : s.B, 0.22 + bands[b.band] * 0.3)); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.globalCompositeOperation = 'source-over';
    } },
    { id: 'leds', name: 'LED hangszínszabályzó', music: true, init(s) { s.pk = new Float32Array(32); }, frame(c, w, h, t, dt, s) {
      const a = s.au, cols = 32, rows = 18, gx = w * 0.08, gw = w * 0.84, cw = gw / cols, gh = h * 0.7, rh = gh / rows, top = h * 0.15;
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < cols; i++) {
        const v = a.bins[Math.floor((i / cols) * a.bins.length)], lit = Math.round(v * rows);
        s.pk[i] = Math.max(lit, s.pk[i] - dt * 0.012);
        for (let r = 0; r < rows; r++) {
          const on = r < lit, peak = r === Math.round(s.pk[i]) && r > 0, col = r > rows * 0.8 ? [255, 70, 90] : mix(s.A, s.B, r / rows);
          c.fillStyle = on || peak ? rgba(col, peak && !on ? 0.8 : 0.95) : rgba(col, 0.07);
          c.fillRect(gx + i * cw + 2, top + gh - (r + 1) * rh + 2, cw - 4, rh - 4);
        }
      }
    } },
  ];

  // a háttér animációk kategóriái
  const BG_CATS = ['Természet', 'Geometria', 'Retró', 'Zenei animációk'];
  const BG_CAT = { clock: 'Retró', stars: 'Természet', matrix: 'Retró', aurora: 'Természet', bubbles: 'Természet', fireflies: 'Természet', bounce: 'Retró', plasma: 'Retró',
    waves: 'Geometria', network: 'Geometria', rain: 'Természet', snow: 'Természet', fireworks: 'Retró', lava: 'Retró', tunnel: 'Geometria', lissajous: 'Geometria',
    covers: 'Geometria', flow: 'Geometria', pipes: 'Retró', ripples: 'Természet' };
  LIST.forEach((x) => { x.cat = x.music ? 'Zenei animációk' : BG_CAT[x.id] || 'Geometria'; });

  // ================= Rendszerhang elemzés (zenére reagáló elemek) =================
  // A rendszerhang „loopback” rögzítéséből számolt spektrum; ha nem elérhető, a lejátszás állapotából szimulált ütem.
  const NB = 48;
  const AU = { an: null, ctx: null, stream: null, live: false, pending: false, np: false, f: new Uint8Array(512), w: new Uint8Array(1024),
    bins: new Float32Array(NB), wave: new Float32Array(256), bass: 0, mid: 0, high: 0, level: 0, beat: 0, beatAt: 0, avg: 0.1, ph: 0 };
  async function audioOn() {
    if (AU.an || AU.pending || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;
    AU.pending = true;
    try {
      const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      st.getVideoTracks().forEach((x) => x.stop()); // csak a hang kell
      if (!st.getAudioTracks().length || !AU.pending) { st.getTracks().forEach((x) => x.stop()); throw new Error('nincs hang'); }
      AU.ctx = new AudioContext();
      AU.an = AU.ctx.createAnalyser(); AU.an.fftSize = 1024; AU.an.smoothingTimeConstant = 0.72;
      AU.ctx.createMediaStreamSource(st).connect(AU.an);
      AU.stream = st; AU.live = true;
    } catch { AU.live = false; } finally { AU.pending = false; }
  }
  function audioOff() {
    AU.pending = false;
    if (AU.stream) AU.stream.getTracks().forEach((x) => x.stop());
    if (AU.ctx) AU.ctx.close().catch(() => {});
    AU.stream = AU.ctx = AU.an = null; AU.live = false;
  }
  function audioTick(t, dt) {
    const a = AU, decay = Math.pow(0.88, dt / 16);
    let silent = true;
    if (a.an) {
      a.an.getByteFrequencyData(a.f); a.an.getByteTimeDomainData(a.w);
      for (let i = 0; i < NB; i++) {
        const lo = Math.floor(2 ** ((i * 8) / NB)), hi = Math.max(lo + 1, Math.floor(2 ** (((i + 1) * 8) / NB)));
        let m = 0; for (let k = lo; k < hi; k++) m = Math.max(m, a.f[k]);
        const v = Math.pow(m / 255, 1.6) * (1 + i / NB * 0.6);
        a.bins[i] = Math.max(Math.min(1, v), a.bins[i] * decay);
        if (m > 8) silent = false;
      }
      for (let i = 0; i < 256; i++) a.wave[i] = (a.w[i * 4] - 128) / 128;
    }
    if (!a.an || (silent && a.np)) {
      // szimulált: ~120 BPM, ha szól valami; csendben halk alapmozgás
      a.ph += dt * (a.np ? 0.0126 : 0.003);
      const kick = a.np ? Math.pow(Math.max(0, Math.cos(a.ph)), 8) : 0, base = a.np ? 0.18 : 0.04;
      for (let i = 0; i < NB; i++) {
        const v = base + (0.5 - i / NB * 0.35) * (a.np ? 0.5 : 0.1) * (0.5 + 0.5 * Math.sin(t * 0.004 + i * 0.7) * Math.sin(t * 0.0017 - i * 0.3)) + (i < 8 ? kick * 0.6 : 0);
        a.bins[i] = Math.max(Math.min(1, v), a.bins[i] * decay);
      }
      for (let i = 0; i < 256; i++) a.wave[i] = (Math.sin(i * 0.15 + t * 0.01) * 0.4 + Math.sin(i * 0.41 - t * 0.017) * 0.2) * (a.np ? 0.4 + kick * 0.6 : 0.08);
    }
    const avg = (x, y) => { let s = 0; for (let i = x; i < y; i++) s += a.bins[i]; return s / (y - x); };
    a.bass = avg(0, 8); a.mid = avg(8, 28); a.high = avg(28, NB); a.level = avg(0, NB);
    a.avg = a.avg * 0.96 + a.bass * 0.04;
    if (a.bass > a.avg * 1.25 + 0.04 && a.bass > 0.18 && t - a.beatAt > 230) { a.beatAt = t; a.beat = 1; }
    a.beat *= Math.pow(0.9, dt / 16);
  }

  // ================= Jelenetek: háttér + élő adatokat mutató komponensek =================
  // scene = { id, name, cat, bg: kímélő id | 'black', widgets: [{ type, x, y (0–100 %, a horgony), scale, align: l|c|r, anim, color, react, opacity?, text? }] }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = (d) => d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  const games = () => (S.lib && S.lib.games) || [];
  const installed = () => games().filter((x) => x.sources && x.sources.length);
  const coverOf = (g) => g.cover || g.coverFallback || '';
  const withCover = () => games().filter((x) => coverOf(x));
  const cv = (v, wd, ht) => `<canvas class="sw-viz" data-v="${v}" style="width:${wd}em;height:${ht}em"></canvas>`;
  const bar = (pct, label) => `<span class="sw-cap">${label}</span><div class="sw-bar"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;
  const ago = (ms) => { const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? 'ma' : d === 1 ? 'tegnap' : `${d} napja`; };
  const HOURS = ['tizenkettő', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc', 'tíz', 'tizenegy'];
  function timeWords(d) {
    let m = Math.round(d.getMinutes() / 5) * 5, hh = d.getHours();
    if (m === 60) { m = 0; hh++; }
    const H = (k) => HOURS[(hh + k) % 12], n = { 5: 'öt', 10: 'tíz', 20: 'tíz', 25: 'öt' };
    switch (m) {
      case 0: return `${H(0)} óra`;
      case 5: case 10: return `${n[m]} perccel múlt ${H(0)}`;
      case 15: return `negyed ${H(1)}`;
      case 20: case 25: return `${n[m]} perc múlva fél ${H(1)}`;
      case 30: return `fél ${H(1)}`;
      case 35: return `öt perccel múlt fél ${H(1)}`;
      case 40: return `tíz perccel múlt fél ${H(1)}`;
      case 45: return `háromnegyed ${H(1)}`;
      default: return `${m === 50 ? 'tíz' : 'öt'} perc múlva ${H(1)}`;
    }
  }
  function moon(d) {
    const ph = (((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.53059 + 29.53059) % 29.53059;
    const i = Math.round((ph / 29.53059) * 8) % 8;
    return { ic: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][i], name: ['Újhold', 'Növő sarló', 'Első negyed', 'Növő hold', 'Telihold', 'Fogyó hold', 'Utolsó negyed', 'Fogyó sarló'][i] };
  }
  const QUOTES = ['Minden nagy kaland egyetlen lépéssel kezdődik.', 'A legjobb mentés az, amit nem kell visszatölteni.', 'Pihenj egyet – a következő pálya is megvár.',
    'A türelem a legerősebb fegyver.', 'Nem a cél a lényeg, hanem az út.', 'Egy jó csapat többet ér a legjobb felszerelésnél.', 'Ma is jó nap egy új kezdéshez.',
    'A hiba csak egy újabb próbálkozás kezdete.', 'Lassan járj, tovább érsz.', 'Ahol a térkép véget ér, ott kezdődik a kaland.', 'Néha a legjobb lépés a szünet gomb.', 'Minden mester egykor kezdő volt.'];
  const TIPS = ['A Guide gombbal bárhonnan előhozod a gyorsmenüt.', 'A képernyőkímélőket a Beállításokban választhatod és szerkesztheted.', 'Az appok között a ⧉ gombbal váltasz.',
    'Stream közben a Select+Start nyitja a menüt.', 'A témaszerkesztőben a csempék animációja is állítható.', 'Az X gombbal a játék adatlapját nyitod meg.',
    'A zenére reagáló képernyőkímélők a gép hangját követik.', 'A billentyűzeten hosszan nyomott betűvel ékezetes változatot kapsz.'];
  const WORLD = [['London', 'Europe/London'], ['New York', 'America/New_York'], ['Tokió', 'Asia/Tokyo']];
  const STORE_N = { steam: 'Steam', epic: 'Epic', gog: 'GOG', msstore: 'Microsoft', ubisoft: 'Ubisoft', custom: 'Egyedi' };
  const marquee = (inner) => `<div class="sw-marquee"><div>${inner}${inner}</div></div>`;
  async function np() { return wCache.np || null; }

  const CATS = ['Idő', 'Információ', 'Játékok', 'Zene', 'Szöveg és díszítés', 'Formák és effektek'];
  // html(w, d): a komponens tartalma (lehet aszinkron) · text: van szerkeszthető szövege (alapérték) · music: a hangot elemzi
  const WIDGETS = {
    // ---- Idő ----
    clock: { cat: 'Idő', name: 'Óra', html: (w, d) => `<b class="sw-big">${hm(d)}</b>` },
    'clock-sec': { cat: 'Idő', name: 'Óra másodpercekkel', html: (w, d) => `<b class="sw-big">${hm(d)}<small class="sw-sec">:${p2(d.getSeconds())}</small></b>` },
    'clock-12': { cat: 'Idő', name: '12 órás óra', html: (w, d) => `<b class="sw-big">${(d.getHours() % 12) || 12}:${p2(d.getMinutes())}</b><span class="sw-cap">${d.getHours() < 12 ? 'délelőtt' : 'délután'}</span>` },
    'clock-flip': { cat: 'Idő', name: 'Lapozós óra', html: (w, d) => { const s = hm(d); return `<div class="sw-flip">${[...s].map((c) => (c === ':' ? '<em>:</em>' : `<span>${c}</span>`)).join('')}</div>`; } },
    'clock-analog': { cat: 'Idő', name: 'Analóg óra', html: () => cv('analog', 12, 12) },
    'clock-ring': { cat: 'Idő', name: 'Óra másodperc-gyűrűvel', html: () => cv('ringclock', 13, 13) },
    'clock-binary': { cat: 'Idő', name: 'Bináris óra', html: () => cv('binary', 12, 8) },
    'clock-word': { cat: 'Idő', name: 'Óra szavakkal', html: (w, d) => `<b class="sw-mid sw-word">${timeWords(d)}</b>` },
    date: { cat: 'Idő', name: 'Dátum', html: (w, d) => `<span class="sw-cap">${esc(d.toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' }))}</span>` },
    weekday: { cat: 'Idő', name: 'A hét napja', html: (w, d) => { const s = d.toLocaleDateString('hu-HU', { weekday: 'long' }); return `<b class="sw-big sw-wd">${s[0].toUpperCase()}${s.slice(1)}</b>`; } },
    calendar: { cat: 'Idő', name: 'Havi naptár', html: (w, d) => {
      const y = d.getFullYear(), m = d.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      let c = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map((x) => `<b>${x}</b>`).join('') + '<i></i>'.repeat(first);
      for (let i = 1; i <= days; i++) c += `<i${i === d.getDate() ? ' class="on"' : ''}>${i}</i>`;
      return `<span class="sw-cap">${d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' })}</span><div class="sw-cal">${c}</div>`;
    } },
    daypct: { cat: 'Idő', name: 'A nap haladása', html: (w, d) => { const p = ((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 864); return bar(p, `A nap ${Math.floor(p)}%-a eltelt`); } },
    yearpct: { cat: 'Idő', name: 'Az év haladása', html: (w, d) => { const y0 = new Date(d.getFullYear(), 0, 1), y1 = new Date(d.getFullYear() + 1, 0, 1), p = ((d - y0) / (y1 - y0)) * 100; return bar(p, `${d.getFullYear()} · ${p.toFixed(1)}%`); } },
    countdown: { cat: 'Idő', name: 'Visszaszámlálás', text: `${new Date().getFullYear()}-12-31 Szilveszter`, html: (w, d) => {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})\s*(.*)$/.exec(String(w.text || '').trim());
      if (!m) return '<span class="sw-cap">Szöveg: ÉÉÉÉ-HH-NN Név</span>';
      let s = Math.max(0, Math.floor((new Date(+m[1], m[2] - 1, +m[3]) - d) / 1000));
      const dd = Math.floor(s / 86400); s %= 86400;
      return `<span class="sw-cap">${esc(m[4] || 'Visszaszámlálás')}</span><b class="sw-mid">${dd} nap ${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}</b>`;
    } },
    'world-clock': { cat: 'Idő', name: 'Világóra', html: (w, d) => `<div class="sw-list">${WORLD.map(([n, tz]) => `<div><b>${n}</b><span>${d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: tz })}</span></div>`).join('')}</div>` },
    uptime: { cat: 'Idő', name: 'Az InariX futási ideje', html: () => { const m = Math.floor(performance.now() / 60000); return `<span class="sw-cap">Az InariX fut</span><b class="sw-mid">${Math.floor(m / 60)} ó ${m % 60} p</b>`; } },
    moon: { cat: 'Idő', name: 'Holdfázis', html: (w, d) => { const x = moon(d); return `<b class="sw-emoji">${x.ic}</b><span class="sw-cap">${x.name}</span>`; } },
    // ---- Információ ----
    weather: { cat: 'Információ', name: 'Időjárás', html: async () => { const x = await wx(); return x === null ? NOCITY : x ? `<b class="sw-mid">${esc(x.icon)} ${esc(x.temp)}°</b><span class="sw-cap">${esc(x.city)}</span>` : ''; } },
    'weather-big': { cat: 'Információ', name: 'Időjárás (nagy)', html: async () => { const x = await wx(); return x === null ? NOCITY : x ? `<b class="sw-emoji">${esc(x.icon)}</b><b class="sw-big">${esc(x.temp)}°</b><span class="sw-cap">${esc(x.city)}</span>` : ''; } },
    battery: { cat: 'Információ', name: 'Akkumulátor', html: () => (S.battery ? `<span class="sw-mid">${S.battery.charging ? '⚡' : '🔋'} ${Math.round(S.battery.level * 100)}%</span>` : '') },
    'battery-bar': { cat: 'Információ', name: 'Akkumulátor sáv', html: () => (S.battery ? bar(S.battery.level * 100, `Akkumulátor · ${Math.round(S.battery.level * 100)}%${S.battery.charging ? ' · töltés' : ''}`) : '') },
    'net-status': { cat: 'Információ', name: 'Hálózat állapota', html: () => `<div class="sw-list"><div><i class="${navigator.onLine ? 'on' : 'off'}"></i><b>${navigator.onLine ? 'Online' : 'Nincs internet'}</b>${navigator.connection && navigator.connection.downlink ? `<span>${navigator.connection.downlink} Mbit/s</span>` : ''}</div></div>` },
    hosts: { cat: 'Információ', name: 'Gépek állapota', html: () => {
      const hs = (S.lib && S.lib.hosts) || [], info = (S.state && S.state.hostInfo) || {};
      return `<div class="sw-list">${hs.map((x) => `<div><i class="${x.local || x.online ? 'on' : 'off'}"></i><b>${esc(x.local ? 'Ez a gép' : x.name)}</b><span>${x.local ? 'helyi' : x.online ? `online${info[x.id] && info[x.id].ping ? ` · ${info[x.id].ping} ms` : ''}` : 'offline'}</span></div>`).join('')}</div>`;
    } },
    'host-count': { cat: 'Információ', name: 'Online gépek száma', html: () => { const hs = (S.lib && S.lib.hosts) || []; const on = hs.filter((x) => x.local || x.online).length; return `<b class="sw-big">${on}/${hs.length}</b><span class="sw-cap">gép online</span>`; } },
    greeting: { cat: 'Információ', name: 'Üdvözlés', html: (w, d) => { const hh = d.getHours(); return `<b class="sw-mid sw-greet">${hh >= 5 && hh < 9 ? 'Jó reggelt!' : hh < 18 && hh >= 9 ? 'Szép napot!' : hh >= 18 && hh < 22 ? 'Jó estét!' : 'Jó éjszakát!'}</b>`; } },
    quote: { cat: 'Információ', name: 'Idézet (váltakozó)', html: () => `<b class="sw-mid sw-quote">„${QUOTES[Math.floor(tick / 20) % QUOTES.length]}”</b>` },
    tip: { cat: 'Információ', name: 'InariX tipp', html: () => `<span class="sw-cap">Tipp</span><span class="sw-sub sw-tip">${TIPS[Math.floor(tick / 15) % TIPS.length]}</span>` },
    news: { cat: 'Információ', name: 'Játékhír (váltakozó)', html: async () => { const L = await newsList(); if (!L.length) return '<span class="sw-cap">Nincs friss hír</span>'; const it = L[Math.floor(tick / 15) % L.length]; return `<span class="sw-cap">${esc(it.game)}</span><b class="sw-mid">${esc(it.title)}</b>`; } },
    'news-list': { cat: 'Információ', name: 'Hírek listája', html: async () => { const L = (await newsList()).slice(0, 4); return L.length ? `<span class="sw-cap">Játékhírek</span><div class="sw-list sw-news">${L.map((x) => `<div><b>${esc(x.title)}</b><span>${esc(x.game)}</span></div>`).join('')}</div>` : '<span class="sw-cap">Nincs friss hír</span>'; } },
    'news-ticker': { cat: 'Információ', name: 'Hírszalag', html: async () => { const L = await newsList(); return L.length ? marquee(L.map((x) => `<span><b>${esc(x.game)}</b> · ${esc(x.title)}</span>`).join('')) : ''; } },
    // ---- Játékok ----
    library: { cat: 'Játékok', name: 'Utoljára játszottak', html: () => {
      const g = games().filter((x) => x.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 4);
      return `<span class="sw-cap">${installed().length} telepített játék · utoljára játszott</span><div class="sw-covers">${g.map((x) => `<img src="${esc(coverOf(x))}" alt="">`).join('')}</div>`;
    } },
    cover: { cat: 'Játékok', name: 'Játékborító (váltakozó)', html: () => { const L = withCover(); if (!L.length) return ''; const g = L[Math.floor(tick / 10) % L.length]; return `<img class="sw-cover" src="${esc(coverOf(g))}" alt=""><span class="sw-cap">${esc(g.name)}</span>`; } },
    'lib-count': { cat: 'Játékok', name: 'Játékok száma', html: () => `<b class="sw-big">${games().length}</b><span class="sw-cap">játék a könyvtárban · ${installed().length} telepítve</span>` },
    'last-game': { cat: 'Játékok', name: 'Utoljára játszott játék', html: () => { const g = games().filter((x) => x.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed)[0]; return g ? `<div class="sw-np"><img class="sw-tall" src="${esc(coverOf(g))}" alt=""><div><span class="sw-cap">Utoljára játszott · ${ago(g.lastPlayed)}</span><b class="sw-mid">${esc(g.name)}</b></div></div>` : ''; } },
    'top-played': { cat: 'Játékok', name: 'Legtöbbet játszott', html: () => { const L = games().filter((x) => x.playSec > 0).sort((a, b) => b.playSec - a.playSec).slice(0, 3); return L.length ? `<span class="sw-cap">Legtöbbet játszott</span><div class="sw-list">${L.map((x, i) => `<div><b>${i + 1}. ${esc(x.name)}</b><span>${Math.round(x.playSec / 3600)} óra</span></div>`).join('')}</div>` : ''; } },
    'playtime-total': { cat: 'Játékok', name: 'Összes játékidő', html: () => { const s = games().reduce((a, x) => a + (x.playSec || 0), 0); return `<b class="sw-big">${Math.round(s / 3600)}</b><span class="sw-cap">óra játékidő összesen</span>`; } },
    'cover-wall': { cat: 'Játékok', name: 'Borítófal', html: () => { const L = withCover(); if (!L.length) return ''; const k = Math.floor(tick / 12); return `<div class="sw-wall">${Array.from({ length: Math.min(8, L.length) }, (_, i) => `<img src="${esc(coverOf(L[(i + k) % L.length]))}" alt="">`).join('')}</div>`; } },
    'cover-strip': { cat: 'Játékok', name: 'Borító szalag (mozgó)', html: () => { const L = withCover().slice(0, 14); return L.length ? marquee(L.map((x) => `<img src="${esc(coverOf(x))}" alt="">`).join('')).replace('sw-marquee', 'sw-marquee sw-strip') : ''; } },
    'random-game': { cat: 'Játékok', name: 'Mit játsszak? (ajánló)', html: () => { const L = installed().filter(coverOf); if (!L.length) return ''; const g = L[(Math.floor(tick / 20) * 7) % L.length]; return `<span class="sw-cap">Mit játsszak ma?</span><img class="sw-cover" src="${esc(coverOf(g))}" alt=""><b class="sw-mid">${esc(g.name)}</b>`; } },
    'store-count': { cat: 'Játékok', name: 'Játékok áruházanként', html: () => { const c = {}; for (const g of games()) c[g.store] = (c[g.store] || 0) + 1; return `<div class="sw-chips">${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span><b>${n}</b> ${STORE_N[k] || esc(k)}</span>`).join('')}</div>`; } },
    // ---- Zene ----
    music: { cat: 'Zene', name: 'Most szól', html: async () => { const x = await np(); return x ? `<div class="sw-np">${x.art ? `<img src="${esc(x.art)}" alt="">` : ''}<div><span class="sw-cap">${esc(x.src)}${x.playing ? '' : ' · szünetel'}</span><b class="sw-mid">${esc(x.title)}</b><span class="sw-sub">${esc(x.sub || '')}</span></div></div>` : '<span class="sw-cap">Most nem szól semmi</span>'; } },
    'np-mini': { cat: 'Zene', name: 'Most szól (egy sor)', html: async () => { const x = await np(); return x ? `<span class="sw-sub">♪ <b>${esc(x.title)}</b>${x.sub ? ` – ${esc(x.sub)}` : ''}</span>` : ''; } },
    'np-title': { cat: 'Zene', name: 'Dal címe (nagy)', html: async () => { const x = await np(); return x ? `<b class="sw-big sw-npt">${esc(x.title)}</b><span class="sw-cap">${esc(x.sub || x.src)}</span>` : '<span class="sw-cap">Most nem szól semmi</span>'; } },
    'np-art': { cat: 'Zene', name: 'Albumborító (nagy)', html: async () => { const x = await np(); return x && x.art ? `<img class="sw-art" src="${esc(x.art)}" alt="">` : '<i class="sw-ring-ph sw-art"></i>'; } },
    'viz-bars': { cat: 'Zene', name: 'Spektrum sáv', music: true, html: () => cv('bars', 26, 6) },
    'viz-mirror': { cat: 'Zene', name: 'Tükrözött spektrum', music: true, html: () => cv('mirror', 26, 8) },
    'viz-line': { cat: 'Zene', name: 'Spektrum görbe', music: true, html: () => cv('line', 26, 7) },
    'viz-wave': { cat: 'Zene', name: 'Hullámforma', music: true, html: () => cv('wave', 26, 4.5) },
    'viz-dots': { cat: 'Zene', name: 'Pontmátrix', music: true, html: () => cv('dots', 22, 7) },
    'viz-circle': { cat: 'Zene', name: 'Spektrum kör', music: true, html: () => cv('circle', 14, 14) },
    'viz-ring': { cat: 'Zene', name: 'Lüktető albumborító', music: true, html: async () => { const x = await np(); return `<div class="sw-ring">${cv('ring', 14, 14)}${x && x.art ? `<img src="${esc(x.art)}" alt="">` : '<i class="sw-ring-ph">♪</i>'}</div>`; } },
    'viz-blob': { cat: 'Zene', name: 'Lüktető folt', music: true, html: () => cv('blob', 14, 14) },
    'viz-vu': { cat: 'Zene', name: 'VU-mérő', music: true, html: () => cv('vu', 18, 10) },
    'viz-level': { cat: 'Zene', name: 'Hangerő oszlop', music: true, html: () => cv('level', 3, 14) },
    'beat-dot': { cat: 'Zene', name: 'Ütemjelző', music: true, html: () => cv('beat', 6, 6) },
    // ---- Szöveg és díszítés ----
    text: { cat: 'Szöveg és díszítés', name: 'Saját szöveg', text: 'InariX', html: (w) => `<b class="sw-mid">${esc(w.text || '')}</b>` },
    title: { cat: 'Szöveg és díszítés', name: 'Címsor', text: 'InariX', html: (w) => `<b class="sw-big sw-title">${esc(w.text || '')}</b>` },
    'text-neon': { cat: 'Szöveg és díszítés', name: 'Neon felirat', text: 'PLAY', html: (w) => `<b class="sw-big sw-neon">${esc(w.text || '')}</b>` },
    'text-outline': { cat: 'Szöveg és díszítés', name: 'Körvonalas felirat', text: 'GAME ON', html: (w) => `<b class="sw-big sw-outline">${esc(w.text || '')}</b>` },
    'text-gradient': { cat: 'Szöveg és díszítés', name: 'Színátmenetes felirat', text: 'INARIX', html: (w) => `<b class="sw-big sw-gradtext">${esc(w.text || '')}</b>` },
    typewriter: { cat: 'Szöveg és díszítés', name: 'Írógép szöveg', text: 'Indul a játék…', html: (w) => { const t = String(w.text || ''); return `<b class="sw-mid sw-type" style="--n:${Math.max(1, t.length)}">${esc(t)}</b>`; } },
    badge: { cat: 'Szöveg és díszítés', name: 'Címke', text: 'ÉLŐ', html: (w) => `<span class="sw-badge">${esc(w.text || '')}</span>` },
    emoji: { cat: 'Szöveg és díszítés', name: 'Emoji', text: '🎮', html: (w) => `<b class="sw-emoji">${esc(w.text || '')}</b>` },
    logo: { cat: 'Szöveg és díszítés', name: 'InariX logó', html: () => '<img class="sw-logo" src="../../assets/inarix-mark.svg" alt="">' },
    divider: { cat: 'Szöveg és díszítés', name: 'Elválasztó vonal', html: () => '<i class="sw-divider"></i>' },
    frame: { cat: 'Szöveg és díszítés', name: 'Keret', html: () => '<i class="sw-frame"></i>' },
    glass: { cat: 'Szöveg és díszítés', name: 'Üveg panel (háttérnek)', html: () => '<i class="sw-glass"></i>' },
    // ---- Formák és effektek ----
    orb: { cat: 'Formák és effektek', name: 'Izzó gömb', html: () => cv('orb', 12, 12) },
    rings: { cat: 'Formák és effektek', name: 'Forgó gyűrűk', html: () => cv('rings', 12, 12) },
    spinner: { cat: 'Formák és effektek', name: 'Pörgő ív', html: () => cv('spinner', 8, 8) },
    polygon: { cat: 'Formák és effektek', name: 'Forgó sokszögek', html: () => cv('polygon', 12, 12) },
    cube: { cat: 'Formák és effektek', name: 'Forgó kocka', html: () => cv('cube', 12, 12) },
    sparkles: { cat: 'Formák és effektek', name: 'Csillogás', html: () => cv('sparkles', 20, 10) },
    dotwave: { cat: 'Formák és effektek', name: 'Pontrács hullám', html: () => cv('dotwave', 22, 8) },
    sine: { cat: 'Formák és effektek', name: 'Szinuszvonalak', html: () => cv('sine', 24, 6) },
    loader: { cat: 'Formák és effektek', name: 'Töltő csík', html: () => cv('loader', 20, 1.2) },
  };
  const NOCITY = '<span class="sw-cap">Időjárás: a Beállításokban adj meg várost</span>';
  async function wx() {
    if (!S.state || !S.state.settings.ui.weatherCity) return null;
    if (!wCache.wx || Date.now() - wCache.wxAt > 600000) { wCache.wxAt = Date.now(); wCache.wx = await gamo.weather().catch(() => false); }
    return wCache.wx || false;
  }
  async function newsList() {
    if (!wCache.news) { wCache.news = []; const n = await gamo.homeNews().catch(() => null); wCache.news = (n && n.news) || []; }
    return wCache.news;
  }

  const ANIM = { none: 'Nincs', drift: 'Lassú vándorlás', float: 'Lebegés', pulse: 'Lüktetés', fade: 'Elhalványuló', slide: 'Beúszás', glow: 'Ragyogás', sway: 'Ringatózás', spin: 'Forgás', blink: 'Villogás' };
  const COLOR = { theme: 'Téma színátmenet', white: 'Fehér', accent: 'Kiemelő szín', accent2: 'Második kiemelő szín', muted: 'Halvány', gold: 'Arany', pink: 'Rózsaszín', green: 'Zöld' };
  const ALIGN = { l: 'Balra', c: 'Középre', r: 'Jobbra' };
  // régi (rácsos) formátum → szabad elhelyezés
  const POSXY = { tl: [5, 9, 'l'], tc: [50, 9, 'c'], tr: [95, 9, 'r'], ml: [5, 50, 'l'], mc: [50, 50, 'c'], mr: [95, 50, 'r'], bl: [5, 89, 'l'], bc: [50, 89, 'c'], br: [95, 89, 'r'] };
  const SIZEK = { s: 0.75, m: 1, l: 1.35, xl: 1.85 };
  function norm(w) {
    if (w.x == null || w.y == null) { const p = POSXY[w.pos] || POSXY.mc; w.x = p[0]; w.y = p[1]; if (!w.align) w.align = p[2]; }
    if (w.scale == null) w.scale = SIZEK[w.size] || 1;
    if (!w.align) w.align = 'c';
    if (w.text == null && WIDGETS[w.type] && 'text' in WIDGETS[w.type]) w.text = WIDGETS[w.type].text;
    delete w.pos; delete w.size;
    return w;
  }
  const W = (type, x, y, scale, align, more = {}) => ({ type, x, y, scale, align, anim: 'none', color: 'white', ...more });
  const SCENE_CATS = ['Óra és idő', 'Információ', 'Játékok', 'Zene', 'Hangulat'];
  const SCENES = [
    // Információ
    { id: 'dyn-info', cat: 'Információ', name: 'Információs pult', bg: 'aurora', widgets: [W('clock', 50, 46, 1.85, 'c', { anim: 'float', color: 'theme' }), W('date', 50, 89, 1, 'c', { color: 'muted' }), W('weather', 95, 9, 1, 'r'), W('music', 5, 89, 1, 'l', { anim: 'slide' })] },
    { id: 'dyn-hosts', cat: 'Információ', name: 'Gépek és hálózat', bg: 'network', widgets: [W('hosts', 50, 50, 1.35, 'c'), W('clock', 5, 9, 1, 'l', { color: 'theme' }), W('battery', 95, 9, 0.75, 'r', { color: 'muted' })] },
    { id: 'dyn-news', cat: 'Információ', name: 'Játékhírek', bg: 'flow', widgets: [W('news', 50, 50, 1.35, 'c', { anim: 'fade' }), W('clock', 5, 9, 1, 'l', { color: 'theme' }), W('date', 95, 9, 0.75, 'r', { color: 'muted' })] },
    { id: 'p-morning', cat: 'Információ', name: 'Reggeli áttekintés', bg: 'aurora', widgets: [W('greeting', 5, 12, 1.6, 'l', { color: 'theme', anim: 'slide' }), W('date', 5, 21, 1, 'l', { color: 'muted' }), W('weather-big', 95, 20, 1, 'r'), W('clock', 50, 52, 1.6, 'c', { anim: 'float' }), W('calendar', 5, 78, 0.9, 'l'), W('tip', 95, 86, 0.9, 'r', { color: 'muted' })] },
    { id: 'p-calendar', cat: 'Információ', name: 'Naptár', bg: 'snow', widgets: [W('calendar', 50, 50, 1.5, 'c'), W('clock', 95, 10, 1.1, 'r', { color: 'theme' }), W('moon', 5, 86, 0.9, 'l'), W('yearpct', 95, 88, 0.9, 'r')] },
    { id: 'p-system', cat: 'Információ', name: 'Rendszer', bg: 'network', widgets: [W('glass', 50, 50, 1.6, 'c', { opacity: 0.8 }), W('host-count', 36, 42, 1, 'c', { color: 'theme' }), W('net-status', 64, 38, 1.1, 'c'), W('battery-bar', 64, 52, 1, 'c'), W('uptime', 36, 62, 1, 'c', { color: 'muted' }), W('clock', 64, 64, 1, 'c')] },
    { id: 'p-quotes', cat: 'Információ', name: 'Idézetek', bg: 'flow', widgets: [W('quote', 50, 46, 1.4, 'c', { anim: 'fade' }), W('divider', 50, 60, 1, 'c', { color: 'theme' }), W('clock', 95, 90, 0.9, 'r', { color: 'muted' })] },
    { id: 'p-ticker', cat: 'Információ', name: 'Hírszalag', bg: 'waves', widgets: [W('news-list', 50, 45, 1.2, 'c'), W('news-ticker', 50, 92, 1, 'c'), W('clock', 5, 9, 1, 'l', { color: 'theme' })] },
    // Óra és idő
    { id: 'p-minimal', cat: 'Óra és idő', name: 'Minimál óra', bg: 'black', widgets: [W('clock-sec', 50, 46, 1.6, 'c'), W('date', 50, 62, 1, 'c', { color: 'muted' })] },
    { id: 'p-analog', cat: 'Óra és idő', name: 'Analóg elegancia', bg: 'stars', widgets: [W('clock-analog', 50, 44, 2.3, 'c'), W('weekday', 50, 84, 0.6, 'c', { color: 'muted' })] },
    { id: 'p-flip', cat: 'Óra és idő', name: 'Lapozós óra', bg: 'black', widgets: [W('clock-flip', 50, 46, 2, 'c'), W('daypct', 50, 80, 1, 'c', { color: 'muted' })] },
    { id: 'p-world', cat: 'Óra és idő', name: 'Világidő', bg: 'network', widgets: [W('clock', 50, 34, 1.6, 'c', { color: 'theme' }), W('world-clock', 50, 66, 1.4, 'c')] },
    { id: 'p-binary', cat: 'Óra és idő', name: 'Bináris', bg: 'matrix', widgets: [W('glass', 50, 50, 1.2, 'c'), W('clock-binary', 50, 46, 1.6, 'c'), W('clock-word', 50, 66, 1, 'c', { color: 'accent' })] },
    { id: 'p-words', cat: 'Óra és idő', name: 'Szavas óra', bg: 'aurora', widgets: [W('clock-word', 50, 46, 2, 'c', { color: 'theme', anim: 'float' }), W('date', 50, 64, 1, 'c', { color: 'muted' })] },
    { id: 'p-ring', cat: 'Óra és idő', name: 'Másodperc-gyűrű', bg: 'ripples', widgets: [W('clock-ring', 50, 48, 2.2, 'c'), W('countdown', 95, 90, 0.9, 'r', { color: 'muted' })] },
    // Játékok
    { id: 'dyn-library', cat: 'Játékok', name: 'Játékkönyvtár', bg: 'covers', widgets: [W('library', 5, 80, 1.35, 'l', { anim: 'slide' }), W('clock', 95, 9, 1, 'r')] },
    { id: 'p-wall', cat: 'Játékok', name: 'Borítófal', bg: 'black', widgets: [W('cover-wall', 50, 54, 1.25, 'c'), W('lib-count', 5, 10, 0.8, 'l', { color: 'theme' }), W('clock', 95, 10, 1, 'r')] },
    { id: 'p-pick', cat: 'Játékok', name: 'Mit játsszak?', bg: 'covers', widgets: [W('glass', 50, 50, 1.5, 'c'), W('random-game', 50, 50, 1.1, 'c', { anim: 'pulse' }), W('clock', 95, 9, 1, 'r')] },
    { id: 'p-stats', cat: 'Játékok', name: 'Játékos statisztika', bg: 'pipes', widgets: [W('glass', 50, 50, 1.9, 'c', { opacity: 0.9 }), W('playtime-total', 32, 36, 1, 'c', { color: 'theme' }), W('lib-count', 68, 36, 1, 'c', { color: 'theme' }), W('top-played', 32, 66, 1, 'c'), W('store-count', 68, 66, 1, 'c')] },
    { id: 'p-strip', cat: 'Játékok', name: 'Borító szalag', bg: 'tunnel', widgets: [W('title', 50, 26, 1, 'c', { text: 'Játékkönyvtár', color: 'theme' }), W('cover-strip', 50, 58, 1.2, 'c'), W('last-game', 5, 90, 0.8, 'l')] },
    // Zene
    { id: 'dyn-music', cat: 'Zene', name: 'Zenelejátszó', bg: 'waves', music: true, widgets: [W('music', 50, 50, 1.85, 'c', { anim: 'float', react: true }), W('clock', 95, 9, 0.75, 'r', { color: 'muted' })] },
    { id: 'dyn-stage', cat: 'Zene', name: 'Koncertszínpad', bg: 'spectrum', music: true, widgets: [W('viz-ring', 50, 34, 1.3, 'c'), W('music', 50, 64, 1.2, 'c'), W('clock', 5, 9, 0.9, 'l', { color: 'theme' })] },
    { id: 'dyn-club', cat: 'Zene', name: 'Klub', bg: 'beatburst', music: true, widgets: [W('clock', 50, 45, 1.85, 'c', { color: 'theme', react: true }), W('viz-wave', 50, 70, 1.2, 'c'), W('music', 5, 89, 0.9, 'l')] },
    { id: 'dyn-studio', cat: 'Zene', name: 'Stúdió', bg: 'nebula', music: true, widgets: [W('viz-bars', 50, 80, 1.6, 'c'), W('music', 5, 12, 1.2, 'l', { anim: 'slide' }), W('clock', 95, 12, 1.2, 'r', { color: 'theme' })] },
    { id: 'p-vu', cat: 'Zene', name: 'VU-mérő', bg: 'black', music: true, widgets: [W('viz-vu', 50, 44, 2, 'c'), W('np-mini', 50, 78, 1.2, 'c'), W('viz-level', 92, 50, 1, 'c')] },
    { id: 'p-neon', cat: 'Zene', name: 'Neon klub', bg: 'bassrings', music: true, widgets: [W('text-neon', 50, 40, 1.6, 'c', { text: 'PARTY', react: true }), W('viz-mirror', 50, 76, 1.4, 'c'), W('beat-dot', 92, 10, 0.9, 'c'), W('np-mini', 5, 92, 0.9, 'l')] },
    { id: 'p-album', cat: 'Zene', name: 'Albumborító', bg: 'nebula', music: true, widgets: [W('np-art', 50, 38, 1.2, 'c', { react: true }), W('np-title', 50, 70, 0.7, 'c'), W('viz-line', 50, 88, 1.6, 'c')] },
    // Hangulat
    { id: 'p-synth', cat: 'Hangulat', name: 'Szintwave', bg: 'waves', widgets: [W('orb', 50, 40, 2.6, 'c'), W('text-gradient', 50, 40, 1.1, 'c', { text: 'INARIX' }), W('clock', 50, 70, 1, 'c', { color: 'gold' }), W('sine', 50, 88, 1.6, 'c')] },
    { id: 'p-zen', cat: 'Hangulat', name: 'Zen', bg: 'ripples', widgets: [W('emoji', 50, 34, 2, 'c', { text: '🌿', anim: 'sway' }), W('quote', 50, 62, 1, 'c', { anim: 'fade' }), W('clock', 95, 90, 0.8, 'r', { color: 'muted' })] },
    { id: 'p-arcade', cat: 'Hangulat', name: 'Retró árkád', bg: 'pipes', widgets: [W('frame', 50, 50, 2.2, 'c', { color: 'pink' }), W('text-outline', 50, 40, 1, 'c', { text: 'INSERT COIN', anim: 'blink', color: 'gold' }), W('clock-flip', 50, 62, 1, 'c'), W('cube', 88, 18, 0.8, 'c')] },
    { id: 'p-space', cat: 'Hangulat', name: 'Űrállomás', bg: 'stars', widgets: [W('rings', 80, 30, 1.6, 'c'), W('polygon', 18, 72, 1.1, 'c', { anim: 'drift' }), W('clock', 50, 50, 1.6, 'c', { color: 'accent2' }), W('loader', 50, 64, 1.2, 'c'), W('typewriter', 50, 72, 0.9, 'c', { text: 'Rendszerek aktívak…', color: 'muted' })] },
  ];
  const needsAudio = (sc, bg) => !!((bg && bg.music) || (sc && (sc.widgets || []).some((w) => w.react || (WIDGETS[w.type] && WIDGETS[w.type].music))));

  let wTimer = 0, layer = null, tick = 0, editor = false;
  const wCache = {};
  async function widgetHtml(w) {
    const def = WIDGETS[w.type];
    if (!def) return '';
    try { return (await def.html(w, new Date())) || ''; } catch { return ''; }
  }
  const ALG = { l: '0%', c: '-50%', r: '-100%' };
  function place(el, w) {
    el.style.left = `${w.x}%`; el.style.top = `${w.y}%`;
    el.style.fontSize = `${(1.4 * (w.scale || 1)).toFixed(3)}cqw`;
    el.style.transform = `translate(${ALG[w.align] || '-50%'}, -50%)`;
    el.style.opacity = w.opacity != null ? String(w.opacity) : '';
  }
  // a komponensek elhelyezése (szinkron: a szerkesztő minden mozdulatnál hívja)
  function layout() {
    if (!layer || !scene) return;
    const items = scene.widgets || [];
    while (layer.children.length < items.length) { const o = document.createElement('div'); const a = document.createElement('div'); const c = document.createElement('div'); a.className = 'sw-a'; c.className = 'sw-c'; a.append(c); o.append(a); layer.append(o); }
    while (layer.children.length > items.length) layer.lastChild.remove();
    items.forEach((w, i) => {
      norm(w);
      const el = layer.children[i];
      const cls = `sw swt-${w.type} sw-al-${w.align} sw-col-${w.color || 'white'}${w.react ? ' sw-react' : ''}`;
      if (el.className !== cls) el.className = cls;
      const an = `sw-a sw-anim-${w.anim || 'none'}`;
      if (el.firstChild.className !== an) el.firstChild.className = an;
      place(el, w);
    });
  }
  // másodpercenként (a másodperces órák miatt); a lejátszás állapota 5 másodpercenként frissül
  async function renderWidgets() {
    if (!layer || !scene) return;
    const sc = scene;
    if (tick % 5 === 0 && (sc.widgets.some((w) => /^(music|np-|viz-ring)/.test(w.type)) || needsAudio(sc, cur))) {
      wCache.np = typeof nowPlayingAny === 'function' ? await nowPlayingAny().catch(() => null) : null;
      AU.np = !!(wCache.np && wCache.np.playing);
    }
    tick++;
    if (sc !== scene) return;
    layout();
    await Promise.all(sc.widgets.map(async (w, i) => {
      let html = await widgetHtml(w);
      if (!html && editor) html = `<span class="sw-cap sw-ph">${esc(WIDGETS[w.type] ? WIDGETS[w.type].name : w.type)} (most nincs adat)</span>`;
      const el = layer.children[i] && layer.children[i].firstChild.firstChild;
      if (el && el._html !== html) { el._html = html; el.innerHTML = html; }
    }));
    if (onRender) onRender();
  }

  // ---- vászon-alapú komponensek rajzolása (képkockánként) ----
  // g: 2D context, w/h: pixelméret, a: hangelemzés, A/B: téma színek, t: idő (ms), cv: maga a vászon (saját állapotnak)
  const DRAW = {
    bars(g, w, h, a, A, B) { const n = a.bins.length, bw = w / n; for (let i = 0; i < n; i++) { const bh = Math.max(h * 0.04, a.bins[i] * h); g.fillStyle = rgba(mix(A, B, i / n), 0.92); g.fillRect(i * bw + bw * 0.15, h - bh, bw * 0.7, bh); } },
    mirror(g, w, h, a, A, B) { const n = a.bins.length, bw = w / n; for (let i = 0; i < n; i++) { const bh = Math.max(h * 0.02, a.bins[i] * h * 0.5); g.fillStyle = rgba(mix(A, B, i / n), 0.92); g.fillRect(i * bw + bw * 0.15, h / 2 - bh, bw * 0.7, bh * 2); } },
    line(g, w, h, a, A, B) {
      const n = a.bins.length, pts = [...a.bins].map((v, i) => [(i / (n - 1)) * w, h - 4 - v * (h - 8)]);
      g.beginPath(); g.moveTo(0, h); pts.forEach(([x, y], i) => { if (!i) g.lineTo(x, y); else { const [px, py] = pts[i - 1]; g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); } }); g.lineTo(w, h); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgba(B, 0.55)); gr.addColorStop(1, rgba(A, 0)); g.fillStyle = gr; g.fill();
      g.strokeStyle = rgba(B); g.lineWidth = Math.max(2, h * 0.03); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    },
    wave(g, w, h, a, A, B) { g.lineWidth = Math.max(2, h * 0.05); g.strokeStyle = rgba(B); g.shadowColor = rgba(A); g.shadowBlur = h * 0.15; g.beginPath(); for (let i = 0; i < a.wave.length; i++) { const x = (i / (a.wave.length - 1)) * w, y = h / 2 + a.wave[i] * h * 0.45; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.shadowBlur = 0; },
    dots(g, w, h, a, A, B) { const cols = 24, rows = 8, dw = w / cols, dh = h / rows; for (let i = 0; i < cols; i++) { const lit = Math.round(a.bins[Math.floor((i / cols) * a.bins.length)] * rows); for (let r = 0; r < rows; r++) { g.fillStyle = rgba(mix(A, B, r / rows), r < lit ? 0.95 : 0.08); g.beginPath(); g.arc(i * dw + dw / 2, h - (r + 0.5) * dh, Math.min(dw, dh) * 0.36, 0, TAU); g.fill(); } } },
    circle(g, w, h, a, A, B, t) {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.28, n = a.bins.length, rot = t * 0.0002;
      g.lineCap = 'round'; g.lineWidth = Math.max(2, (TAU * R) / (n * 2) * 0.55);
      for (let i = 0; i < n * 2; i++) { const k = i < n ? i : n * 2 - 1 - i, an = rot + (i / (n * 2)) * TAU, L = R * 0.06 + a.bins[k] * R * 0.75; g.strokeStyle = rgba(mix(A, B, k / n)); g.beginPath(); g.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); g.lineTo(cx + Math.cos(an) * (R + L), cy + Math.sin(an) * (R + L)); g.stroke(); }
    },
    ring(g, w, h, a, A, B, t, cv) {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.33, n = a.bins.length;
      g.lineCap = 'round'; g.lineWidth = Math.max(2, (TAU * R) / (n * 2) * 0.5);
      for (let i = 0; i < n * 2; i++) { const k = i < n ? i : n * 2 - 1 - i, an = (i / (n * 2)) * TAU - Math.PI / 2, L = R * 0.05 + a.bins[k] * R * 0.5; g.strokeStyle = rgba(mix(A, B, k / n), 0.95); g.beginPath(); g.moveTo(cx + Math.cos(an) * R * 1.04, cy + Math.sin(an) * R * 1.04); g.lineTo(cx + Math.cos(an) * (R * 1.04 + L), cy + Math.sin(an) * (R * 1.04 + L)); g.stroke(); }
      const im = cv.nextElementSibling; if (im) im.style.transform = `translate(-50%, -50%) scale(${(1 + a.bass * 0.08 + a.beat * 0.05).toFixed(3)})`;
    },
    blob(g, w, h, a, A, B, t) {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3 * (1 + a.bass * 0.25), n = 64;
      g.beginPath();
      for (let i = 0; i <= n; i++) { const an = (i / n) * TAU, k = a.bins[Math.floor(((i % n) / n) * 24)] || 0, r = R * (1 + k * 0.45 + Math.sin(an * 3 + t * 0.002) * 0.05); const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5); gr.addColorStop(0, rgba(B, 0.95)); gr.addColorStop(1, rgba(A, 0.6)); g.fillStyle = gr; g.shadowColor = rgba(B); g.shadowBlur = R * 0.4; g.fill(); g.shadowBlur = 0;
    },
    vu(g, w, h, a, A, B, t, cv) {
      cv._v = (cv._v || 0) * 0.8 + Math.min(1, a.level * 2.2) * 0.2;
      const cx = w / 2, cy = h * 0.92, R = Math.min(w * 0.46, h * 0.85);
      g.lineWidth = Math.max(2, R * 0.06); g.lineCap = 'butt';
      g.strokeStyle = rgba(mix(A, B, 0.5), 0.5); g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.7); g.stroke();
      g.strokeStyle = 'rgba(255,80,90,.85)'; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.7, Math.PI * 1.85); g.stroke();
      g.lineWidth = Math.max(1, R * 0.015); g.strokeStyle = 'rgba(255,255,255,.6)';
      for (let i = 0; i <= 10; i++) { const an = Math.PI * (1.15 + 0.07 * i); g.beginPath(); g.moveTo(cx + Math.cos(an) * R * 0.88, cy + Math.sin(an) * R * 0.88); g.lineTo(cx + Math.cos(an) * R * 0.8, cy + Math.sin(an) * R * 0.8); g.stroke(); }
      const an = Math.PI * (1.15 + 0.7 * cv._v);
      g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, R * 0.025); g.shadowColor = rgba(B); g.shadowBlur = R * 0.1;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * R * 0.95, cy + Math.sin(an) * R * 0.95); g.stroke(); g.shadowBlur = 0;
      g.fillStyle = rgba(A); g.beginPath(); g.arc(cx, cy, R * 0.07, 0, TAU); g.fill();
    },
    level(g, w, h, a, A, B) { const n = 20, sh = h / n, lit = Math.round(Math.min(1, a.level * 2.2) * n); for (let i = 0; i < n; i++) { g.fillStyle = i < lit ? (i > n * 0.8 ? 'rgba(255,80,90,.95)' : rgba(mix(A, B, i / n))) : 'rgba(255,255,255,.08)'; g.fillRect(w * 0.1, h - (i + 1) * sh + 2, w * 0.8, sh - 4); } },
    beat(g, w, h, a, A, B) { const r = Math.min(w, h) * (0.22 + a.beat * 0.22); const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r * 1.6); gr.addColorStop(0, rgba(mix(B, [255, 255, 255], 0.4))); gr.addColorStop(0.5, rgba(A, 0.6)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
    analog(g, w, h, a, A, B) {
      const d = new Date(), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46, s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
      g.lineWidth = R * 0.03; g.strokeStyle = rgba(mix(A, B, 0.5), 0.6); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
      for (let i = 0; i < 60; i++) { const an = (i / 60) * TAU, big = i % 5 === 0; g.strokeStyle = big ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.25)'; g.lineWidth = big ? R * 0.03 : R * 0.012; g.beginPath(); g.moveTo(cx + Math.sin(an) * R * (big ? 0.82 : 0.88), cy - Math.cos(an) * R * (big ? 0.82 : 0.88)); g.lineTo(cx + Math.sin(an) * R * 0.94, cy - Math.cos(an) * R * 0.94); g.stroke(); }
      const hand = (v, len, wd, col) => { const an = v * TAU; g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - Math.sin(an) * R * 0.1, cy + Math.cos(an) * R * 0.1); g.lineTo(cx + Math.sin(an) * R * len, cy - Math.cos(an) * R * len); g.stroke(); };
      hand(hr / 12, 0.5, R * 0.06, '#fff'); hand(m / 60, 0.75, R * 0.04, '#fff'); hand(s / 60, 0.85, R * 0.015, rgba(B));
      g.fillStyle = rgba(B); g.beginPath(); g.arc(cx, cy, R * 0.04, 0, TAU); g.fill();
    },
    ringclock(g, w, h, a, A, B) {
      const d = new Date(), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, s = d.getSeconds() + d.getMilliseconds() / 1000;
      g.lineWidth = R * 0.07; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
      const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); gr.addColorStop(0, rgba(A)); gr.addColorStop(1, rgba(B));
      g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (s / 60) * TAU); g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `200 ${R * 0.55}px "Segoe UI", sans-serif`; g.fillText(hm(d), cx, cy);
    },
    binary(g, w, h, a, A, B) {
      const d = new Date(), digits = `${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`, cw = w / 6, rh = h / 4, r = Math.min(cw, rh) * 0.32;
      for (let c = 0; c < 6; c++) for (let b = 0; b < 4; b++) { const on = (+digits[c] >> b) & 1; g.fillStyle = on ? rgba(mix(A, B, c / 5)) : 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(c * cw + cw / 2 + (c > 1 ? cw * 0.0 : 0), h - (b + 0.5) * rh, r, 0, TAU); g.fill(); }
    },
    orb(g, w, h, a, A, B, t) { const R = Math.min(w, h) * (0.32 + Math.sin(t * 0.0015) * 0.03 + a.bass * 0.08); const gr = g.createRadialGradient(w / 2 - R * 0.3, h / 2 - R * 0.3, R * 0.05, w / 2, h / 2, R * 1.5); gr.addColorStop(0, rgba(mix(B, [255, 255, 255], 0.5))); gr.addColorStop(0.45, rgba(A, 0.85)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
    rings(g, w, h, a, A, B, t) { const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.45; g.lineCap = 'round'; for (let k = 0; k < 3; k++) { const r = R * (1 - k * 0.25), st = t * 0.001 * (k % 2 ? -1 : 1) * (1 + k * 0.4); g.lineWidth = R * 0.05; g.strokeStyle = rgba(mix(A, B, k / 2), 0.9); g.beginPath(); g.arc(cx, cy, r, st, st + Math.PI * (0.7 + k * 0.3)); g.stroke(); g.strokeStyle = rgba(mix(A, B, k / 2), 0.15); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); } },
    spinner(g, w, h, a, A, B, t) { const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4, st = t * 0.004; const gr = g.createConicGradient ? g.createConicGradient(st, cx, cy) : null; if (gr) { gr.addColorStop(0, rgba(A, 0)); gr.addColorStop(0.8, rgba(B)); gr.addColorStop(1, rgba(B, 0)); } g.strokeStyle = gr || rgba(B); g.lineWidth = R * 0.14; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, R, st, st + Math.PI * 1.6); g.stroke(); },
    polygon(g, w, h, a, A, B, t) { const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.45; for (let k = 0; k < 4; k++) { const n = 3 + k, r = R * (1 - k * 0.2), rot = t * 0.0004 * (k % 2 ? -1 : 1); g.strokeStyle = rgba(mix(A, B, k / 3), 0.85); g.lineWidth = Math.max(1.5, R * 0.025); g.beginPath(); for (let i = 0; i <= n; i++) { const an = rot + (i / n) * TAU; const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } },
    cube(g, w, h, a, A, B, t) {
      const cx = w / 2, cy = h / 2, S2 = Math.min(w, h) * 0.26, ax = t * 0.0007, ay = t * 0.0011;
      const P = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z]))).map(([x, y, z]) => { let y1 = y * Math.cos(ax) - z * Math.sin(ax), z1 = y * Math.sin(ax) + z * Math.cos(ax); const x1 = x * Math.cos(ay) + z1 * Math.sin(ay); z1 = -x * Math.sin(ay) + z1 * Math.cos(ay); const k = 3 / (3 + z1); return [cx + x1 * S2 * k * 1.3, cy + y1 * S2 * k * 1.3]; });
      g.strokeStyle = rgba(B); g.lineWidth = Math.max(1.5, S2 * 0.05); g.shadowColor = rgba(A); g.shadowBlur = S2 * 0.2; g.beginPath();
      for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) { const j = i ^ b; if (j > i) { g.moveTo(...P[i]); g.lineTo(...P[j]); } }
      g.stroke(); g.shadowBlur = 0;
    },
    sparkles(g, w, h, a, A, B, t) { for (let i = 0; i < 40; i++) { const x = ((Math.sin(i * 91.7) + 1) / 2) * w, y = ((Math.sin(i * 47.3 + 1) + 1) / 2) * h, k = Math.max(0, Math.sin(t * 0.002 + i * 1.7)), r = Math.min(w, h) * 0.035 * k; if (r < 0.5) continue; g.fillStyle = rgba(i % 2 ? A : mix(B, [255, 255, 255], 0.4), k); g.beginPath(); g.moveTo(x, y - r * 2); g.lineTo(x + r * 0.4, y - r * 0.4); g.lineTo(x + r * 2, y); g.lineTo(x + r * 0.4, y + r * 0.4); g.lineTo(x, y + r * 2); g.lineTo(x - r * 0.4, y + r * 0.4); g.lineTo(x - r * 2, y); g.lineTo(x - r * 0.4, y - r * 0.4); g.fill(); } },
    dotwave(g, w, h, a, A, B, t) { const cols = 28, rows = 8, dw = w / cols, dh = h / rows; for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) { const k = (Math.sin(i * 0.45 + r * 0.6 - t * 0.003) + 1) / 2; g.fillStyle = rgba(mix(A, B, k), 0.25 + k * 0.75); g.beginPath(); g.arc(i * dw + dw / 2, r * dh + dh / 2, Math.min(dw, dh) * (0.12 + k * 0.25), 0, TAU); g.fill(); } },
    sine(g, w, h, a, A, B, t) { for (let k = 0; k < 4; k++) { g.strokeStyle = rgba(mix(A, B, k / 3), 0.85 - k * 0.15); g.lineWidth = Math.max(1.5, h * 0.03); g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h / 2 + Math.sin(x * 0.02 * (1 + k * 0.3) + t * 0.002 * (1 + k * 0.2)) * h * 0.35 * (1 - k * 0.15); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } },
    loader(g, w, h, a, A, B, t) { const r = h / 2; g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill(); const k = (t % 2600) / 2600, x0 = (k * 1.6 - 0.4) * w; const gr = g.createLinearGradient(x0, 0, x0 + w * 0.4, 0); gr.addColorStop(0, rgba(A, 0)); gr.addColorStop(0.5, rgba(B)); gr.addColorStop(1, rgba(A, 0)); g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill(); },
  };
  // vászon-alapú és zenére reagáló komponensek: képkockánként
  function drawViz(t) {
    if (!layer) return;
    const a = AU;
    for (const el of layer.children) {
      const c = el.firstChild && el.firstChild.firstChild;
      if (!c) continue;
      if (state.audio && el.classList.contains('sw-react')) c.style.transform = `scale(${(1 + a.bass * 0.14 + a.beat * 0.07).toFixed(3)})`;
      else if (c.style.transform) c.style.transform = '';
      for (const cv of c.querySelectorAll('canvas.sw-viz')) {
        const k = Math.min(window.devicePixelRatio || 1, 1.5), cw = Math.round(cv.clientWidth * k), ch = Math.round(cv.clientHeight * k);
        if (!cw || !ch) continue;
        if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
        const g = cv.getContext('2d'), fn = DRAW[cv.dataset.v];
        g.clearRect(0, 0, cw, ch);
        if (fn) try { fn(g, cw, ch, a, state.A, state.B, t, cv); } catch { /* egy elem hibája ne állítsa meg a többit */ }
      }
    }
  }

  let raf = 0, cur = null, state = null, last = 0, canvas = null, ctx = null, clockEl = null, scene = null, vw = 0, vh = 0, ro = null, onRender = null;
  function size() {
    if (!canvas) return;
    const k = Math.min(window.devicePixelRatio || 1, 1.5);
    vw = canvas.clientWidth || innerWidth; vh = canvas.clientHeight || innerHeight;
    const W2 = Math.round(vw * k), H2 = Math.round(vh * k);
    if (canvas.width !== W2 || canvas.height !== H2) { canvas.width = W2; canvas.height = H2; if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W2, H2); } if (cur && state) cur.init(state, vw, vh); }
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - last < 32) return; // ~30 fps
    const dt = Math.min(80, last ? ts - last : 33);
    last = ts;
    if (state.audio) audioTick(ts, dt);
    const k = canvas.width / (vw || 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    try { cur.frame(ctx, vw, vh, ts, dt, state); } catch { /* egy kímélő hibája ne állítsa meg a többit */ }
    drawViz(ts);
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }
  const BLACK = { id: 'black', name: 'Fekete', init() {}, frame(c, w, h) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); } };
  const findBg = (id) => (id === 'black' ? BLACK : LIST.find((x) => x.id === id));
  function setBg(id) {
    cur = findBg(id) || LIST[Math.floor(Math.random() * LIST.length)];
    if (!state) return cur;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    cur.init(state, vw, vh);
    syncAudio();
    if (clockEl) clockEl.classList.toggle('hidden', cur.id === 'clock' || !!scene);
    return cur;
  }
  function syncAudio() {
    if (!state) return;
    state.audio = needsAudio(scene, cur);
    if (state.audio) audioOn(); else audioOff();
  }
  // id: kímélő id | jelenet id | 'random' · vagy jelenet objektum (saját) · wl: a komponensek rétege
  // opts.editor: üres komponens helyén is látszik egy felirat (a szerkesztőben kijelölhető legyen); opts.onRender
  function start(id, cv, clock, wl, opts = {}) {
    stop();
    canvas = cv; ctx = canvas.getContext('2d'); clockEl = clock || null; layer = wl || null; editor = !!opts.editor; onRender = opts.onRender || null;
    scene = typeof id === 'object' && id ? id : SCENES.find((x) => x.id === id) || null;
    if (!scene && id === 'random' && Math.random() < SCENES.length / (SCENES.length + LIST.length)) scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    if (scene) (scene.widgets || (scene.widgets = [])).forEach(norm);
    state = { A: hexRgb(css('--a1', '#7c3aed')), B: hexRgb(css('--a2', '#22d3ee')), au: AU, audio: false };
    size();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    setBg(scene ? scene.bg : id);
    if (layer) { layer.replaceChildren(); if (scene) { layout(); renderWidgets(); wTimer = setInterval(renderWidgets, 1000); } }
    last = 0;
    raf = requestAnimationFrame(loop);
    ro = new ResizeObserver(() => size()); ro.observe(canvas);
    return cur;
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0; clearInterval(wTimer); wTimer = 0;
    if (ro) { ro.disconnect(); ro = null; }
    audioOff();
    state = null; if (layer) layer.replaceChildren();
    scene = null; onRender = null;
  }
  const isMusic = (id) => { const sc = SCENES.find((x) => x.id === id); const bg = findBg(id); return !!((sc && sc.music) || (bg && bg.music)); };
  return {
    LIST, SCENES, WIDGETS, CATS, SCENE_CATS, BG_CATS, ANIM, COLOR, ALIGN, norm, isMusic, needsAudio, start, stop, setBg, layout, syncAudio,
    refresh: () => renderWidgets(),
    el: (i) => (layer ? layer.children[i] : null),
    audioLive: () => AU.live,
  };
})();
