'use strict';
// UI hangok WebAudio szintetizátorral (nincs szükség hangfájlokra).
const Sound = (() => {
  let ctx = null;
  let enabled = true;
  const ac = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  function tone(freq, start, dur, { type = 'sine', vol = 0.08, slide = 0 } = {}) {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, c.currentTime + start + dur);
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.05);
  }
  const play = (fn) => { if (!enabled) return; try { fn(); } catch { /* audio nem elérhető */ } };
  return {
    setEnabled(v) { enabled = !!v; },
    move: () => play(() => tone(1400, 0, 0.035, { type: 'triangle', vol: 0.035 })),
    select: () => play(() => { tone(880, 0, 0.07, { vol: 0.06 }); tone(1320, 0.05, 0.1, { vol: 0.05 }); }),
    back: () => play(() => tone(700, 0, 0.09, { vol: 0.05, slide: 0.6 })),
    tab: () => play(() => tone(1100, 0, 0.05, { type: 'triangle', vol: 0.045 })),
    error: () => play(() => { tone(220, 0, 0.12, { type: 'square', vol: 0.03 }); tone(180, 0.1, 0.15, { type: 'square', vol: 0.03 }); }),
    boot: () => play(() => {
      // lassú szintipad + csillogó arpeggio
      [196, 293.66, 392].forEach((f) => tone(f, 0.15, 2.6, { vol: 0.035 }));
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 1.2 + i * 0.09, 1.4, { type: 'triangle', vol: 0.045 }));
      tone(2093, 1.75, 1.8, { vol: 0.02 });
    }),
  };
})();
