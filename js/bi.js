/* Painel geral — Central de Inteligência (BI) do Império ERP.
   Tudo é calculado sobre os dados reais cadastrados; nada é fixo na tela.
   Insights e anomalias são regras de limiar determinísticas (não é IA). */
(function () {
'use strict';
let C; // contexto injetado pelo app (BI.init)
const LS = { st: 'imperio_bi_state_v1', views: 'imperio_bi_views_v1' };
const PERIODS = [['3m', '3 meses', 3], ['6m', '6 meses', 6], ['12m', '12 meses', 12], ['all', 'Tudo', 0]];
const DIMS = [
  { k: 'emp', l: 'Empreendimento' }, { k: 'obra', l: 'Obra' }, { k: 'status', l: 'Status da obra' },
  { k: 'resp', l: 'Engenheiro' }, { k: 'cat', l: 'Material' }
];
const ANOM = 0.3; // desvio mínimo da média móvel para marcar anomalia
const STATUS = ['Planejamento', 'Em andamento', 'Pausada', 'Concluída'];
const emptySel = () => Object.fromEntries(DIMS.map(d => [d.k, { i: [], x: [] }]));
const st = { period: '6m', cmp: true, sel: emptySel(), open: null };
let anim = true, lastDrill = null, tipEl = null;

/* ---------- utilidades ---------- */
const E = s => C.esc(s);
const R$ = n => C.brl(n), R$s = n => C.brlS(n);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const ratio = (a, b) => b ? a / b : null;
const fp = (x, d = 1) => x == null ? '—' : (x * 100).toFixed(d).replace('.', ',') + '%';
const f2 = x => x == null ? '—' : x.toFixed(2).replace('.', ',');
const pad = n => String(n).padStart(2, '0');
const mk = (y, m) => y + '-' + pad(m + 1);
const dkey = s => (s || '').slice(0, 7);
const mDate = k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1); };
const mShort = k => mDate(k).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
const mLong = k => mDate(k).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const monthsBack = (n, skip = 0) => { const d = new Date(), out = []; for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - skip - i, 1); out.push(mk(x.getFullYear(), x.getMonth())); } return out; };
const tip = (...l) => `data-tip="${E(l.filter(Boolean).join('\n'))}"`;
const a = (act, v, k) => `data-bi="${act}"${v != null ? ` data-v="${E(v)}"` : ''}${k ? ` data-k="${k}"` : ''} tabindex="0" role="button"`;
const info = t => `<span class="inf" tabindex="0" ${tip(...t)}>ⓘ</span>`;
const empty = t => `<p class="empty sm">${t || 'Sem dados para os filtros atuais.'}</p>`;
const card = (title, sub, body, cls = '', help) => `<section class="card bi-card ${cls}"><h3><span>${title}${help ? ' ' + info(help) : ''}</span>${sub ? `<small>${sub}</small>` : ''}</h3>${body}</section>`;

/* ---------- estado e persistência ---------- */
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS.st));
    if (!s || !s.sel) return;
    if (PERIODS.some(p => p[0] === s.period)) st.period = s.period;
    st.cmp = s.cmp !== false;
    DIMS.forEach(d => { const x = s.sel[d.k]; if (x) st.sel[d.k] = { i: [].concat(x.i || []), x: [].concat(x.x || []) }; });
  } catch (e) { /* sem estado salvo */ }
}
const saveState = () => { try { localStorage.setItem(LS.st, JSON.stringify({ period: st.period, cmp: st.cmp, sel: st.sel })); } catch (e) { /* ignora */ } };
const getViews = () => { try { return JSON.parse(localStorage.getItem(LS.views)) || []; } catch (e) { return []; } };
const putViews = v => { try { localStorage.setItem(LS.views, JSON.stringify(v)); } catch (e) { /* ignora */ } };
const BUILTIN = [
  { id: 'b-all', name: 'Visão geral (sem filtros)', period: '6m', sel: {} },
  { id: 'b-and', name: 'Só obras em andamento', period: '6m', sel: { status: { i: ['Em andamento'], x: [] } } },
  { id: 'b-sem', name: 'Sem obras concluídas', period: '6m', sel: { status: { i: [], x: ['Concluída'] } } },
  { id: 'b-tri', name: 'Último trimestre', period: '3m', sel: {} },
  { id: 'b-ano', name: 'Ano (12 meses)', period: '12m', sel: {} }
];

/* ---------- filtros (incluir / excluir; exclusão sempre ganha) ---------- */
const cnt = k => st.sel[k].i.length + st.sel[k].x.length;
const anyFilter = () => DIMS.some(d => cnt(d.k));
function cycle(k, v) { const s = st.sel[k]; if (s.i.includes(v)) { s.i = s.i.filter(x => x !== v); s.x.push(v); } else if (s.x.includes(v)) s.x = s.x.filter(x => x !== v); else s.i.push(v); }
function toggleInc(k, v) { const s = st.sel[k]; s.x = s.x.filter(x => x !== v); s.i = s.i.includes(v) ? s.i.filter(x => x !== v) : s.i.concat(v); }
function pass(k, v) { const s = st.sel[k]; if (s.x.includes(v)) return false; return !s.i.length || (v !== '' && s.i.includes(v)); }
function options(k) {
  const S = C.S();
  if (k === 'emp') return S.empreendimentos.map(e => ({ v: e.id, l: e.nome }));
  if (k === 'obra') return S.obras.map(o => ({ v: o.id, l: o.nome }));
  if (k === 'status') return STATUS.map(v => ({ v, l: v }));
  if (k === 'resp') return [...new Set(S.obras.map(o => o.resp).filter(Boolean))].map(v => ({ v, l: v }));
  return [...new Set(S.materiais.map(m => m.cat))].map(v => ({ v, l: v }));
}
const labelOf = (k, v) => (options(k).find(o => o.v === v) || { l: v }).l;
// dimensões de cada registro; sem valor ('') some quando há inclusão e permanece quando só há exclusão
function dRef(obraId, empId) {
  const o = obraId ? C.by(C.S().obras, obraId) : null;
  return { emp: empId || (o ? o.empId : ''), obra: obraId || '', status: o ? o.status : '', resp: o ? (o.resp || '') : '' };
}
const dObra = o => ({ emp: o.empId, obra: o.id, status: o.status, resp: o.resp || '' });
const okDims = d => pass('emp', d.emp) && pass('obra', d.obra) && pass('status', d.status) && pass('resp', d.resp);

/* ---------- indicadores de obra (valor agregado) ---------- */
function evm(o) {
  const BAC = +o.orcamento || 0, AC = +o.gasto || 0, p = C.prog(o) / 100, EV = BAC * p;
  const s = new Date(o.inicio + 'T12:00:00').getTime(), e = new Date(o.previsao + 'T12:00:00').getTime(), t = Date.now();
  const plan = isFinite(s) && isFinite(e) ? (e > s ? clamp((t - s) / (e - s), 0, 1) : (t >= e ? 1 : 0)) : 0;
  const PV = BAC * plan, firm = p >= 0.10 && AC > 0; // projeção só a partir de 10% de avanço
  const CPI = firm ? EV / AC : null, SPI = firm && PV > 0 ? EV / PV : null;
  const EAC = o.status === 'Concluída' ? AC : (CPI ? BAC / CPI : BAC);
  return { BAC, AC, EV, PV, CPI, SPI, EAC, p, plan, desvio: EAC - BAC };
}

