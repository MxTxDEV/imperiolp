/* Financeiro — painel de gráficos do Império ERP.
   Tudo é calculado sobre os lançamentos, obras e contratos cadastrados.
   Mesmos padrões do BI (js/bi.js): SVG próprio, tooltip por data-tip,
   comparação com o período anterior e clique no gráfico filtra os lançamentos. */
(function () {
'use strict';
let C; // contexto injetado pelo app (FIN.init)
const PER = [['3m', '3 meses', 3], ['6m', '6 meses', 6], ['12m', '12 meses', 12]];
const st = { per: '6m', tipo: 'Todos', mes: null, cat: null, obra: null, anim: true, lim: 15 };
const E = s => C.esc(s);
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const pad = n => String(n).padStart(2, '0');
const mk = (y, m) => y + '-' + pad(m + 1);
const dkey = s => (s || '').slice(0, 7);
const mDate = k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1); };
const mShort = k => mDate(k).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
const mLong = k => mDate(k).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const monthsBack = (n, skip = 0) => { const d = new Date(), out = []; for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - skip - i, 1); out.push(mk(x.getFullYear(), x.getMonth())); } return out; };
const tip = (...l) => `data-tip="${E(l.filter(Boolean).join('\n'))}"`;
const act = (k, v) => `data-fin="${k}" data-v="${E(v)}" role="button" tabindex="0"`;
const fp = x => x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + '%';
const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const CAT_COR = ['var(--c6)', 'var(--c2)', 'var(--c4)', 'var(--c1)', 'var(--c5)', 'var(--c7)'];

// Categoria: a escolhida no lançamento; sem ela, derivada da origem do lançamento.
const CATS = { Receita: ['Venda de unidades', 'Outras receitas'], Despesa: ['Obras (materiais e mão de obra)', 'Compra de materiais', 'Contratos', 'Administrativo', 'Outras despesas'] };
function catOf(l) {
  if (l.cat) return l.cat;
  const d = l.desc || '';
  if (l.tipo === 'Receita') return l.empId || /venda/i.test(d) ? 'Venda de unidades' : 'Outras receitas';
  if (/^compra/i.test(d)) return 'Compra de materiais';
  if (/contrato/i.test(d)) return 'Contratos';
  if (/administrativ/i.test(d)) return 'Administrativo';
  return l.obraId ? 'Obras (materiais e mão de obra)' : 'Outras despesas';
}
function group(arr, keyFn, valFn) {
  const m = new Map(); arr.forEach(x => { const k = keyFn(x); m.set(k, (m.get(k) || 0) + valFn(x)); });
  return [...m].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
}

/* ---------- modelo ---------- */
function model() {
  const S = C.S(), n = (PER.find(p => p[0] === st.per) || PER[1])[2];
  const keys = monthsBack(n), prevKeys = monthsBack(n, n), ks = new Set(keys), pks = new Set(prevKeys);
  const L = S.lancamentos.filter(l => ks.has(dkey(l.data))), P = S.lancamentos.filter(l => pks.has(dkey(l.data)));
  const tot = (ls, t) => sum(ls.filter(l => l.tipo === t), l => l.valor);
  const months = keys.map((k, i) => { const ls = L.filter(l => dkey(l.data) === k), ps = P.filter(l => dkey(l.data) === prevKeys[i]); const r = tot(ls, 'Receita'), d = tot(ls, 'Despesa'), pr = tot(ps, 'Receita'), pd = tot(ps, 'Despesa'); return { k, r, d, res: r - d, pr, pd, pres: pr - pd, m: r ? (r - d) / r : null }; });
  let acc = 0; months.forEach(x => { acc += x.res; x.acc = acc; });
  const R = tot(L, 'Receita'), D = tot(L, 'Despesa'), pR = tot(P, 'Receita'), pD = tot(P, 'Despesa');
  const nRec = L.filter(l => l.tipo === 'Receita').length;
  const ctAbertos = S.contratos.filter(c => c.status === 'Vigente' || c.status === 'Rascunho');
  const aPagar = sum(ctAbertos, c => Math.max(0, c.valor - c.pago));
  return {
    S, n, keys, months, L, R, D, res: R - D, pR, pD, pres: pR - pD,
    margin: R ? (R - D) / R : null, pMargin: pR ? (pR - pD) / pR : null,
    burn: D / n, pBurn: pD / n, ticket: nRec ? R / nRec : null,
    catD: group(L.filter(l => l.tipo === 'Despesa'), catOf, l => l.valor),
    recEmp: group(L.filter(l => l.tipo === 'Receita'), l => l.empId || '', l => l.valor),
    dspObra: group(L.filter(l => l.tipo === 'Despesa'), l => l.obraId || '', l => l.valor),
    ctAbertos, aPagar, contratos: S.contratos
  };
}

