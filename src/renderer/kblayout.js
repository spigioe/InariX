'use strict';
// Billentyűzetkiosztás: automatikus felismerés (navigator.keyboard.getLayoutMap) vagy kézi választás.
// A gyorsbillentyűk a billentyűre NYOMTATOTT betű szerint működnek (magyar QWERTZ-en az Y a Z helyén van),
// és ugyanez a kiosztás jelenik meg a képernyő-billentyűzeten.
const KbLayout = (() => {
  const NAMES = { us: 'Angol (QWERTY)', hu: 'Magyar (QWERTZ)', de: 'Német (QWERTZ)', fr: 'Francia (AZERTY)' };
  // fizikai billentyű → nyomtatott betű, ahol eltér a QWERTY-től
  const SWAP = {
    us: {},
    hu: { KeyY: 'z', KeyZ: 'y' },
    de: { KeyY: 'z', KeyZ: 'y' },
    fr: { KeyQ: 'a', KeyA: 'q', KeyW: 'z', KeyZ: 'w', Semicolon: 'm', KeyM: ',' },
  };
  const D = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const SYM = [':', '/', '\\', '_', '@', '"', '(', ')', '!', '?'];
  const OSK = {
    hu: [[...D, 'ö', 'ü', 'ó'], ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ő', 'ú'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'é', 'á', 'ű'], ['⇧', 'í', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', '⌫']],
    us: [[...D, '-', '='], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"], ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', '⌫']],
    de: [[...D, 'ß'], ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'], ['⇧', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', '⌫']],
    fr: [[...D, 'é', 'è', 'à', 'ç'], ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'ù'], ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'], ['⇧', 'w', 'x', 'c', 'v', 'b', 'n', ',', '.', '-', '⌫']],
  };
  let detected = 'us', setting = 'auto';

  async function detect() {
    try {
      const m = await navigator.keyboard.getLayoutMap();
      const g = (c) => m.get(c);
      if (g('Digit0') === 'ö' || g('BracketLeft') === 'ő') detected = 'hu';
      else if (g('KeyQ') === 'a') detected = 'fr';
      else if (g('KeyY') === 'z') detected = 'de';
      else detected = 'us';
    } catch { /* nem elérhető: marad az előző */ }
    return detected;
  }
  detect();
  // a Windows kiosztás futás közben is váltható (Win+Szóköz)
  if (navigator.keyboard && navigator.keyboard.addEventListener) navigator.keyboard.addEventListener('layoutchange', detect);
  window.addEventListener('focus', () => { detect(); });

  const active = () => (setting === 'auto' ? detected : (SWAP[setting] ? setting : 'us'));
  return {
    NAMES,
    set(v) { setting = v || 'auto'; },
    get setting() { return setting; },
    active,
    detected: () => detected,
    detect,
    // a lenyomott billentyű nyomtatott betűje (kisbetű) – automatikus módban a Windows által adott karakter
    letter(e) {
      if (!/^Key[A-Z]$|^Semicolon$/.test(e.code)) return null;
      if (setting === 'auto' && e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) return e.key.toLowerCase();
      const L = SWAP[active()];
      return L[e.code] || (e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : null);
    },
    oskRows() { return [...OSK[active()].map((r) => [...r]), SYM, ['␣', '✓']]; },
  };
})();
