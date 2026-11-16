'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dir = [], data = [];
  let off = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(off, 12);
    dir.push(e); data.push(buf); off += buf.length;
  }
  return Buffer.concat([head, ...dir, ...data]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, 'assets', 'inarix-mark.svg'), 'utf8');
  const w = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  // a logó lapja a 600×600-as rajzon kb. 140..460 között van – erre vágunk, hogy kitöltse az ikont
  // az InariX jel (assets/inarix-mark.svg) már a lapra van vágva – kitölti az ikont
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`;
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const sizes = [16, 32, 48, 256];
  const pngs = sizes.map((s) => ({ size: s, buf: img.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(root, 'assets', 'icon.png'), img.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), ico(pngs));
  // tálca (értesítési terület): csak a róka
  const fox = fs.readFileSync(path.join(root, 'assets', 'inarix-fox.svg'), 'utf8');
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${fox.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 300));
  const fimg = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(root, 'assets', 'tray.png'), fimg.resize({ width: 32, height: 32, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(root, 'assets', 'tray@2x.png'), fimg.resize({ width: 64, height: 64, quality: 'best' }).toPNG());
  console.log('Ikonok kész: assets/icon.png, assets/icon.ico (InariX logó), assets/tray.png (róka)');
  app.exit(0);
});