/* ---------- números flutuantes ---------- */
function delta(cur, prev, goodUp, fmt) {
  if (cur == null || prev == null) return '';
  if (!prev) return cur ? `<span class="dl" ${tip('Sem base de comparação', 'O período anterior não teve valor.')}>novo</span>` : '';
  const p = (cur - prev) / Math.abs(prev);
  if (Math.abs(p) < 0.005) return `<span class="dl" ${tip('Estável', 'Anterior: ' + fmt(prev))}>● estável</span>`;
  const good = (p > 0) === goodUp;
  return `<span class="dl ${good ? 'up' : 'down'}" ${tip(`${p > 0 ? 'Acima' : 'Abaixo'} do período anterior`, 'Anterior: ' + fmt(prev))}>${p > 0 ? '▲' : '▼'} ${fp(Math.abs(p))}</span>`;
}
function spark(vals, color) {
  if (vals.length < 2) return '';
  const w = 84, h = 26, mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * w, h - 3 - (v - mn) / sp * (h - 6)]), d = smooth(pts), last = pts[pts.length - 1];
  return `<svg class="fn-sp" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${w},${h}L0,${h}Z" style="fill:${color};opacity:.14"/><path d="${d}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" style="fill:${color}"/></svg>`;
}
function numbers(M) {
  const ms = M.months, f = C.brlS;
  const it = [
    ['Receitas', f(M.R), delta(M.R, M.pR, true, f), spark(ms.map(x => x.r), 'var(--c3)'), [`Soma das receitas em ${M.n} meses`]],
    ['Despesas', f(M.D), delta(M.D, M.pD, false, f), spark(ms.map(x => x.d), 'var(--c6)'), [`Soma das despesas em ${M.n} meses`]],
    ['Resultado', f(M.res), delta(M.res, M.pres, true, f), spark(ms.map(x => x.res), 'var(--gold)'), ['Receitas − despesas do período', 'É resultado de caixa, não lucro contábil.'], M.res < 0 ? 'down' : ''],
    ['Margem', fp(M.margin), M.margin != null && M.pMargin != null ? `<span class="dl ${M.margin >= M.pMargin ? 'up' : 'down'}" ${tip('Margem do período anterior', fp(M.pMargin))}>${M.margin >= M.pMargin ? '▲' : '▼'} ${((M.margin - M.pMargin) * 100).toFixed(1).replace('.', ',')} p.p.</span>` : '', spark(ms.filter(x => x.m != null).map(x => x.m), 'var(--c4)'), ['Resultado ÷ receitas']],
    ['Despesa média/mês', f(M.burn), delta(M.burn, M.pBurn, false, f), '', ['Quanto a empresa gasta por mês em média no período']],
    ['A pagar em contratos', f(M.aPagar), `<span class="fn-s">${M.ctAbertos.length} contrato(s) em aberto</span>`, '', ['Valor dos contratos vigentes e em rascunho ainda não pago', 'Situação de hoje, não segue o período.']]
  ];
  return `<div class="fn-row">${it.map(([l, v, d, sp, t, cls]) => `<div class="fn" ${tip(l, ...t)}><small>${l}</small><b class="${cls || ''}">${v}</b><div class="fn-d">${d}${sp}</div></div>`).join('')}</div>`;
}

/* ---------- gráficos ---------- */
const { tb, smooth, vg } = window.CK;
const card = (title, sub, body, cls = '') => `<section class="card fc ${cls}"><h4><span>${title}</span>${sub ? `<small>${sub}</small>` : ''}</h4>${body}</section>`;
function yScale(vals, top, bottom) { const mx = Math.max(0, ...vals), mn = Math.min(0, ...vals), sp = (mx - mn) || 1; return { Y: v => top + (mx - v) / sp * (bottom - top), mx, mn }; }
function grid(Y, mx, mn, pl, W) {
  let g = ''; for (let i = 0; i <= 3; i++) { const v = mn + (mx - mn) * i / 3, y = Y(v); g += `<line x1="${pl}" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="gl"/><text x="${pl - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="ax">${C.brlS(v).replace('R$ ', '')}</text>`; }
  return g;
}

