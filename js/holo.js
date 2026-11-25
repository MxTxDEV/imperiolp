/* Andamento da obra de placas, desenhado em isométrico (SVG próprio, sem biblioteca e sem build).
   Etapas: terraplanagem, fundação, levantamento das placas e telhado.
   Só aparece o que já foi feito: etapa que ainda não começou não deixa molde nem contorno no desenho.
   A planta (retangular, quadrada, em L ou em U) vem do cadastro da obra.
   O telhado é de quatro águas, calculado pela distância até as paredes, então serve para qualquer planta.
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

/* ---------- plantas (polígonos em ordem anti-horária, medidas em módulos de 1 placa) ---------- */
const FORMAS = {
  'Retangular': [[0, 0], [8, 0], [8, 6], [0, 6]],
  'Quadrada': [[0, 0], [6, 0], [6, 6], [0, 6]],
  'Em L': [[0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8]],
  'Em U': [[0, 0], [8, 0], [8, 7], [5, 7], [5, 3], [3, 3], [3, 7], [0, 7]]
};
const H = 2.6, HF = .25, WF = .4, T = .18, OH = .5, RP = .55, GR = .5, S = 34, K = Math.sqrt(3) / 2;
const arestas = V => V.map((a, i) => {
  const b = V[(i + 1) % V.length], c = V[(i + 2) % V.length], d = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
  return { a, b, d, len: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), reflex: d[0] * d2[1] - d[1] * d2[0] < 0 };
});
const FCACHE = {};
function forma(nome) {
  if (FCACHE[nome]) return FCACHE[nome];
  const V = FORMAS[nome] || FORMAS.Retangular, n = V.length, E = arestas(V);
  const xs = V.map(v => v[0]), ys = V.map(v => v[1]), bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const inside = (x, y) => { let c = false; for (let i = 0; i < n; i++) { const a = V[i], b = V[(i + 1) % n]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  // distância (norma do máximo) até a parede mais próxima: dá o telhado de quatro águas em qualquer planta ortogonal
  const dist = (x, y) => {
    let m = 1e9;
    for (const e of E) {
      const a = e.a, b = e.b;
      const d = a[1] === b[1] ? Math.max(Math.max(Math.min(a[0], b[0]) - x, 0, x - Math.max(a[0], b[0])), Math.abs(y - a[1])) : Math.max(Math.max(Math.min(a[1], b[1]) - y, 0, y - Math.max(a[1], b[1])), Math.abs(x - a[0]));
      if (d < m) m = d;
    }
    return m;
  };
  const sd = (x, y) => inside(x, y) ? dist(x, y) : -dist(x, y);
  let dmax = 0;
  for (let x = bb.x0; x <= bb.x1; x += .5) for (let y = bb.y0; y <= bb.y1; y += .5) dmax = Math.max(dmax, sd(x, y));
  return (FCACHE[nome] = { V, E, bb, sd, dmax, hc: new Map(), door: E.filter(e => e.d[0] === -1).sort((p, q) => q.a[1] - p.a[1] || q.len - p.len)[0] });
}

/* ---------- geometria isométrica com giro livre ----------
   O modelo fica em coordenadas da planta; o giro é aplicado em volta do centro na hora de projetar.
   Cada face só é desenhada se estiver voltada para quem olha, e a luz é fixa na tela. */
let R = { c: 1, s: 0, cx: 0, cy: 0 };
const setRot = (deg, cx, cy) => { const a = deg * Math.PI / 180; R = { c: Math.cos(a), s: Math.sin(a), cx, cy }; };
const vw = (x, y) => { const dx = x - R.cx, dy = y - R.cy; return [R.cx + dx * R.c - dy * R.s, R.cy + dx * R.s + dy * R.c]; };
const nv = n => [n[0] * R.c - n[1] * R.s, n[0] * R.s + n[1] * R.c, n[2]];
const pt = (x, y, z) => { const v = vw(x, y); return [(v[0] - v[1]) * K * S, (v[0] + v[1]) * .5 * S - z * S]; };
const dv = (x, y) => { const v = vw(x, y); return v[0] + v[1]; };
const P = (x, y, z) => { const q = pt(x, y, z); return q[0].toFixed(1) + ',' + q[1].toFixed(1); };
const poly = (pts, c, st) => `<polygon class="${c}"${st ? ` style="${st}"` : ''} points="${pts.map(p => P(p[0], p[1], p[2])).join(' ')}"/>`;
// quantas peças já estão prontas: etapa em andamento mostra pelo menos 1, e só chega ao total quando concluída
const cnt = (total, f, andando) => f >= 1 ? total : f > 0 || andando ? Math.min(total - 1, Math.max(1, Math.round(f * total))) : 0;
const hash = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
const LD = (() => { const v = [-.45, .55, .7], m = Math.hypot(...v); return v.map(q => q / m); })();
const lum = n => { const m = nv(n); return Math.max(0, m[0] * LD[0] + m[1] * LD[1] + m[2] * LD[2]); };
const BASE = { conc: [236, 232, 224], fund: [169, 170, 166], soil: [123, 90, 61], strata: [104, 73, 47] };
const tom = (rgb, n) => { const f = .84 + .29 * lum(n); return `rgb(${rgb.map(q => Math.min(255, Math.round(q * f))).join(',')})`; };
const virada = n => { const m = nv(n); return m[0] + m[1] + m[2] > .001; };

// caixa: só as faces voltadas para quem olha, cada uma com a luz da sua direção
function caixa(x0, y0, z0, x1, y1, z1, mat, semTopo) {
  const F = [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]], [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [0, -1, 0]],
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0]]];
  if (!semTopo) F.push([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]]);
  return F.filter(f => virada(f[4])).map(f => poly(f.slice(0, 4), mat, `fill:${tom(BASE[mat], f[4])}`)).join('');
}
// faixas de 1 módulo ao longo das paredes, com a espessura para dentro; nos cantos internos a faixa avança para fechar o canto
function faixas(F, th) {
  const L = [];
  F.E.forEach(e => {
    const nx = -e.d[1], ny = e.d[0], horiz = e.d[1] === 0;
    for (let k = 0; k < e.len; k++) {
      const c = horiz ? e.a[1] : e.a[0], s0 = (horiz ? e.a[0] : e.a[1]) + (horiz ? e.d[0] : e.d[1]) * k, s1 = s0 + (horiz ? e.d[0] : e.d[1]), u0 = Math.min(s0, s1);
      let lo = u0, hi = u0 + 1;
      if (k === e.len - 1 && e.reflex) { if ((horiz ? e.d[0] : e.d[1]) > 0) hi += th; else lo -= th; }
      const box = horiz ? (ny > 0 ? [lo, c, hi, c + th] : [lo, c - th, hi, c]) : (nx > 0 ? [c, lo, c + th, hi] : [c - th, lo, c, hi]);
      L.push({ e, k, u0, horiz, box });
    }
  });
  return L;
}
const dep = q => dv((q.box[0] + q.box[2]) / 2, (q.box[1] + q.box[3]) / 2);

