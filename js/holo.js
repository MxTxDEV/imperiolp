/* Holograma do andamento de obras de placas.
   Desenho isométrico em SVG próprio (sem biblioteca, sem build) com 4 etapas:
   terraplanagem, fundação, levantamento das placas e telhado.
   Parte já construída = traço cheio; parte ainda prevista = tracejado.
   Etapa em andamento ganha o tracejado dourado pulsando; etapa atrasada, vermelho.
   O desenho é esquemático: não representa o projeto real da obra. */
(function () {
'use strict';
let C = {
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  dt: s => s || '—'
};
const FASES = [
  { k: 'terra', nome: 'Terraplanagem', re: /terrapl|aterro|nivelament/i },
  { k: 'fundacao', nome: 'Fundação', re: /funda/i },
  { k: 'placas', nome: 'Levantamento das placas', re: /placa|painel|painéis/i },
  { k: 'telhado', nome: 'Telhado', re: /telhad|cobertura|telha/i }
];
// a etapa do passo vem do campo "fase" (modelo de placas) ou, se não houver, do nome do passo
const faseDe = p => p.fase || (FASES.find(F => F.re.test(p.nome || '')) || {}).k || null;

/* ---------- estado de cada etapa a partir dos passos da obra ---------- */
function estado(passos, late) {
  const fr = p => p.status === 'Concluído' ? 1 : p.status === 'Em andamento' ? Math.min(1, Math.max(0, (+p.pct || 0) / 100)) : 0;
  return FASES.map(F => {
    const ps = (passos || []).filter(p => faseDe(p) === F.k), w = ps.reduce((s, p) => s + (+p.peso || 1), 0);
    const f = w ? ps.reduce((s, p) => s + fr(p) * (+p.peso || 1), 0) / w : 0, andando = ps.some(p => p.status === 'Em andamento');
    const st = ps.length && ps.every(p => p.status === 'Concluído') ? 'done' : (andando || f > 0) ? 'doing' : 'pending';
    return { k: F.k, nome: F.nome, f, st, late: st !== 'done' && !!late && ps.some(late), vazio: !ps.length, fim: ps.reduce((m, p) => p.fim > m ? p.fim : m, '') };
  });
}

/* ---------- geometria isométrica ---------- */
const W = 8, D = 6, H = 2.6, HF = .25, WF = .4, OH = .5, RISE = 1.5, ZR = H + RISE, ZE = H - OH * RISE / (D / 2), RS = 6, S = 34, K = Math.sqrt(3) / 2;
const P = (x, y, z) => ((x - y) * K * S).toFixed(1) + ',' + ((x + y) * .5 * S - z * S).toFixed(1);
const poly = (pts, c) => `<polygon class="${c}" points="${pts.map(p => P(p[0], p[1], p[2])).join(' ')}"/>`;
// quantas peças já estão prontas: etapa em andamento mostra pelo menos 1, e só chega ao total quando concluída
const cnt = (total, f, andando) => f >= 1 ? total : f > 0 || andando ? Math.min(total - 1, Math.max(1, Math.round(f * total))) : 0;
const cls = b => b ? 'b' : 'g';

function box(x0, y0, z0, x1, y1, z1, b) {
  const c = cls(b);
  return poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c) + poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], c) + poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c + ' t');
}

function terra(s) {
  const nx = W + 3, ny = D + 3, n = cnt(nx * ny, s.f, s.st === 'doing');
  let o = '';
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = -1.5 + i, y = -1.5 + j;
    o += poly([[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], cls(j * nx + i < n) + ' fl');
  }
  return o;
}

function fundacao(s) {
  const seg = [];
  for (let i = 0; i < W; i++) seg.push([i, 0, i + 1, WF]);
  for (let j = 0; j < D; j++) seg.push([W - WF, j, W, j + 1]);
  for (let i = W - 1; i >= 0; i--) seg.push([i, D - WF, i + 1, D]);
  for (let j = D - 1; j >= 0; j--) seg.push([0, j, WF, j + 1]);
  const n = cnt(seg.length, s.f, s.st === 'doing');
  const laje = poly([[0, 0, .12], [W, 0, .12], [W, D, .12], [0, D, .12]], cls(s.st === 'done') + ' fl');
  return laje + seg.map((q, i) => ({ q, b: i < n })).sort((a, c) => (a.q[0] + a.q[1]) - (c.q[0] + c.q[1]))
    .map(x => box(x.q[0], x.q[1], 0, x.q[2], x.q[3], HF, x.b)).join('');
}