function fluxo(M) {
  const ms = M.months, W = 640, H = 220, pl = 46, pt = 12, pb = 26, n = ms.length;
  const { Y, mx, mn } = yScale(ms.flatMap(x => [x.r, x.d, x.res, x.pres]), pt, H - pb);
  const slot = (W - pl - 6) / n, bw = Math.min(26, slot * .3), X = i => pl + slot * i + slot / 2;
  let g = `<defs>${vg('fgR', 'var(--c3)', .25)}${vg('fgD', 'var(--c6)', .25)}</defs>` + grid(Y, mx, mn, pl, W) + `<line x1="${pl}" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zl"/>`;
  ms.forEach((x, i) => {
    const on = st.mes === x.k, dim = st.mes && !on ? ' dim' : '';
    g += `<path class="fb gr${dim}" d="${tb(X(i) - bw - 2, Y(x.r), bw, Math.max(0, Y(0) - Y(x.r)))}" fill="url(#fgR)"/>`;
    g += `<path class="fb gr${dim}" d="${tb(X(i) + 2, Y(x.d), bw, Math.max(0, Y(0) - Y(x.d)))}" fill="url(#fgD)"/>`;
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ax${on ? ' on' : ''}">${mShort(x.k)}</text>`;
  });
  const line = (k, cls) => `<path d="${smooth(ms.map((x, i) => [X(i), Y(x[k])]))}" class="${cls}"/>`;
  g += line('pres', 'ln prev') + line('res', 'ln res') + ms.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.res)}" r="3.5" class="dot"/>`).join('');
  ms.forEach((x, i) => { g += `<rect class="hit" x="${X(i) - slot / 2}" y="${pt}" width="${slot}" height="${H - pb - pt}" ${act('mes', x.k)} ${tip(mLong(x.k), 'Receitas: ' + C.brl(x.r), 'Despesas: ' + C.brl(x.d), 'Resultado: ' + C.brl(x.res) + (x.m != null ? ` (margem ${fp(x.m)})` : ''), 'Mesmo mês do período anterior: ' + C.brl(x.pres), st.mes === x.k ? 'Clique para limpar o filtro' : 'Clique para ver os lançamentos do mês')}/>`; });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas, despesas e resultado por mês">${g}</svg>
  <div class="lg"><span><i style="background:var(--c3)"></i>Receitas</span><span><i style="background:var(--c6)"></i>Despesas</span><span><i class="l" style="background:var(--gold)"></i>Resultado</span><span><i class="l d"></i>Resultado do período anterior</span></div>`;
}

function cascata(M) {
  const cats = M.catD.slice(0, 4), resto = sum(M.catD.slice(4), c => c.v);
  if (resto) cats.push({ k: 'Outras', v: resto });
  const steps = [{ l: 'Receitas', v: M.R, a: 0, b: M.R, c: 'var(--c3)' }]; let cur = M.R;
  cats.forEach((c, i) => { steps.push({ l: c.k, v: -c.v, a: cur - c.v, b: cur, c: CAT_COR[i % CAT_COR.length], cat: c.k }); cur -= c.v; });
  steps.push({ l: 'Resultado', v: cur, a: Math.min(0, cur), b: Math.max(0, cur), c: cur >= 0 ? 'var(--gold)' : 'var(--red)' });
  const W = 380, H = 210, pl = 6, pt = 18, pb = 40, n = steps.length, slot = (W - pl * 2) / n, bw = slot * .62;
  const { Y } = yScale(steps.flatMap(s => [s.a, s.b]), pt, H - pb);
  let g = `<defs>${steps.map((s, i) => vg('fgW' + i, s.c, .4)).join('')}</defs><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zl"/>`;
  steps.forEach((s, i) => {
    const x = pl + slot * i + (slot - bw) / 2, y = Y(s.b), h = Math.max(1.5, Y(s.a) - Y(s.b));
    if (i < n - 1) { const lv = i === 0 ? s.b : s.a; g += `<line x1="${x + bw}" x2="${x + slot}" y1="${Y(lv)}" y2="${Y(lv)}" class="cn"/>`; }
    const on = s.cat && st.cat === s.cat;
    g += `<path class="fb gr${st.cat && s.cat && !on ? ' dim' : ''}" d="${tb(x, y, bw, h, 6)}" fill="url(#fgW${i})" ${s.cat ? act('cat', s.cat) : ''} ${tip(s.l, C.brl(Math.abs(s.v)), i && i < n - 1 ? fp(Math.abs(s.v) / (M.R || 1)) + ' das receitas' : '', s.cat ? 'Clique para filtrar' : '')}/>`;
    g += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="vl">${s.v < 0 ? '−' : ''}${C.brlS(Math.abs(s.v)).replace('R$ ', '')}</text>`;
    g += `<text x="${x + bw / 2}" y="${H - pb + 14}" text-anchor="middle" class="ax">${E(short(s.l.replace('Obras (materiais e mão de obra)', 'Obras'), 11))}</text>`;
  });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cascata do resultado">${g}</svg>`;
}

function donut(M) {
  const t = M.D || 1, R = 46, CC = 2 * Math.PI * R; let off = 0;
  const ring = `<circle r="${R}" cx="64" cy="64" fill="none" stroke-width="14" style="stroke:var(--panel2)"/>`, arcs = ring + M.catD.map((c, i) => { const len = c.v / t * CC, on = st.cat === c.k, s = `<circle r="${R}" cx="64" cy="64" fill="none" stroke-width="${on ? 18 : 14}" stroke-linecap="round" class="slice" style="stroke:${CAT_COR[i % CAT_COR.length]};opacity:${st.cat && !on ? .3 : 1}" stroke-dasharray="${Math.max(.1, len - (M.catD.length > 1 ? 9 : 0))} ${CC - len + (M.catD.length > 1 ? 9 : 0)}" stroke-dashoffset="${-off}" transform="rotate(-90 64 64)" ${act('cat', c.k)} ${tip(c.k, C.brl(c.v), fp(c.v / t) + ' das despesas', 'Clique para filtrar')}/>`; off += len; return s; }).join('');
  if (!M.catD.length) return '<p class="empty sm">Sem despesas no período.</p>';
  return `<div class="dn"><svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="Despesas por categoria">${arcs}<text x="64" y="62" text-anchor="middle" class="dn-v">${C.brlS(M.D).replace('R$ ', '')}</text><text x="64" y="77" text-anchor="middle" class="ax">despesas</text></svg>
    <div class="dn-l">${M.catD.map((c, i) => `<div class="dn-r ${st.cat === c.k ? 'on' : ''}" ${act('cat', c.k)}><i style="background:${CAT_COR[i % CAT_COR.length]}"></i><span>${E(c.k)}</span><b>${Math.round(c.v / t * 100)}%</b></div>`).join('')}</div></div>`;
}

function acumulado(M) {
  const ms = M.months, W = 380, H = 160, pl = 44, pt = 12, pb = 22, n = ms.length;
  const { Y, mx, mn } = yScale(ms.map(x => x.acc), pt, H - pb), X = i => pl + (W - pl - 8) * (n === 1 ? .5 : i / (n - 1));
  const pp = ms.map((x, i) => [X(i), Y(x.acc)]), d = smooth(pp), last = ms[n - 1];
  const g = grid(Y, mx, mn, pl, W) + `<line x1="${pl}" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zl"/>
    <defs><linearGradient id="fAcc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--gold);stop-opacity:.45"/><stop offset="1" style="stop-color:var(--gold);stop-opacity:0"/></linearGradient></defs>
    <path d="${d}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z" fill="url(#fAcc)" class="ar"/><path d="${d}" class="ln acc"/>` +
    ms.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.acc)}" r="${i === n - 1 ? 5 : 3}" class="dot" ${tip(mLong(x.k), 'Acumulado: ' + C.brl(x.acc), 'No mês: ' + C.brl(x.res))}/>`).join('') +
    ms.map((x, i) => i % Math.ceil(n / 6) === 0 || i === n - 1 ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" class="ax">${mShort(x.k)}</text>` : '').join('');
  return `<div class="big-n ${last.acc < 0 ? 'down' : ''}">${C.brlS(last.acc)}<small>acumulado no período</small></div><svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Resultado acumulado">${g}</svg>`;
}

