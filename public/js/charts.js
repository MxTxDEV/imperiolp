/* Peças de desenho dos gráficos, compartilhadas pelo Painel geral (bi.js) e pelo Financeiro (fin.js). */
(function () {
'use strict';
// barra com cantos de cima arredondados (base reta no eixo)
function tb(x, y, w, h, r = 5) { r = Math.max(0, Math.min(r, w / 2, h)); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
// linha suave (Catmull-Rom -> Bézier) passando por todos os pontos
function smooth(pts) {
  if (pts.length < 3) return 'M' + pts.map(p => p.join(',')).join('L');
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${(+p2[0]).toFixed(1)},${(+p2[1]).toFixed(1)}`;
  }
  return d;
}
// gradiente vertical: cor cheia em cima, mais transparente embaixo
const vg = (id, c, a = .35) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${c}"/><stop offset="1" style="stop-color:${c};stop-opacity:${a}"/></linearGradient>`;
// fatias de rosca com espaço entre elas e pontas arredondadas
function ringDash(len, CC, n, gap = 8) { const g = n > 1 ? gap : 0; return `stroke-dasharray="${Math.max(.1, len - g)} ${CC - len + g}" stroke-linecap="${n > 1 ? 'round' : 'butt'}"`; }
window.CK = { tb, smooth, vg, ringDash };
})();