// painéis de parede, na ordem em que são levantados (volta completa pelo perímetro, depois as empenas)
function paineis() {
  const L = [], h = H - HF, add = (o, u, v, back, op) => L.push({ o, u, v, back, op });
  for (let i = 0; i < W; i++) add([i, 0, HF], [1, 0, 0], [0, 0, h], 1, i === 3 ? 'j' : '');
  for (let j = 0; j < D; j++) add([W, j, HF], [0, 1, 0], [0, 0, h], 0, j === 2 ? 'j' : '');
  for (let i = W - 1; i >= 0; i--) add([i, D, HF], [1, 0, 0], [0, 0, h], 0, i === 2 ? 'p' : i === 1 || i === 5 ? 'j' : '');
  for (let j = D - 1; j >= 0; j--) add([0, j, HF], [0, 1, 0], [0, 0, h], 1, j === 3 ? 'j' : '');
  L.push({ tri: [[0, 0, H], [0, D, H], [0, D / 2, ZR]], back: 1 }, { tri: [[W, 0, H], [W, D, H], [W, D / 2, ZR]], back: 0 });
  return L;
}
function painel(q, b) {
  if (q.tri) return poly(q.tri, cls(b));
  const at = (a, c) => q.o.map((v, k) => v + q.u[k] * a + q.v[k] * c), r = (a0, a1, c0, c1, k) => poly([at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1)], k);
  let o = r(0, 1, 0, 1, cls(b));
  if (b && q.op === 'j') o += r(.25, .75, .4, .78, 'w');
  if (b && q.op === 'p') o += r(.22, .78, 0, .8, 'w');
  return o;
}
function placas(s) {
  const L = paineis(), n = cnt(L.length, s.f, s.st === 'doing'), item = (q, i) => painel(q, i < n);
  return { back: L.map((q, i) => q.back ? item(q, i) : '').join(''), front: L.map((q, i) => q.back ? '' : item(q, i)).join('') };
}

function telhado(s) {
  const n = cnt(RS, s.f, s.st === 'doing'), slope = yE => {
    let o = '';
    for (let k = 0; k < RS; k++) {
      const t0 = k / RS, t1 = (k + 1) / RS, y0 = yE + t0 * (D / 2 - yE), y1 = yE + t1 * (D / 2 - yE), z0 = ZE + t0 * (ZR - ZE), z1 = ZE + t1 * (ZR - ZE);
      o += poly([[-OH, y0, z0], [W + OH, y0, z0], [W + OH, y1, z1], [-OH, y1, z1]], cls(k < n));
    }
    return o;
  };
  return { back: slope(-OH), front: slope(D + OH) };
}

function svg(est, label) {
  const e = k => est.find(x => x.k === k), t = e('terra'), f = e('fundacao'), p = e('placas'), r = e('telhado');
  const g = (s, inner) => `<g class="st ${s.st}${s.late ? ' late' : ''}">${inner}</g>`, pl = placas(p), tl = telhado(r);
  return `<svg class="hg-svg" viewBox="-290 -205 640 510" role="img" aria-label="${C.esc(label)}">
  <defs><radialGradient id="hgDisk"><stop offset="0" stop-color="#43d9ff" stop-opacity=".22"/><stop offset=".7" stop-color="#43d9ff" stop-opacity=".07"/><stop offset="1" stop-color="#43d9ff" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="29" cy="119" rx="310" ry="165" fill="url(#hgDisk)"/>
  <ellipse class="ring" cx="29" cy="119" rx="292" ry="154"/><ellipse class="ring r2" cx="29" cy="119" rx="236" ry="124"/>
  <g class="glow">${g(t, terra(t))}${g(f, fundacao(f))}${g(p, pl.back)}${g(r, tl.back)}${g(p, pl.front)}${g(r, tl.front)}</g>
</svg>`;
}

/* ---------- painel lateral (texto equivalente ao desenho) ---------- */
function resumo(s) {
  const pc = Math.round(s.f * 100);
  return s.vazio ? 'Sem passo cadastrado' : s.st === 'done' ? 'Concluída' : s.st === 'doing' ? `Em andamento${pc ? ' · ' + pc + '%' : ''}${s.late ? ' · atrasada' : ''}` : s.late ? 'Não iniciada · atrasada' : 'Ainda não iniciada';
}
function view(est, o) {
  const label = 'Desenho esquemático da obra. ' + est.map(s => s.nome + ': ' + resumo(s).toLowerCase()).join('. ') + '.';
  return `<div class="hg" id="hgBox"><div class="hg-scan" aria-hidden="true"></div>
  <div class="hg-top"><div><small>HOLOGRAMA DA OBRA</small><h3>${C.esc(o.titulo)}</h3>${o.sub ? `<p>${C.esc(o.sub)}</p>` : ''}</div><div class="hg-tot"><b>${o.total}%</b><small>concluído</small></div></div>
  <div class="hg-body"><div class="hg-fig">${svg(est, label)}</div>
  <ol class="hg-st">${est.map((s, i) => `<li class="${s.st}${s.late ? ' late' : ''}"><span class="n" aria-hidden="true">${s.st === 'done' ? '✓' : i + 1}</span><div><b>${C.esc(s.nome)}</b><small>${C.esc(resumo(s))}${s.fim && s.st !== 'done' ? ' · prazo ' + C.esc(C.dt(s.fim)) : ''}</small><i class="hg-bar"><u style="width:${Math.round(s.f * 100)}%"></u></i></div></li>`).join('')}</ol></div>
  <p class="hg-foot">Desenho esquemático e ilustrativo. As proporções não representam o projeto real.</p></div>`;
}

window.HOLO = { init: ctx => { C = Object.assign(C, ctx); }, FASES, faseDe, estado, svg, view };
})();