function margem(M) {
  const ms = M.months, W = 380, H = 160, pl = 8, pt = 18, pb = 22, n = ms.length, slot = (W - pl * 2) / n, bw = slot * .56;
  const vals = ms.map(x => x.m == null ? 0 : x.m), { Y } = yScale(vals, pt, H - pb);
  let g = `<defs>${vg('fgM', 'var(--c4)', .3)}</defs><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zl"/>`;
  ms.forEach((x, i) => {
    const v = vals[i], xx = pl + slot * i + (slot - bw) / 2, y = Math.min(Y(v), Y(0)), h = Math.max(1.5, Math.abs(Y(v) - Y(0)));
    g += `<path class="fb gr" d="${v >= 0 ? tb(xx, y, bw, h, 6) : `M${xx},${y}H${xx + bw}V${y + h}H${xx}Z`}" fill="${x.m == null ? 'var(--line)' : v >= 0 ? 'url(#fgM)' : 'var(--red)'}" ${tip(mLong(x.k), x.m == null ? 'Sem receita no mês: margem não se aplica' : 'Margem: ' + fp(x.m))}/>`;
    if (n <= 12 && x.m != null) g += `<text x="${xx + bw / 2}" y="${v >= 0 ? y - 4 : y + h + 10}" text-anchor="middle" class="vl">${Math.round(v * 100)}%</text>`;
    g += `<text x="${xx + bw / 2}" y="${H - 6}" text-anchor="middle" class="ax">${n > 6 ? mShort(x.k).slice(0, 1) : mShort(x.k)}</text>`;
  });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Margem por mês">${g}</svg>`;
}

