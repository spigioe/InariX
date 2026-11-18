'use strict';
/* global $, h, S, gamo, Nav, OSK, Sound, toast, modal, confirmBox, renderRows, rowCycle, applyState, renderLibrary, renderSettings */
// ================= Témakezelő =================

const FONTS = {
  segoe: ['Segoe UI', '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif'],
  bahn: ['Bahnschrift', 'Bahnschrift, "Segoe UI", sans-serif'],
  trebuchet: ['Trebuchet', '"Trebuchet MS", "Segoe UI", sans-serif'],
  verdana: ['Verdana', 'Verdana, "Segoe UI", sans-serif'],
  georgia: ['Georgia', 'Georgia, "Times New Roman", serif'],
  cons: ['Consolas', 'Consolas, "Cascadia Mono", monospace'],
};
const PALETTE = [
  ['#7c3aed', 'Lila'], ['#a855f7', 'Ibolya'], ['#ec4899', 'Rózsaszín'], ['#ef4444', 'Piros'], ['#f97316', 'Narancs'],
  ['#f59e0b', 'Borostyán'], ['#facc15', 'Sárga'], ['#84cc16', 'Lime'], ['#22c55e', 'Zöld'], ['#10b981', 'Smaragd'],
  ['#14b8a6', 'Türkiz'], ['#22d3ee', 'Cián'], ['#3b82f6', 'Kék'], ['#1d4ed8', 'Mélykék'], ['#ff00e5', 'Neon pink'],
  ['#00ffa3', 'Neon zöld'], ['#e4e4e7', 'Ezüst'], ['#ffffff', 'Fehér'],
  ['#107c10', 'Xbox zöld'], ['#5dc21e', 'Világos zöld'], ['#0070d1', 'PlayStation kék'], ['#4fa3ff', 'Égkék'],
];
const BG_COLORS = [['#05060a', 'Éjsötét'], ['#000000', 'Fekete'], ['#0b1020', 'Tengerészkék'], ['#0f0a1a', 'Mélylila'], ['#070012', 'Ultraviola'],
  ['#07120c', 'Sötétzöld'], ['#0c0a05', 'Sötétbarna'], ['#111111', 'Grafit'], ['#1a1a1f', 'Palaszürke'],
  ['#101010', 'Antracit'], ['#00091a', 'Éjkék']];
const PANEL_COLORS = [['#12141e', 'Alap'], ['#0d0d12', 'Mély'], ['#1b1e2b', 'Világosabb'], ['#140726', 'Lila'], ['#0f1a12', 'Zöld'],
  ['#1c1709', 'Barna'], ['#18181b', 'Szürke'], ['#0f1c2e', 'Kék'], ['#2a2a2a', 'Középszürke'], ['#0b1a33', 'Sötétkék']];
const BG_MODES = [['art', 'Játék háttérkép'], ['gradient', 'Mozgó színátmenet'], ['solid', 'Egyszínű'], ['image', 'Saját kép'], ['scanlines', 'Retro CRT']];

