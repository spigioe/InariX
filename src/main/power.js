'use strict';
// Windows energiaséma: fedél művelet (LIDACTION) és ébredéskori zárolás (CONSOLELOCK).
// 0 = semmit, 1 = alvás, 2 = hibernálás, 3 = leállítás
const { run } = require('../core/util');

// `powercfg /q` kimenet: az utolsó két "...: 0x0000000N" sor a töltős (AC) és akkus (DC) érték. Nyelvfüggetlen.
function parseIndex(stdout) {
  const m = [...String(stdout).matchAll(/:\s*0x([0-9a-f]+)\s*$/gim)];
  if (m.length < 2) return null; // a gépen nincs ilyen beállítás (pl. asztali gép, nincs fedél)
  return { ac: parseInt(m[m.length - 2][1], 16), dc: parseInt(m[m.length - 1][1], 16) };
}

async function readIndex(sub, setting) {
  const r = await run('powercfg', ['/q', 'SCHEME_CURRENT', sub, setting]);
  return parseIndex(r.stdout);
}

async function writeIndex(sub, setting, { ac, dc }) {
  await run('powercfg', ['/setacvalueindex', 'SCHEME_CURRENT', sub, setting, String(ac)]);
  await run('powercfg', ['/setdcvalueindex', 'SCHEME_CURRENT', sub, setting, String(dc)]);
  await run('powercfg', ['/setactive', 'SCHEME_CURRENT']);
}

const getLidAction = () => readIndex('SUB_BUTTONS', 'LIDACTION');
const setLidAction = (v) => writeIndex('SUB_BUTTONS', 'LIDACTION', v);
const getConsoleLock = () => readIndex('SUB_NONE', 'CONSOLELOCK');
const setConsoleLock = (on) => writeIndex('SUB_NONE', 'CONSOLELOCK', { ac: on ? 1 : 0, dc: on ? 1 : 0 });

// ---------- Zárolás ("Ne kérjen PIN-t") ----------
// Három helyen dől el, hogy a Windows zárol-e:
//  - CONSOLELOCK (energiaséma): klasszikus S3 alvásból ébredés
//  - HKCU\Control Panel\Desktop\DelayLockInterval: Modern Standby-os laptopok ("Ha távol voltál, mikor kérjen bejelentkezést?")
//    0xFFFFFFFF = soha; ha nincs érték, a Windows alapértelmezése (ébredéskor) érvényes
//  - ScreenSaverIsSecure: a képernyővédő zároljon-e
const DESK = process.env.INARIX_TEST_LOCK_KEY || 'HKCU\\Control Panel\\Desktop'; // tesztben felülírható
const SKIP_POWERCFG = !!process.env.INARIX_TEST_LOCK_KEY;
const NEVER = 4294967295;

async function regGet(key, name) {
  const r = await run('reg', ['query', key, '/v', name]);
  if (r.code !== 0) return null;
  const m = r.stdout.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.*)`, 'i'));
  return m ? m[1].trim() : null;
}
const regSet = (key, name, type, value) => run('reg', ['add', key, '/v', name, '/t', type, '/d', String(value), '/f']);
const regDel = (key, name) => run('reg', ['delete', key, '/v', name, '/f']);
const dword = (v) => (v == null ? null : Number(v));

async function getLockState() {
  const [consoleLock, delay, ss, autoLogon, helloOnly, policy] = await Promise.all([
    getConsoleLock().catch(() => null),
    regGet(DESK, 'DelayLockInterval'),
    regGet(DESK, 'ScreenSaverIsSecure'),
    regGet('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoAdminLogon'),
    regGet('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\PasswordLess\\Device', 'DevicePasswordLessBuildVersion'),
    regGet('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'InactivityTimeoutSecs'),
  ]);
  const d = dword(delay);
  return {
    consoleLock,                                       // { ac, dc } vagy null
    wakeLockNever: d === NEVER,                        // Modern Standby: soha ne kérjen
    delayLock: d,
    screenSaverSecure: ss === '1',
    autoLogon: autoLogon === '1',
    helloOnly: dword(helloOnly) === 2,                 // "csak Windows Hello" – ilyenkor az automatikus bejelentkezés nem működik
    policyTimeout: dword(policy) || 0,                 // céges házirend inaktivitási zárolás (mp)
  };
}

// Zárolás kikapcsolása. Visszaadja az eredeti értékeket (konfigba mentjük a visszaállításhoz).
async function disableLock(saved) {
  const orig = saved || {
    consoleLock: SKIP_POWERCFG ? null : await getConsoleLock().catch(() => null),
    delayLock: dword(await regGet(DESK, 'DelayLockInterval')),
    ss: await regGet(DESK, 'ScreenSaverIsSecure'),
  };
  if (!SKIP_POWERCFG) await setConsoleLock(false).catch(() => {});
  await regSet(DESK, 'DelayLockInterval', 'REG_DWORD', NEVER);
  await regSet(DESK, 'ScreenSaverIsSecure', 'REG_SZ', '0');
  return orig;
}

async function restoreLock(orig) {
  if (!SKIP_POWERCFG) {
    if (orig && orig.consoleLock) await writeIndex('SUB_NONE', 'CONSOLELOCK', orig.consoleLock).catch(() => {});
    else await setConsoleLock(true).catch(() => {});
  }
  if (!orig || orig.delayLock == null) await regDel(DESK, 'DelayLockInterval');
  else await regSet(DESK, 'DelayLockInterval', 'REG_DWORD', orig.delayLock);
  if (orig && orig.ss != null) await regSet(DESK, 'ScreenSaverIsSecure', 'REG_SZ', orig.ss);
}

module.exports = { getLidAction, setLidAction, getConsoleLock, setConsoleLock, parseIndex, getLockState, disableLock, restoreLock, regGet, regSet, regDel };