function hbars(items, total, color, k, nameOf) {
  if (!items.length) return '<p class="empty sm">Sem lançamentos no período.</p>';
  const mx = items[0].v || 1;
  return `<div class="hb">${items.slice(0, 6).map(x => { const on = k && st[k] === x.k, name = nameOf(x.k); return `<div class="hb-r ${on ? 'on' : ''} ${k && st[k] && !on ? 'dim' : ''}" ${k ? act(k, x.k) : ''} ${tip(name, C.brl(x.v), fp(x.v / (total || 1)) + ' do total', k ? 'Clique para filtrar' : '')}><span class="hb-n">${E(name)}</span><span class="hb-t"><i class="gw" style="width:${(x.v / mx * 100).toFixed(1)}%;background:linear-gradient(90deg,color-mix(in srgb,${color} 35%,transparent),${color})"></i></span><b>${C.brlS(x.v)}</b></div>`; }).join('')}</div>`;
}

function contratos(M) {
  const S = M.S, porObra = group(M.contratos, c => c.obraId, c => c.valor).map(x => ({ ...x, pago: sum(M.contratos.filter(c => c.obraId === x.k), c => c.pago) }));
  if (!porObra.length) return '<p class="empty sm">Nenhum contrato cadastrado.</p>';
  const mx = porObra[0].v || 1, prox = M.ctAbertos.filter(c => c.valor > c.pago).sort((a, b) => a.fim.localeCompare(b.fim)).slice(0, 3);
  return `<div class="hb">${porObra.slice(0, 5).map(x => `<div class="hb-r" ${tip(C.nm(S.obras, x.k), 'Contratado: ' + C.brl(x.v), 'Pago: ' + C.brl(x.pago), 'A pagar: ' + C.brl(x.v - x.pago))}><span class="hb-n">${E(C.nm(S.obras, x.k))}</span><span class="hb-t"><i class="gw" style="width:${(x.v / mx * 100).toFixed(1)}%;background:linear-gradient(90deg,var(--c3) ${(x.pago / (x.v || 1) * 100).toFixed(1)}%,var(--c2) 0)"></i></span><b>${C.brlS(x.v - x.pago)}</b></div>`).join('')}</div>
  <div class="lg"><span><i style="background:var(--c3)"></i>Pago</span><span><i style="background:var(--c2)"></i>A pagar</span></div>
  ${prox.length ? `<div class="ct-n">${prox.map(c => { const d = C.daysTo(c.fim); return `<div ${tip(c.nome, c.empresa, 'Saldo: ' + C.brl(c.valor - c.pago))}><span>${E(short(c.nome, 30))}</span><b class="${d < 0 ? 'down' : d <= 30 ? 'warn' : ''}">${d < 0 ? 'vencido' : d + 'd'}</b></div>`; }).join('')}</div>` : ''}`;
}

