(function () {
'use strict';
/* ============ estado e utilitários ============ */
const KEY = 'imperio_erp_v1';
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.obras) S = seedData();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlS = n => { n = +n || 0; const a = Math.abs(n); if (a >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + ' mi'; if (a >= 1e3) return 'R$ ' + Math.round(n / 1e3) + ' mil'; return brl(n); };
const num = n => (+n || 0).toLocaleString('pt-BR');
const dt = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const uid = p => p + Math.random().toString(36).slice(2, 9);
const by = (arr, id) => arr.find(x => x.id === id);
const nm = (arr, id) => { const r = by(arr, id); return r ? r.nome : '—'; };
const daysTo = s => Math.round((new Date(s + 'T12:00:00') - new Date()) / 864e5);
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const todayISO = () => new Date().toISOString().slice(0, 10);
const prog = o => o.status === 'Concluída' ? 100 : (o.etapas && o.etapas.length ? Math.round(o.etapas.reduce((s, e) => s + e.pct, 0) / o.etapas.length) : 0);
const isLate = o => o.status === 'Em andamento' && daysTo(o.previsao) < 0;
const low = m => m.qtd < m.min;
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const COLOR = { 'Em andamento': 'blue', 'Planejamento': 'purple', 'Pausada': 'orange', 'Concluída': 'green', 'Lançamento': 'purple', 'Em obras': 'blue', 'Entregue': 'green', 'Ativo': 'green', 'Férias': 'orange', 'Afastado': 'red', 'Alta': 'red', 'Média': 'orange', 'Baixa': 'blue', 'Aberta': 'orange', 'Resolvida': 'green', 'Receita': 'green', 'Despesa': 'red', 'Entrada': 'green', 'Saída': 'orange' };
const pill = t => `<span class="pill c-${COLOR[t] || 'blue'}">${esc(t)}</span>`;
const state = { q: '', f: {}, tab: {} };
const fil = (k, d = 'Todos') => state.f[k] || d;

/* ============ esquema dos cadastros ============ */
const opt = arr => arr.map(v => ({ v, l: v }));
const refOpt = (key, blank) => () => (blank ? [{ v: '', l: '— nenhum —' }] : []).concat(S[key].map(r => ({ v: r.id, l: r.nome })));
const SCHEMA = {
  obras: { t: 'Obra', f: [
    { k: 'nome', l: 'Nome da obra', full: 1, req: 1 }, { k: 'empId', l: 'Empreendimento', type: 'select', o: refOpt('empreendimentos') },
    { k: 'status', l: 'Status', type: 'select', o: () => opt(['Planejamento', 'Em andamento', 'Pausada', 'Concluída']) },
    { k: 'orcamento', l: 'Orçamento (R$)', type: 'number' }, { k: 'gasto', l: 'Gasto até agora (R$)', type: 'number' },
    { k: 'inicio', l: 'Início', type: 'date' }, { k: 'previsao', l: 'Previsão de término', type: 'date' },
    { k: 'resp', l: 'Engenheiro responsável' }, { k: 'endereco', l: 'Endereço' }] },
  empreendimentos: { t: 'Empreendimento', f: [
    { k: 'nome', l: 'Nome', full: 1, req: 1 }, { k: 'tipo', l: 'Tipo', type: 'select', o: () => opt(['Condomínio de apartamentos', 'Condomínio de casas', 'Comercial / salas', 'Loteamento']) },
    { k: 'status', l: 'Status', type: 'select', o: () => opt(['Lançamento', 'Em obras', 'Entregue']) },
    { k: 'cidade', l: 'Cidade' }, { k: 'bairro', l: 'Bairro' },
    { k: 'unidades', l: 'Unidades totais', type: 'number' }, { k: 'vendidas', l: 'Vendidas', type: 'number' },
    { k: 'reservadas', l: 'Reservadas', type: 'number' }, { k: 'vgv', l: 'VGV (R$)', type: 'number' }, { k: 'entrega', l: 'Entrega prevista', type: 'date' }] },
  materiais: { t: 'Material', f: [
    { k: 'nome', l: 'Material / insumo', full: 1, req: 1 }, { k: 'cat', l: 'Categoria', type: 'select', o: () => opt(['Aglomerantes', 'Agregados', 'Aço', 'Alvenaria', 'Hidráulica', 'Elétrica', 'Acabamento', 'EPI', 'Ferramentas', 'Outros']) },
    { k: 'un', l: 'Unidade (un, m³, saco...)' }, { k: 'qtd', l: 'Quantidade em estoque', type: 'number' }, { k: 'min', l: 'Estoque mínimo', type: 'number' },
    { k: 'custo', l: 'Custo unitário (R$)', type: 'number' }, { k: 'forn', l: 'Fornecedor', type: 'select', o: refOpt('fornecedores', 1) }, { k: 'local', l: 'Local de armazenagem' }] },
  funcionarios: { t: 'Funcionário', f: [
    { k: 'nome', l: 'Nome completo', full: 1, req: 1 }, { k: 'cargo', l: 'Cargo' }, { k: 'status', l: 'Situação', type: 'select', o: () => opt(['Ativo', 'Férias', 'Afastado']) },
    { k: 'obraId', l: 'Alocado na obra', type: 'select', o: refOpt('obras', 1) }, { k: 'salario', l: 'Salário (R$)', type: 'number' },
    { k: 'adm', l: 'Admissão', type: 'date' }, { k: 'tel', l: 'Telefone' }] },
  fornecedores: { t: 'Fornecedor', f: [
    { k: 'nome', l: 'Razão social / nome', full: 1, req: 1 }, { k: 'cat', l: 'Categoria' }, { k: 'prazo', l: 'Prazo de entrega (dias)', type: 'number' },
    { k: 'tel', l: 'Telefone' }, { k: 'email', l: 'E-mail' }] },
  tarefas: { t: 'Tarefa', f: [
    { k: 'titulo', l: 'Título', full: 1, req: 1 }, { k: 'obraId', l: 'Obra', type: 'select', o: refOpt('obras', 1) },
    { k: 'prio', l: 'Prioridade', type: 'select', o: () => opt(['Alta', 'Média', 'Baixa']) },
    { k: 'status', l: 'Status', type: 'select', o: () => opt(['Aberta', 'Em andamento', 'Resolvida']) }, { k: 'prazo', l: 'Prazo', type: 'date' }] },
  lancamentos: { t: 'Lançamento', f: [
    { k: 'desc', l: 'Descrição', full: 1, req: 1 }, { k: 'tipo', l: 'Tipo', type: 'select', o: () => opt(['Receita', 'Despesa']) },
    { k: 'valor', l: 'Valor (R$)', type: 'number' }, { k: 'data', l: 'Data', type: 'date' }, { k: 'obraId', l: 'Obra', type: 'select', o: refOpt('obras', 1) }] }
};
const DEFAULTS = {
  obras: () => ({ status: 'Planejamento', orcamento: 0, gasto: 0, inicio: todayISO(), previsao: todayISO(), empId: (S.empreendimentos[0] || {}).id || '', etapas: ['Fundação', 'Estrutura', 'Alvenaria', 'Instalações', 'Acabamento'].map(n => ({ nome: n, pct: 0 })) }),
  empreendimentos: () => ({ tipo: 'Condomínio de apartamentos', status: 'Lançamento', unidades: 0, vendidas: 0, reservadas: 0, vgv: 0, entrega: todayISO() }),
  materiais: () => ({ cat: 'Outros', un: 'un', qtd: 0, min: 0, custo: 0, forn: '' }),
  funcionarios: () => ({ status: 'Ativo', obraId: '', salario: 0, adm: todayISO() }),
  fornecedores: () => ({ prazo: 3 }),
  tarefas: () => ({ prio: 'Média', status: 'Aberta', obraId: '', prazo: todayISO() }),
  lancamentos: () => ({ tipo: 'Despesa', valor: 0, data: todayISO(), obraId: '' })
};

/* ============ UI base: modal, toast ============ */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function modal(title, body, footer, wide) {
  const m = $('#modal');
  m.innerHTML = `<div class="mbox ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><h2>${title}</h2><button class="mx" data-close aria-label="Fechar">✕</button></div><div class="mb">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div>`;
  m.hidden = false;
}
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function confirmBox(msg, onYes, label = 'Excluir') {
  modal('Confirmar', `<p>${msg}</p>`, `<button class="btn ghost" data-close>Cancelar</button><button class="btn red" id="cfYes">${label}</button>`);
  $('#cfYes').onclick = () => { closeModal(); onYes(); };
}

/* ============ formulários genéricos ============ */
function fieldHTML(f, v) {
  const cls = f.full ? 'full' : '';
  if (f.type === 'select') {
    const o = f.o();
    return `<label class="${cls}">${f.l}<select name="${f.k}">${o.map(x => `<option value="${esc(x.v)}" ${String(x.v) === String(v) ? 'selected' : ''}>${esc(x.l)}</option>`).join('')}</select></label>`;
  }
  const type = f.type === 'number' ? 'number" step="any" min="0' : (f.type || 'text');
  return `<label class="${cls}">${f.l}<input name="${f.k}" type="${type}" value="${esc(v == null ? '' : v)}" ${f.req ? 'required' : ''}></label>`;
}
function openForm(key, id) {
  const sc = SCHEMA[key];
  const row = id ? by(S[key], id) : Object.assign({}, DEFAULTS[key]());
  modal((id ? 'Editar ' : 'Novo(a) ') + sc.t.toLowerCase(),
    `<form class="form" id="frm">${sc.f.map(f => fieldHTML(f, row[f.k])).join('')}</form>`,
    `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Salvar</button>`);
  const ok = () => {
    const fm = $('#frm'); if (!fm.reportValidity()) return;
    const d = {}; sc.f.forEach(f => { const el = fm.elements[f.k]; d[f.k] = f.type === 'number' ? (parseFloat(el.value) || 0) : el.value.trim(); });
    if (id) Object.assign(row, d); else { Object.assign(row, d, { id: uid(key[0]) }); S[key].push(row); }
    save(); closeModal(); render(); toast(id ? 'Alterações salvas' : sc.t + ' cadastrado(a)');
  };
  $('#frmOk').onclick = ok; $('#frm').onsubmit = e => { e.preventDefault(); ok(); };
}
function del(key, id) {
  const r = by(S[key], id); if (!r) return;
  confirmBox(`Excluir <b>${esc(r.nome || r.titulo || r.desc)}</b>? Essa ação não pode ser desfeita.`, () => { S[key] = S[key].filter(x => x.id !== id); save(); render(); toast('Excluído'); });
}

/* ============ movimentação de estoque ============ */
function openMov(tipo, matId) {
  const mats = S.materiais;
  modal(tipo === 'Entrada' ? '📥 Entrada de material' : '📤 Saída de material (consumo)',
    `<form class="form" id="frm">
      <label class="full">Material<select name="matId">${mats.map(m => `<option value="${m.id}" ${m.id === matId ? 'selected' : ''}>${esc(m.nome)} — ${num(m.qtd)} ${esc(m.un)}</option>`).join('')}</select></label>
      <label>Quantidade<input name="qtd" type="number" step="any" min="0.01" required value="1"></label>
      <label>Data<input name="data" type="date" value="${todayISO()}"></label>
      ${tipo === 'Saída' ? `<label class="full">Obra de destino<select name="obraId">${S.obras.filter(o => o.status !== 'Concluída').map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</select></label>` : ''}
      <label class="full">Observação / nota fiscal<input name="obs" placeholder="${tipo === 'Entrada' ? 'Ex.: NF 12345' : 'Ex.: Laje do 5º pavimento'}"></label>
    </form>`,
    `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Registrar ${tipo.toLowerCase()}</button>`);
  $('#frmOk').onclick = () => {
    const fm = $('#frm'); if (!fm.reportValidity()) return;
    const m = by(S.materiais, fm.elements.matId.value), q = parseFloat(fm.elements.qtd.value) || 0;
    if (tipo === 'Saída' && q > m.qtd) { toast('Estoque insuficiente: há apenas ' + num(m.qtd) + ' ' + m.un); return; }
    m.qtd += tipo === 'Entrada' ? q : -q;
    const obraId = tipo === 'Saída' ? fm.elements.obraId.value : '';
    S.movs.unshift({ id: uid('v'), data: fm.elements.data.value, matId: m.id, tipo, qtd: q, obraId, obs: fm.elements.obs.value.trim() });
    if (tipo === 'Saída' && obraId) { const o = by(S.obras, obraId); o.gasto = (o.gasto || 0) + q * m.custo; }
    if (tipo === 'Entrada') S.lancamentos.push({ id: uid('d'), data: fm.elements.data.value, desc: 'Compra: ' + m.nome, tipo: 'Despesa', valor: q * m.custo, obraId: '' });
    save(); closeModal(); render(); toast(`${tipo} registrada: ${num(q)} ${m.un} de ${m.nome}`);
  };
}

/* ============ gráficos SVG ============ */
function barChart(items, ca = 'var(--blue)', cb = 'var(--gold)') {
  const W = 640, H = 270, pl = 54, pb = 46, pt = 12, max = Math.max(1, ...items.flatMap(i => [i.a, i.b])) * 1.1;
  const bw = (W - pl) / items.length;
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = pt + (H - pb - pt) * (1 - i / 4); g += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${brlS(max * i / 4).replace('R$ ', '')}</text>`; }
  items.forEach((it, i) => {
    const x = pl + i * bw + bw * .16, w = bw * .33, hh = H - pb - pt;
    const h1 = it.a / max * hh, h2 = it.b / max * hh;
    g += `<rect x="${x}" y="${H - pb - h1}" width="${w}" height="${h1}" rx="4" style="fill:${ca}"/><rect x="${x + w + 3}" y="${H - pb - h2}" width="${w}" height="${h2}" rx="4" style="fill:${cb}"/>
      <text x="${pl + i * bw + bw / 2}" y="${H - pb + 17}" text-anchor="middle">${esc(it.label.length > 13 ? it.label.slice(0, 12) + '…' : it.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
function lineChart(labels, series) {
  const W = 640, H = 250, pl = 54, pb = 32, pt = 12, max = Math.max(1, ...series.flatMap(s => s.d)) * 1.1, n = labels.length;
  const X = i => pl + (W - pl - 16) * (n === 1 ? .5 : i / (n - 1)), Y = v => pt + (H - pb - pt) * (1 - v / max);
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = pt + (H - pb - pt) * (1 - i / 4); g += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${brlS(max * i / 4).replace('R$ ', '')}</text>`; }
  labels.forEach((l, i) => g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${l}</text>`);
  series.forEach(s => {
    const pts = s.d.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    g += `<polygon points="${X(0)},${H - pb} ${pts} ${X(n - 1)},${H - pb}" style="fill:${s.c};opacity:.1"/><polyline points="${pts}" fill="none" style="stroke:${s.c};stroke-width:3;stroke-linejoin:round;stroke-linecap:round"/>` + s.d.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4" style="fill:${s.c}"/>`).join('');
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
function donut(parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1, R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = parts.filter(p => p.v).map(p => { const len = p.v / tot * C, s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke-width="20" style="stroke:${p.c}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return s; }).join('');
  return `<div class="donut-w"><svg viewBox="0 0 140 140" width="150" height="150">${arcs}<text x="70" y="68" text-anchor="middle" style="fill:var(--txt);font-size:26px;font-weight:700;font-family:Sora">${tot === 1 && !parts.some(p => p.v) ? 0 : parts.reduce((s, p) => s + p.v, 0)}</text><text x="70" y="86" text-anchor="middle" style="font-size:10px">obras</text></svg>
    <div class="legend" style="flex-direction:column;gap:8px">${parts.map(p => `<span><i style="background:${p.c}"></i>${esc(p.l)}: <b style="color:var(--txt)">${p.v}</b></span>`).join('')}</div></div>`;
}
const bar = (p, c = '') => `<div class="bar ${c}"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div>`;

/* ============ alertas ============ */
function alerts() {
  const a = [];
  S.materiais.filter(low).forEach(m => a.push({ c: 'red', ic: '📦', t: 'Estoque baixo: ' + m.nome, s: `${num(m.qtd)} ${m.un} em estoque (mínimo ${num(m.min)})`, h: '#/estoque' }));
  S.obras.filter(isLate).forEach(o => a.push({ c: 'orange', ic: '⏰', t: 'Obra atrasada: ' + o.nome, s: `Previsão era ${dt(o.previsao)} (${-daysTo(o.previsao)} dias de atraso)`, h: '#/obras' }));
  S.obras.filter(o => o.status !== 'Concluída' && o.orcamento && pct(o.gasto, o.orcamento) > prog(o) + 20).forEach(o => a.push({ c: 'red', ic: '💸', t: 'Gasto acima do ritmo: ' + o.nome, s: `${pct(o.gasto, o.orcamento)}% do orçamento gasto para ${prog(o)}% de avanço`, h: '#/obras' }));
  S.tarefas.filter(t => t.status !== 'Resolvida' && t.prio === 'Alta' && daysTo(t.prazo) <= 7).forEach(t => a.push({ c: 'purple', ic: '✅', t: 'Tarefa urgente: ' + t.titulo, s: 'Prazo ' + dt(t.prazo), h: '#/tarefas' }));
  return a;
}
const alertList = (arr, empty) => arr.length ? `<div class="list">${arr.map(x => `<a class="li" href="${x.h}" style="text-decoration:none;color:inherit" data-close><span class="dot c-${x.c}">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></a>`).join('')}</div>` : `<p class="empty">${empty}</p>`;

/* ============ tabelas genéricas ============ */
const match = (r, extra = '') => !state.q || (Object.values(r).filter(v => typeof v !== 'object').join(' ') + ' ' + extra).toLowerCase().includes(state.q.toLowerCase());
const rowActs = (k, id) => `<div class="acts"><button class="btn ghost sm" data-act="edit" data-k="${k}" data-id="${id}">✏️ Editar</button><button class="btn red sm" data-act="del" data-k="${k}" data-id="${id}">🗑</button></div>`;
function table(cols, rows, k, extraActs) {
  if (!rows.length) return `<div class="tw"><p class="empty">Nada encontrado. Use o botão de adicionar para cadastrar.</p></div>`;
  return `<div class="tw"><table><thead><tr>${cols.map(c => `<th>${c.h}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c.f(r)}</td>`).join('')}<td>${k ? rowActs(k, r.id).replace('</div>', (extraActs ? extraActs(r) : '') + '</div>') : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
const header = (t, sub, acts) => `<div class="page-h"><div><h1>${t}</h1><p>${sub}</p></div><div class="acts">${acts || ''}</div></div>`;
const chips = (k, opts) => `<div class="chips">${opts.map(o => `<button class="chip ${fil(k) === o ? 'on' : ''}" data-act="filter" data-k="${k}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
const kpi = (ic, c, v, l, d) => `<div class="card kpi"><div class="ic c-${c}">${ic}</div><div class="v">${v}</div><div class="l">${l}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const exportBtn = k => `<button class="btn ghost" data-act="csv" data-k="${k}">⬇ Exportar CSV</button>`;

/* ============ PÁGINAS ============ */
const PAGES = {};

PAGES.dashboard = () => {
  const ativas = S.obras.filter(o => o.status === 'Em andamento'), atras = S.obras.filter(isLate);
  const unid = S.empreendimentos.reduce((s, e) => s + e.unidades, 0), vend = S.empreendimentos.reduce((s, e) => s + e.vendidas, 0);
  const orcT = S.obras.filter(o => o.status !== 'Concluída').reduce((s, o) => s + o.orcamento, 0), gT = S.obras.filter(o => o.status !== 'Concluída').reduce((s, o) => s + o.gasto, 0);
  const func = S.funcionarios.filter(f => f.status === 'Ativo').length, baixos = S.materiais.filter(low).length;
  const valEst = S.materiais.reduce((s, m) => s + m.qtd * m.custo, 0);
  const rec = S.lancamentos.filter(l => l.tipo === 'Receita').reduce((s, l) => s + l.valor, 0), dsp = S.lancamentos.filter(l => l.tipo === 'Despesa').reduce((s, l) => s + l.valor, 0);
  const meses = monthly(6), al = alerts();
  const st = ['Em andamento', 'Planejamento', 'Pausada', 'Concluída'], cor = { 'Em andamento': 'var(--blue)', 'Planejamento': 'var(--purple)', 'Pausada': 'var(--orange)', 'Concluída': 'var(--green)' };
  const hora = new Date().getHours(), sau = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  return header(`${sau}, Império 👋`, 'Visão geral de obras, vendas, estoque e finanças em tempo real.',
    `<button class="btn ghost" data-act="new" data-k="obras">+ Obra</button><button class="btn ghost" data-act="mov" data-v="Entrada">📥 Entrada</button><button class="btn ghost" data-act="mov" data-v="Saída">📤 Saída</button><button class="btn" data-act="quick">+ Ação rápida</button>`) + `
  <div class="grid g-kpi">
    ${kpi('🏗️', 'blue', ativas.length, 'Obras em andamento', atras.length ? `<span class="down">▼ ${atras.length} atrasada(s)</span>` : '<span class="up">▲ Todas no prazo</span>')}
    ${kpi('🏢', 'gold', brlS(S.empreendimentos.reduce((s, e) => s + e.vgv, 0)), 'VGV total', `<span class="up">${pct(vend, unid)}% das unidades vendidas</span>`)}
    ${kpi('💰', 'green', brlS(rec - dsp), 'Saldo (6 meses)', `<span class="mut">Receitas ${brlS(rec)} · Despesas ${brlS(dsp)}</span>`)}
    ${kpi('📊', 'purple', pct(gT, orcT) + '%', 'Orçamento executado', `<span class="mut">${brlS(gT)} de ${brlS(orcT)}</span>`)}
    ${kpi('👷', 'orange', func, 'Funcionários ativos', `<span class="mut">${S.funcionarios.length} cadastrados</span>`)}
    ${kpi('📦', baixos ? 'red' : 'green', baixos, 'Itens com estoque baixo', `<span class="mut">Estoque: ${brlS(valEst)}</span>`)}
  </div>
  <div class="grid g-2" style="margin-bottom:18px">
    <div class="card"><h3>Orçamento x Gasto por obra <small>obras não concluídas</small></h3>${barChart(S.obras.filter(o => o.status !== 'Concluída').map(o => ({ label: o.nome.replace('Império Park - ', 'Park '), a: o.orcamento, b: o.gasto })))}<div class="legend"><span><i style="background:var(--blue)"></i>Orçamento</span><span><i style="background:var(--gold)"></i>Gasto</span></div></div>
    <div class="card"><h3>Fluxo de caixa <small>últimos 6 meses</small></h3>${lineChart(meses.map(m => m.l), [{ n: 'Receitas', c: 'var(--green)', d: meses.map(m => m.r) }, { n: 'Despesas', c: 'var(--red)', d: meses.map(m => m.d) }])}<div class="legend"><span><i style="background:var(--green)"></i>Receitas</span><span><i style="background:var(--red)"></i>Despesas</span></div></div>
  </div>
  <div class="grid g-3">
    <div class="card"><h3>🚨 Alertas <small>${al.length} pendência(s)</small></h3>${alertList(al.slice(0, 6), '✅ Nenhuma pendência. Tudo sob controle!')}</div>
    <div class="card"><h3>Status das obras</h3>${donut(st.map(s => ({ l: s, v: S.obras.filter(o => o.status === s).length, c: cor[s] })))}
      <h3 style="margin-top:22px">Vendas por empreendimento</h3>${S.empreendimentos.map(e => `<div style="margin-bottom:12px"><div class="row sm"><b>${esc(e.nome)}</b><span class="mut">${e.vendidas}/${e.unidades}</span></div>${bar(pct(e.vendidas, e.unidades), 'g')}</div>`).join('')}</div>
    <div class="card"><h3>Últimas movimentações <a href="#/estoque" class="sm" style="color:var(--gold2)">ver todas</a></h3><div class="list">${S.movs.slice(0, 6).map(v => { const m = by(S.materiais, v.matId); return `<div class="li"><span class="dot c-${v.tipo === 'Entrada' ? 'green' : 'orange'}">${v.tipo === 'Entrada' ? '📥' : '📤'}</span><div><b>${esc(m ? m.nome : 'Material removido')}</b><small>${dt(v.data)} · ${esc(v.obraId ? nm(S.obras, v.obraId) : v.obs || '—')}</small></div><div class="end">${v.tipo === 'Entrada' ? '+' : '−'}${num(v.qtd)} <small>${esc(m ? m.un : '')}</small></div></div>`; }).join('') || '<p class="empty">Sem movimentações</p>'}</div></div>
  </div>`;
};
function monthly(n) {
  const out = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1), key = d.toISOString().slice(0, 7);
    const ls = S.lancamentos.filter(l => (l.data || '').slice(0, 7) === key);
    out.push({ l: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), r: ls.filter(l => l.tipo === 'Receita').reduce((s, l) => s + l.valor, 0), d: ls.filter(l => l.tipo === 'Despesa').reduce((s, l) => s + l.valor, 0) });
  }
  return out;
}

PAGES.obras = () => {
  const f = fil('obras'), rows = S.obras.filter(o => (f === 'Todos' || o.status === f || (f === 'Atrasadas' && isLate(o))) && match(o, nm(S.empreendimentos, o.empId)));
  const ativas = S.obras.filter(o => o.status === 'Em andamento');
  return header('Obras', 'Acompanhe andamento, orçamento, equipe e consumo de cada obra.', exportBtn('obras') + '<button class="btn" data-act="new" data-k="obras">+ Nova obra</button>') + `
  <div class="grid g-kpi">${kpi('🏗️', 'blue', ativas.length, 'Em andamento')}${kpi('⏰', 'red', S.obras.filter(isLate).length, 'Atrasadas')}${kpi('✅', 'green', S.obras.filter(o => o.status === 'Concluída').length, 'Concluídas')}${kpi('💰', 'gold', brlS(S.obras.reduce((s, o) => s + o.gasto, 0)), 'Total investido')}</div>
  ${chips('obras', ['Todos', 'Em andamento', 'Planejamento', 'Pausada', 'Concluída', 'Atrasadas'])}
  <div class="grid g-3">${rows.map(o => {
    const p = prog(o), g = pct(o.gasto, o.orcamento), eq = S.funcionarios.filter(x => x.obraId === o.id).length;
    return `<div class="card ocard" data-act="obra" data-id="${o.id}"><div class="row" style="align-items:flex-start"><div><h4>${esc(o.nome)}</h4><small class="mut">${esc(nm(S.empreendimentos, o.empId))}</small></div>${isLate(o) ? pill('Atrasada').replace('c-blue', 'c-red') : pill(o.status)}</div>
    <div style="margin-top:16px"><div class="row sm"><span class="mut">Avanço físico</span><b>${p}%</b></div>${bar(p, isLate(o) ? 'r' : '')}</div>
    <div style="margin-top:12px"><div class="row sm"><span class="mut">Orçamento usado</span><b>${g}%</b></div>${bar(g, g > p + 20 ? 'r' : 'b')}</div>
    <div class="meta"><div><small>Orçamento</small><b>${brlS(o.orcamento)}</b></div><div><small>Gasto</small><b>${brlS(o.gasto)}</b></div><div><small>Previsão</small><b>${dt(o.previsao)}</b></div><div><small>Equipe</small><b>${eq} pessoa(s)</b></div></div>
    <small class="mut">👷 ${esc(o.resp || '—')}</small></div>`;
  }).join('') || '<div class="card empty" style="grid-column:1/-1">Nenhuma obra encontrada.</div>'}</div>`;
};
function openObra(id) {
  const o = by(S.obras, id); if (!o) return;
  const eq = S.funcionarios.filter(f => f.obraId === id), consumo = S.movs.filter(v => v.obraId === id && v.tipo === 'Saída'), tf = S.tarefas.filter(t => t.obraId === id && t.status !== 'Resolvida');
  modal(esc(o.nome), `
  <div class="grid g-kpi" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${kpi('📈', 'blue', prog(o) + '%', 'Avanço físico')}${kpi('💰', 'gold', brlS(o.gasto), 'de ' + brlS(o.orcamento))}${kpi('📅', isLate(o) ? 'red' : 'green', dt(o.previsao), 'Previsão', isLate(o) ? '<span class="down">Atrasada</span>' : '')}</div>
  <p class="mut sm" style="margin-bottom:18px">${pill(o.status)} &nbsp; ${esc(nm(S.empreendimentos, o.empId))} · ${esc(o.endereco || 'Sem endereço')} · Resp.: ${esc(o.resp || '—')}</p>
  <div class="card" style="margin-bottom:16px;box-shadow:none"><h3>Etapas da obra <small>arraste para atualizar</small></h3>${(o.etapas || []).map((e, i) => `<div class="etapa"><span>${esc(e.nome)}</span><input type="range" min="0" max="100" step="5" value="${e.pct}" data-et="${i}"><b id="ev${i}">${e.pct}%</b></div>`).join('')}</div>
  <div class="grid g-2" style="grid-template-columns:1fr 1fr">
    <div><h3 style="font-size:.95rem;margin-bottom:8px">👷 Equipe alocada (${eq.length})</h3><div class="list">${eq.map(f => `<div class="li"><span class="avatar" style="margin:0">${initials(f.nome)}</span><div><b>${esc(f.nome)}</b><small>${esc(f.cargo)}</small></div></div>`).join('') || '<p class="mut sm">Ninguém alocado.</p>'}</div></div>
    <div><h3 style="font-size:.95rem;margin-bottom:8px">📤 Materiais consumidos</h3><div class="list">${consumo.slice(0, 6).map(v => { const m = by(S.materiais, v.matId); return `<div class="li"><div><b>${esc(m ? m.nome : '—')}</b><small>${dt(v.data)}</small></div><div class="end">${num(v.qtd)} ${esc(m ? m.un : '')}</div></div>`; }).join('') || '<p class="mut sm">Sem consumo registrado.</p>'}</div>
    <h3 style="font-size:.95rem;margin:14px 0 8px">✅ Tarefas abertas (${tf.length})</h3>${tf.map(t => `<div class="sm" style="padding:4px 0">• ${esc(t.titulo)} ${pill(t.prio)}</div>`).join('') || '<p class="mut sm">Nenhuma.</p>'}</div>
  </div>`,
  `<button class="btn red" id="oDel">Excluir</button><button class="btn ghost" id="oEdit">✏️ Editar dados</button><button class="btn" id="oSave">Salvar etapas</button>`, true);
  document.querySelectorAll('[data-et]').forEach(r => r.oninput = () => $('#ev' + r.dataset.et).textContent = r.value + '%');
  $('#oSave').onclick = () => { document.querySelectorAll('[data-et]').forEach(r => o.etapas[+r.dataset.et].pct = +r.value); if (prog(o) === 100 && o.status === 'Em andamento') o.status = 'Concluída'; save(); closeModal(); render(); toast('Etapas atualizadas'); };
  $('#oEdit').onclick = () => openForm('obras', id); $('#oDel').onclick = () => del('obras', id);
}

PAGES.empreendimentos = () => {
  const rows = S.empreendimentos.filter(e => match(e)), f = fil('emp');
  const r2 = rows.filter(e => f === 'Todos' || e.status === f);
  return header('Condomínios e Empreendimentos', 'Carteira de lançamentos, vendas e entregas.', exportBtn('empreendimentos') + '<button class="btn" data-act="new" data-k="empreendimentos">+ Novo empreendimento</button>') + `
  <div class="grid g-kpi">${kpi('🏢', 'gold', S.empreendimentos.length, 'Empreendimentos')}${kpi('🏠', 'blue', num(S.empreendimentos.reduce((s, e) => s + e.unidades, 0)), 'Unidades totais')}${kpi('🤝', 'green', num(S.empreendimentos.reduce((s, e) => s + e.vendidas, 0)), 'Unidades vendidas')}${kpi('💎', 'purple', brlS(S.empreendimentos.reduce((s, e) => s + e.vgv, 0)), 'VGV total')}</div>
  ${chips('emp', ['Todos', 'Lançamento', 'Em obras', 'Entregue'])}
  <div class="grid g-3">${r2.map(e => {
    const disp = e.unidades - e.vendidas - e.reservadas, ob = S.obras.filter(o => o.empId === e.id).length;
    return `<div class="card"><div class="row" style="align-items:flex-start"><div><h3 style="margin:0">${esc(e.nome)}</h3><small class="mut">${esc(e.tipo)} · ${esc(e.bairro)}, ${esc(e.cidade)}</small></div>${pill(e.status)}</div>
    <div style="margin:18px 0 6px" class="row sm"><span class="mut">Vendas</span><b>${pct(e.vendidas, e.unidades)}%</b></div>
    <div class="bar g"><i style="width:${pct(e.vendidas, e.unidades)}%"></i></div>
    <div class="legend"><span><i style="background:var(--green)"></i>${e.vendidas} vendidas</span><span><i style="background:var(--orange)"></i>${e.reservadas} reservadas</span><span><i style="background:var(--mut)"></i>${disp} disponíveis</span></div>
    <div class="meta"><div><small>VGV</small><b>${brlS(e.vgv)}</b></div><div><small>Entrega</small><b>${dt(e.entrega)}</b></div><div><small>Obras vinculadas</small><b>${ob}</b></div><div><small>Unidades</small><b>${e.unidades}</b></div></div>
    ${rowActs('empreendimentos', e.id)}</div>`;
  }).join('') || '<div class="card empty" style="grid-column:1/-1">Nenhum empreendimento.</div>'}</div>`;
};

PAGES.estoque = () => {
  const tab = state.tab.estoque || 'Materiais', cat = fil('estCat'), only = state.f.estLow;
  const cats = ['Todos', ...new Set(S.materiais.map(m => m.cat))];
  const rows = S.materiais.filter(m => (cat === 'Todos' || m.cat === cat) && (!only || low(m)) && match(m, nm(S.fornecedores, m.forn)));
  const head = header('Estoque e Insumos', 'Materiais de construção, EPIs e ferramentas, com alerta de reposição.', exportBtn('materiais') + '<button class="btn ghost" data-act="mov" data-v="Saída">📤 Saída</button><button class="btn ghost" data-act="mov" data-v="Entrada">📥 Entrada</button><button class="btn" data-act="new" data-k="materiais">+ Novo material</button>')
    + `<div class="grid g-kpi">${kpi('📦', 'blue', S.materiais.length, 'Itens cadastrados')}${kpi('⚠️', 'red', S.materiais.filter(low).length, 'Abaixo do mínimo')}${kpi('💰', 'gold', brlS(S.materiais.reduce((s, m) => s + m.qtd * m.custo, 0)), 'Valor em estoque')}${kpi('🔄', 'green', S.movs.length, 'Movimentações')}</div>
    <div class="chips"><button class="chip ${tab === 'Materiais' ? 'on' : ''}" data-act="tab" data-k="estoque" data-v="Materiais">📦 Materiais</button><button class="chip ${tab === 'Movimentações' ? 'on' : ''}" data-act="tab" data-k="estoque" data-v="Movimentações">🔄 Movimentações</button></div>`;
  if (tab === 'Movimentações') {
    const mv = S.movs.filter(v => match(v, nm(S.materiais, v.matId) + ' ' + nm(S.obras, v.obraId)));
    return head + (mv.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Quantidade</th><th>Obra / Obs.</th></tr></thead><tbody>${mv.map(v => { const m = by(S.materiais, v.matId); return `<tr><td>${dt(v.data)}</td><td>${pill(v.tipo)}</td><td><b>${esc(m ? m.nome : 'Removido')}</b></td><td>${num(v.qtd)} ${esc(m ? m.un : '')}</td><td>${esc(v.obraId ? nm(S.obras, v.obraId) + (v.obs ? ' · ' + v.obs : '') : v.obs || '—')}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="tw"><p class="empty">Sem movimentações.</p></div>');
  }
  return head + `<div class="filters"><select data-sel="estCat">${cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><button class="chip ${only ? 'on' : ''}" data-act="lowonly">⚠️ Só itens em alerta</button></div>` +
    table([
      { h: 'Material', f: m => `<b>${esc(m.nome)}</b><br><small class="mut">${esc(m.cat)} · ${esc(m.local)}</small>` },
      { h: 'Estoque', f: m => `<b>${num(m.qtd)}</b> ${esc(m.un)}<div style="margin-top:6px;width:120px">${bar(pct(m.qtd, m.min * 2), low(m) ? 'r' : 'g')}</div>` },
      { h: 'Mínimo', f: m => num(m.min) }, { h: 'Situação', f: m => low(m) ? '<span class="pill c-red">⚠ Repor</span>' : '<span class="pill c-green">OK</span>' },
      { h: 'Custo un.', f: m => brl(m.custo) }, { h: 'Valor', f: m => brlS(m.qtd * m.custo) }, { h: 'Fornecedor', f: m => esc(nm(S.fornecedores, m.forn)) }
    ], rows, 'materiais', m => `<button class="btn green sm" data-act="mov" data-v="Entrada" data-id="${m.id}">＋</button><button class="btn ghost sm" data-act="mov" data-v="Saída" data-id="${m.id}">－</button>`);
};

PAGES.funcionarios = () => {
  const s = fil('fst'), o = fil('fob'), rows = S.funcionarios.filter(f => (s === 'Todos' || f.status === s) && (o === 'Todos' || f.obraId === o) && match(f, nm(S.obras, f.obraId)));
  return header('Funcionários', 'Equipe própria, alocação por obra e folha de pagamento.', exportBtn('funcionarios') + '<button class="btn" data-act="new" data-k="funcionarios">+ Novo funcionário</button>') + `
  <div class="grid g-kpi">${kpi('👷', 'blue', S.funcionarios.length, 'Total de funcionários')}${kpi('✅', 'green', S.funcionarios.filter(f => f.status === 'Ativo').length, 'Ativos')}${kpi('🏖️', 'orange', S.funcionarios.filter(f => f.status !== 'Ativo').length, 'Férias / afastados')}${kpi('💵', 'gold', brlS(S.funcionarios.filter(f => f.status !== 'Afastado').reduce((s, f) => s + f.salario, 0)), 'Folha mensal (base)')}</div>
  <div class="filters"><select data-sel="fst">${['Todos', 'Ativo', 'Férias', 'Afastado'].map(x => `<option ${x === s ? 'selected' : ''}>${x}</option>`).join('')}</select>
  <select data-sel="fob"><option value="Todos">Todas as obras</option>${S.obras.map(x => `<option value="${x.id}" ${x.id === o ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>` +
    table([{ h: 'Nome', f: f => `<span class="avatar">${initials(f.nome)}</span><b>${esc(f.nome)}</b>` }, { h: 'Cargo', f: f => esc(f.cargo) }, { h: 'Obra', f: f => esc(nm(S.obras, f.obraId)) }, { h: 'Situação', f: f => pill(f.status) }, { h: 'Salário', f: f => brl(f.salario) }, { h: 'Admissão', f: f => dt(f.adm) }, { h: 'Contato', f: f => esc(f.tel) }], rows, 'funcionarios');
};

PAGES.fornecedores = () => {
  const rows = S.fornecedores.filter(f => match(f));
  return header('Fornecedores', 'Parceiros de materiais, prazos e contatos.', exportBtn('fornecedores') + '<button class="btn" data-act="new" data-k="fornecedores">+ Novo fornecedor</button>') +
    table([{ h: 'Fornecedor', f: f => `<span class="avatar">${initials(f.nome)}</span><b>${esc(f.nome)}</b>` }, { h: 'Categoria', f: f => esc(f.cat) }, { h: 'Prazo', f: f => f.prazo + ' dias' }, { h: 'Telefone', f: f => esc(f.tel) }, { h: 'E-mail', f: f => esc(f.email) }, { h: 'Itens', f: f => S.materiais.filter(m => m.forn === f.id).length }], rows, 'fornecedores');
};

PAGES.financeiro = () => {
  const t = fil('ft'), ls = S.lancamentos.filter(l => (t === 'Todos' || l.tipo === t) && match(l, nm(S.obras, l.obraId))).sort((a, b) => b.data.localeCompare(a.data));
  const rec = S.lancamentos.filter(l => l.tipo === 'Receita').reduce((s, l) => s + l.valor, 0), dsp = S.lancamentos.filter(l => l.tipo === 'Despesa').reduce((s, l) => s + l.valor, 0), m = monthly(6);
  return header('Financeiro', 'Receitas, despesas e fluxo de caixa consolidado.', exportBtn('lancamentos') + '<button class="btn" data-act="new" data-k="lancamentos">+ Novo lançamento</button>') + `
  <div class="grid g-kpi">${kpi('📈', 'green', brlS(rec), 'Receitas')}${kpi('📉', 'red', brlS(dsp), 'Despesas')}${kpi('💰', rec >= dsp ? 'gold' : 'red', brlS(rec - dsp), 'Saldo')}${kpi('🎯', 'purple', pct(rec - dsp, rec) + '%', 'Margem')}</div>
  <div class="card" style="margin-bottom:18px"><h3>Receitas x Despesas <small>mensal</small></h3>${lineChart(m.map(x => x.l), [{ c: 'var(--green)', d: m.map(x => x.r) }, { c: 'var(--red)', d: m.map(x => x.d) }])}</div>
  <div class="filters"><select data-sel="ft">${['Todos', 'Receita', 'Despesa'].map(x => `<option ${x === t ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` +
    table([{ h: 'Data', f: l => dt(l.data) }, { h: 'Descrição', f: l => `<b>${esc(l.desc)}</b>` }, { h: 'Tipo', f: l => pill(l.tipo) }, { h: 'Obra', f: l => esc(nm(S.obras, l.obraId)) }, { h: 'Valor', f: l => `<b class="${l.tipo === 'Receita' ? 'up' : 'down'}">${l.tipo === 'Receita' ? '+' : '−'} ${brl(l.valor)}</b>` }], ls, 'lancamentos');
};

PAGES.tarefas = () => {
  const cols = ['Aberta', 'Em andamento', 'Resolvida'], rows = S.tarefas.filter(t => match(t, nm(S.obras, t.obraId)));
  return header('Tarefas e Ocorrências', 'Quadro de pendências das obras.', '<button class="btn" data-act="new" data-k="tarefas">+ Nova tarefa</button>') + `<div class="kan">${cols.map((c, ci) => `<div class="kcol"><h3>${c} <span class="pill gray">${rows.filter(t => t.status === c).length}</span></h3>${rows.filter(t => t.status === c).map(t => `<div class="kcard"><b>${esc(t.titulo)}</b><div class="row sm"><span class="mut">${esc(nm(S.obras, t.obraId))}</span>${pill(t.prio)}</div><div class="sm mut" style="margin-top:4px">📅 ${dt(t.prazo)} ${c !== 'Resolvida' && daysTo(t.prazo) < 0 ? '<span class="down">· vencida</span>' : ''}</div>
    <div class="acts">${ci > 0 ? `<button class="btn ghost sm" data-act="move" data-id="${t.id}" data-v="${cols[ci - 1]}">◀</button>` : ''}${ci < 2 ? `<button class="btn green sm" data-act="move" data-id="${t.id}" data-v="${cols[ci + 1]}">${ci === 1 ? '✔ Concluir' : 'Iniciar ▶'}</button>` : ''}<button class="btn ghost sm" data-act="edit" data-k="tarefas" data-id="${t.id}">✏️</button><button class="btn red sm" data-act="del" data-k="tarefas" data-id="${t.id}">🗑</button></div></div>`).join('') || '<p class="empty">Vazio</p>'}</div>`).join('')}</div>`;
};

/* ============ navegação e render ============ */
const NAV = [['dashboard', '📊', 'Painel geral'], ['obras', '🏗️', 'Obras'], ['empreendimentos', '🏢', 'Condomínios'], ['estoque', '📦', 'Estoque e insumos'], ['funcionarios', '👷', 'Funcionários'], ['fornecedores', '🚚', 'Fornecedores'], ['financeiro', '💰', 'Financeiro'], ['tarefas', '✅', 'Tarefas']];
const route = () => { const r = (location.hash.replace('#/', '') || 'dashboard'); return PAGES[r] ? r : 'dashboard'; };
function render() {
  const r = route();
  $('#nav').innerHTML = NAV.map(([k, i, l]) => `<a href="#/${k}" class="${k === r ? 'on' : ''}"><i>${i}</i>${l}${k === 'estoque' && S.materiais.some(low) ? `<em>${S.materiais.filter(low).length}</em>` : ''}${k === 'tarefas' && S.tarefas.some(t => t.status !== 'Resolvida') ? `<em style="background:var(--blue)">${S.tarefas.filter(t => t.status !== 'Resolvida').length}</em>` : ''}</a>`).join('');
  $('#view').innerHTML = PAGES[r]();
  const n = alerts().length; $('#bellN').textContent = n; $('#bellN').style.display = n ? '' : 'none';
  document.title = 'Império ERP | ' + (NAV.find(x => x[0] === r) || [])[2];
}
window.addEventListener('hashchange', () => { state.q = ''; $('#q').value = ''; $('#side').classList.remove('open'); render(); window.scrollTo(0, 0); });
$('#q').addEventListener('input', e => { state.q = e.target.value; render(); });

const ACT = {
  new: (id, b) => openForm(b.dataset.k), edit: (id, b) => openForm(b.dataset.k, id), del: (id, b) => del(b.dataset.k, id),
  obra: id => openObra(id), mov: (id, b) => openMov(b.dataset.v, id),
  filter: (id, b) => { state.f[b.dataset.k] = b.dataset.v; render(); }, tab: (id, b) => { state.tab[b.dataset.k] = b.dataset.v; render(); },
  lowonly: () => { state.f.estLow = !state.f.estLow; render(); },
  move: (id, b) => { by(S.tarefas, id).status = b.dataset.v; save(); render(); toast('Tarefa movida para "' + b.dataset.v + '"'); },
  quick: () => quick(),
  csv: (id, b) => exportCSV(b.dataset.k)
};
$('#view').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && ACT[b.dataset.act]) { e.stopPropagation(); ACT[b.dataset.act](b.dataset.id, b); } });
$('#view').addEventListener('change', e => { const s = e.target.closest('[data-sel]'); if (s) { state.f[s.dataset.sel] = s.value; render(); } });

function quick() {
  const items = [['🏗️', 'Nova obra', () => openForm('obras')], ['🏢', 'Novo empreendimento', () => openForm('empreendimentos')], ['📥', 'Entrada de material', () => openMov('Entrada')], ['📤', 'Saída de material', () => openMov('Saída')], ['👷', 'Novo funcionário', () => openForm('funcionarios')], ['🚚', 'Novo fornecedor', () => openForm('fornecedores')], ['✅', 'Nova tarefa', () => openForm('tarefas')], ['💰', 'Novo lançamento', () => openForm('lancamentos')]];
  modal('⚡ Ação rápida', `<div class="grid" style="grid-template-columns:1fr 1fr">${items.map((x, i) => `<button class="btn ghost" data-q="${i}" style="padding:16px;text-align:left">${x[0]} ${x[1]}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { closeModal(); items[+b.dataset.q][2](); });
}
function exportCSV(k) {
  const rows = S[k]; if (!rows.length) return toast('Nada para exportar');
  const cols = Object.keys(rows[0]).filter(c => typeof rows[0][c] !== 'object');
  const csv = [cols.join(';')].concat(rows.map(r => cols.map(c => '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"').join(';'))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = k + '.csv'; a.click(); toast('Arquivo ' + k + '.csv gerado');
}
$('#btnQuick').onclick = quick;
$('#btnBell').onclick = () => modal('🔔 Alertas e pendências', alertList(alerts(), '✅ Nenhuma pendência!'));
$('#btnMenu').onclick = () => $('#side').classList.toggle('open');
$('#btnReset').onclick = () => confirmBox('Restaurar os dados de exemplo? Todos os dados que você cadastrou serão substituídos.', () => { S = seedData(); save(); render(); toast('Dados de exemplo restaurados'); }, 'Restaurar');
let theme = 'dark'; try { theme = localStorage.getItem('imperio_theme') || 'dark'; } catch (e) {}
document.documentElement.dataset.theme = theme;
$('#btnTheme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('imperio_theme', theme); } catch (e) {} };
render();
})();