/* ---------- modelo: aplica filtros e calcula tudo uma vez por desenho ---------- */
function flow(lanc, keys) {
  return keys.map(k => {
    const ls = lanc.filter(l => dkey(l.data) === k);
    const r = sum(ls.filter(l => l.tipo === 'Receita'), l => l.valor), d = sum(ls.filter(l => l.tipo === 'Despesa'), l => l.valor);
    return { k, r, d, s: r - d };
  });
}
function model() {
  const S = C.S();
  const all = S.lancamentos.map(l => dkey(l.data)).filter(Boolean).sort();
  let n = PERIODS.find(p => p[0] === st.period)[2];
  if (!n) { const first = all[0] || monthsBack(1)[0], d0 = mDate(first), now = new Date(); n = clamp((now.getFullYear() - d0.getFullYear()) * 12 + now.getMonth() - d0.getMonth() + 1, 1, 36); }
  const months = monthsBack(n), prevMonths = st.period === 'all' ? [] : monthsBack(n, n);
  const obras = S.obras.filter(o => okDims(dObra(o)));
  const obraF = ['obra', 'status', 'resp'].some(cnt);
  const emps = S.empreendimentos.filter(e => pass('emp', e.id) && (!obraF || obras.some(o => o.empId === e.id)));
  const lanc = S.lancamentos.filter(l => okDims(dRef(l.obraId, l.empId)));
  const series = flow(lanc, months), prev = flow(lanc, prevMonths);
  const R = sum(series, x => x.r), D = sum(series, x => x.d), pR = prevMonths.length ? sum(prev, x => x.r) : null, pD = prevMonths.length ? sum(prev, x => x.d) : null;
  const margin = ratio(R - D, R), pMargin = pR ? (pR - pD) / pR : null;
  // anomalia: mês que desvia 30% ou mais da média dos 3 meses anteriores
  const ext = flow(lanc, monthsBack(n + 3)), anom = [];
  for (let i = 3; i < ext.length; i++) ['r', 'd'].forEach(m => {
    const avg = (ext[i - 1][m] + ext[i - 2][m] + ext[i - 3][m]) / 3, dev = avg > 0 ? (ext[i][m] - avg) / avg : 0;
    if (Math.abs(dev) >= ANOM) anom.push({ k: ext[i].k, m, dev, v: ext[i][m], avg });
  });
  const active = obras.filter(o => o.status !== 'Concluída'), running = obras.filter(o => o.status === 'Em andamento');
  const tarefas = S.tarefas.filter(t => okDims(dRef(t.obraId, '')));
  const funcs = S.funcionarios.filter(f => okDims(dRef(f.obraId, '')));
  const mats = S.materiais.filter(m => pass('cat', m.cat));
  const movs = S.movs.filter(v => okDims(dRef(v.obraId, '')) && months.includes(dkey(v.data)));
  const lancP = lanc.filter(l => months.includes(dkey(l.data))), lancPrev = lanc.filter(l => prevMonths.includes(dkey(l.data)));
  const ev = active.map(evm);
  const BAC = sum(ev, x => x.BAC), AC = sum(ev, x => x.AC), EV = sum(ev, x => x.EV), EAC = sum(ev, x => x.EAC);
  const unid = sum(emps, e => e.unidades), vend = sum(emps, e => e.vendidas), res = sum(emps, e => e.reservadas);
  const vgv = sum(emps, e => e.vgv), vgvV = sum(emps, e => ratio(e.vendidas, e.unidades) * e.vgv || 0);
  const low = mats.filter(C.low);
  const abertas = tarefas.filter(t => t.status !== 'Resolvida'), vencidas = abertas.filter(t => C.daysTo(t.prazo) < 0);
  return {
    S, n, months, prevMonths, obras, emps, lanc, lancP, lancPrev, series, prev, R, D, pR, pD, margin, pMargin, anom, active, running,
    tarefas, funcs, mats, movs, BAC, AC, EV, EAC, unid, vend, res, vgv, vgvV, low, abertas, vencidas,
    stockVal: sum(mats, m => m.qtd * m.custo), lowCost: sum(low, m => (m.min - m.qtd) * m.custo),
    folha: sum(funcs.filter(f => f.status !== 'Afastado'), f => f.salario), ativos: funcs.filter(f => f.status === 'Ativo').length
  };
}

/* ---------- insights automáticos (regras de limiar) ---------- */
function insights(M) {
  const out = [], add = (sev, ic, title, text, act) => out.push({ sev, ic, title, text, act });
  M.active.forEach(o => {
    const v = evm(o);
    if (C.isLate(o)) add('crit', '⏰', 'Obra atrasada: ' + o.nome, `${-C.daysTo(o.previsao)} dias além da previsão (${C.dt(o.previsao)}), com ${C.prog(o)}% de avanço.`, { obra: o.id });
    else if (o.status === 'Em andamento' && v.SPI != null && v.SPI < 0.85) add('warn', '🐢', 'Ritmo abaixo do planejado: ' + o.nome, `Avanço de ${Math.round(v.SPI * 100)}% do que o cronograma previa até hoje (SPI ${f2(v.SPI)}).`, { obra: o.id });
    if (v.CPI != null && v.EAC > v.BAC * 1.05) { const d = v.EAC / v.BAC - 1; add(d > 0.10 ? 'crit' : 'warn', '💸', 'Projeção de estouro: ' + o.nome, `Mantido o ritmo de custo (CPI ${f2(v.CPI)}), termina em ${R$s(v.EAC)}: ${fp(d, 0)} acima do orçamento de ${R$s(v.BAC)}.`, { obra: o.id }); }
  });
  M.running.filter(o => !C.S().funcionarios.some(f => f.obraId === o.id)).forEach(o => add('warn', '👷', 'Obra sem equipe alocada: ' + o.nome, 'Está em andamento e nenhum funcionário está alocado nela.', { go: '#/funcionarios' }));
  if (M.low.length) {
    const crit = M.low.some(m => m.qtd < m.min * 0.5), worst = M.low.slice().sort((x, y) => x.qtd / x.min - y.qtd / y.min).slice(0, 3).map(m => m.nome).join(', ');
    add(crit ? 'crit' : 'warn', '📦', `${M.low.length} ${M.low.length > 1 ? 'itens abaixo' : 'item abaixo'} do estoque mínimo`, `Mais críticos: ${worst}. Repor até o mínimo custa ≈ ${R$s(M.lowCost)}.`, { drill: 'estoque' });
  }
  if (M.vencidas.length) add('crit', '📅', `${M.vencidas.length} ${M.vencidas.length > 1 ? 'tarefas vencidas' : 'tarefa vencida'}`, M.vencidas.slice(0, 2).map(t => t.titulo).join(' · '), { drill: 'tarefas' });
  const urg = M.abertas.filter(t => t.prio === 'Alta' && C.daysTo(t.prazo) >= 0 && C.daysTo(t.prazo) <= 7);
  if (urg.length) add('warn', '✅', `${urg.length} ${urg.length > 1 ? 'tarefas urgentes' : 'tarefa urgente'} nos próximos 7 dias`, urg.slice(0, 2).map(t => t.titulo).join(' · '), { drill: 'tarefas' });
  if (M.R - M.D < 0) add('crit', '📉', 'Resultado negativo no período', `Despesas de ${R$s(M.D)} superam as receitas de ${R$s(M.R)}.`, { drill: 'res' });
  if (M.margin != null && M.pMargin != null && M.pMargin - M.margin > 0.05) add('warn', '🎯', 'Margem em queda', `Margem de ${fp(M.margin)} contra ${fp(M.pMargin)} no período anterior.`, { drill: 'res' });
  ['d', 'r'].forEach(m => {
    const x = M.anom.filter(z => z.m === m && M.months.includes(z.k)).pop(); if (!x) return;
    const nome = m === 'd' ? 'Despesas' : 'Receitas', pc = fp(Math.abs(x.dev), 0), txt = `${nome} de ${mLong(x.k)}: ${R$s(x.v)} contra média de ${R$s(x.avg)} nos 3 meses anteriores.`;
    if (m === 'd') add(x.dev > 0 ? 'warn' : 'info', x.dev > 0 ? '🔺' : '🔻', `Despesas ${pc} ${x.dev > 0 ? 'acima' : 'abaixo'} do normal`, txt, { drill: 'm:' + x.k });
    else add(x.dev > 0 ? 'ok' : 'warn', x.dev > 0 ? '🚀' : '🔻', `Receitas ${pc} ${x.dev > 0 ? 'acima' : 'abaixo'} do normal`, txt, { drill: 'm:' + x.k });
  });
  const conc = (arr, key, nome, k, src) => { const g = group(arr, key, l => l.valor), tot = sum(g, x => x.v), top = g[0]; if (g.length > 1 && top && top.k && top.v / tot >= 0.5) add('info', '🧩', `Concentração: ${fp(top.v / tot, 0)} ${nome}`, `${C.nm(src, top.k)} responde por ${R$s(top.v)} de ${R$s(tot)} no período.`, { toggle: [k, top.k] }); };
  conc(M.lancP.filter(l => l.tipo === 'Receita'), l => dRef(l.obraId, l.empId).emp, 'da receita em um só empreendimento', 'emp', M.S.empreendimentos);
  conc(M.lancP.filter(l => l.tipo === 'Despesa'), l => l.obraId, 'da despesa em uma só obra', 'obra', M.S.obras);
  M.emps.filter(e => e.status === 'Entregue' && e.unidades - e.vendidas - e.reservadas > 0).forEach(e => { const d = e.unidades - e.vendidas - e.reservadas; add('info', '🏠', `${d} ${d > 1 ? 'unidades prontas' : 'unidade pronta'} para vender`, `${e.nome} já foi entregue e ainda tem ≈ ${R$s(e.vgv / e.unidades * d)} de VGV disponível.`, { toggle: ['emp', e.id] }); });
  if (M.res > 0) add('info', '🔖', `${M.res} unidades reservadas`, `Ainda não viraram venda: ≈ ${R$s(sum(M.emps, e => e.reservadas * e.vgv / (e.unidades || 1)))} de VGV.`, { drill: 'vendas' });
  const rank = { crit: 0, warn: 1, info: 2, ok: 3 };
  out.sort((x, y) => rank[x.sev] - rank[y.sev]);
  return out.length ? out : [{ sev: 'ok', ic: '✅', title: 'Tudo sob controle', text: 'Nenhuma regra de atenção disparou para os filtros atuais.' }];
}
function group(arr, keyFn, valFn) {
  const m = new Map(); arr.forEach(x => { const k = keyFn(x) || ''; m.set(k, (m.get(k) || 0) + valFn(x)); });
  return [...m].map(([k, v]) => ({ k, v })).sort((x, y) => y.v - x.v);
}