function heat(M) {
  const cats = M.catD.map(c => c.k), ms = M.months, L = M.L.filter(l => l.tipo === 'Despesa');
  if (!cats.length) return '<p class="empty sm">Sem despesas no período.</p>';
  const val = (c, k) => sum(L.filter(l => catOf(l) === c && dkey(l.data) === k), l => l.valor), mx = Math.max(1, ...cats.flatMap(c => ms.map(x => val(c, x.k))));
  return `<div class="hm" style="grid-template-columns:minmax(90px,1.4fr) repeat(${ms.length},minmax(0,1fr))"><span></span>${ms.map(x => `<span class="hm-h">${ms.length > 6 ? mShort(x.k).slice(0, 1) : mShort(x.k)}</span>`).join('')}
    ${cats.map(c => `<span class="hm-c" title="${E(c)}">${E(short(c.replace('Obras (materiais e mão de obra)', 'Obras'), 16))}</span>${ms.map(x => { const v = val(c, x.k), a = v / mx; return `<span class="hm-v" style="--a:${(a * .85 + (v ? .08 : 0)).toFixed(2)}" ${act('mes', x.k)} ${tip(c + ' · ' + mLong(x.k), C.brl(v))}></span>`; }).join('')}`).join('')}</div>`;
}

function gauge(M) {
  const ob = M.S.obras.filter(o => o.status !== 'Concluída'), orc = sum(ob, o => +o.orcamento || 0), gas = sum(ob, o => +o.gasto || 0);
  if (!orc) return '<p class="empty sm">Nenhuma obra com orçamento.</p>';
  const p = gas / orc, pc = Math.min(1, p), R = 70, cx = 90, cy = 86, ang = Math.PI * (1 - pc);
  const x = cx + R * Math.cos(ang), y = cy - R * Math.sin(ang), cor = p > 0.9 ? 'var(--red)' : p > 0.7 ? 'var(--c2)' : 'var(--c3)';
  return `<svg class="ch gauge" viewBox="0 0 180 104" role="img" aria-label="Orçamento executado" ${tip('Orçamento executado das obras não concluídas', 'Gasto: ' + C.brl(gas), 'Orçamento: ' + C.brl(orc), 'Saldo: ' + C.brl(orc - gas))}>
    <path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}" fill="none" stroke-width="14" stroke-linecap="round" style="stroke:var(--panel2)"/>
    <path class="gp" d="M${cx - R},${cy} A${R},${R} 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}" fill="none" stroke-width="14" stroke-linecap="round" style="stroke:${cor}"/>
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" class="dn-v" style="font-size:22px">${fp(p).replace(',0%', '%')}</text>
    <text x="${cx}" y="${cy + 2}" text-anchor="middle" class="ax">do orçamento gasto</text></svg>
  <div class="an-next"><span>Gasto</span><b>${C.brlS(gas)}</b></div><div class="an-next"><span>Saldo a gastar</span><b>${C.brlS(orc - gas)}</b></div><div class="an-next"><span>Obras em aberto</span><b>${ob.length}</b></div>`;
}

/* ---------- página ---------- */
function page() {
  const M = model(), S = M.S, anim = st.anim; st.anim = false;
  const per = PER.map(p => `<button class="seg ${st.per === p[0] ? 'on' : ''}" ${act('per', p[0])} aria-pressed="${st.per === p[0]}">${p[1]}</button>`).join('');
  const head = C.header('Financeiro', 'Receitas, despesas, resultado e contratos, com comparação ao período anterior.',
    `<div class="seg-g" role="group" aria-label="Período">${per}</div><button class="btn ghost sm" data-act="csv" data-k="lancamentos">⬇ CSV</button><button class="btn sm" data-act="new" data-k="lancamentos">+ Lançamento</button>`);
  const nome = (arr, blank) => k => k ? C.nm(arr, k) : blank;
  const charts = `<div class="fc-grid">
    ${card('Fluxo de caixa', `${M.n} meses · clique no mês`, fluxo(M), 'w2')}
    ${card('Resultado acumulado', '', acumulado(M))}
    ${card('Cascata do resultado', 'de onde sai o dinheiro', cascata(M))}
    ${card('Despesas por categoria', 'clique para filtrar', donut(M))}
    ${card('Margem por mês', 'resultado ÷ receitas', margem(M))}
    ${card('Receita por empreendimento', '', hbars(M.recEmp, M.R, 'var(--c3)', null, nome(S.empreendimentos, 'Sem empreendimento')))}
    ${card('Despesa por obra', 'clique para filtrar', hbars(M.dspObra, M.D, 'var(--c6)', 'obra', nome(S.obras, 'Administrativo / sem obra')))}
    ${card('Contratos: pago × a pagar', 'situação de hoje', contratos(M))}
    ${card('Mapa de calor das despesas', 'categoria × mês', heat(M), 'w2')}
    ${card('Orçamento das obras', 'situação de hoje', gauge(M))}
  </div>`;
  return head + `<div class="fin ${anim ? 'anim' : ''}">${numbers(M)}${charts}${table(M)}</div>`;
}