const THEME_PRESETS = [
  // A két nagy konzol alapértelmezett felületének hangulata (színek, formák) – logók és védett elemek nélkül
  { id: 'xbox', name: 'Xbox stílus', a1: '#107c10', a2: '#5dc21e', bg: '#101010', panel: '#2a2a2a', bgMode: 'art', bgDim: 40, radius: 3, font: 'segoe', tiles: 'square', glow: false },
  { id: 'ps5', name: 'PS5 stílus', a1: '#0070d1', a2: '#4fa3ff', bg: '#00091a', panel: '#0b1a33', bgMode: 'art', bgDim: 15, radius: 12, font: 'segoe', tiles: 'square', grow: 'big', glow: true },
  { id: 'aurora', name: 'Aurora', a1: '#7c3aed', a2: '#22d3ee', bg: '#05060a', panel: '#12141e', bgMode: 'art', bgDim: 10, radius: 14, font: 'segoe', tiles: 'portrait', glow: false },
  { id: 'ocean', name: 'Óceán', a1: '#1d4ed8', a2: '#22d3ee', bg: '#0b1020', panel: '#0f1c2e', bgMode: 'art', bgDim: 15, radius: 14, font: 'segoe', tiles: 'portrait', glow: false },
  { id: 'emerald', name: 'Smaragd', a1: '#10b981', a2: '#84cc16', bg: '#07120c', panel: '#0f1a12', bgMode: 'art', bgDim: 15, radius: 14, font: 'segoe', tiles: 'portrait', glow: false },
  { id: 'sunset', name: 'Naplemente', a1: '#f97316', a2: '#ec4899', bg: '#0f0a1a', panel: '#1b1e2b', bgMode: 'gradient', bgDim: 0, radius: 18, font: 'trebuchet', tiles: 'portrait', glow: true },
  { id: 'crimson', name: 'Bíbor', a1: '#ef4444', a2: '#f59e0b', bg: '#0c0a05', panel: '#1c1709', bgMode: 'art', bgDim: 20, radius: 10, font: 'bahn', tiles: 'portrait', glow: false },
  { id: 'mono', name: 'Grafit', a1: '#52525b', a2: '#e4e4e7', bg: '#111111', panel: '#18181b', bgMode: 'solid', bgDim: 0, radius: 8, font: 'segoe', tiles: 'portrait', glow: false },
  { id: 'neon', name: 'Neon', a1: '#ff00e5', a2: '#00ffa3', bg: '#070012', panel: '#140726', bgMode: 'gradient', bgDim: 0, radius: 4, font: 'bahn', tiles: 'portrait', glow: true },
  { id: 'retro', name: 'Retro CRT', a1: '#f59e0b', a2: '#84cc16', bg: '#0c0a05', panel: '#1c1709', bgMode: 'scanlines', bgDim: 0, radius: 0, font: 'cons', tiles: 'landscape', glow: true },
  { id: 'midnight', name: 'Éjfél', a1: '#3b82f6', a2: '#a855f7', bg: '#000000', panel: '#0d0d12', bgMode: 'solid', bgDim: 0, radius: 22, font: 'segoe', tiles: 'portrait', glow: false },
  { id: 'cinema', name: 'Mozi', a1: '#facc15', a2: '#ffffff', bg: '#000000', panel: '#111111', bgMode: 'art', bgDim: 0, radius: 6, font: 'georgia', tiles: 'landscape', glow: false },
  { id: 'forest', name: 'Erdő', a1: '#22c55e', a2: '#facc15', bg: '#07120c', panel: '#0f1a12', bgMode: 'art', bgDim: 30, radius: 12, font: 'georgia', tiles: 'portrait', glow: false },
  { id: 'arctic', name: 'Sarkvidék', a1: '#14b8a6', a2: '#e4e4e7', bg: '#0b1020', panel: '#1b1e2b', bgMode: 'gradient', bgDim: 0, radius: 20, font: 'verdana', tiles: 'portrait', glow: false },
];
const THEME_KEYS = ['name', 'a1', 'a2', 'bg', 'panel', 'bgMode', 'bgImage', 'bgDim', 'radius', 'font', 'tiles', 'grow', 'tileIn', 'tileFx', 'glow'];

const themeList = () => [...THEME_PRESETS, ...((S.state && S.state.settings.themes) || [])];
function activeTheme() {
  const ui = S.state ? S.state.settings.ui : {};
  const id = ui.theme || ui.accent || 'aurora';
  return themeList().find((t) => t.id === id) || THEME_PRESETS[0];
}
const currentThemeName = () => activeTheme().name;
const isPreset = (t) => THEME_PRESETS.some((p) => p.id === t.id);

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function toImageUrl(p) {
  if (!p) return '';
  if (/^[a-z]:[\\/]/i.test(p)) return `file:///${p.replace(/\\/g, '/')}`;
  return p;
}

let lastTiles = null;
function applyTheme(t) {
  const r = document.documentElement.style;
  r.setProperty('--a1', t.a1);
  r.setProperty('--a2', t.a2);
  r.setProperty('--bg', t.bg);
  r.setProperty('--panel-solid', t.panel);
  r.setProperty('--panel', hexA(t.panel, 0.74));
  r.setProperty('--rs', String((t.radius ?? 14) / 14));
  r.setProperty('--font', (FONTS[t.font] || FONTS.segoe)[1]);
  r.setProperty('--bg-dim', String((t.bgDim || 0) / 100));
  const b = document.body;
  b.dataset.bgmode = t.bgMode || 'art';
  b.dataset.tiles = t.tiles || 'portrait';
  b.dataset.grow = t.grow || 'wide';
  b.dataset.tileIn = t.tileIn || 'zoom';
  b.dataset.tileFx = t.tileFx || 'both';
  b.classList.toggle('glow', !!t.glow);
  const custom = $('#bg-custom');
  if (custom) custom.style.backgroundImage = t.bgMode === 'image' && t.bgImage ? `url("${toImageUrl(t.bgImage)}")` : '';
  // csempe forma váltásakor újra kell rajzolni a könyvtárat (más borítókép kell)
  if (lastTiles !== null && lastTiles !== b.dataset.tiles && typeof refreshLibViews === 'function') refreshLibViews();
  lastTiles = b.dataset.tiles;
}