/* ---------- componentes visuais ---------- */
function delta(cur, prev, goodUp, what) {
  if (prev == null || !st.cmp) return '';
  if (!prev) return cur ? `<span class="dl" ${tip('Sem base de comparação', 'O período anterior não teve valor.')}>novo</span>` : '';
  const p = (cur - prev) / Math.abs(prev);
  if (Math.abs(p) < 0.005) return `<span class="dl" ${tip('Estável', `Igual ao período anterior (${what(prev)}).`)}>● estável</span>`;
  const good = (p >= 0) === goodUp;
  return `<span class="dl ${good ? 'up' : 'down'}" ${tip(`${p > 0 ? 'Acima' : 'Abaixo'} do período anterior`, `Anterior: ${what(prev)}`, good ? 'Variação favorável' : 'Variação desfavorável')}>${p > 0 ? '▲' : '▼'} ${fp(Math.abs(p))}</span>`;
}
function spark(vals, color) {
  if (vals.length < 2) return '';
  const W = 100, H = 30, lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const d = CK.smooth(vals.map((v, i) => [i / (vals.length - 1) * W, H - 3 - (v - lo) / sp * (H - 6)]));
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W},${H}L0,${H}Z" style="fill:${color};opacity:.16"/><path d="${d}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function kpiCard(k) {
  return `<div class="bk" ${a('drill', k.id)} ${tip(k.l, ...k.tip)}>
    <div class="bk-h"><span class="bk-ic c-${k.c}">${k.ic}</span><span class="bk-l">${k.l}</span></div>
    <div class="bk-v">${k.v}</div>
    <div class="bk-d">${k.d || ''}<span class="bk-s">${k.sub || ''}</span></div>
    ${k.spark ? spark(k.spark, k.sc) : ''}</div>`;
}
function rankList(items, total, empt) {
  if (!items.length) return empty(empt);
  const max = Math.max(...items.map(i => i.v), 1);
  return `<div class="rk">${items.map(i => `<div class="rk-r ${i.on ? 'sel' : ''}" ${i.bi || ''} ${tip(i.l, ...(i.tip || []))}>
    <div class="rk-t"><span>${E(i.l)}</span><b>${i.val}</b></div>
    <div class="rk-b"><i style="width:${(i.v / max * 100).toFixed(1)}%;background:${i.col || 'var(--c1)'}"></i></div>
    ${i.sub ? `<small class="mut">${i.sub}</small>` : ''}</div>`).join('')}</div>`;
}

/* ---------- gráfico principal: fluxo de caixa ---------- */
function cashChart(M) {
  const W = 760, H = 310, pl = 58, pr = 14, pt = 16, pb = 36, n = M.series.length;
  if (!M.lancP.length && !M.series.some(x => x.r || x.d)) return empty('Nenhum lançamento no período com os filtros atuais.');
  const cmp = st.cmp && M.prev.length === n;
  const vals = M.series.flatMap(x => [x.r, x.d, x.s]).concat(cmp ? M.prev.flatMap(x => [x.r, x.d]) : []);
  const hi = Math.max(1, ...vals) * 1.1, lo = Math.min(0, ...vals) * 1.1;
  const Y = v => pt + (H - pb - pt) * (1 - (v - lo) / (hi - lo)), slot = (W - pl - pr) / n, X = i => pl + slot * (i + .5), bw = clamp(slot * 0.32, 6, 30);
  let g = `<defs>${CK.vg('bgR', 'var(--c1)', .3)}${CK.vg('bgD', 'var(--c2)', .3)}</defs>`;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="gl"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${R$s(v).replace('R$ ', '')}</text>`; }
  g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" class="gz"/>`;
  const line = (arr, key, cls) => `<path class="${cls}" fill="none" d="${CK.smooth(arr.map((x, i) => [X(i), Y(x[key])]))}"/>`;
  if (cmp) g += line(M.prev, 'r', 'ln-prev c1') + line(M.prev, 'd', 'ln-prev c2');
  M.series.forEach((x, i) => {
    const an = M.anom.filter(z => z.k === x.k), cx = X(i);
    g += `<path class="cbar c1" style="fill:url(#bgR)" d="${CK.tb(cx - bw - 2, Y(Math.max(x.r, 0)), bw, Math.max(0, Y(0) - Y(Math.max(x.r, 0))), 6)}"/>`;
    g += `<path class="cbar c2" style="fill:url(#bgD)" d="${CK.tb(cx + 2, Y(Math.max(x.d, 0)), bw, Math.max(0, Y(0) - Y(Math.max(x.d, 0))), 6)}"/>`;
    if (an.length) g += `<text class="anom" x="${cx}" y="${Math.min(Y(x.r), Y(x.d)) - 7}" text-anchor="middle">⚠</text>`;
    const p = cmp ? M.prev[i] : null, lines = [mLong(x.k), `Receita: ${R$(x.r)}`, `Despesa: ${R$(x.d)}`, `Resultado: ${R$(x.s)} (margem ${fp(ratio(x.s, x.r))})`];
    if (p) lines.push(`Mês equivalente anterior (${mLong(p.k)}): receita ${R$s(p.r)} · despesa ${R$s(p.d)}`);
    an.forEach(z => lines.push(`⚠ ${z.m === 'd' ? 'Despesa' : 'Receita'} ${fp(Math.abs(z.dev), 0)} ${z.dev > 0 ? 'acima' : 'abaixo'} da média dos 3 meses anteriores`));
    lines.push('Clique para ver os lançamentos');
    g += `<rect class="hit" x="${cx - slot / 2}" y="${pt}" width="${slot}" height="${H - pb - pt}" ${a('drill', 'm:' + x.k)} ${tip(...lines)}/>`;
    g += `<text x="${cx}" y="${H - 12}" text-anchor="middle">${mShort(x.k)}${n > 7 || x.k.endsWith('-01') ? '/' + x.k.slice(2, 4) : ''}</text>`;
  });
  g += `<path class="ln-res" fill="none" d="${CK.smooth(M.series.map((x, i) => [X(i), Y(x.s)]))}"/>` + M.series.map((x, i) => `<circle class="dot-res" cx="${X(i)}" cy="${Y(x.s)}" r="4"/>`).join('');
  return `<svg class="chart bi-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas, despesas e resultado por mês: receita ${R$s(M.R)}, despesa ${R$s(M.D)}.">${g}</svg>
  <div class="legend"><span><i class="lg c1"></i>Receita</span><span><i class="lg c2"></i>Despesa</span><span><i class="lg-l"></i>Resultado</span>${cmp ? '<span><i class="lg-d"></i>Período anterior (receita e despesa)</span>' : ''}${M.anom.some(z => M.months.includes(z.k)) ? '<span>⚠ Desvio ≥ 30% da média móvel</span>' : ''}</div>`;
}

/* ---------- obras: orçamento, gasto, avanço e projeção ---------- */
function obrasPanel(M) {
  if (!M.active.length) return empty('Nenhuma obra ativa com os filtros atuais.');
  const rows = M.active.slice().sort((x, y) => y.orcamento - x.orcamento);
  const max = Math.max(...rows.map(o => Math.max(o.orcamento, evm(o).EAC)), 1) * 1.04, w = x => (x / max * 100).toFixed(2) + '%';
  return `<div class="orows">${rows.map(o => {
    const v = evm(o), over = v.CPI != null && v.EAC > v.BAC * 1.05, late = C.isLate(o), on = st.sel.obra.i.includes(o.id);
    return `<div class="orow ${on ? 'sel' : ''}" ${a('toggle', o.id, 'obra')} ${tip(o.nome, `Orçamento: ${R$(v.BAC)}`, `Gasto: ${R$(v.AC)} (${fp(ratio(v.AC, v.BAC), 0)})`, `Avanço físico: ${C.prog(o)}% → valor agregado ${R$s(v.EV)}`, v.CPI != null ? `Custo (CPI): ${f2(v.CPI)} · Projeção final: ${R$s(v.EAC)} (${v.desvio >= 0 ? '+' : '−'}${R$s(Math.abs(v.desvio))})` : 'Projeção de custo disponível a partir de 10% de avanço', v.SPI != null ? `Prazo (SPI): ${f2(v.SPI)}` : '', 'Clique para filtrar por esta obra')}>
      <div class="ol"><b>${E(o.nome)}</b>${late ? C.pill('Atrasada').replace('c-blue', 'c-red') : C.pill(o.status)}<button class="lk" ${a('obra', o.id)} aria-label="Abrir ${E(o.nome)}">↗</button></div>
      <div class="otrack"><i class="bud" style="width:${w(v.BAC)}"></i><i class="spent ${v.AC > v.EV * 1.1 ? 'hot' : ''}" style="width:${w(v.AC)}"></i><s class="mk ev" style="left:${w(v.EV)}"></s>${over ? `<s class="mk eac" style="left:${w(v.EAC)}"></s>` : ''}</div>
      <div class="onum"><span>Gasto <b>${R$s(v.AC)}</b> de ${R$s(v.BAC)}</span><span>Avanço <b>${C.prog(o)}%</b></span>${over ? `<span class="down">Projeção ${R$s(v.EAC)}</span>` : ''}</div></div>`;
  }).join('')}</div>
  <div class="legend"><span><i class="lg bud"></i>Orçamento</span><span><i class="lg spent"></i>Gasto</span><span><i class="lg-t"></i>Valor agregado (avanço × orçamento)</span><span><i class="lg-t r"></i>Projeção acima do orçamento</span></div>`;
}