function chao(F) {
  const b = F.bb, x0 = b.x0 - 3, x1 = b.x1 + 3, y0 = b.y0 - 3, y1 = b.y1 + 3, z = -.55;
  let o = caixa(x0, y0, z, x1, y1, 0, 'soil', true) + caixa(x0, y0, -.38, x1, y1, -.24, 'strata', true)
    + poly([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 'grass');
  for (let i = 0; i < 70; i++) {
    const x = x0 + .3 + hash(i * 3 + 1) * (x1 - x0 - .8), y = y0 + .3 + hash(i * 3 + 2) * (y1 - y0 - .8), s = .22 + hash(i * 3 + 3) * .38;
    if (x > b.x0 - 1.8 && x < b.x1 + 1.8 && y > b.y0 - 1.8 && y < b.y1 + 1.8) continue;
    o += poly([[x, y, 0], [x + s, y, 0], [x + s, y + s * .8, 0], [x, y + s * .8, 0]], 'tuft t' + (i % 3));
  }
  return { o, x0, x1, y0, y1, z };
}
function arvore(x, y, k) {
  const b = pt(x, y, 0), t = pt(x, y, 1.15 * k), c = pt(x, y, 2.05 * k), r = 25 * k;
  return `<ellipse cx="${(b[0] + 14 * k).toFixed(1)}" cy="${(b[1] + 3).toFixed(1)}" rx="${(24 * k).toFixed(1)}" ry="${(9 * k).toFixed(1)}" class="tsh"/><line x1="${b[0].toFixed(1)}" y1="${b[1].toFixed(1)}" x2="${t[0].toFixed(1)}" y2="${t[1].toFixed(1)}" class="trunk" stroke-width="${(5 * k).toFixed(1)}"/>
  <ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 1.15).toFixed(1)}" fill="url(#hgLeaf)"/><ellipse cx="${(c[0] - r * .25).toFixed(1)}" cy="${(c[1] - r * .35).toFixed(1)}" rx="${(r * .5).toFixed(1)}" ry="${(r * .45).toFixed(1)}" class="leafhi"/>`;
}
function terra(s, F) {
  const b = F.bb, nx = b.x1 - b.x0 + 3, ny = b.y1 - b.y0 + 3, n = cnt(nx * ny, s.f, s.st === 'doing');
  let o = '';
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (j * nx + i >= n) return o;
    const x = b.x0 - 1.5 + i, y = b.y0 - 1.5 + j;
    o += poly([[x, y, .01], [x + 1, y, .01], [x + 1, y + 1, .01], [x, y + 1, .01]], 'dirt d' + Math.floor(hash(j * nx + i + 7) * 4));
  }
  return o;
}
function fundacao(s, F) {
  const L = faixas(F, WF), n = cnt(L.length, s.f, s.st === 'doing');
  if (!n) return '';
  const laje = s.st === 'done' ? poly(F.V.map(v => [v[0], v[1], .12]), 'slab') : '';
  return laje + L.slice(0, n).sort((a, c) => dep(a) - dep(c)).map(q => caixa(q.box[0], q.box[1], 0, q.box[2], q.box[3], HF, 'fund')).join('');
}
function paredes(s, F) {
  const L = faixas(F, T), n = cnt(L.length, s.f, s.st === 'doing'), h = H - HF;
  return L.slice(0, n).sort((a, c) => dep(a) - dep(c)).map(q => {
    const [x0, y0, x1, y1] = q.box;
    let o = caixa(x0, y0, HF, x1, y1, H, 'conc');
    const porta = q.e === F.door && q.k === 2, janela = q.e.len >= 3 && q.k % 3 === 1;
    if (porta || janela) {
      // a abertura aparece na face grande que estiver voltada para quem olha (por fora ou por dentro)
      const fs = q.horiz ? [[0, 1, y1], [0, -1, y0]] : [[1, 0, x1], [-1, 0, x0]], f = fs.map(q2 => ({ n: q2, v: nv([q2[0], q2[1], 0]) })).sort((a, c) => (c.v[0] + c.v[1]) - (a.v[0] + a.v[1]))[0];
      if (f.v[0] + f.v[1] > .001) {
        const pl = f.n[2], at = (a, c) => q.horiz ? [q.u0 + a, pl, HF + c * h] : [pl, q.u0 + a, HF + c * h], r = (a0, a1, c0, c1, cl) => poly([at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1)], cl);
        o += porta ? r(.17, .83, 0, .85, 'frame') + r(.23, .77, .02, .81, 'door') : r(.2, .8, .33, .85, 'frame') + r(.26, .74, .39, .79, 'glass');
      }
    }
    return o;
  }).join('');
}