function themePreview(t) {
  return h('div', { class: 'tp-prev', style: `background:${t.bg}; font-family:${(FONTS[t.font] || FONTS.segoe)[1]}; border-radius:${(t.radius ?? 14) * 0.6}px` },
    h('div', { class: 'tp-bar', style: `background:linear-gradient(90deg, ${t.a1}, ${t.a2})` }),
    h('div', { class: 'tp-tiles' }, [0, 1, 2].map((i) => h('div', {
      class: 'tp-tile',
      style: `background:${i === 0 ? `linear-gradient(135deg, ${t.a1}, ${t.a2})` : t.panel}; border-radius:${(t.radius ?? 14) * 0.35}px; aspect-ratio:${t.tiles === 'landscape' ? '16/9' : t.tiles === 'square' ? '1/1' : '2/3'};${i === 0 && t.glow ? ` box-shadow:0 0 10px ${t.a2}` : ''}`,
    }))),
    h('div', { class: 'tp-aa', style: `color:${t.a2}` }, 'Aa'));
}

async function openThemeManager() {
  const active = activeTheme();
  const cards = themeList().map((t) => h('button', { class: `theme-card focusable${t.id === active.id ? ' active' : ''}`, dataset: t.id === active.id ? { default: '1' } : {}, onclick: () => close(t) },
    themePreview(t), h('div', { class: 'tc-name' }, t.name, t.id === active.id ? h('span', { class: 'sel' }, 'AKTÍV') : null, isPreset(t) ? null : h('span', { class: 'tc-own' }, 'saját'))));
  cards.push(h('button', { class: 'theme-card focusable add', onclick: () => close('__new') }, h('div', { class: 'big' }, '＋'), h('div', { class: 'tc-name' }, 'Új téma')));
  cards.push(h('button', { class: 'theme-card focusable add', onclick: () => close('__import') }, h('div', { class: 'big' }, '⭳'), h('div', { class: 'tc-name' }, 'Importálás')));
  const node = h('div', { class: 'theme-grid' }, cards);
  let close;
  const pick = new Promise((res) => { close = (v) => { res(v); document.querySelector('#modal-layer .menu-item')?.click(); }; });
  const closed = modal({ title: 'Témakezelő', node, wide: true, noDefault: true, items: [{ label: 'Bezárás', value: null }] });
  const choice = await Promise.race([pick, closed.then(() => null)]);
  if (!choice) return;
  await new Promise((r) => setTimeout(r, 50));
  if (choice === '__new') return openThemeEditor({ ...activeTheme(), id: null, name: 'Saját téma' });
  if (choice === '__import') return importTheme();
  return themeMenu(choice);
}

async function themeMenu(t) {
  const items = [{ label: 'Alkalmazás', value: 'apply', kind: 'primary' }];
  items.push({ label: isPreset(t) ? 'Testreszabás (másolat)' : 'Szerkesztés', value: 'edit' });
  items.push({ label: 'Exportálás fájlba', value: 'export' });
  if (!isPreset(t)) items.push({ label: 'Törlés', value: 'delete', kind: 'danger' });
  items.push({ label: 'Vissza', value: 'back' });
  const v = await modal({ title: t.name, node: themePreview(t), items });
  if (v === 'apply') { applyState(await gamo.settings({ ui: { theme: t.id } })); toast(`Téma: ${t.name}`, 'ok', 2000); Sound.select(); return openThemeManager(); }
  if (v === 'edit') return openThemeEditor(isPreset(t) ? { ...t, id: null, name: `${t.name} (saját)` } : { ...t });
  if (v === 'export') {
    try { const p = await gamo.themeExport(pickTheme(t)); toast(`Exportálva: ${p}`, 'ok', 7000); } catch (e) { toast(e.message, 'err'); }
    return openThemeManager();
  }
  if (v === 'delete' && await confirmBox('Törlés', `Törlöd a(z) „${t.name}” témát?`, 'Törlés')) {
    const themes = (S.state.settings.themes || []).filter((x) => x.id !== t.id);
    const ui = S.state.settings.ui.theme === t.id ? { theme: 'aurora' } : {};
    applyState(await gamo.settings({ themes, ui }));
    return openThemeManager();
  }
  if (v === 'back') return openThemeManager();
}

const pickTheme = (t) => Object.fromEntries(THEME_KEYS.filter((k) => k in t).map((k) => [k, t[k]]));