function table(M) {
  const S = M.S, ks = new Set(M.keys);
  const ls = S.lancamentos.filter(l => ks.has(dkey(l.data)) && (st.tipo === 'Todos' || l.tipo === st.tipo) && (!st.mes || dkey(l.data) === st.mes) && (!st.cat || catOf(l) === st.cat) && (st.obra == null || (l.obraId || '') === st.obra) && C.match(l, C.nm(S.obras, l.obraId) + ' ' + C.nm(S.empreendimentos, l.empId) + ' ' + catOf(l))).sort((a, b) => b.data.localeCompare(a.data));
  const chip = (k, label) => `<span class="fchip i">${E(label)} <button ${act('clr', k)} aria-label="Remover filtro">✕</button></span>`;
  const chips = [st.mes && chip('mes', mLong(st.mes)), st.cat && chip('cat', st.cat), st.obra != null && chip('obra', st.obra ? C.nm(S.obras, st.obra) : 'Sem obra')].filter(Boolean).join('');
  const tot = sum(ls, l => l.tipo === 'Receita' ? l.valor : -l.valor);
  return `<div class="fin-t"><h3>Lançamentos <small>${ls.length} no período${chips ? ' filtrado' : ''} · saldo ${C.brl(tot)}</small></h3>
    <div class="fin-f"><div class="seg-g" role="group" aria-label="Tipo">${['Todos', 'Receita', 'Despesa'].map(t => `<button class="seg ${st.tipo === t ? 'on' : ''}" ${act('tipo', t)}>${t === 'Todos' ? 'Todos' : t + 's'}</button>`).join('')}</div>${chips}${chips ? `<button class="lnk" ${act('clr', 'all')}>Limpar filtros</button>` : ''}</div></div>` +
    C.table([
      { h: 'Data', f: l => C.dt(l.data) }, { h: 'Descrição', f: l => `<b>${E(l.desc)}</b><br><small class="mut">${E(catOf(l))}</small>` }, { h: 'Tipo', f: l => C.pill(l.tipo) },
      { h: 'Obra / Empreend.', f: l => E(l.obraId ? C.nm(S.obras, l.obraId) : l.empId ? C.nm(S.empreendimentos, l.empId) : '—') },
      { h: 'Valor', f: l => `<b class="${l.tipo === 'Receita' ? 'up' : 'down'}">${l.tipo === 'Receita' ? '+' : '−'} ${C.brl(l.valor)}</b>` }
    ], ls.slice(0, st.lim), 'lancamentos') + (ls.length > st.lim ? `<div class="fin-more"><button class="btn ghost sm" ${act('more', '1')}>Mostrar mais ${Math.min(15, ls.length - st.lim)} de ${ls.length - st.lim} restantes</button></div>` : '');
}

function onAct(el) {
  const k = el.dataset.fin, v = el.dataset.v;
  if (k === 'more') { st.lim += 15; C.render(); return; }
  st.lim = 15;
  if (k === 'per') { st.per = v; st.mes = null; st.anim = true; }
  else if (k === 'tipo') st.tipo = v;
  else if (k === 'mes') st.mes = st.mes === v ? null : v;
  else if (k === 'cat') st.cat = st.cat === v ? null : v;
  else if (k === 'obra') st.obra = st.obra === v ? null : v;
  else if (k === 'clr') { if (v === 'all') { st.mes = null; st.cat = null; st.obra = null; } else st[v] = null; }
  C.render();
}
function init(ctx) {
  C = ctx;
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-fin]'); if (el) onAct(el); });
  document.addEventListener('keydown', e => { const el = e.target.closest && e.target.closest('[data-fin]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAct(el); } });
  window.addEventListener('hashchange', () => { st.anim = true; });
}
window.FIN = { init, page, catOf, CATS };
})();