/* telhado de quatro águas: altura = H + inclinação × distância até a parede (negativa no beiral) */
function cor(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (n[2] < 0) n = n.map(q => -q);
  const m = Math.hypot(...n) || 1, f = .5 + .8 * lum(n.map(q => q / m));
  return `rgb(${Math.min(255, Math.round(205 * f))},${Math.min(255, Math.round(98 * f))},${Math.min(255, Math.round(58 * f))})`;
}
function telhado(s, F) {
  const KK = 8, n = cnt(KK, s.f, s.st === 'doing');
  if (!n) return '';
  const zE = H - RP * OH, zT = H + RP * F.dmax, lim = zE + n / KK * (zT - zE) + 1e-6, b = F.bb;
  const hz = (x, y) => { const k = x + ',' + y; let v = F.hc.get(k); if (v === undefined) { v = H + RP * F.sd(x, y); F.hc.set(k, v); } return v; };
  const i0 = Math.floor((b.x0 - OH) / GR), i1 = Math.ceil((b.x1 + OH) / GR), j0 = Math.floor((b.y0 - OH) / GR), j1 = Math.ceil((b.y1 + OH) / GR), inc = new Set(), cells = [];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (F.sd((i + .5) * GR, (j + .5) * GR) >= -OH) { inc.add(i + ',' + j); cells.push([i, j, dv((i + .5) * GR, (j + .5) * GR)]); }
  cells.sort((p, q) => p[2] - q[2]);
  const step = (zT - zE) / 10; let o = '', lines = '';
  const tri = (A, B, Cc) => {
    for (let j = 1; j < 10; j++) {
      const L = zE + j * step, pts = [];
      [[A, B], [B, Cc], [Cc, A]].forEach(([p, q]) => { if ((p[2] - L) * (q[2] - L) < 0) { const t = (L - p[2]) / (q[2] - p[2]); pts.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), L]); } });
      if (pts.length === 2) lines += `M${P(...pts[0])}L${P(...pts[1])}`;
    }
  };
  const lados = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [i, j] of cells) {
    const x0 = i * GR, y0 = j * GR, x1 = x0 + GR, y1 = y0 + GR, hc = hz(x0 + GR / 2, y0 + GR / 2);
    if (hc > lim) continue;
    const p00 = [x0, y0, hz(x0, y0)], p10 = [x1, y0, hz(x1, y0)], p11 = [x1, y1, hz(x1, y1)], p01 = [x0, y1, hz(x0, y1)];
    const ca = (p00[2] + p11[2]) / 2, cb = (p10[2] + p01[2]) / 2, st = c => `fill:${c};stroke:${c};stroke-width:.7`;
    if (Math.abs(ca - cb) < 1e-6) { o += poly([p00, p10, p11, p01], 'rt', st(cor(p00, p10, p11))); tri(p00, p10, p11); tri(p00, p11, p01); }
    else {
      const t = Math.abs(hc - ca) < Math.abs(hc - cb) ? [[p00, p10, p11], [p00, p11, p01]] : [[p00, p10, p01], [p10, p11, p01]];
      t.forEach(q => { o += poly(q, 'rt', st(cor(q[0], q[1], q[2]))); tri(q[0], q[1], q[2]); });
    }
    // fascia do beiral: só nas bordas de fora do telhado que estão voltadas para quem olha
    for (const [dx, dy] of lados) {
      if (inc.has((i + dx) + ',' + (j + dy)) || !virada([dx, dy, 0])) continue;
      const A = dx ? [dx > 0 ? x1 : x0, y0] : [x0, dy > 0 ? y1 : y0], B = dx ? [A[0], y1] : [x1, A[1]], ha = hz(A[0], A[1]), hb = hz(B[0], B[1]);
      o += poly([[A[0], A[1], ha], [B[0], B[1], hb], [B[0], B[1], hb - .14], [A[0], A[1], ha - .14]], 'redge', `fill:${tom([138, 74, 46], [dx, dy, 0])}`);
    }
  }
  return o + `<path class="tj" d="${lines}"/>`;
}
function sombra(est, F) {
  const f = k => est.find(e => e.k === k).f, alt = (f('fundacao') > 0 ? HF : 0) + f('placas') * (H - HF) + f('telhado') * RP * F.dmax * .7;
  if (alt < .05) return '';
  // a luz é fixa na tela, então o deslocamento da sombra gira ao contrário da casa
  const ex = alt * .9, ey = -alt * .15, dx = ex * R.c + ey * R.s, dy = -ex * R.s + ey * R.c, g = (x, y) => [x, y, .02], V = F.V, n = V.length;
  let o = poly(V.map(v => g(v[0], v[1])), 'sh') + poly(V.map(v => g(v[0] + dx, v[1] + dy)), 'sh');
  for (let i = 0; i < n; i++) { const a = V[i], b = V[(i + 1) % n]; o += poly([g(a[0], a[1]), g(b[0], b[1]), g(b[0] + dx, b[1] + dy), g(a[0] + dx, a[1] + dy)], 'sh'); }
  return `<g class="shadow" filter="url(#hgBlur)">${o}</g>`;
}
const arvores = b => [[b.x0 - 2.2, b.y0 + .8, .95], [b.x1 + 2.2, b.y0 - 1.6, 1.05], [b.x1 + 2.4, b.y1 + 2.2, 1.1], [b.x0 - 2, b.y1 + 1.8, .85]];
// enquadramento que serve para qualquer ângulo, para o desenho não mudar de tamanho enquanto gira
function enquadra(F) {
  if (F.vb) return F.vb;
  const b = F.bb, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, zT = H + RP * F.dmax, x0 = b.x0 - 3, x1 = b.x1 + 3, y0 = b.y0 - 3, y1 = b.y1 + 3;
  let ax = 1e9, bx = -1e9, ay = 1e9, by = -1e9;
  for (let a = 0; a < 360; a += 15) {
    setRot(a, cx, cy);
    [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, -.55], [x1, y0, -.55], [x1, y1, -.55], [x0, y1, -.55]].forEach(q => { const w = pt(...q); ax = Math.min(ax, w[0]); bx = Math.max(bx, w[0]); ay = Math.min(ay, w[1]); by = Math.max(by, w[1]); });
    F.V.forEach(v => { ay = Math.min(ay, pt(v[0], v[1], zT)[1] - 36); });
    arvores(b).forEach(q => { const w = pt(q[0], q[1], 2.05 * q[2]); ay = Math.min(ay, w[1] - 36 * q[2]); });
  }
  const X0 = ax - 24, X1 = bx + 24, Y0 = ay - 30, Y1 = by + 40;
  return (F.vb = { x0: X0, y0: Y0, w: X1 - X0, h: Y1 - Y0, cx: (X0 + X1) / 2, bottom: Y1 });
}