async function openThemeEditor(base) {
  const draft = { ...THEME_PRESETS[0], ...base };
  S.themePreview = true;
  const box = h('div', { class: 'theme-editor' }, h('div', { class: 'te-prev' }), h('div', { class: 'te-rows' }));
  const set = (k) => (v) => { draft[k] = v; applyTheme(draft); };
  const rows = () => [
    { type: 'text', label: 'Név', get: () => draft.name, set: set('name') },
    { group: 'Színek' },
    { type: 'select', label: 'Kiemelő szín 1', swatch: true, options: PALETTE, get: () => draft.a1, set: set('a1') },
    { type: 'select', label: 'Kiemelő szín 2', swatch: true, options: PALETTE, get: () => draft.a2, set: set('a2') },
    { type: 'select', label: 'Háttérszín', swatch: true, options: BG_COLORS, get: () => draft.bg, set: set('bg') },
    { type: 'select', label: 'Panelek színe', swatch: true, options: PANEL_COLORS, get: () => draft.panel, set: set('panel') },
    { type: 'toggle', label: 'Ragyogás a kijelölt elemen', get: () => !!draft.glow, set: set('glow') },
    { group: 'Háttér' },
    { type: 'select', label: 'Háttér típusa', options: BG_MODES, get: () => draft.bgMode, set: set('bgMode') },
    draft.bgMode === 'image' ? { type: 'text', label: 'Saját háttérkép', desc: 'Kép URL (https://…) vagy fájl útvonal (pl. C:\\Képek\\hatter.jpg)', get: () => draft.bgImage || '', set: set('bgImage') } : null,
    { type: 'slider', label: 'Háttér sötétítése', get: () => draft.bgDim || 0, step: 10, fmt: (v) => `${v}%`, set: set('bgDim') },
    { group: 'Forma és betű' },
    { type: 'select', label: 'Lekerekítés', options: [[0, 'Szögletes'], [4, 'Enyhe'], [8, 'Kicsi'], [14, 'Közepes'], [20, 'Nagy'], [28, 'Extra']], get: () => draft.radius, set: (v) => set('radius')(Number(v)) },
    { type: 'select', label: 'Betűtípus', options: Object.entries(FONTS).map(([k, [n]]) => [k, n]), get: () => draft.font, set: set('font') },
    { type: 'select', label: 'Csempekép megjelenése', desc: 'Betöltéskor és képváltáskor (pl. a kijelölt csempe kiszélesedésekor)',
      options: [['zoom', 'Ráközelítés'], ['fade', 'Áttűnés'], ['slide', 'Beúszás alulról'], ['blur', 'Élesedés'], ['flip', 'Átfordulás'], ['pop', 'Felpattanás'], ['none', 'Nincs (azonnali)']], get: () => draft.tileIn || 'zoom', set: set('tileIn') },
    { type: 'select', label: 'Kijelölt csempe effekt', options: [['both', 'Fénycsík + lassú nagyítás'], ['sheen', 'Csak fénycsík'], ['kb', 'Csak lassú nagyítás'], ['glow', 'Lüktető fény'], ['tilt', 'Billegés'], ['none', 'Nincs']], get: () => draft.tileFx || 'both', set: set('tileFx') },
    { type: 'select', label: 'Kijelölt csempe (kezdőképernyő)', options: [['wide', 'Oldalirányba nyúlik meg'], ['big', 'Az egész nagyobb lesz']], get: () => draft.grow || 'wide', set: set('grow') },
    { type: 'select', label: 'Játék csempék', options: [['portrait', 'Álló borító (2:3)'], ['square', 'Négyzetes (1:1)'], ['landscape', 'Fekvő borító (16:9)']], get: () => draft.tiles, set: set('tiles') },
  ];
  const rerender = () => {
    box.querySelector('.te-prev').replaceChildren(themePreview(draft));
    renderRows(box.querySelector('.te-rows'), rows(), rerender);
  };
  rerender();
  applyTheme(draft);
  const v = await modal({
    title: draft.id ? `Téma szerkesztése: ${draft.name}` : 'Új téma', node: box, wide: true, noDefault: true,
    items: [{ label: 'Mentés és alkalmazás', value: 'save', kind: 'primary' }, { label: 'Mégse', value: null }],
    handlers: { left: () => rowCycle(-1, rerender), right: () => rowCycle(1, rerender) },
  });
  S.themePreview = false;
  if (v !== 'save') { applyTheme(activeTheme()); return openThemeManager(); }
  const id = draft.id || `t${Date.now().toString(36)}`;
  const theme = { id, ...pickTheme(draft), name: (draft.name || 'Saját téma').trim() };
  const themes = [...(S.state.settings.themes || []).filter((x) => x.id !== id), theme];
  applyState(await gamo.settings({ themes, ui: { theme: id } }));
  toast(`Téma mentve: ${theme.name}`, 'ok');
  if (S.tab === 'settings') renderSettings();
  return openThemeManager();
}

async function importTheme() {
  const p = await OSK.prompt({ title: 'Téma fájl útvonala (.json)', value: '' });
  if (!p) return openThemeManager();
  try {
    const t = await gamo.themeImport(p.trim().replace(/^"|"$/g, ''));
    const theme = { ...THEME_PRESETS[0], ...pickTheme(t), id: `t${Date.now().toString(36)}` };
    applyState(await gamo.settings({ themes: [...(S.state.settings.themes || []), theme], ui: { theme: theme.id } }));
    toast(`Téma importálva: ${theme.name}`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
  return openThemeManager();
}
