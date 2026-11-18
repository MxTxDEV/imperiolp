(function () {
'use strict';
/* ============ estado e utilitários ============ */
const KEY = 'imperio_erp_v1';
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
let migrado = false;
if (!S || !S.obras) S = seedData(); else migrado = migrateData(S);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
if (migrado) save();
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
const prog = o => { if (o.status === 'Concluída') return 100; const ps = o.passos || [], t = ps.reduce((s, x) => s + (+x.peso || 1), 0); return t ? Math.round(ps.filter(x => x.status === 'Concluído').reduce((s, x) => s + (+x.peso || 1), 0) / t * 100) : 0; };
const isLate = o => o.status === 'Em andamento' && daysTo(o.previsao) < 0;
const low = m => m.qtd < m.min;
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const COLOR = { 'Concluído': 'green', 'Pendente': 'gray', 'Vigente': 'blue', 'Rascunho': 'gray', 'Rescindido': 'red', 'Em andamento': 'blue', 'Planejamento': 'purple', 'Pausada': 'orange', 'Concluída': 'green', 'Lançamento': 'purple', 'Em obras': 'blue', 'Entregue': 'green', 'Ativo': 'green', 'Férias': 'orange', 'Afastado': 'red', 'Alta': 'red', 'Média': 'orange', 'Baixa': 'blue', 'Aberta': 'orange', 'Resolvida': 'green', 'Receita': 'green', 'Despesa': 'red', 'Entrada': 'green', 'Saída': 'orange' };
const pill = t => `<span class="pill c-${COLOR[t] || 'blue'}">${esc(t)}</span>`;
const state = { q: '', f: {}, tab: {} };
const fil = (k, d = 'Todos') => state.f[k] || d;
// migração: dados antigos (etapas) -> passos; contratos
(function migrate() {
  if (!S.contratos) S.contratos = seedData().contratos.filter(c => by(S.obras, c.obraId));
  S.obras.forEach(o => { if (!o.passos) { const old = o.etapas && o.etapas.length ? Math.round(o.etapas.reduce((s, e) => s + e.pct, 0) / o.etapas.length) : 0; o.passos = mkPassos(o, Math.floor(old / 100 * 9), o.status === 'Em andamento'); delete o.etapas; } });
  save();
})();

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
  contratos: { t: 'Contrato', f: [
    { k: 'nome', l: 'Objeto do contrato', full: 1, req: 1 }, { k: 'empresa', l: 'Contratada (empresa / pessoa)' }, { k: 'obraId', l: 'Obra', type: 'select', o: refOpt('obras') },
    { k: 'tipo', l: 'Tipo', type: 'select', o: () => opt(['Empreitada', 'Fornecimento', 'Serviço', 'Projeto', 'Locação', 'Outro']) },
    { k: 'status', l: 'Status', type: 'select', o: () => opt(['Rascunho', 'Vigente', 'Concluído', 'Rescindido']) },
    { k: 'valor', l: 'Valor do contrato (R$)', type: 'number' }, { k: 'pago', l: 'Já pago (R$)', type: 'number' },
    { k: 'inicio', l: 'Início', type: 'date' }, { k: 'fim', l: 'Término', type: 'date' }, { k: 'obs', l: 'Observações', full: 1 }] },
  lancamentos: { t: 'Lançamento', f: [
    { k: 'desc', l: 'Descrição', full: 1, req: 1 }, { k: 'tipo', l: 'Tipo', type: 'select', o: () => opt(['Receita', 'Despesa']) },
    { k: 'valor', l: 'Valor (R$)', type: 'number' }, { k: 'data', l: 'Data', type: 'date' }, { k: 'obraId', l: 'Obra', type: 'select', o: refOpt('obras', 1) },
    { k: 'empId', l: 'Empreendimento (receitas de venda)', type: 'select', o: refOpt('empreendimentos', 1) },
    { k: 'cat', l: 'Categoria (vazio = automática)', type: 'select', o: () => [{ v: '', l: '— automática —' }].concat(opt(FIN.CATS.Receita.concat(FIN.CATS.Despesa))) }] }
};
const DEFAULTS = {
  obras: () => ({ status: 'Planejamento', orcamento: 0, gasto: 0, inicio: todayISO(), previsao: todayISO(), empId: (S.empreendimentos[0] || {}).id || '' }),
  empreendimentos: () => ({ tipo: 'Condomínio de apartamentos', status: 'Lançamento', unidades: 0, vendidas: 0, reservadas: 0, vgv: 0, entrega: todayISO() }),
  materiais: () => ({ cat: 'Outros', un: 'un', qtd: 0, min: 0, custo: 0, forn: '' }),
  funcionarios: () => ({ status: 'Ativo', obraId: '', salario: 0, adm: todayISO() }),
  fornecedores: () => ({ prazo: 3 }),
  tarefas: () => ({ prio: 'Média', status: 'Aberta', obraId: '', prazo: todayISO() }),
  contratos: () => ({ obraId: curObraId(), tipo: 'Empreitada', status: 'Vigente', valor: 0, pago: 0, inicio: todayISO(), fim: todayISO() }),
  lancamentos: () => ({ tipo: 'Despesa', valor: 0, data: todayISO(), obraId: '', empId: '' })
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
    if (id) Object.assign(row, d); else { Object.assign(row, d, { id: uid(key[0]) }); if (key === 'obras') row.passos = mkPassos(row, 0, false); S[key].push(row); }
    save(); closeModal(); render(); toast(id ? 'Alterações salvas' : sc.t + ' cadastrado(a)');
  };
  $('#frmOk').onclick = ok; $('#frm').onsubmit = e => { e.preventDefault(); ok(); };
}
function del(key, id) {
  const r = by(S[key], id); if (!r) return;
  confirmBox(`Excluir <b>${esc(r.nome || r.titulo || r.desc)}</b>? Essa ação não pode ser desfeita.`, () => { S[key] = S[key].filter(x => x.id !== id); if (key === 'obras') S.contratos = S.contratos.filter(c => c.obraId !== id); save(); render(); toast('Excluído'); });
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
const bar = (p, c = '') => `<div class="bar ${c}"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div>`;

/* ============ alertas ============ */
function alerts() {
  const a = [];
  S.materiais.filter(low).forEach(m => a.push({ c: 'red', ic: '📦', t: 'Estoque baixo: ' + m.nome, s: `${num(m.qtd)} ${m.un} em estoque (mínimo ${num(m.min)})`, h: '#/estoque' }));
  S.obras.filter(isLate).forEach(o => a.push({ c: 'orange', ic: '⏰', t: 'Obra atrasada: ' + o.nome, s: `Previsão era ${dt(o.previsao)} (${-daysTo(o.previsao)} dias de atraso)`, h: '#/obras' }));
  S.obras.filter(o => o.status !== 'Concluída' && o.orcamento && pct(o.gasto, o.orcamento) > prog(o) + 20).forEach(o => a.push({ c: 'red', ic: '💸', t: 'Gasto acima do ritmo: ' + o.nome, s: `${pct(o.gasto, o.orcamento)}% do orçamento gasto para ${prog(o)}% de avanço`, h: '#/obras' }));
  S.tarefas.filter(t => t.status !== 'Resolvida' && t.prio === 'Alta' && daysTo(t.prazo) <= 7).forEach(t => a.push({ c: 'purple', ic: '✅', t: 'Tarefa urgente: ' + t.titulo, s: 'Prazo ' + dt(t.prazo), h: '#/tarefas' }));
  S.obras.filter(o => o.status === 'Em andamento').forEach(o => { const l = (o.passos || []).filter(passoLate); if (l.length) a.push({ c: 'orange', ic: '🪜', t: `${l.length} passo(s) atrasado(s): ${o.nome}`, s: l.map(x => x.nome).slice(0, 2).join(', '), h: '#/andamento' }); });
  S.contratos.filter(c => c.status === 'Vigente' && daysTo(c.fim) <= 30).forEach(c => a.push({ c: 'purple', ic: '📑', t: (daysTo(c.fim) < 0 ? 'Contrato vencido: ' : 'Contrato vence em ' + daysTo(c.fim) + ' dias: ') + c.nome, s: nm(S.obras, c.obraId) + ' · saldo ' + brl(c.valor - c.pago), h: '#/andamento' }));
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

PAGES.dashboard = () => BI.page();
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
  <div class="card" style="margin-bottom:16px;box-shadow:none"><h3>Passos da obra <small>${prog(o)}% concluído</small></h3>${(o.passos || []).map((p, i) => `<div class="row sm" style="padding:5px 0"><span>${p.status === 'Concluído' ? '✅' : '⬜'} ${esc(p.nome)}</span><span class="mut">até ${dt(p.fim)}</span></div>`).join('') || '<p class="mut sm">Sem passos.</p>'}</div>
  <div class="grid g-2" style="grid-template-columns:1fr 1fr">
    <div><h3 style="font-size:.95rem;margin-bottom:8px">👷 Equipe alocada (${eq.length})</h3><div class="list">${eq.map(f => `<div class="li"><span class="avatar" style="margin:0">${initials(f.nome)}</span><div><b>${esc(f.nome)}</b><small>${esc(f.cargo)}</small></div></div>`).join('') || '<p class="mut sm">Ninguém alocado.</p>'}</div></div>
    <div><h3 style="font-size:.95rem;margin-bottom:8px">📤 Materiais consumidos</h3><div class="list">${consumo.slice(0, 6).map(v => { const m = by(S.materiais, v.matId); return `<div class="li"><div><b>${esc(m ? m.nome : '—')}</b><small>${dt(v.data)}</small></div><div class="end">${num(v.qtd)} ${esc(m ? m.un : '')}</div></div>`; }).join('') || '<p class="mut sm">Sem consumo registrado.</p>'}</div>
    <h3 style="font-size:.95rem;margin:14px 0 8px">✅ Tarefas abertas (${tf.length})</h3>${tf.map(t => `<div class="sm" style="padding:4px 0">• ${esc(t.titulo)} ${pill(t.prio)}</div>`).join('') || '<p class="mut sm">Nenhuma.</p>'}</div>
  </div>`,
  `<button class="btn red" id="oDel">Excluir</button><button class="btn ghost" id="oEdit">✏️ Editar dados</button><button class="btn" id="oAnd">📈 Abrir andamento</button>`, true);
  $('#oAnd').onclick = () => { state.f.andObra = id; closeModal(); location.hash = '#/andamento'; };
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

PAGES.financeiro = () => FIN.page();

PAGES.tarefas = () => {
  const cols = ['Aberta', 'Em andamento', 'Resolvida'], rows = S.tarefas.filter(t => match(t, nm(S.obras, t.obraId)));
  return header('Tarefas e Ocorrências', 'Quadro de pendências das obras.', '<button class="btn" data-act="new" data-k="tarefas">+ Nova tarefa</button>') + `<div class="kan">${cols.map((c, ci) => `<div class="kcol"><h3>${c} <span class="pill gray">${rows.filter(t => t.status === c).length}</span></h3>${rows.filter(t => t.status === c).map(t => `<div class="kcard"><b>${esc(t.titulo)}</b><div class="row sm"><span class="mut">${esc(nm(S.obras, t.obraId))}</span>${pill(t.prio)}</div><div class="sm mut" style="margin-top:4px">📅 ${dt(t.prazo)} ${c !== 'Resolvida' && daysTo(t.prazo) < 0 ? '<span class="down">· vencida</span>' : ''}</div>
    <div class="acts">${ci > 0 ? `<button class="btn ghost sm" data-act="move" data-id="${t.id}" data-v="${cols[ci - 1]}">◀</button>` : ''}${ci < 2 ? `<button class="btn green sm" data-act="move" data-id="${t.id}" data-v="${cols[ci + 1]}">${ci === 1 ? '✔ Concluir' : 'Iniciar ▶'}</button>` : ''}<button class="btn ghost sm" data-act="edit" data-k="tarefas" data-id="${t.id}">✏️</button><button class="btn red sm" data-act="del" data-k="tarefas" data-id="${t.id}">🗑</button></div></div>`).join('') || '<p class="empty">Vazio</p>'}</div>`).join('')}</div>`;
};

/* ============ ANDAMENTO DAS OBRAS (passos, materiais, custos, contratos) ============ */
const ORD = ['Primeiro', 'Segundo', 'Terceiro', 'Quarto', 'Quinto', 'Sexto', 'Sétimo', 'Oitavo', 'Nono', 'Décimo'];
const ordName = i => i < 10 ? ORD[i] + ' passo' : (i + 1) + 'º passo';
const passoLate = p => p.status !== 'Concluído' && daysTo(p.fim) < 0;
const matCost = p => (p.mats || []).reduce((s, m) => { const x = by(S.materiais, m.matId); return s + (x ? x.custo * m.qtd : 0); }, 0);
const passoCost = p => matCost(p) + (+p.extra || 0);
const passoReal = p => (p.baixado ? matCost(p) : 0) + (p.status === 'Concluído' ? (+p.extra || 0) : 0);
const toT = s => new Date(s + 'T12:00:00').getTime();
const curObraId = () => { if (state.f.andObra && by(S.obras, state.f.andObra)) return state.f.andObra; const o = S.obras.find(x => x.status !== 'Concluída') || S.obras[0]; return o ? o.id : null; };
function syncObra(o) {
  const p = prog(o), ps = o.passos || [];
  if (p === 100 && ps.length && o.status !== 'Concluída') o.status = 'Concluída';
  else if (p < 100 && o.status === 'Concluída') o.status = 'Em andamento';
  else if (o.status === 'Planejamento' && ps.some(x => x.status !== 'Pendente')) o.status = 'Em andamento';
}

const stat = (l, v, cls = '', sub = '') => `<div class="an-stat"><small>${l}</small><b class="${cls}">${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
const ring = (p, size = 92) => { const r = size / 2 - 7, c = 2 * Math.PI * r, len = c * p / 100; return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="an-ring"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="8" style="stroke:var(--panel2)"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="8" stroke-linecap="round" style="stroke:${p === 100 ? 'var(--green)' : 'var(--gold)'}" stroke-dasharray="${len} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" style="fill:var(--txt);font:700 ${size / 4.6}px Sora,sans-serif">${p}%</text></svg>`; };

PAGES.andamento = () => {
  const id = curObraId();
  if (!id) return header('Andamento das Obras', 'Passos, prazos, materiais, custos e contratos de cada obra.') + '<div class="card empty">Cadastre uma obra primeiro.</div>';
  const o = by(S.obras, id), tab = state.tab.and || 'Passos', ps = o.passos || [], p = prog(o);
  const done = ps.filter(x => x.status === 'Concluído').length, late = ps.filter(passoLate).length;
  const prevT = ps.reduce((s, x) => s + passoCost(x), 0), cts = S.contratos.filter(c => c.obraId === id);
  const cVal = cts.reduce((s, c) => s + c.valor, 0), cPago = cts.reduce((s, c) => s + c.pago, 0), dias = daysTo(o.previsao);
  const strip = `<div class="an-strip" role="tablist" aria-label="Obras">${S.obras.map(x => { const px = prog(x); return `<button class="an-o ${x.id === id ? 'on' : ''}" data-act="selObra" data-id="${x.id}" role="tab" aria-selected="${x.id === id}"><span class="an-o-n">${esc(x.nome)}</span><span class="an-o-p">${px}%</span><i style="--w:${px}%" class="${px === 100 ? 'ok' : (x.passos || []).some(passoLate) && x.status === 'Em andamento' ? 'late' : ''}"></i></button>`; }).join('')}</div>`;
  const head = `<div class="card an-head">
    <div class="an-title"><div><h2>${esc(o.nome)}</h2><p>${esc(nm(S.empreendimentos, o.empId))} · ${esc(o.resp || '—')} · ${dt(o.inicio)} → ${dt(o.previsao)}</p></div>${pill(o.status)}</div>
    <div class="an-bar ${p === 100 ? 'ok' : ''}"><i style="width:${p}%"></i></div>
    <div class="an-stats">${stat('Avanço', p + '%', '', `${done} de ${ps.length} passos`)}${stat('Atrasados', late, late ? 'down' : '', late ? 'passo(s) fora do prazo' : 'nenhum')}${stat('Prazo final', dias >= 0 ? dias + ' dias' : -dias + ' dias', dias < 0 ? 'down' : '', dias >= 0 ? 'restantes' : 'de atraso')}${stat('Previsto', brlS(prevT), prevT > o.orcamento ? 'down' : '', 'de ' + brlS(o.orcamento) + ' orçados')}${stat('Contratos', brlS(cVal), '', cts.length + ' · pago ' + brlS(cPago))}</div></div>`;
  const tabs = ['Passos', 'Materiais e custos', 'Contratos', 'Cronograma'];
  const tb = `<div class="an-tabs"><div class="seg-g" role="tablist">${tabs.map(t => `<button class="seg ${tab === t ? 'on' : ''}" role="tab" aria-selected="${tab === t}" data-act="tab" data-k="and" data-v="${t}">${t}</button>`).join('')}</div>
    <div class="acts">${tab === 'Passos' ? '<button class="btn sm" data-act="pNew">+ Novo passo</button><button class="btn ghost sm" data-act="pCsv">⬇ CSV</button>' : tab === 'Contratos' ? '<button class="btn sm" data-act="new" data-k="contratos">+ Novo contrato</button><button class="btn ghost sm" data-act="csv" data-k="contratos">⬇ CSV</button>' : ''}</div></div>`;
  const body = tab === 'Passos' ? tabPassos(o) : tab === 'Materiais e custos' ? tabMat(o) : tab === 'Contratos' ? tabCont(o, cts) : tabCron(o);
  return header('Andamento das Obras', 'Passos, prazos, materiais, custos e contratos de cada obra.') + strip + head + tb + body;
};

function tabPassos(o) {
  const all = o.passos || [], ps = all.map((p, i) => ({ p, i })).filter(x => !state.q || (x.p.nome + ' ' + (x.p.obs || '')).toLowerCase().includes(state.q.toLowerCase()));
  state.open = state.open || {};
  const list = !all.length ? `<div class="card empty">Nenhum passo nesta obra.<br><br><button class="btn sm" data-act="pTpl">✨ Usar modelo padrão de obra</button></div>`
    : !ps.length ? '<div class="card empty">Nenhum passo encontrado na busca.</div>'
    : `<div class="card st-list">${ps.map(({ p, i }) => {
      const late = passoLate(p), cs = p.status === 'Concluído' ? 'done' : late ? 'late' : p.status === 'Em andamento' ? 'doing' : '', op = state.open[p.id];
      const mats = p.mats || [], falta = !p.baixado && mats.some(m => { const x = by(S.materiais, m.matId); return x && x.qtd < m.qtd; });
      return `<div class="st-row ${cs} ${op ? 'open' : ''}">
        <button class="st-dot" data-act="pToggle" data-id="${p.id}" title="${p.status === 'Concluído' ? 'Desmarcar passo' : 'Marcar passo como concluído'}" aria-label="${p.status === 'Concluído' ? 'Desmarcar' : 'Concluir'} ${esc(p.nome)}">${p.status === 'Concluído' ? '✓' : i + 1}</button>
        <div class="st-body">
          <div class="st-line" data-act="pOpen" data-id="${p.id}" role="button" tabindex="0" aria-expanded="${!!op}">
            <div class="st-txt"><small class="ord">${ordName(i)}</small><b class="st-name">${esc(p.nome)}</b>
              <span class="st-meta">${dt(p.ini).slice(0, 5)} → ${dt(p.fim)}${mats.length ? ` · ${mats.length} materia${mats.length > 1 ? 'is' : 'l'}` : ''}${falta ? ' <span class="down">⚠ falta estoque</span>' : ''}</span></div>
            <span class="st-cost">${brlS(passoCost(p))}</span>
            <span class="st-pill">${late ? `<span class="pill c-red">${-daysTo(p.fim)}d atraso</span>` : pill(p.status)}</span>
            <span class="st-car" aria-hidden="true">${op ? '▴' : '▾'}</span>
          </div>
          ${op ? `<div class="st-det">
            ${mats.length ? `<div class="mchips">${mats.map(m => { const x = by(S.materiais, m.matId), f = !p.baixado && x && x.qtd < m.qtd; return `<span class="mchip ${f ? 'bad' : ''}">${esc(x ? x.nome : '?')} · ${num(m.qtd)} ${esc(x ? x.un : '')}${f ? ' ⚠' : ''}</span>`; }).join('')}</div>` : '<p class="sm mut">Nenhum material vinculado.</p>'}
            <p class="sm mut">Materiais ${brl(matCost(p))} + mão de obra/serviços ${brl(p.extra)} = <b style="color:var(--txt)">${brl(passoCost(p))}</b> · peso ${p.peso || 1}${p.dataConc ? ' · concluído em ' + dt(p.dataConc) : ''}${p.obs ? ' · ' + esc(p.obs) : ''}</p>
            <div class="acts">${mats.length ? (p.baixado ? '<span class="pill c-green">✓ Materiais baixados</span>' : `<button class="btn green sm" data-act="pBaixa" data-id="${p.id}">📤 Baixar materiais</button>`) : ''}
              <button class="btn ghost sm" data-act="pEdit" data-id="${p.id}">✏️ Editar</button><button class="btn ghost sm" data-act="pUp" data-id="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button><button class="btn ghost sm" data-act="pDown" data-id="${p.id}" ${i === all.length - 1 ? 'disabled' : ''} aria-label="Descer">▼</button><button class="btn red sm" data-act="pDel" data-id="${p.id}" aria-label="Excluir passo">🗑</button></div>
          </div>` : ''}
        </div></div>`;
    }).join('')}</div>`;
  return `<div class="an-grid">${list}${sidePanel(o)}</div>`;
}

function sidePanel(o) {
  const ps = o.passos || [], p = prog(o), prox = ps.filter(x => x.status !== 'Concluído').sort((a, b) => a.fim.localeCompare(b.fim)).slice(0, 3);
  const tot = ps.reduce((s, x) => s + passoCost(x), 0), real = ps.reduce((s, x) => s + passoReal(x), 0);
  const need = {}; ps.filter(x => !x.baixado).forEach(x => (x.mats || []).forEach(m => need[m.matId] = (need[m.matId] || 0) + m.qtd));
  const falt = Object.keys(need).filter(k => { const m = by(S.materiais, k); return m && m.qtd < need[k]; }).length;
  return `<aside class="an-side">
    <div class="card an-sum">${ring(p)}<div><b>${ps.filter(x => x.status === 'Concluído').length} de ${ps.length} passos</b><span class="sm mut">Clique no círculo de um passo para marcar como concluído.</span></div></div>
    <div class="card"><h3>Próximos prazos</h3>${prox.length ? prox.map(x => { const d = daysTo(x.fim); return `<div class="an-next"><span>${esc(x.nome)}</span><b class="${d < 0 ? 'down' : d <= 7 ? 'warn' : ''}">${d < 0 ? -d + 'd atraso' : d === 0 ? 'hoje' : d + 'd'}</b></div>`; }).join('') : '<p class="sm mut">Todos os passos concluídos.</p>'}</div>
    <div class="card"><h3>Custos dos passos</h3>
      <div class="an-next"><span>Previsto</span><b>${brlS(tot)}</b></div><div class="an-next"><span>Realizado</span><b>${brlS(real)}</b></div><div class="an-next"><span>Orçamento</span><b>${brlS(o.orcamento)}</b></div>
      <div style="margin-top:10px">${bar(pct(tot, o.orcamento), tot > o.orcamento ? 'r' : 'b')}</div>
      <p class="sm ${falt ? 'down' : 'mut'}" style="margin-top:10px">${falt ? `⚠ ${falt} material(is) sem estoque suficiente` : '✓ Estoque cobre os materiais pendentes'}</p>
      <button class="lnk" data-act="tab" data-k="and" data-v="Materiais e custos">Ver materiais e custos →</button></div>
  </aside>`;
}

function tabMat(o) {
  const ps = o.passos || [], need = {};
  ps.forEach(p => (p.mats || []).forEach(m => { const r = need[m.matId] = need[m.matId] || { pend: 0, baix: 0 }; if (p.baixado) r.baix += m.qtd; else r.pend += m.qtd; }));
  const rows = Object.keys(need).map(k => ({ m: by(S.materiais, k), r: need[k] })).filter(x => x.m);
  const matT = ps.reduce((s, p) => s + matCost(p), 0), exT = ps.reduce((s, p) => s + (+p.extra || 0), 0), tot = matT + exT, real = ps.reduce((s, p) => s + passoReal(p), 0), est = tot > o.orcamento;
  return `<div class="an-stats an-stats-c card">${stat('Materiais', brlS(matT))}${stat('Mão de obra e serviços', brlS(exT))}${stat('Total previsto', brlS(tot), est ? 'down' : '', pct(tot, o.orcamento) + '% do orçamento')}${stat('Realizado', brlS(real))}${stat(est ? 'Estouro previsto' : 'Folga', brlS(Math.abs(o.orcamento - tot)), est ? 'down' : 'up')}</div>
  <div class="an-grid">
    <div>${rows.length ? `<div class="tw"><table class="tbl-c"><thead><tr><th>Material</th><th>A usar</th><th>Baixado</th><th>Estoque</th><th>Situação</th><th>Custo</th><th></th></tr></thead><tbody>${rows.map(({ m, r }) => { const falta = Math.max(0, r.pend - m.qtd); return `<tr><td><b>${esc(m.nome)}</b><br><small class="mut">${esc(nm(S.fornecedores, m.forn))}</small></td><td>${num(r.pend)} ${esc(m.un)}</td><td>${num(r.baix)}</td><td>${num(m.qtd)}</td><td>${falta ? `<span class="pill c-red">Falta ${num(falta)}</span>` : '<span class="pill c-green">OK</span>'}</td><td>${brlS((r.pend + r.baix) * m.custo)}</td><td><button class="btn green sm" data-act="mov" data-v="Entrada" data-id="${m.id}" aria-label="Entrada de ${esc(m.nome)}">📥</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">Nenhum material vinculado aos passos.</div>'}</div>
    <aside class="card an-side"><h3>Custo por passo</h3>${ps.map((p, i) => `<div class="an-next"><span>${i + 1}. ${esc(p.nome)}</span><b>${brlS(passoCost(p))}</b></div>`).join('') || '<p class="sm mut">Sem passos.</p>'}</aside>
  </div>`;
}

function tabCont(o, cts) {
  const rows = cts.filter(c => match(c)), v = cts.reduce((s, c) => s + c.valor, 0), pg = cts.reduce((s, c) => s + c.pago, 0);
  return `<div class="an-stats an-stats-c card">${stat('Contratos', cts.length)}${stat('Contratado', brlS(v))}${stat('Pago', brlS(pg), 'up')}${stat('A pagar', brlS(v - pg), v - pg > 0 ? 'warn' : '')}</div>` +
  (rows.length ? `<div class="ct-list">${rows.map(c => { const pc = pct(c.pago, c.valor), d = daysTo(c.fim), venc = c.status === 'Vigente' && d < 0, perto = c.status === 'Vigente' && d >= 0 && d <= 30;
    return `<div class="card ct">
      <div class="ct-top"><div><b>${esc(c.nome)}</b><small class="mut">${esc(c.empresa)} · ${esc(c.tipo)}</small></div>${pill(c.status)}</div>
      <div class="ct-mid"><span class="sm mut">${dt(c.inicio)} → ${dt(c.fim)}${venc ? ' <b class="down">· vencido</b>' : perto ? ` <b class="warn">· vence em ${d}d</b>` : ''}</span><span class="sm"><b>${brlS(c.pago)}</b> <span class="mut">de ${brlS(c.valor)}</span></span></div>
      ${bar(pc, 'g')}
      <div class="ct-bot"><span class="sm mut">${pc}% pago · saldo ${brl(c.valor - c.pago)}</span><div class="acts">${c.valor - c.pago > 0 ? `<button class="btn green sm" data-act="cPay" data-id="${c.id}">💵 Pagar</button>` : ''}<button class="btn ghost sm" data-act="edit" data-k="contratos" data-id="${c.id}" aria-label="Editar contrato">✏️</button><button class="btn red sm" data-act="del" data-k="contratos" data-id="${c.id}" aria-label="Excluir contrato">🗑</button></div></div>
    </div>`; }).join('')}</div>` : '<div class="card empty">Nenhum contrato nesta obra.</div>');
}

function tabCron(o) {
  const ps = o.passos || [];
  if (!ps.length) return '<div class="card empty">Sem passos para exibir.</div>';
  const t0 = Math.min(toT(o.inicio), ...ps.map(p => toT(p.ini))), t1 = Math.max(toT(o.previsao), ...ps.map(p => toT(p.fim))), span = Math.max(1, t1 - t0);
  const pos = t => Math.min(100, Math.max(0, (t - t0) / span * 100)), hoje = pos(Date.now());
  return `<div class="card gantt"><h3>Cronograma <small>${dt(o.inicio)} → ${dt(o.previsao)} · linha vermelha = hoje</small></h3>
  ${ps.map((p, i) => { const l = pos(toT(p.ini)), w = Math.max(1.5, pos(toT(p.fim)) - l), c = p.status === 'Concluído' ? 'g' : passoLate(p) ? 'r' : p.status === 'Em andamento' ? 'b' : 'n';
    return `<div class="grow"><span class="gl" title="${esc(p.nome)}">${i + 1}. ${esc(p.nome)}</span><div class="gt"><i class="gbar ${c}" style="left:${l}%;width:${w}%" title="${dt(p.ini)} → ${dt(p.fim)}">${w > 12 ? dt(p.ini).slice(0, 5) + ' → ' + dt(p.fim).slice(0, 5) : ''}</i><u class="today" style="left:${hoje}%"></u></div></div>`; }).join('')}
  <div class="legend" style="margin-top:14px"><span><i style="background:var(--green)"></i>Concluído</span><span><i style="background:var(--blue)"></i>Em andamento</span><span><i style="background:var(--mut)"></i>Pendente</span><span><i style="background:var(--red)"></i>Atrasado</span></div></div>`;
}

function openPasso(oid, pid) {
  const o = by(S.obras, oid), cur = pid ? o.passos.find(x => x.id === pid) : null;
  const addD = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  const lastP = o.passos[o.passos.length - 1], ini0 = lastP ? addD(lastP.fim, 1) : o.inicio;
  const p = cur || { nome: '', status: 'Pendente', ini: ini0, fim: addD(ini0, 30), peso: 1, extra: 0, mats: [], obs: '' };
  const mrow = m => `<div class="mrow"><select name="mat">${S.materiais.map(x => `<option value="${x.id}" ${x.id === m.matId ? 'selected' : ''}>${esc(x.nome)} (${esc(x.un)} · ${brl(x.custo)})</option>`).join('')}</select><input name="q" type="number" min="0" step="any" value="${m.qtd}" aria-label="Quantidade"><button type="button" class="btn red sm" data-rm>✕</button></div>`;
  modal(cur ? 'Editar passo' : 'Novo passo', `<form class="form" id="frm">
    <label class="full">Nome do passo<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Fundação"></label>
    <label>Situação<select name="status">${['Pendente', 'Em andamento', 'Concluído'].map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label>Peso na barra (importância)<input name="peso" type="number" min="1" step="1" value="${p.peso || 1}"></label>
    <label>Início previsto<input name="ini" type="date" required value="${p.ini}"></label><label>Prazo (término)<input name="fim" type="date" required value="${p.fim}"></label>
    <label class="full">Mão de obra e serviços previstos (R$)<input name="extra" type="number" min="0" step="any" value="${p.extra || 0}"></label>
    <div class="full"><b class="sm">Materiais necessários neste passo</b><div id="pm" style="margin-top:8px">${(p.mats || []).map(mrow).join('')}</div><button type="button" class="btn ghost sm" id="pmAdd" style="margin-top:6px">+ Adicionar material</button><p class="sm mut" id="pTot" style="margin-top:8px"></p></div>
    <label class="full">Observações<input name="obs" value="${esc(p.obs || '')}"></label></form>`,
    `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Salvar passo</button>`);
  const fm = $('#frm');
  const rows = () => [...document.querySelectorAll('#pm .mrow')].map(r => ({ matId: r.querySelector('select').value, qtd: parseFloat(r.querySelector('input').value) || 0 })).filter(m => m.qtd > 0);
  const recalc = () => { const mc = rows().reduce((s, m) => s + (by(S.materiais, m.matId) || { custo: 0 }).custo * m.qtd, 0), ex = parseFloat(fm.elements.extra.value) || 0; $('#pTot').innerHTML = `Custo previsto: materiais <b>${brl(mc)}</b> + serviços <b>${brl(ex)}</b> = <b style="color:var(--gold2)">${brl(mc + ex)}</b>`; };
  $('#pmAdd').onclick = () => { $('#pm').insertAdjacentHTML('beforeend', mrow({ matId: (S.materiais[0] || {}).id, qtd: 1 })); recalc(); };
  $('#pm').addEventListener('click', e => { if (e.target.closest('[data-rm]')) { e.target.closest('.mrow').remove(); recalc(); } });
  fm.addEventListener('input', recalc); fm.addEventListener('change', recalc); recalc();
  $('#frmOk').onclick = () => {
    if (!fm.reportValidity()) return;
    if (fm.elements.fim.value < fm.elements.ini.value) return toast('O prazo não pode ser antes do início');
    const d = { nome: fm.elements.nome.value.trim(), status: fm.elements.status.value, peso: Math.max(1, parseInt(fm.elements.peso.value) || 1), ini: fm.elements.ini.value, fim: fm.elements.fim.value, extra: parseFloat(fm.elements.extra.value) || 0, obs: fm.elements.obs.value.trim(), mats: rows() };
    const was = cur ? cur.status : 'Pendente';
    d.dataConc = d.status === 'Concluído' ? (was === 'Concluído' && cur.dataConc ? cur.dataConc : todayISO()) : '';
    if (cur) Object.assign(cur, d); else o.passos.push(Object.assign({ id: uid('s'), baixado: false }, d));
    syncObra(o); save(); closeModal(); render(); toast('Passo salvo · obra em ' + prog(o) + '%');
  };
}
function togglePasso(o, pid) {
  const p = o.passos.find(x => x.id === pid); if (!p) return;
  if (p.status === 'Concluído') { p.status = 'Pendente'; p.dataConc = ''; } else { p.status = 'Concluído'; p.dataConc = todayISO(); }
  syncObra(o); save(); render(); toast(p.status === 'Concluído' ? `✅ Passo concluído · obra em ${prog(o)}%` : `Passo reaberto · obra em ${prog(o)}%`);
}
function baixarPasso(o, pid) {
  const p = o.passos.find(x => x.id === pid), falta = [];
  (p.mats || []).forEach(m => { const x = by(S.materiais, m.matId); if (!x || x.qtd < m.qtd) falta.push(`${x ? x.nome : '?'} (faltam ${num(m.qtd - (x ? x.qtd : 0))})`); });
  if (falta.length) return toast('Estoque insuficiente: ' + falta.join(', '));
  confirmBox(`Dar baixa dos materiais deste passo no estoque? Será registrada uma saída para <b>${esc(o.nome)}</b>, no valor de ${brl(matCost(p))}.`, () => {
    p.mats.forEach(m => { const x = by(S.materiais, m.matId); x.qtd -= m.qtd; o.gasto = (o.gasto || 0) + m.qtd * x.custo; S.movs.unshift({ id: uid('v'), data: todayISO(), matId: x.id, tipo: 'Saída', qtd: m.qtd, obraId: o.id, obs: ordName(o.passos.indexOf(p)) + ': ' + p.nome }); });
    p.baixado = true; save(); render(); toast('Materiais baixados do estoque');
  }, 'Dar baixa');
}
function payContrato(cid) {
  const c = by(S.contratos, cid), saldo = c.valor - c.pago;
  modal('💵 Registrar pagamento', `<p class="sm mut" style="margin-bottom:14px"><b>${esc(c.nome)}</b> · ${esc(c.empresa)}<br>Saldo a pagar: <b>${brl(saldo)}</b></p><form class="form" id="frm"><label>Valor pago (R$)<input name="v" type="number" step="any" min="0.01" max="${saldo}" value="${saldo}" required></label><label>Data<input name="d" type="date" value="${todayISO()}"></label></form>`,
    `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Registrar</button>`);
  $('#frmOk').onclick = () => {
    const fm = $('#frm'); if (!fm.reportValidity()) return;
    const v = parseFloat(fm.elements.v.value) || 0, o = by(S.obras, c.obraId);
    c.pago += v; if (c.pago >= c.valor && c.status === 'Vigente') c.status = 'Concluído'; if (o) o.gasto = (o.gasto || 0) + v;
    S.lancamentos.push({ id: uid('d'), data: fm.elements.d.value, desc: 'Pagamento de contrato: ' + c.nome, tipo: 'Despesa', valor: v, obraId: c.obraId });
    save(); closeModal(); render(); toast('Pagamento de ' + brl(v) + ' registrado');
  };
}
function movePasso(o, pid, dir) {
  const i = o.passos.findIndex(x => x.id === pid), j = i + dir; if (j < 0 || j >= o.passos.length) return;
  [o.passos[i], o.passos[j]] = [o.passos[j], o.passos[i]]; save(); render();
}
function exportPassos(o) {
  const cols = ['Ordem', 'Passo', 'Situação', 'Início', 'Prazo', 'Peso', 'Custo previsto', 'Concluído em'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = [cols.join(';')].concat(o.passos.map((p, i) => [ordName(i), p.nome, p.status, p.ini, p.fim, p.peso, passoCost(p).toFixed(2).replace('.', ','), p.dataConc].map(q).join(';'))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'passos-' + o.nome.replace(/\W+/g, '-').toLowerCase() + '.csv'; a.click(); toast('CSV gerado');
}

/* ============ navegação e render ============ */
const NAV = [['dashboard', '📊', 'Painel geral'], ['obras', '🏗️', 'Obras'], ['andamento', '📈', 'Andamento'], ['empreendimentos', '🏢', 'Condomínios'], ['estoque', '📦', 'Estoque e insumos'], ['funcionarios', '👷', 'Funcionários'], ['fornecedores', '🚚', 'Fornecedores'], ['financeiro', '💰', 'Financeiro'], ['tarefas', '✅', 'Tarefas']];
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
  selObra: id => { state.f.andObra = id; render(); },
  pOpen: id => { state.open = state.open || {}; state.open[id] = !state.open[id]; render(); },
  pNew: () => openPasso(curObraId()), pEdit: id => openPasso(curObraId(), id),
  pToggle: id => togglePasso(by(S.obras, curObraId()), id), pBaixa: id => baixarPasso(by(S.obras, curObraId()), id),
  pUp: id => movePasso(by(S.obras, curObraId()), id, -1), pDown: id => movePasso(by(S.obras, curObraId()), id, 1),
  pDel: id => { const o = by(S.obras, curObraId()), p = o.passos.find(x => x.id === id); confirmBox(`Excluir o passo <b>${esc(p.nome)}</b>?`, () => { o.passos = o.passos.filter(x => x.id !== id); syncObra(o); save(); render(); toast('Passo excluído'); }); },
  pTpl: () => { const o = by(S.obras, curObraId()); o.passos = mkPassos(o, 0, false); save(); render(); toast('Modelo padrão aplicado: edite os passos como quiser'); },
  pCsv: () => exportPassos(by(S.obras, curObraId())), cPay: id => payContrato(id),
  csv: (id, b) => exportCSV(b.dataset.k)
};
$('#view').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && ACT[b.dataset.act]) { e.stopPropagation(); ACT[b.dataset.act](b.dataset.id, b); } });
$('#view').addEventListener('keydown', e => { const b = e.target.closest('[role=button][data-act]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); b.click(); } });
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
FIN.init({ S: () => S, nm, esc, brl, brlS, dt, daysTo, header, pill, table, match, render });
BI.init({ S: () => S, by, nm, esc, brl, brlS, num, dt, daysTo, prog, isLate, low, pill, COLOR, header, modal, closeModal, toast, render, openObra });
render();
})();
