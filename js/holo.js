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


/* ---------- modo realista: mesma obra, materiais e luz de verdade ---------- */
const T = .18; // espessura das paredes de placa
const hash = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
const pt = (x, y, z) => [(x - y) * K * S, (x + y) * .5 * S - z * S];
// caixa com 3 faces visíveis: fa (voltada p/ +y, clara), fb (voltada p/ +x, escura), ft (topo). Não construída = contorno fantasma.
function rbox(x0, y0, z0, x1, y1, z1, mat, b) {
  const c = b ? mat : 'gh';
  return poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c + ' fa') + poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], c + ' fb') + poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c + ' ft');
}
function chao() {
  const x0 = -3, x1 = W + 3, y0 = -3, y1 = D + 3, z = -.55;
  let o = poly([[x0, y1, z], [x1, y1, z], [x1, y1, 0], [x0, y1, 0]], 'soil fa') + poly([[x1, y0, z], [x1, y1, z], [x1, y1, 0], [x1, y0, 0]], 'soil fb')
    + poly([[x0, y1, -.38], [x1, y1, -.38], [x1, y1, -.24], [x0, y1, -.24]], 'strata fa') + poly([[x1, y0, -.38], [x1, y1, -.38], [x1, y1, -.24], [x1, y0, -.24]], 'strata fb')
    + poly([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 'grass');
  for (let i = 0; i < 60; i++) {
    const x = x0 + .3 + hash(i * 3 + 1) * (x1 - x0 - .8), y = y0 + .3 + hash(i * 3 + 2) * (y1 - y0 - .8), s = .22 + hash(i * 3 + 3) * .38;
    if (x > -1.8 && x < W + 1.8 && y > -1.8 && y < D + 1.8) continue;
    o += poly([[x, y, 0], [x + s, y, 0], [x + s, y + s * .8, 0], [x, y + s * .8, 0]], 'tuft t' + (i % 3));
  }
  return o;
}
function arvore(x, y, k) {
  const b = pt(x, y, 0), t = pt(x, y, 1.15 * k), c = pt(x, y, 2.05 * k), r = 25 * k;
  return `<ellipse cx="${(b[0] + 14 * k).toFixed(1)}" cy="${(b[1] + 3).toFixed(1)}" rx="${(24 * k).toFixed(1)}" ry="${(9 * k).toFixed(1)}" class="tsh"/><line x1="${b[0].toFixed(1)}" y1="${b[1].toFixed(1)}" x2="${t[0].toFixed(1)}" y2="${t[1].toFixed(1)}" class="trunk" stroke-width="${(5 * k).toFixed(1)}"/>
  <ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 1.15).toFixed(1)}" fill="url(#hgLeaf)"/><ellipse cx="${(c[0] - r * .25).toFixed(1)}" cy="${(c[1] - r * .35).toFixed(1)}" rx="${(r * .5).toFixed(1)}" ry="${(r * .45).toFixed(1)}" class="leafhi"/>`;
}
function terraR(s) {
  const nx = W + 3, ny = D + 3, n = cnt(nx * ny, s.f, s.st === 'doing');
  let o = '';
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = -1.5 + i, y = -1.5 + j, b = j * nx + i < n;
    o += poly([[x, y, .01], [x + 1, y, .01], [x + 1, y + 1, .01], [x, y + 1, .01]], b ? 'dirt d' + Math.floor(hash(j * nx + i + 7) * 4) : 'gh fl');
  }
  return o;
}
function fundacaoR(s) {
  const seg = [];
  for (let i = 0; i < W; i++) seg.push([i, 0, i + 1, WF]);
  for (let j = 0; j < D; j++) seg.push([W - WF, j, W, j + 1]);
  for (let i = W - 1; i >= 0; i--) seg.push([i, D - WF, i + 1, D]);
  for (let j = D - 1; j >= 0; j--) seg.push([0, j, WF, j + 1]);
  const n = cnt(seg.length, s.f, s.st === 'doing');
  const laje = poly([[0, 0, .12], [W, 0, .12], [W, D, .12], [0, D, .12]], s.st === 'done' ? 'slab' : 'gh fl');
  return laje + seg.map((q, i) => ({ q, b: i < n })).sort((a, c) => (a.q[0] + a.q[1]) - (c.q[0] + c.q[1]))
    .map(x => rbox(x.q[0], x.q[1], 0, x.q[2], x.q[3], HF, 'fund', x.b)).join('');
}
function paredesR(s) {
  const h = H - HF, L = [];
  const add = (ax, box, face, back, op, i) => L.push({ ax, box, face, back, op, i });
  for (let i = 0; i < W; i++) add('x', [i, 0, i + 1, T], T, 1, i === 3 ? 'j' : '', i);
  for (let j = 0; j < D; j++) add('y', [W - T, j, W, j + 1], W, 0, j === 2 ? 'j' : '', j);
  for (let i = W - 1; i >= 0; i--) add('x', [i, D - T, i + 1, D], D, 0, i === 2 ? 'p' : i === 1 || i === 5 ? 'j' : '', i);
  for (let j = D - 1; j >= 0; j--) add('y', [0, j, T, j + 1], T, 1, j === 3 ? 'j' : '', j);
  L.push({ tri: [[T, 0, H], [T, D, H], [T, D / 2, ZR]], back: 1 }, { tri: [[W, 0, H], [W, D, H], [W, D / 2, ZR]], back: 0 });
  const n = cnt(L.length, s.f, s.st === 'doing');
  const one = (q, k) => {
    const b = k < n;
    if (q.tri) return poly(q.tri, b ? 'conc fb' : 'gh');
    const [x0, y0, x1, y1] = q.box;
    let o = rbox(x0, y0, HF, x1, y1, H, 'conc', b);
    if (b && q.op) {
      const at = (a, c) => q.ax === 'x' ? [q.i + a, q.face, HF + c * h] : [q.face, q.i + a, HF + c * h], r = (a0, a1, c0, c1, cl) => poly([at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1)], cl + (q.ax === 'x' ? ' fa' : ' fb'));
      o += q.op === 'j' ? r(.2, .8, .33, .85, 'frame') + r(.26, .74, .39, .79, 'glass') : r(.17, .83, 0, .85, 'frame') + r(.23, .77, .02, .81, 'door');
    }
    return o;
  };
  const dep = q => q.tri ? (q.tri[0][0] + D / 2) : (q.box[0] + q.box[2] + q.box[1] + q.box[3]) / 2;
  const mk = back => L.map((q, k) => ({ q, k })).filter(x => !!x.q.back === back).sort((a, c) => dep(a.q) - dep(c.q)).map(x => one(x.q, x.k)).join('');
  return { back: mk(true), front: mk(false) };
}
function telhadoR(s) {
  const n = cnt(RS, s.f, s.st === 'doing'), done = s.st === 'done';
  const slope = (yE, lit) => {
    let o = '';
    for (let k = 0; k < RS; k++) {
      const t0 = k / RS, t1 = (k + 1) / RS, y0 = yE + t0 * (D / 2 - yE), y1 = yE + t1 * (D / 2 - yE), z0 = ZE + t0 * (ZR - ZE), z1 = ZE + t1 * (ZR - ZE);
      o += poly([[-OH, y0, z0], [W + OH, y0, z0], [W + OH, y1, z1], [-OH, y1, z1]], k < n ? `roof ${lit ? 'l' : 'd'} s${k % 2}` : 'gh');
      if (k < n) for (let x = -OH + .55; x < W + OH - .1; x += .55) o += `<path class="tj" d="M${P(x, y0, z0)}L${P(x, y1, z1)}"/>`;
    }
    if (done) o += poly([[W + OH, yE, ZE], [W + OH, D / 2, ZR], [W + OH, D / 2, ZR - .14], [W + OH, yE, ZE - .14]], 'redge fb') + (lit ? poly([[-OH, yE, ZE], [W + OH, yE, ZE], [W + OH, yE, ZE - .14], [-OH, yE, ZE - .14]], 'redge fa') : '');
    return o;
  };
  const ridge = done ? `<path class="ridge" d="M${P(-OH, D / 2, ZR)}L${P(W + OH, D / 2, ZR)}"/>` : '';
  return { back: slope(-OH, false), front: slope(D + OH, true) + ridge };
}
function sombra(est) {
  const f = k => est.find(e => e.k === k).f, alt = (f('fundacao') > 0 ? HF : 0) + f('placas') * (H - HF) + f('telhado') * RISE * .6;
  if (alt < .05) return '';
  const dx = alt * .9, dy = alt * .25;
  return `<polygon class="shadow" filter="url(#hgBlur)" points="${[[0, 0], [W, 0], [W + dx, dy], [W + dx, D + dy], [dx, D + dy], [0, D]].map(q => P(q[0], q[1], .02)).join(' ')}"/>`;
}
function svgReal(est, label) {
  const e = k => est.find(x => x.k === k), t = e('terra'), f = e('fundacao'), p = e('placas'), r = e('telhado');
  const g = (s, inner) => `<g class="st ${s.st}${s.late ? ' late' : ''}" data-k="${s.k}">${inner}</g>`, pa = paredesR(p), tl = telhadoR(r);
  return `<svg class="hg-svg real" viewBox="-390 -150 830 560" role="img" aria-label="${C.esc(label)}">
  <defs><filter id="hgBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter><filter id="hgBlur2"><feGaussianBlur stdDeviation="14"/></filter>
  <linearGradient id="hgGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3efff"/><stop offset=".55" stop-color="#7fb3d6"/><stop offset="1" stop-color="#3d6a8c"/></linearGradient>
  <radialGradient id="hgLeaf" cx=".4" cy=".35"><stop offset="0" stop-color="#6fae4a"/><stop offset="1" stop-color="#2f6a2c"/></radialGradient></defs>
  <ellipse cx="29" cy="300" rx="330" ry="70" class="floorsh" filter="url(#hgBlur2)"/>
  ${chao()}${arvore(-2.2, 1, .95)}${arvore(10, -1.6, 1.05)}
  ${g(t, terraR(t))}${sombra(est)}${g(f, fundacaoR(f))}${g(p, pa.back)}${g(r, tl.back)}${g(p, pa.front)}${g(r, tl.front)}
  ${arvore(10.2, 8, 1.1)}${arvore(-2, 7.6, .85)}
</svg>`;
}