function svg(est, label, planta, ang) {
  const F = forma(planta), e = k => est.find(x => x.k === k), t = e('terra'), f = e('fundacao'), p = e('placas'), r = e('telhado'), g = (s, inner) => `<g class="st ${s.st}${s.late ? ' late' : ''}" data-k="${s.k}">${inner}</g>`;
  const v = enquadra(F), b = F.bb;
  setRot(ang || 0, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  const c = chao(F), T4 = arvores(b).sort((p, q) => dv(p[0], p[1]) - dv(q[0], q[1]));
  const vb = `${v.x0.toFixed(0)} ${v.y0.toFixed(0)} ${v.w.toFixed(0)} ${v.h.toFixed(0)}`;
  return `<svg class="hg-svg" viewBox="${vb}" data-vb="${vb}" role="img" aria-label="${C.esc(label)}">
  <defs><filter id="hgBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter><filter id="hgBlur2" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
  <linearGradient id="hgGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3efff"/><stop offset=".55" stop-color="#7fb3d6"/><stop offset="1" stop-color="#3d6a8c"/></linearGradient>
  <radialGradient id="hgLeaf" cx=".4" cy=".35"><stop offset="0" stop-color="#6fae4a"/><stop offset="1" stop-color="#2f6a2c"/></radialGradient></defs>
  <ellipse cx="${v.cx.toFixed(0)}" cy="${(v.bottom - 70).toFixed(0)}" rx="${(v.w * .38).toFixed(0)}" ry="70" class="floorsh" filter="url(#hgBlur2)"/>
  ${c.o}${arvore(...T4[0])}${arvore(...T4[1])}
  ${g(t, terra(t, F))}${sombra(est, F)}${g(f, fundacao(f, F))}${g(p, paredes(p, F))}${g(r, telhado(r, F))}
  ${arvore(...T4[2])}${arvore(...T4[3])}
</svg>`;
}
const rotulo = est => 'Desenho esquemático da obra. ' + est.map(s => s.nome + ': ' + resumo(s).toLowerCase()).join('. ') + '.';

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
    <span class="hg-ed"><button type="button" class="hg-b${ok ? ' on' : ''}" data-act="hgDone" data-id="${p.id}" title="${ok ? 'Reabrir passo' : 'Marcar como concluído'}" aria-label="${ok ? 'Reabrir' : 'Concluir'} ${n}">✓</button><button type="button" data-act="pEdit" data-id="${p.id}" class="hg-b hg-edit" title="Editar passo" aria-label="Editar ${n}">✏️</button></span></div>
    <div class="hg-ed hg-p2"><input type="range" class="hg-r" min="0" max="100" step="5" value="${pc}" data-hgpct="${p.id}" aria-label="Avanço de ${n}"><output>${pc}%</output></div></div>`;
}
function inner(est, o) {
  const label = rotulo(est);
  const ps = o.passos || [], por = k => ps.filter(p => faseDe(p) === k), soltos = ps.filter(p => !faseDe(p));
  return `<div class="hg-top"><div><small>ANDAMENTO DA OBRA</small><h3>${C.esc(o.titulo)}</h3>${o.sub ? `<p>${C.esc(o.sub)}</p>` : ''}</div><div class="hg-tot"><b>${o.total}%</b><small>concluído</small></div></div>
  <div class="hg-body"><div class="hg-fig">${svg(est, label, o.planta, o.ang)}<div class="hg-ctl" role="group" aria-label="Girar e aproximar"><button type="button" data-act="hgRot" data-d="-1" title="Girar para a esquerda" aria-label="Girar para a esquerda">⟲</button><button type="button" data-act="hgRot" data-d="1" title="Girar para a direita" aria-label="Girar para a direita">⟳</button><button type="button" data-act="hgZoom" data-d="1" title="Aproximar" aria-label="Aproximar">＋</button><button type="button" data-act="hgZoom" data-d="-1" title="Afastar" aria-label="Afastar">－</button><button type="button" data-act="hgReset" title="Voltar à visão inicial" aria-label="Voltar à visão inicial">⌂</button></div></div>
  <ol class="hg-st">${est.map((s, i) => `<li class="${s.st}${s.late ? ' late' : ''}" data-k="${s.k}"><span class="n" aria-hidden="true">${s.st === 'done' ? '✓' : i + 1}</span><div><b>${C.esc(s.nome)}</b><small>${C.esc(resumo(s))}${s.fim && s.st !== 'done' ? ' · prazo ' + C.esc(C.dt(s.fim)) : ''}</small><i class="hg-bar"><u style="width:${Math.round(s.f * 100)}%"></u></i>
    <div class="hg-ps">${por(s.k).map(passoRow).join('')}<button type="button" class="hg-add hg-ed" data-act="pNewF" data-k="${s.k}">+ passo nesta etapa</button></div></div></li>`).join('')}</ol></div>
  ${soltos.length ? `<div class="hg-solto hg-ed"><small>Passos sem etapa no desenho (edite o passo e escolha a etapa)</small>${soltos.map(passoRow).join('')}</div>` : ''}
  <p class="hg-foot">Desenho esquemático e ilustrativo. As proporções não representam o projeto real.</p>`;
}
const view = (est, o) => `<div class="hg" id="hgBox">${inner(est, o)}</div>`;

window.HOLO = { init: ctx => { C = Object.assign(C, ctx); }, FASES, FORMAS: Object.keys(FORMAS), faseDe, estado, svg, rotulo, view, inner };
})();