/* ---------- saúde das obras: custo x prazo ---------- */
function healthPanel(M) {
  const pts = M.active.map(o => ({ o, v: evm(o) })).filter(x => x.v.CPI != null && x.v.SPI != null);
  if (!pts.length) return empty('Sem obra com 10% ou mais de avanço para calcular custo e prazo.');
  const W = 520, H = 340, pl = 44, pb = 38, pt = 12, pr = 12, lo = 0.5, hi = 1.5;
  const X = v => pl + (W - pl - pr) * (clamp(v, lo, hi) - lo) / (hi - lo), Y = v => pt + (H - pb - pt) * (1 - (clamp(v, lo, hi) - lo) / (hi - lo));
  const maxB = Math.max(...pts.map(p => p.v.BAC));
  let g = `<rect x="${X(1)}" y="${Y(hi)}" width="${X(hi) - X(1)}" height="${Y(1) - Y(hi)}" class="q-good"/><rect x="${pl}" y="${Y(1)}" width="${X(1) - pl}" height="${Y(lo) - Y(1)}" class="q-bad"/>`;
  [0.5, 0.75, 1, 1.25, 1.5].forEach(t => { g += `<line x1="${X(t)}" x2="${X(t)}" y1="${pt}" y2="${H - pb}" class="${t === 1 ? 'gz' : 'gl'}"/><line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" class="${t === 1 ? 'gz' : 'gl'}"/><text x="${X(t)}" y="${H - pb + 15}" text-anchor="middle">${f2(t)}</text><text x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${f2(t)}</text>`; });
  g += `<text x="${(pl + W - pr) / 2}" y="${H - 6}" text-anchor="middle" class="ax">Prazo (SPI) → adiantada</text><text transform="translate(11 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle" class="ax">Custo (CPI) → econômica</text>`;
  g += `<text x="${W - pr - 6}" y="${pt + 14}" text-anchor="end" class="qt">No prazo e no custo</text><text x="${pl + 6}" y="${H - pb - 8}" class="qt">Atrasada e cara</text>`;
  pts.forEach(({ o, v }) => {
    const good = v.CPI >= 1 && v.SPI >= 1, bad = v.CPI < 0.9 || v.SPI < 0.85, r = 7 + 13 * Math.sqrt(v.BAC / maxB), on = st.sel.obra.i.includes(o.id);
    const lines = [o.nome, `Custo (CPI): ${f2(v.CPI)} — ${v.CPI >= 1 ? 'gastando menos que o avanço' : 'gastando mais que o avanço'}`, `Prazo (SPI): ${f2(v.SPI)} — ${v.SPI >= 1 ? 'adiantada' : 'atrás do cronograma'}`, `Orçamento: ${R$s(v.BAC)}`, 'Clique para filtrar por esta obra'];
    g += `<g ${a('toggle', o.id, 'obra')} ${tip(...lines)} class="pt ${good ? 'good' : bad ? 'bad' : 'mid'} ${on ? 'sel' : ''}"><circle cx="${X(v.SPI)}" cy="${Y(v.CPI)}" r="${r.toFixed(1)}"/><text x="${X(v.SPI)}" y="${Y(v.CPI) - r - 5}" text-anchor="middle" class="plab">${E(o.nome.length > 22 ? o.nome.slice(0, 21) + '…' : o.nome)}</text></g>`;
  });
  return `<svg class="chart bi-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dispersão de custo (CPI) por prazo (SPI) das obras">${g}</svg>
  <div class="legend"><span><i class="lg c3"></i>No prazo e no custo</span><span><i class="lg c2"></i>Atenção</span><span><i class="lg bad"></i>CPI &lt; 0,90 ou SPI &lt; 0,85</span><span>Tamanho = orçamento</span></div>`;
}