function svg(est, label) {
  const e = k => est.find(x => x.k === k), t = e('terra'), f = e('fundacao'), p = e('placas'), r = e('telhado');
  const g = (s, inner) => `<g class="st ${s.st}${s.late ? ' late' : ''}" data-k="${s.k}">${inner}</g>`, pl = placas(p), tl = telhado(r);
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
// passos de uma etapa, com controles de edição (somem na tela cheia, que é só para mostrar ao cliente)
const pctDe = p => p.status === 'Concluído' ? 100 : p.status === 'Em andamento' ? Math.min(100, Math.max(0, +p.pct || 0)) : 0;
function passoRow(p) {
  const pc = pctDe(p), ok = p.status === 'Concluído', n = C.esc(p.nome);
  return `<div class="hg-p ${ok ? 'done' : p.status === 'Em andamento' ? 'doing' : ''}"><div class="hg-p1"><span class="pn" title="${n}">${n}</span>
    <span class="hg-ed"><button type="button" class="hg-b${ok ? ' on' : ''}" data-act="hgDone" data-id="${p.id}" title="${ok ? 'Reabrir passo' : 'Marcar como concluído'}" aria-label="${ok ? 'Reabrir' : 'Concluir'} ${n}">✓</button><button type="button" class="hg-b" data-act="pEdit" data-id="${p.id}" title="Editar passo" aria-label="Editar ${n}">✏️</button></span></div>
    <div class="hg-ed hg-p2"><input type="range" class="hg-r" min="0" max="100" step="5" value="${pc}" data-hgpct="${p.id}" aria-label="Avanço de ${n}"><output>${pc}%</output></div></div>`;
}
function view(est, o) {
  const label = 'Desenho esquemático da obra. ' + est.map(s => s.nome + ': ' + resumo(s).toLowerCase()).join('. ') + '.';
  const ps = o.passos || [], por = k => ps.filter(p => faseDe(p) === k), soltos = ps.filter(p => !faseDe(p));
  const real = o.modo !== 'holo';
  return `<div class="hg${real ? ' real' : ''}" id="hgBox"><div class="hg-scan" aria-hidden="true"></div>
  <div class="hg-top"><div><small>${real ? 'ANDAMENTO DA OBRA' : 'HOLOGRAMA DA OBRA'}</small><h3>${C.esc(o.titulo)}</h3>${o.sub ? `<p>${C.esc(o.sub)}</p>` : ''}</div><div class="hg-tot"><b>${o.total}%</b><small>concluído</small></div></div>
  <div class="hg-body"><div class="hg-fig">${real ? svgReal(est, label) : svg(est, label)}</div>
  <ol class="hg-st">${est.map((s, i) => `<li class="${s.st}${s.late ? ' late' : ''}" data-k="${s.k}"><span class="n" aria-hidden="true">${s.st === 'done' ? '✓' : i + 1}</span><div><b>${C.esc(s.nome)}</b><small>${C.esc(resumo(s))}${s.fim && s.st !== 'done' ? ' · prazo ' + C.esc(C.dt(s.fim)) : ''}</small><i class="hg-bar"><u style="width:${Math.round(s.f * 100)}%"></u></i>
    <div class="hg-ps">${por(s.k).map(passoRow).join('')}<button type="button" class="hg-add hg-ed" data-act="pNewF" data-k="${s.k}">+ passo nesta etapa</button></div></div></li>`).join('')}</ol></div>
  ${soltos.length ? `<div class="hg-solto hg-ed"><small>Passos sem etapa no desenho (edite o passo e escolha a etapa)</small>${soltos.map(passoRow).join('')}</div>` : ''}
  <p class="hg-foot">Desenho esquemático e ilustrativo. As proporções não representam o projeto real.</p></div>`;
}

window.HOLO = { init: ctx => { C = Object.assign(C, ctx); }, FASES, faseDe, estado, svg, svgReal, view };
})();
