'use strict';
// "Ne kérjen PIN-t" beállítás tesztje egy ártalmatlan registry kulcson (a valódi beállításokhoz nem nyúl).
const assert = require('assert');
const { execFileSync } = require('child_process');

const KEY = 'HKCU\\Software\\InariXLockTest';
process.env.INARIX_TEST_LOCK_KEY = KEY;
const p = require('../src/main/power');

const reset = () => { try { execFileSync('reg', ['delete', KEY, '/f'], { stdio: 'ignore' }); } catch { /* nincs */ } };
let ok = 0, bad = 0;
async function t(name, fn) {
  try { reset(); await fn(); ok++; console.log(`  ✓ ${name}`); } catch (e) { bad++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

(async () => {
  console.log('Zárolás (PIN) beállítás tesztek\n');

  await t('Alapállapotból (nincs érték): kikapcsolás → soha, visszaállítás → érték törölve', async () => {
    const orig = await p.disableLock(null);
    assert.strictEqual(Number(await p.regGet(KEY, 'DelayLockInterval')), 4294967295);
    assert.strictEqual(await p.regGet(KEY, 'ScreenSaverIsSecure'), '0');
    assert.strictEqual(orig.delayLock, null);
    await p.restoreLock(orig);
    assert.strictEqual(await p.regGet(KEY, 'DelayLockInterval'), null);
  });

  await t('Egyedi eredeti érték (15 perc) és zároló képernyővédő pontosan visszaáll', async () => {
    await p.regSet(KEY, 'DelayLockInterval', 'REG_DWORD', 900);
    await p.regSet(KEY, 'ScreenSaverIsSecure', 'REG_SZ', '1');
    const orig = await p.disableLock(null);
    assert.deepStrictEqual({ d: orig.delayLock, s: orig.ss }, { d: 900, s: '1' });
    await p.restoreLock(orig);
    assert.strictEqual(Number(await p.regGet(KEY, 'DelayLockInterval')), 900);
    assert.strictEqual(await p.regGet(KEY, 'ScreenSaverIsSecure'), '1');
  });

  await t('Ismételt kikapcsolás a mentett eredetit használja (nem a már módosított értéket)', async () => {
    await p.regSet(KEY, 'DelayLockInterval', 'REG_DWORD', 60);
    const first = await p.disableLock(null);
    const second = await p.disableLock(first); // pl. újra dokkolás
    assert.strictEqual(second.delayLock, 60);
    await p.restoreLock(second);
    assert.strictEqual(Number(await p.regGet(KEY, 'DelayLockInterval')), 60);
  });

  reset();
  console.log(`\n${ok} sikeres, ${bad} sikertelen`);
  process.exit(bad ? 1 : 0);
})();
