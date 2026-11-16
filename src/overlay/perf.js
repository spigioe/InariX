'use strict';
window.ov.onPerf((d) => {
  const parts = [];
  if (d.gpu) parts.push(`GPU ${d.gpu.load}% · ${d.gpu.temp}°C`);
  if (d.cpu !== null && d.cpu !== undefined) parts.push(`CPU ${d.cpu}%`);
  parts.push(`RAM ${d.ram}%`);
  document.getElementById('p').textContent = parts.join('   ');
});
