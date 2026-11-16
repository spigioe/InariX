'use strict';
// InariX ikonkészlet – egységes design: 24×24 rács, 2 px-es vonal, lekerekített végek és sarkok, kitöltés nélkül.
// Használat: uiIcon('store') → <span class="ui-ico"><svg…></span>; a szín a környezet currentColor-ja.
const UI_ICONS = {
  store: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  hosts: '<rect x="4" y="3" width="16" height="7.5" rx="2"/><rect x="4" y="13.5" width="16" height="7.5" rx="2"/><path d="M8 6.75h.01M8 17.25h.01M12 6.75h4M12 17.25h4"/>',
  music: '<path d="M9 18V5.5l11-2.5v12.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>',
  random: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" stroke-width="2.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  power: '<path d="M12 3v8"/><path d="M6.6 6.6a7.6 7.6 0 1 0 10.8 0"/>',
  sleep: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>',
  logout: '<path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="M9.5 16.5 5 12l4.5-4.5"/><path d="M5 12h10.5"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4.5V9h-4.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  toDesktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M9.5 9.5 12 12l2.5-2.5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  cloud: '<path d="M7 18.5h10.2a4.3 4.3 0 0 0 .5-8.57A6.2 6.2 0 0 0 5.9 9.2 4.7 4.7 0 0 0 7 18.5z"/>',
  running: '<path d="M3 12h4l2.5-6.5 5 13L17 12h4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.8"/><path d="M2.5 19h19"/>',
  layers: '<path d="M12 3.5 21 8.5l-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  hidden: '<path d="M3.5 3.5l17 17"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5.2 0 9 6 9 6a16.5 16.5 0 0 1-2.9 3.5M6.6 7.6C4.3 9.2 3 12 3 12s3.8 6 9 6a9.3 9.3 0 0 0 4.2-1"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>',
  accounts: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.3 0 1.9-1 1.4-2.1-.6-1.3.3-2.6 1.7-2.6H18a3 3 0 0 0 3-3C21 7.6 17 3 12 3z"/><path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01" stroke-width="2.8"/>',
  energy: '<rect x="2.5" y="7" width="16.5" height="10" rx="2.2"/><path d="M21.5 10.5v3"/><path d="M11.5 9 9 12.5h3.5L10 15.5" />',
  stream: '<path d="M3 8.5V6.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-5.5"/><path d="M3 12.5a7 7 0 0 1 7 7M3 16.5a3 3 0 0 1 3 3"/><path d="M3 19.5h.01" stroke-width="2.8"/>',
  gamepad: '<path d="M7 7.5h10a4.5 4.5 0 0 1 4.5 4.5v1.6a3.4 3.4 0 0 1-6.1 2L14.3 14H9.7l-1.1 1.6a3.4 3.4 0 0 1-6.1-2V12A4.5 4.5 0 0 1 7 7.5z"/><path d="M7.5 10.5v3M6 12h3"/><path d="M15.5 11h.01M17.5 13h.01" stroke-width="2.6"/>',
  shield: '<path d="M12 3l7.5 3v5.6c0 4.6-3.2 8-7.5 9.4-4.3-1.4-7.5-4.8-7.5-9.4V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  system: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9.5 2.5V5M14.5 2.5V5M9.5 19v2.5M14.5 19v2.5M2.5 9.5H5M2.5 14.5H5M19 9.5h2.5M19 14.5h2.5"/>',
  download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>',
  starFill: '<path fill="currentColor" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  prev: '<path d="M6 5v14"/><path d="M18.5 5.8v12.4a.8.8 0 0 1-1.2.7L9 13a1.1 1.1 0 0 1 0-2l8.3-5.9a.8.8 0 0 1 1.2.7z"/>',
  next: '<path d="M18 5v14"/><path d="M5.5 5.8v12.4a.8.8 0 0 0 1.2.7L15 13a1.1 1.1 0 0 0 0-2L6.7 5.1a.8.8 0 0 0-1.2.7z"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  shuffle: '<path d="M3 7h3.5c2 0 3.3 1 4.5 2.8l2 3.4c1.2 1.8 2.5 2.8 4.5 2.8H21"/><path d="M3 17h3.5c1.6 0 2.7-.6 3.7-1.7M14.3 8.7c1-1.1 2.1-1.7 3.7-1.7H21"/><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5"/>',
  radio: '<rect x="3" y="8" width="18" height="12" rx="2.5"/><path d="M7 8 16 3.5"/><circle cx="15.5" cy="14" r="2.5"/><path d="M6.5 12.5h3M6.5 15.5h3"/>',
  heart2: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  tv: '<rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="m8.5 2.5 3.5 3.5 3.5-3.5"/><path d="M10.5 10v5l4-2.5z"/>',
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-7.5L7 21v-3.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8 10h8M8 13.5h5"/>',
  gauge: '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="m12 13.5 4-5"/><circle cx="12" cy="14" r="1.6"/>',
  apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="3.25"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="3.25"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18 6"/>',
  news: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7 8.5h10M7 12h10M7 15.5h6"/>',
  map: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  'b-youtube': '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.3 5 2.7-5 2.7z" fill="currentColor"/>',
  'b-twitch': '<path d="M5 3.5h15v10.5l-4 4h-3.5l-3 3v-3H5z"/><path d="M11 8v4M15.5 8v4"/>',
  'b-ytmusic': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.8"/><path d="m10.9 10.2 2.6 1.8-2.6 1.8z" fill="currentColor"/>',
  'b-discord': '<path d="M7.6 6.4C9 5.8 10.5 5.5 12 5.5s3 .3 4.4.9c1.8 2.5 2.7 5.4 2.6 8.7-1.4 1.1-2.9 1.8-4.3 2.3l-1-1.8M7.6 6.4C5.8 8.9 4.9 11.8 5 15.1c1.4 1.1 2.9 1.8 4.3 2.3l1-1.8"/><circle cx="9.5" cy="12" r="1.3" fill="currentColor"/><circle cx="14.5" cy="12" r="1.3" fill="currentColor"/>',
  'b-steam': '<circle cx="12" cy="12" r="9"/><circle cx="15" cy="9.5" r="2.6"/><circle cx="8.8" cy="15" r="1.8"/><path d="m10.4 14.1 2.5-2.3"/>',
  'b-xbox': '<circle cx="12" cy="12" r="9"/><path d="M6.4 6.8c3 1.7 6 5 8.3 9.8M17.6 6.8c-3 1.7-6 5-8.3 9.8"/>',
  'b-geforce': '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M12 9a3 3 0 1 0 3 3"/>',
  'b-spotify': '<circle cx="12" cy="12" r="9"/><path d="M7.5 9.6c3-1 6.5-.7 9.3.8M8 12.6c2.5-.7 5.2-.4 7.4.8M8.6 15.4c1.9-.5 3.8-.3 5.5.6"/>',
  'b-reddit': '<ellipse cx="12" cy="14" rx="7.5" ry="5"/><circle cx="17.5" cy="5.5" r="1.5"/><path d="m12 9 1.2-4.5 4.3 1"/><circle cx="9.5" cy="13.5" r=".9" fill="currentColor"/><circle cx="14.5" cy="13.5" r=".9" fill="currentColor"/><path d="M9.5 16.3c1.5.9 3.5.9 5 0"/>',
  'b-maps': '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 4M16 6h2.5a2.5 2.5 0 0 1-2.6 4"/><path d="M12 14v3.5M8.5 20.5h7M9.5 20.5c0-1.8 1-3 2.5-3s2.5 1.2 2.5 3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  alert: '<path d="M12 4 21.5 20h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  bolt: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  battery: '<rect x="2.5" y="7" width="16.5" height="10" rx="2.2"/><path d="M21.5 10.5v3M6 10.5v3M9.5 10.5v3"/>',
};

function uiIcon(name, cls = '') {
  const s = document.createElement('span');
  s.className = `ui-ico${cls ? ` ${cls}` : ''}`;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[name] || UI_ICONS.circle}</svg>`;
  return s;
}

// a régi (emoji / szöveges) jelek megfelelője az ikonkészletben; ismeretlen jel szövegként marad
const GLYPH_ICON = { '🛒': 'store', '🌐': 'browser', '🖥': 'desktop', '⌂': 'hosts', '♫': 'music', '🎲': 'random', '⚙': 'settings', '💻': 'laptop', '🎮': 'gamepad',
  '🛡': 'shield', '✓': 'check', '⛁': 'accounts', '○': 'circle', '◐': 'palette', '▭': 'energy', '▦': 'grid', '☁': 'cloud', '●': 'running', '★': 'star', '▤': 'layers', '◌': 'hidden', '▶': 'play' };
function glyphIcon(g, cls) {
  const n = UI_ICONS[g] ? g : GLYPH_ICON[g];
  return n ? uiIcon(n, cls) : (g || '');
}