/* ---------- cronograma ---------- */
function ganttPanel(M) {
  const rows = M.active.filter(o => o.inicio && o.previsao);
  if (!rows.length) return empty('Nenhuma obra ativa com datas cadastradas.');
  const t = d => new Date(d + 'T12:00:00').getTime(), now = Date.now();
  let lo = Math.min(...rows.map(o => t(o.inicio)), now), hi = Math.max(...rows.map(o => t(o.previsao)), now);
  const padd = (hi - lo) * 0.02; lo -= padd; hi += padd;
  const P = ms => ((ms - lo) / (hi - lo) * 100), ticks = [], d0 = new Date(lo), step = (hi - lo) / 864e5 > 900 ? 6 : (hi - lo) / 864e5 > 420 ? 3 : 1;
  for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); +d < hi; d = new Date(d.getFullYear(), d.getMonth() + step, 1)) ticks.push(d);
  return `<div class="gantt"><div class="g-h"><span></span><div class="g-axis">${ticks.map(d => `<em style="left:${P(+d).toFixed(2)}%">${d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')}</em>`).join('')}</div></div>
  ${rows.sort((x, y) => t(x.inicio) - t(y.inicio)).map(o => {
    const l = P(t(o.inicio)), r = P(t(o.previsao)), w = Math.max(r - l, 0.8), late = C.isLate(o), p = C.prog(o), cls = late ? 'late' : { 'Em andamento': 'run', 'Planejamento': 'plan', 'Pausada': 'pause' }[o.status] || 'run';
    return `<div class="g-r"><span class="g-n" title="${E(o.nome)}">${E(o.nome)}</span><div class="g-t">${ticks.map(d => `<u style="left:${P(+d).toFixed(2)}%"></u>`).join('')}
      <div class="g-b ${cls}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%" ${a('obra', o.id)} ${tip(o.nome, `${C.dt(o.inicio)} → ${C.dt(o.previsao)}`, `Avanço físico: ${p}%`, late ? `Atrasada há ${-C.daysTo(o.previsao)} dias` : o.status === 'Planejamento' ? 'Em planejamento' : `Faltam ${Math.max(0, C.daysTo(o.previsao))} dias para a previsão`, 'Clique para abrir a obra')}><i style="width:${p}%"></i><span>${p}%</span></div></div></div>`;
  }).join('')}
  <div class="g-now" style="left:calc(var(--gl) + (100% - var(--gl)) * ${P(now).toFixed(2) / 100})"><span>Hoje</span></div></div>
  <div class="legend"><span><i class="lg run"></i>Em andamento</span><span><i class="lg plan"></i>Planejamento</span><span><i class="lg pause"></i>Pausada</span><span><i class="lg late"></i>Atrasada</span><span>Preenchimento = avanço físico</span></div>`;
}

/* ---------- status das obras (rosca) ---------- */
function statusPanel(M) {
  const parts = STATUS.map((s, i) => ({ s, v: M.obras.filter(o => o.status === s).length, bac: sum(M.obras.filter(o => o.status === s), o => o.orcamento), c: ['var(--c5)', 'var(--c1)', 'var(--c2)', 'var(--c3)'][i] }));
  const tot = sum(parts, p => p.v);
  if (!tot) return empty('Nenhuma obra para os filtros atuais.');
  const R = 52, CC = 2 * Math.PI * R, any = st.sel.status.i.length > 0, nv = parts.filter(p => p.v).length; let off = 0;
  const arcs = `<circle r="${R}" cx="70" cy="70" fill="none" stroke-width="18" style="stroke:var(--panel2)"/>` + parts.filter(p => p.v).map(p => {
    const len = p.v / tot * CC, on = st.sel.status.i.includes(p.s), s = `<circle ${a('toggle', p.s, 'status')} ${tip(p.s, `${p.v} obra(s) · orçamento ${R$s(p.bac)}`, 'Clique para filtrar por este status')} r="${R}" cx="70" cy="70" fill="none" stroke-width="${on ? 22 : 18}" style="stroke:${p.c};opacity:${any && !on ? .35 : 1}" ${CK.ringDash(len, CC, nv, 10)} stroke-dashoffset="${-off}" transform="rotate(-90 70 70)" class="slice"/>`; off += len; return s;
  }).join('');
  return `<div class="donut-w"><svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="${tot} obras por status">${arcs}<text x="70" y="70" text-anchor="middle" class="dn">${tot}</text><text x="70" y="88" text-anchor="middle" style="font-size:10px">obras</text></svg>
  <div class="dl-list">${parts.map(p => `<button class="dl-i ${st.sel.status.i.includes(p.s) ? 'sel' : ''}" ${a('toggle', p.s, 'status')}><i class="lg" style="background:${p.c}"></i><span>${p.s}</span><small class="mut">${R$s(p.bac)}</small><b>${p.v}</b></button>`).join('')}</div></div>`;
}

/* ---------- vendas ---------- */
function salesPanel(M) {
  if (!M.emps.length) return empty('Nenhum empreendimento para os filtros atuais.');
  const rows = M.emps.map(e => { const disp = Math.max(0, e.unidades - e.vendidas - e.reservadas), vv = ratio(e.vendidas, e.unidades) * e.vgv || 0, on = st.sel.emp.i.includes(e.id);
    return `<div class="srow ${on ? 'sel' : ''}" ${a('toggle', e.id, 'emp')} ${tip(e.nome, `${e.vendidas} vendidas · ${e.reservadas} reservadas · ${disp} disponíveis de ${e.unidades}`, `VGV: ${R$(e.vgv)}`, `VGV vendido (estimado): ${R$s(vv)}`, `Entrega prevista: ${C.dt(e.entrega)}`, 'Clique para filtrar por este empreendimento')}>
      <div class="rk-t"><span><b>${E(e.nome)}</b> ${C.pill(e.status)}</span><b>${fp(ratio(e.vendidas, e.unidades), 0)}</b></div>
      <div class="stack"><i class="c3" style="width:${ratio(e.vendidas, e.unidades) * 100 || 0}%"></i><i class="c2" style="width:${ratio(e.reservadas, e.unidades) * 100 || 0}%"></i></div>
      <small class="mut">${e.vendidas} vendidas · ${e.reservadas} reservadas · ${disp} disponíveis · VGV ${R$s(e.vgv)}</small></div>`; }).join('');
  return `<div class="s-sum"><div><small>Unidades vendidas</small><b>${M.vend}<em>/${M.unid}</em></b></div><div><small>VGV vendido <i ${tip('Estimativa', 'VGV × proporção de unidades vendidas de cada empreendimento. Não é valor contratado.')}>(est.)</i></small><b>${R$s(M.vgvV)}</b></div><div><small>VGV a vender</small><b>${R$s(M.vgv - M.vgvV)}</b></div></div>${rows}
  <div class="legend"><span><i class="lg c3"></i>Vendidas</span><span><i class="lg c2"></i>Reservadas</span><span><i class="lg track"></i>Disponíveis</span></div>`;
}

/* ---------- origem da receita e destino da despesa ---------- */
function flowRank(M, tipo) {
  const isR = tipo === 'Receita', S = M.S;
  const key = isR ? (l => dRef(l.obraId, l.empId).emp) : (l => l.obraId), dim = isR ? 'emp' : 'obra';
  const cur = group(M.lancP.filter(l => l.tipo === tipo), key, l => l.valor), pv = new Map(group(M.lancPrev.filter(l => l.tipo === tipo), key, l => l.valor).map(x => [x.k, x.v]));
  const tot = sum(cur, x => x.v), src = isR ? S.empreendimentos : S.obras;
  return rankList(cur.map((x, i) => {
    const nome = x.k ? C.nm(src, x.k) : (isR ? 'Sem empreendimento' : 'Sem obra (administrativo)'), p = pv.get(x.k);
    return { l: nome, v: x.v, val: R$s(x.v), col: isR ? 'var(--c1)' : 'var(--c2)', on: x.k && st.sel[dim].i.includes(x.k), bi: x.k ? a('toggle', x.k, dim) : '',
      sub: `${fp(x.v / tot, 0)} do total${st.cmp && p != null ? ` · antes ${R$s(p)}` : ''}`, tip: [`${R$(x.v)} (${fp(x.v / tot, 1)} do total)`, st.cmp && p != null ? `Período anterior: ${R$s(p)}` : '', x.k ? 'Clique para filtrar' : ''] };
  }), tot, 'Sem lançamentos no período.');
}

/* ---------- estoque ---------- */
function stockPanel(M) {
  const cats = group(M.mats, m => m.cat, m => m.qtd * m.custo), crit = M.low.slice().sort((x, y) => x.qtd / x.min - y.qtd / y.min);
  const entr = sum(M.movs.filter(v => v.tipo === 'Entrada'), v => v.qtd * ((C.by(M.S.materiais, v.matId) || {}).custo || 0)), said = sum(M.movs.filter(v => v.tipo === 'Saída'), v => v.qtd * ((C.by(M.S.materiais, v.matId) || {}).custo || 0));
  return `<div class="bi-2">
    <div><h4 class="sub-h">Valor em estoque por categoria</h4>${rankList(cats.map((c, i) => ({ l: c.k, v: c.v, val: R$s(c.v), col: 'var(--c4)', on: st.sel.cat.i.includes(c.k), bi: a('toggle', c.k, 'cat'), tip: [R$(c.v), 'Clique para filtrar por esta categoria'] })), 0, 'Sem materiais.')}</div>
    <div><h4 class="sub-h">Itens abaixo do mínimo <a href="#/estoque" class="lnk">ver estoque</a></h4>${crit.length ? crit.slice(0, 6).map(m => `<div class="crit" ${tip(m.nome, `Em estoque: ${C.num(m.qtd)} ${m.un} · mínimo ${C.num(m.min)}`, `Repor até o mínimo ≈ ${R$((m.min - m.qtd) * m.custo)}`, `Fornecedor: ${C.nm(M.S.fornecedores, m.forn)}`)}><div class="rk-t"><span>${E(m.nome)}</span><b>${C.num(m.qtd)}<em>/${C.num(m.min)} ${E(m.un)}</em></b></div><div class="bar r"><i style="width:${clamp(m.qtd / m.min * 100, 2, 100)}%"></i></div></div>`).join('') : '<p class="empty sm">✅ Nenhum item abaixo do mínimo.</p>'}</div></div>
  <div class="mini-stats"><div><small>Entradas no período</small><b class="up">${R$s(entr)}</b></div><div><small>Saídas no período</small><b class="warn">${R$s(said)}</b></div><div><small>Movimentações</small><b>${M.movs.length}</b></div><div><small>Repor até o mínimo</small><b class="${M.low.length ? 'down' : ''}">${R$s(M.lowCost)}</b></div></div>`;
}

/* ---------- equipe e tarefas ---------- */
function teamPanel(M) {
  const byObra = group(M.funcs, f => f.obraId, () => 1), S = M.S;
  const people = byObra.map((x, i) => ({ l: x.k ? C.nm(S.obras, x.k) : 'Sem obra alocada', v: x.v, val: x.v + (x.v > 1 ? ' pessoas' : ' pessoa'), col: 'var(--c5)', on: x.k && st.sel.obra.i.includes(x.k), bi: x.k ? a('toggle', x.k, 'obra') : '',
    sub: 'Folha base ' + R$s(sum(M.funcs.filter(f => (f.obraId || '') === x.k && f.status !== 'Afastado'), f => f.salario)), tip: [x.v + ' funcionário(s)', x.k ? 'Clique para filtrar' : ''] }));
  const cols = ['Aberta', 'Em andamento', 'Resolvida'];
  const urg = M.abertas.slice().sort((x, y) => x.prazo.localeCompare(y.prazo)).slice(0, 4);
  return `<h4 class="sub-h">Pessoas por obra</h4>${rankList(people, 0, 'Nenhum funcionário para os filtros atuais.')}
  <h4 class="sub-h" style="margin-top:18px">Tarefas <a href="#/tarefas" class="lnk">abrir quadro</a></h4>
  <div class="mini-stats">${cols.map(c => `<div><small>${c}</small><b>${M.tarefas.filter(t => t.status === c).length}</b></div>`).join('')}<div><small>Vencidas</small><b class="${M.vencidas.length ? 'down' : ''}">${M.vencidas.length}</b></div></div>
  ${urg.map(t => `<div class="li"><span class="dot c-${C.COLOR[t.prio] || 'blue'}">${t.prio === 'Alta' ? '❗' : '•'}</span><div><b>${E(t.titulo)}</b><small>${E(C.nm(S.obras, t.obraId))} · ${C.dt(t.prazo)}</small></div><div class="end">${C.daysTo(t.prazo) < 0 ? '<span class="down">vencida</span>' : 'em ' + C.daysTo(t.prazo) + 'd'}</div></div>`).join('')}`;
}

/* ---------- insights ---------- */
function insightsPanel(list) {
  const lab = { crit: 'Crítico', warn: 'Atenção', info: 'Info', ok: 'Positivo' };
  return `<div class="ins-l">${list.map(i => {
    const att = i.act ? (i.act.go ? `href="${i.act.go}"` : i.act.obra ? a('obra', i.act.obra) : i.act.drill ? a('drill', i.act.drill) : a('toggle', i.act.toggle[1], i.act.toggle[0])) : '';
    return `<${i.act && i.act.go ? 'a' : 'div'} class="ins ${i.sev}" ${att}><span class="ins-i">${i.ic}</span><div><b>${E(i.title)}</b><small>${E(i.text)}</small></div><span class="ins-t">${lab[i.sev]}</span></${i.act && i.act.go ? 'a' : 'div'}>`;
  }).join('')}</div>`;
}

/* ---------- barra de filtros ---------- */
function filterBar() {
  const per = PERIODS.map(([k, l]) => `<button class="seg ${st.period === k ? 'on' : ''}" ${a('period', k)} aria-pressed="${st.period === k}">${l}</button>`).join('');
  const dims = DIMS.map(d => { const n = cnt(d.k), open = st.open === d.k;
    return `<div class="fdim"><button class="fbtn ${n ? 'on' : ''}" ${a('open', d.k)} aria-expanded="${open}">${d.l}${n ? `<b>${n}</b>` : ''}<span>▾</span></button>${open ? `<div class="fpop" role="menu">${options(d.k).map(o => { const s = st.sel[d.k].i.includes(o.v) ? 'inc' : st.sel[d.k].x.includes(o.v) ? 'exc' : '';
      return `<button class="fopt ${s}" ${a('cycle', o.v, d.k)}><span class="fst">${s === 'inc' ? '＋' : s === 'exc' ? '－' : ''}</span>${E(o.l)}</button>`; }).join('') || '<p class="empty sm">Sem opções.</p>'}
      <div class="fpop-f"><small>Clique: incluir → excluir → limpar</small>${n ? `<button class="lnk" ${a('clear', '', d.k)}>Limpar</button>` : ''}</div></div>` : ''}</div>`; }).join('');
  const views = [...BUILTIN, ...getViews()], vOpen = st.open === 'views';
  const chips = DIMS.flatMap(d => st.sel[d.k].i.map(v => ({ d, v, x: 0 })).concat(st.sel[d.k].x.map(v => ({ d, v, x: 1 }))));
  return `<div class="bi-filters" id="biFilters"><div class="bf-row"><div class="seg-g" role="group" aria-label="Período">${per}</div>
    <div class="bf-dims">${dims}</div>
    <div class="bf-r"><button class="chip ${st.cmp ? 'on' : ''}" ${a('cmp')} aria-pressed="${st.cmp}" ${tip('Comparar com o período anterior', 'Mostra a variação dos indicadores e a linha tracejada no gráfico de fluxo de caixa.')}>⇄ Comparar</button>
    <div class="fdim"><button class="fbtn" ${a('open', 'views')} aria-expanded="${vOpen}">💾 Visões<span>▾</span></button>${vOpen ? `<div class="fpop right" role="menu">${views.map(v => `<div class="vrow"><button class="fopt" ${a('view', v.id)}>${E(v.name)}</button>${v.id.startsWith('b-') ? '' : `<button class="vx" ${a('delview', v.id)} aria-label="Excluir visão ${E(v.name)}">✕</button>`}</div>`).join('')}<div class="fpop-f"><button class="lnk" ${a('saveview')}>＋ Salvar filtros atuais como visão…</button></div></div>` : ''}</div></div></div>
    ${chips.length ? `<div class="bf-chips">${chips.map(c => `<span class="fchip ${c.x ? 'x' : 'i'}">${c.x ? 'Exceto' : c.d.l + ':'} ${E(labelOf(c.d.k, c.v))}${c.x ? ` <small>(${c.d.l})</small>` : ''}<button ${a('rm', c.v, c.d.k)} aria-label="Remover filtro">✕</button></span>`).join('')}<button class="lnk" ${a('clear')}>Limpar tudo</button></div>` : ''}</div>`;
}

/* ---------- página ---------- */
function page() {
  const M = model(), ins = insights(M), cmp = st.cmp && M.prevMonths.length;
  const pName = PERIODS.find(p => p[0] === st.period)[1], per = `${mShort(M.months[0])}/${M.months[0].slice(2, 4)} a ${mShort(M.months[M.months.length - 1])}/${M.months[M.months.length - 1].slice(2, 4)}`;
  const hora = new Date().getHours(), sau = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const kp = [
    { id: 'rec', ic: '📈', c: 'blue', l: 'Receita', v: R$s(M.R), d: delta(M.R, M.pR, true, R$s), sub: pName, spark: M.series.map(x => x.r), sc: 'var(--c1)', tip: ['Soma das receitas lançadas no período.', 'Clique para ver os lançamentos.'] },
    { id: 'dsp', ic: '📉', c: 'orange', l: 'Despesa', v: R$s(M.D), d: delta(M.D, M.pD, false, R$s), sub: pName, spark: M.series.map(x => x.d), sc: 'var(--c2)', tip: ['Soma das despesas lançadas no período.', 'Menor é melhor.'] },
    { id: 'res', ic: '💰', c: M.R >= M.D ? 'green' : 'red', l: 'Resultado', v: R$s(M.R - M.D), d: delta(M.R - M.D, M.pR == null ? null : M.pR - M.pD, true, R$s), sub: `margem ${fp(M.margin)}`, spark: M.series.map(x => x.s), sc: 'var(--c3)', tip: ['Receita − despesa no período.', 'Margem = resultado ÷ receita.'] },
    { id: 'orc', ic: '📊', c: 'purple', l: 'Orçamento executado', v: fp(ratio(M.AC, M.BAC), 0), sub: `avanço físico ${fp(ratio(M.EV, M.BAC), 0)}`, tip: ['Gasto ÷ orçamento das obras ativas.', 'Avanço físico ponderado pelo orçamento de cada obra.', 'Gasto bem acima do avanço = custo fora do ritmo.'] },
    { id: 'eac', ic: '🔮', c: M.EAC > M.BAC * 1.02 ? 'red' : 'green', l: 'Custo final projetado', v: R$s(M.EAC), sub: M.BAC ? `${M.EAC >= M.BAC ? '+' : '−'}${R$s(Math.abs(M.EAC - M.BAC))} vs orçamento` : '', tip: ['Projeção do custo final das obras ativas.', 'Obra: orçamento ÷ CPI, com CPI = valor agregado ÷ gasto.', 'Só projeta a partir de 10% de avanço.'] },
    { id: 'obras', ic: '🏗️', c: 'blue', l: 'Obras em andamento', v: M.running.length, d: M.obras.some(C.isLate) ? `<span class="dl down">▼ ${M.obras.filter(C.isLate).length} atrasada(s)</span>` : '<span class="dl up">▲ no prazo</span>', sub: `${M.obras.length} no filtro`, tip: ['Obras com status "Em andamento".', 'Atrasada = em andamento com previsão vencida.'] },
    { id: 'vendas', ic: '🏢', c: 'gold', l: 'Vendas', v: fp(ratio(M.vend, M.unid), 0), sub: `${M.vend}/${M.unid} un. · VGV ${R$s(M.vgv)}`, tip: ['Unidades vendidas ÷ unidades totais.', 'Reservas não contam como venda.'] },
    { id: 'estoque', ic: '📦', c: M.low.length ? 'red' : 'green', l: 'Estoque crítico', v: M.low.length, sub: `valor em estoque ${R$s(M.stockVal)}`, tip: ['Itens com quantidade abaixo do mínimo.', 'Reposição até o mínimo ≈ ' + R$s(M.lowCost)] },
    { id: 'equipe', ic: '👷', c: 'orange', l: 'Equipe ativa', v: M.ativos, sub: `folha base ${R$s(M.folha)}`, tip: ['Funcionários com situação "Ativo".', 'Folha base = salários de quem não está afastado.'] },
    { id: 'tarefas', ic: '✅', c: M.vencidas.length ? 'red' : 'blue', l: 'Tarefas abertas', v: M.abertas.length, d: M.vencidas.length ? `<span class="dl down">▼ ${M.vencidas.length} vencida(s)</span>` : '<span class="dl up">▲ em dia</span>', tip: ['Tarefas que não estão resolvidas.'] }
  ];
  const note = M.lanc.length < C.S().lancamentos.length || M.obras.length < C.S().obras.length;
  setTimeout(() => { anim = false; }, 1200);
  return C.header(`${sau}, Império 👋`, 'Painel geral — central de inteligência de obras, vendas, estoque e finanças.',
    `<button class="btn ghost" ${a('csv')}>⬇ Exportar CSV</button><button class="btn ghost" ${a('print')}>🖨 Imprimir / PDF</button><button class="btn ghost" data-act="mov" data-v="Entrada">📥 Entrada</button><button class="btn ghost" data-act="mov" data-v="Saída">📤 Saída</button><button class="btn" data-act="new" data-k="obras">+ Obra</button>`)
  + filterBar() + `<div class="bi ${anim ? 'bi-anim' : ''}">
  <p class="bi-scope">Período <b>${per}</b> (${M.n} ${M.n > 1 ? 'meses' : 'mês'})${cmp ? ' comparado aos ' + M.prevMonths.length + ' anteriores' : ''}. Receita, despesa e movimentação seguem o período; obras, vendas, estoque e equipe mostram a situação de hoje.${note && anyFilter() ? ' Lançamentos sem vínculo com a obra/empreendimento filtrado ficam de fora.' : ''}</p>
  <div class="bk-grid">${kp.map(kpiCard).join('')}</div>
  <div class="bi-row r-8-4">${card('Fluxo de caixa', per, cashChart(M), '', ['Barras: receita e despesa de cada mês.', 'Linha: resultado (receita − despesa).', 'Tracejado: mesmos meses do período anterior.', 'Clique em um mês para ver os lançamentos.'])}
    ${card('🧠 Insights automáticos', `${ins.filter(i => i.sev === 'crit' || i.sev === 'warn').length} para ver`, insightsPanel(ins), 'ins-card', ['Regras de limiar sobre os números do painel (não é IA).', 'Respeitam os filtros ativos.', 'Clique em um insight para investigar.'])}</div>
  <div class="bi-row r-7-5">${card('Obras: orçamento × gasto × avanço', `${M.active.length} ativa(s)`, obrasPanel(M), '', ['Barra clara = orçamento; preenchida = gasto.', 'Marca ◆ = valor agregado (avanço físico × orçamento).', 'Gasto à frente da marca = custo acima do avanço.', 'Clique na linha para filtrar; ↗ abre a obra.'])}
    ${card('Saúde das obras', 'custo × prazo', healthPanel(M), '', ['CPI = valor agregado ÷ gasto (acima de 1 é econômica).', 'SPI = valor agregado ÷ valor planejado até hoje (acima de 1 é adiantada).', 'Planejado = orçamento × fração do prazo decorrida.', 'Aparece a partir de 10% de avanço.'])}</div>
  <div class="bi-row">${card('Cronograma das obras', 'linha do tempo', ganttPanel(M))}</div>
  <div class="bi-row r-4-8">${card('Status das obras', 'clique para filtrar', statusPanel(M))}
    ${card('Vendas por empreendimento', `${M.emps.length} no filtro`, salesPanel(M))}</div>
  <div class="bi-row r-6-6">${card('De onde vem a receita', pName, flowRank(M, 'Receita'), '', ['Receita do período por empreendimento.', 'Lançamentos sem empreendimento ficam em "Sem empreendimento".'])}
    ${card('Para onde vai a despesa', pName, flowRank(M, 'Despesa'), '', ['Despesa do período por obra.', 'Lançamentos sem obra são administrativos.'])}</div>
  <div class="bi-row r-7-5">${card('Estoque e insumos', 'situação de hoje', stockPanel(M), '', ['Estoque é global: só responde ao filtro de categoria de material.'])}
    ${card('Equipe e tarefas', 'situação de hoje', teamPanel(M))}</div>
  <p class="bi-foot">Como ler: indicadores de custo e prazo (CPI, SPI, projeção) seguem o método do valor agregado. Insights e desvios são regras fixas sobre seus dados — sem IA e sem valores de exemplo escondidos. Dados salvos neste navegador.</p></div>`;
}

/* ---------- detalhamento (drill-down) ---------- */
function drillData(key) {
  const M = model(), S = M.S, ob = id => id ? C.nm(S.obras, id) : '—';
  const lc = (list, title) => ({ title, rows: list.slice().sort((x, y) => y.data.localeCompare(x.data)), foot: l => `${l.length} lançamento(s)`, cols: [
    { h: 'Data', v: l => C.dt(l.data) }, { h: 'Descrição', v: l => l.desc, f: l => `<b>${E(l.desc)}</b>` }, { h: 'Tipo', v: l => l.tipo, f: l => C.pill(l.tipo) },
    { h: 'Obra', v: l => ob(l.obraId) }, { h: 'Empreendimento', v: l => { const e = dRef(l.obraId, l.empId).emp; return e ? C.nm(S.empreendimentos, e) : '—'; } },
    { h: 'Valor', v: l => (l.tipo === 'Receita' ? 1 : -1) * l.valor, f: l => `<b class="${l.tipo === 'Receita' ? 'up' : 'down'}">${l.tipo === 'Receita' ? '+' : '−'} ${R$(l.valor)}</b>` }] });
  if (key === 'rec') return lc(M.lancP.filter(l => l.tipo === 'Receita'), 'Receitas do período');
  if (key === 'dsp') return lc(M.lancP.filter(l => l.tipo === 'Despesa'), 'Despesas do período');
  if (key === 'res') return lc(M.lancP, 'Resultado: todos os lançamentos do período');
  if (key.startsWith('m:')) return lc(M.lanc.filter(l => dkey(l.data) === key.slice(2)), 'Lançamentos de ' + mLong(key.slice(2)));
  if (key === 'orc' || key === 'eac' || key === 'obras') {
    const list = key === 'obras' ? M.obras : M.active;
    return { title: key === 'obras' ? 'Obras no filtro' : 'Orçamento e projeção das obras ativas', rows: list.slice().sort((x, y) => y.orcamento - x.orcamento), foot: l => `${l.length} obra(s)`, cols: [
      { h: 'Obra', v: o => o.nome, f: o => `<b>${E(o.nome)}</b>` }, { h: 'Status', v: o => o.status, f: o => C.isLate(o) ? C.pill('Atrasada').replace('c-blue', 'c-red') : C.pill(o.status) },
      { h: 'Orçamento', v: o => o.orcamento, f: o => R$(o.orcamento) }, { h: 'Gasto', v: o => o.gasto, f: o => R$(o.gasto) }, { h: 'Avanço', v: o => C.prog(o) + '%' },
      { h: 'CPI', v: o => f2(evm(o).CPI) }, { h: 'SPI', v: o => f2(evm(o).SPI) }, { h: 'Projeção final', v: o => evm(o).EAC, f: o => R$(evm(o).EAC) },
      { h: 'Desvio', v: o => evm(o).desvio, f: o => { const d = evm(o).desvio; return `<span class="${d > 0.05 * o.orcamento ? 'down' : ''}">${d >= 0 ? '+' : '−'} ${R$s(Math.abs(d))}</span>`; } }] };
  }
  if (key === 'vendas') return { title: 'Vendas por empreendimento', rows: M.emps, foot: l => `${l.length} empreendimento(s)`, cols: [
    { h: 'Empreendimento', v: e => e.nome, f: e => `<b>${E(e.nome)}</b>` }, { h: 'Status', v: e => e.status, f: e => C.pill(e.status) }, { h: 'Unidades', v: e => e.unidades }, { h: 'Vendidas', v: e => e.vendidas },
    { h: 'Reservadas', v: e => e.reservadas }, { h: 'Disponíveis', v: e => Math.max(0, e.unidades - e.vendidas - e.reservadas) }, { h: '% vendido', v: e => fp(ratio(e.vendidas, e.unidades), 0) },
    { h: 'VGV', v: e => e.vgv, f: e => R$(e.vgv) }, { h: 'Entrega', v: e => C.dt(e.entrega) }] };
  if (key === 'estoque') return { title: 'Itens abaixo do estoque mínimo', rows: M.low.slice().sort((x, y) => x.qtd / x.min - y.qtd / y.min), foot: l => `${l.length} item(ns) · repor até o mínimo ≈ ${R$s(M.lowCost)}`, cols: [
    { h: 'Material', v: m => m.nome, f: m => `<b>${E(m.nome)}</b>` }, { h: 'Categoria', v: m => m.cat }, { h: 'Em estoque', v: m => m.qtd + ' ' + m.un }, { h: 'Mínimo', v: m => m.min }, { h: 'Falta', v: m => m.min - m.qtd },
    { h: 'Custo para repor', v: m => (m.min - m.qtd) * m.custo, f: m => R$((m.min - m.qtd) * m.custo) }, { h: 'Fornecedor', v: m => C.nm(S.fornecedores, m.forn) }, { h: 'Prazo', v: m => (C.by(S.fornecedores, m.forn) || {}).prazo ? C.by(S.fornecedores, m.forn).prazo + ' dias' : '—' }] };
  if (key === 'equipe') return { title: 'Equipe no filtro', rows: M.funcs, foot: l => `${l.length} pessoa(s)`, cols: [
    { h: 'Nome', v: f => f.nome, f: f => `<b>${E(f.nome)}</b>` }, { h: 'Cargo', v: f => f.cargo }, { h: 'Obra', v: f => ob(f.obraId) }, { h: 'Situação', v: f => f.status, f: f => C.pill(f.status) }, { h: 'Salário', v: f => f.salario, f: f => R$(f.salario) }] };
  if (key === 'tarefas') return { title: 'Tarefas abertas', rows: M.abertas.slice().sort((x, y) => x.prazo.localeCompare(y.prazo)), foot: l => `${l.length} tarefa(s) · ${M.vencidas.length} vencida(s)`, cols: [
    { h: 'Tarefa', v: t => t.titulo, f: t => `<b>${E(t.titulo)}</b>` }, { h: 'Obra', v: t => ob(t.obraId) }, { h: 'Prioridade', v: t => t.prio, f: t => C.pill(t.prio) }, { h: 'Status', v: t => t.status, f: t => C.pill(t.status) },
    { h: 'Prazo', v: t => C.dt(t.prazo), f: t => C.dt(t.prazo) + (C.daysTo(t.prazo) < 0 ? ' <span class="down">· vencida</span>' : '') }] };
  return null;
}
function showDrill(key) {
  const d = drillData(key); if (!d) return;
  lastDrill = d;
  let totalHtml = d.foot(d.rows);
  if (/^(rec|dsp|res|m:)/.test(key)) { const t = sum(d.rows, l => (l.tipo === 'Receita' ? 1 : -1) * l.valor); totalHtml += ` · saldo ${R$(t)}`; }
  C.modal(E(d.title), d.rows.length ? `<div class="tw"><table><thead><tr>${d.cols.map(c => `<th>${c.h}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r => `<tr>${d.cols.map(c => `<td>${c.f ? c.f(r) : E(c.v(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="mut sm" style="margin-top:12px">${totalHtml}</p>` : empty('Nada para mostrar com os filtros atuais.'),
    `<button class="btn ghost" data-close>Fechar</button><button class="btn" ${a('csv-drill')}>⬇ Exportar CSV</button>`, true);
}

/* ---------- exportação ---------- */
function download(name, rows) {
  const cell = v => { if (typeof v === 'number') v = String(Math.round(v * 100) / 100).replace('.', ','); return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  const csv = rows.map(r => r.map(cell).join(';')).join('\n');
  const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); l.download = name; l.click();
  setTimeout(() => URL.revokeObjectURL(l.href), 2000); C.toast('Arquivo ' + name + ' gerado');
}
function exportAll() {
  const M = model(), rows = [['IMPÉRIO ERP — PAINEL GERAL'], ['Gerado em', new Date().toLocaleString('pt-BR')], ['Período', M.months[0] + ' a ' + M.months[M.months.length - 1]]];
  rows.push(['Filtros']); DIMS.forEach(d => { if (cnt(d.k)) rows.push([d.l, 'Incluir: ' + st.sel[d.k].i.map(v => labelOf(d.k, v)).join(', '), 'Excluir: ' + st.sel[d.k].x.map(v => labelOf(d.k, v)).join(', ')]); });
  if (!anyFilter()) rows.push(['Nenhum filtro ativo']);
  rows.push([], ['INDICADORES'], ['Indicador', 'Valor', 'Período anterior'],
    ['Receita', M.R, M.pR], ['Despesa', M.D, M.pD], ['Resultado', M.R - M.D, M.pR == null ? '' : M.pR - M.pD], ['Margem', fp(M.margin), fp(M.pMargin)],
    ['Orçamento das obras ativas', M.BAC], ['Gasto das obras ativas', M.AC], ['Valor agregado', M.EV], ['Custo final projetado', M.EAC],
    ['Obras em andamento', M.running.length], ['Unidades vendidas', M.vend], ['Unidades totais', M.unid], ['VGV', M.vgv], ['VGV vendido (estimado)', M.vgvV],
    ['Itens abaixo do mínimo', M.low.length], ['Valor em estoque', M.stockVal], ['Funcionários ativos', M.ativos], ['Tarefas abertas', M.abertas.length], ['Tarefas vencidas', M.vencidas.length]);
  rows.push([], ['FLUXO MENSAL'], ['Mês', 'Receita', 'Despesa', 'Resultado']); M.series.forEach(x => rows.push([x.k, x.r, x.d, x.s]));
  rows.push([], ['OBRAS'], ['Obra', 'Status', 'Orçamento', 'Gasto', 'Avanço %', 'CPI', 'SPI', 'Projeção final']);
  M.obras.forEach(o => { const v = evm(o); rows.push([o.nome, o.status, o.orcamento, o.gasto, C.prog(o), v.CPI == null ? '' : f2(v.CPI), v.SPI == null ? '' : f2(v.SPI), v.EAC]); });
  rows.push([], ['INSIGHTS']); insights(M).forEach(i => rows.push([i.title, i.text]));
  download('painel-geral-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
}

/* ---------- visões salvas ---------- */
function applyView(id) {
  const v = [...BUILTIN, ...getViews()].find(x => x.id === id); if (!v) return;
  st.sel = emptySel(); DIMS.forEach(d => { if (v.sel && v.sel[d.k]) st.sel[d.k] = { i: [].concat(v.sel[d.k].i || []), x: [].concat(v.sel[d.k].x || []) }; });
  st.period = v.period; if (v.cmp != null) st.cmp = v.cmp; st.open = null; saveState();
}
function saveViewDialog() {
  st.open = null;
  C.modal('Salvar visão', `<form class="form" id="frm"><label class="full">Nome da visão<input name="nm" required maxlength="40" placeholder="Ex.: Diretoria — obras atrasadas" autofocus></label></form><p class="mut sm" style="margin-top:12px">Guarda o período e todos os filtros de agora. Fica salva neste navegador.</p>`, `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Salvar visão</button>`);
  const ok = () => { const fm = document.getElementById('frm'); if (!fm.reportValidity()) return; const name = fm.elements.nm.value.trim();
    putViews(getViews().concat({ id: 'u' + Date.now().toString(36), name, period: st.period, cmp: st.cmp, sel: JSON.parse(JSON.stringify(st.sel)) })); C.closeModal(); C.render(); C.toast('Visão "' + name + '" salva'); };
  document.getElementById('frmOk').onclick = ok; document.getElementById('frm').onsubmit = e => { e.preventDefault(); ok(); };
}

/* ---------- eventos ---------- */
function onClick(e) {
  const el = e.target.closest('[data-bi]');
  if (!el) { if (st.open && !e.target.closest('.fpop')) { st.open = null; C.render(); } return; }
  hideTip();
  const act = el.dataset.bi, k = el.dataset.k, v = el.dataset.v;
  let redraw = true;
  switch (act) {
    case 'period': st.period = v; st.open = null; saveState(); break;
    case 'cmp': st.cmp = !st.cmp; saveState(); break;
    case 'open': st.open = st.open === v ? null : v; break;
    case 'cycle': cycle(k, v); saveState(); break;
    case 'toggle': toggleInc(k, v); st.open = null; saveState(); break;
    case 'rm': st.sel[k].i = st.sel[k].i.filter(x => x !== v); st.sel[k].x = st.sel[k].x.filter(x => x !== v); saveState(); break;
    case 'clear': if (k) st.sel[k] = { i: [], x: [] }; else st.sel = emptySel(); st.open = k ? st.open : null; saveState(); break;
    case 'view': applyView(v); break;
    case 'delview': putViews(getViews().filter(x => x.id !== v)); break;
    case 'saveview': saveViewDialog(); redraw = false; break;
    case 'drill': showDrill(v); redraw = false; break;
    case 'obra': e.stopPropagation(); C.openObra(v); redraw = false; break;
    case 'csv': exportAll(); redraw = false; break;
    case 'csv-drill': if (lastDrill) download('detalhe.csv', [lastDrill.cols.map(c => c.h)].concat(lastDrill.rows.map(r => lastDrill.cols.map(c => c.v(r))))); redraw = false; break;
    case 'print': window.print(); redraw = false; break;
    default: redraw = false;
  }
  if (redraw) C.render();
}
function hideTip() { if (tipEl) tipEl.hidden = true; }
function showTip(el, x, y) {
  const t = el.getAttribute('data-tip'); if (!t) return hideTip();
  tipEl.innerHTML = t.split('\n').map((l, i) => i ? `<span>${E(l)}</span>` : `<b>${E(l)}</b>`).join(''); tipEl.hidden = false; placeTip(x, y);
}
function placeTip(x, y) {
  const r = tipEl.getBoundingClientRect(); let L = x + 14, T = y + 16;
  if (L + r.width > innerWidth - 8) L = x - r.width - 14; if (T + r.height > innerHeight - 8) T = y - r.height - 14;
  tipEl.style.left = Math.max(8, L) + 'px'; tipEl.style.top = Math.max(8, T) + 'px';
}
function init(ctx) {
  C = ctx; loadState(); tipEl = document.getElementById('tip');
  document.addEventListener('click', onClick);
  document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else hideTip(); });
  document.addEventListener('mousemove', e => { if (!tipEl.hidden) placeTip(e.clientX, e.clientY); });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top + r.height / 2); } });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && st.open) { st.open = null; C.render(); return; }
    const el = e.target.closest && e.target.closest('[data-bi]');
    if (el && el.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });
}
window.addEventListener('hashchange', () => { anim = true; st.open = null; });
window.BI = { init, page };
})();
