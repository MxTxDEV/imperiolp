/* Núcleo da interface: estado, utilidades, diálogos, formulários e listas genéricas, login e roteador. */
(function () {
'use strict';
const APP = window.APP = { S: null, ME: null, META: null, pages: {}, lists: {}, alertas: [], state: { q: '', f: {}, tab: {}, open: {} }, hooks: [] };
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlS = n => { n = +n || 0; const a = Math.abs(n); if (a >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + ' mi'; if (a >= 1e3) return 'R$ ' + Math.round(n / 1e3) + ' mil'; return brl(n); };
const num = n => (+n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dt = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const pad = n => String(n).padStart(2, '0');
const localISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const todayISO = () => (APP.S && APP.S.hoje) || localISO();
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const daysTo = s => Math.round((new Date(s + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5);
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const by = (arr, id) => (arr || []).find(x => x.id === id);
const nm = (arr, id) => { const r = by(arr, id); return r ? r.nome : '—'; };
const initials = n => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const can = k => !!APP.ME && (APP.ME.permissoes.includes('*') || APP.ME.permissoes.includes(k));
const prog = o => o.prog || 0;
const isLate = o => o.status === 'Em andamento' && daysTo(o.previsao) < 0;
const low = m => m.qtd < m.min;
const COLOR = { 'Concluído': 'green', 'Pendente': 'gray', 'Vigente': 'blue', 'Rascunho': 'gray', 'Encerrado': 'green', 'Rescindido': 'red', 'Em andamento': 'blue', 'Planejamento': 'purple', 'Pausada': 'orange', 'Concluída': 'green', 'Lançamento': 'purple', 'Em obras': 'blue', 'Entregue': 'green', 'Ativo': 'green', 'Férias': 'orange', 'Afastado': 'red', 'Desligado': 'gray', 'Alta': 'red', 'Média': 'orange', 'Baixa': 'blue', 'Aberta': 'orange', 'Resolvida': 'green', 'Receita': 'green', 'Despesa': 'red', 'Entrada': 'green', 'Saída': 'orange', 'Ajuste': 'purple', 'Estorno': 'gray', 'Paga': 'green', 'Parcial': 'blue', 'Vencida': 'red', 'Cancelada': 'gray', 'Cancelado': 'gray', 'Disponível': 'green', 'Reservada': 'orange', 'Vendida': 'blue', 'Bloqueada': 'gray', 'Enviado': 'blue', 'Recebido': 'green', 'Recebido parcial': 'orange', 'Aprovada': 'green', 'Fechada': 'green', 'Ativa': 'green' };
const pill = t => `<span class="pill c-${COLOR[t] || 'blue'}">${esc(t)}</span>`;
const bar = (p, c = '') => `<div class="bar ${c}"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div>`;
const header = (t, sub, acts) => `<div class="page-h"><div><h1>${t}</h1><p>${sub || ''}</p></div><div class="acts">${acts || ''}</div></div>`;
const kpi = (ic, c, v, l, d) => `<div class="kpi kf"><div class="kf-h"><span class="ic c-${c}">${ic}</span><span class="l">${l}</span></div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const parseMoney = v => { let s = String(v == null ? '' : v).trim().replace(/\s|R\$/g, ''); if (!s) return ''; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, ''); const n = Number(s); return isFinite(n) ? n : s; };
const fmtMoneyIn = v => (v == null || v === '' ? '' : String(v).replace('.', ','));
Object.assign(APP, { $, esc, brl, brlS, num, dt, todayISO, addDays, daysTo, pct, by, nm, initials, can, prog, isLate, low, COLOR, pill, bar, header, kpi, debounce, parseMoney, localISO });

/* ---------- dados em cache ---------- */
const REF = { empreendimentos: ['empreendimentos', 'nome'], obras: ['obras', 'nome'], fornecedores: ['fornecedores', 'nome'], clientes: ['clientes', 'nome'], materiais: ['materiais', 'nome'], users: ['usuarios', 'nome'], funcionarios: ['funcionarios', 'nome'], contratos: ['contratos', 'nome'] };
APP.refName = (ref, id) => { if (!id) return '—'; const m = REF[ref]; const r = m && APP.S ? by(APP.S[m[0]], id) : null; return r ? r[m[1]] : '—'; };
APP.refOpts = ref => { const m = REF[ref]; return m && APP.S ? APP.S[m[0]].map(r => ({ v: r.id, l: r[m[1]] })) : []; };
async function reload(silencioso) {
  const [S, al] = await Promise.all([API.get('/api/dataset'), API.get('/api/alertas')]);
  APP.S = S; APP.alertas = al; return S;
}
APP.reload = reload;

/* ---------- avisos e diálogos ---------- */
let toastT;
function toast(msg, tipo) {
  const t = $('#toast'); t.className = 'toast show' + (tipo === 'erro' ? ' erro' : ''); t.innerHTML = `<span>${esc(msg)}</span>${tipo === 'erro' ? '<button class="tx" aria-label="Fechar aviso">✕</button>' : ''}`;
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), tipo === 'erro' ? 9000 : 3200);
}
document.addEventListener('click', e => { if (e.target.closest('.toast .tx')) $('#toast').classList.remove('show'); });
let ultimoFoco = null;
function modal(title, body, footer, wide) {
  const m = $('#modal'); if (m.hidden) ultimoFoco = document.activeElement;
  m.innerHTML = `<div class="mbox ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mTitulo"><div class="mh"><h2 id="mTitulo">${title}</h2><button class="mx" data-close aria-label="Fechar">✕</button></div><div class="mb">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div>`;
  m.hidden = false;
  const alvo = m.querySelector('[autofocus], .mb input:not([type=hidden]):not([disabled]), .mb select, .mb textarea') || m.querySelector('.mf .btn:not(.ghost), .mf .btn, .mx'); if (alvo) alvo.focus();
}
const modalAberto = () => !$('#modal').hidden;
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; if (ultimoFoco && document.contains(ultimoFoco)) { try { ultimoFoco.focus(); } catch (e) { /* ignora */ } } if (APP.pendente) { APP.pendente = false; recarregarETela(); } }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalAberto()) { closeModal(); return; }
  if (e.key === 'Tab' && modalAberto()) { const f = [...$('#modal').querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } else if (!$('#modal').contains(document.activeElement)) { e.preventDefault(); a.focus(); } }
});
function confirmBox(msg, onYes, label = 'Confirmar', perigo = true) {
  modal('Confirmar', `<p>${msg}</p>`, `<button class="btn ghost" data-close autofocus>Cancelar</button><button class="btn ${perigo ? 'red' : ''}" id="cfYes">${label}</button>`);
  $('#cfYes').onclick = () => { closeModal(); onYes(); };
}
/** Pede um motivo (obrigatório) antes de uma ação que desfaz algo. */
function pedirMotivo(titulo, texto, onOk, label = 'Confirmar') {
  modal(titulo, `<p class="sm mut" style="margin-bottom:12px">${texto}</p><form class="form" id="frm" novalidate><label class="full">Motivo<input name="motivo" required minlength="3" maxlength="300" autocomplete="off" placeholder="Explique em poucas palavras"><span class="err" data-err="motivo"></span></label></form>`, `<button class="btn ghost" data-close>Cancelar</button><button class="btn red" id="frmOk">${label}</button>`);
  const ok = async () => { const v = $('#frm').elements.motivo.value.trim(); if (v.length < 3) { $('[data-err=motivo]').textContent = 'Informe o motivo (mínimo 3 letras).'; return; } closeModal(); await onOk(v); };
  $('#frmOk').onclick = ok; $('#frm').onsubmit = e => { e.preventDefault(); ok(); };
}
function falha(e) {
  if (e && e.status === 401) return;
  const msg = e && e.message ? e.message : 'Erro inesperado.';
  const campos = e && e.erros && Object.keys(e.erros).length ? ' ' + Object.values(e.erros).join(' ') : '';
  toast(msg + (msg === 'Há campos inválidos.' ? campos : ''), 'erro');
  if (e && e.status === 409 && /alterad[oa] por outra pessoa|Recarregue/i.test(msg)) recarregarETela();
}
/** Executa uma ação no servidor, atualiza a tela e avisa o resultado. */
async function agir(fn, okMsg) { try { const r = await fn(); await reload(); render(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r; } catch (e) { falha(e); return undefined; } }
Object.assign(APP, { toast, modal, closeModal, modalAberto, confirmBox, pedirMotivo, falha, agir });

/* ---------- formulários genéricos (montados a partir do esquema do servidor) ---------- */
const MASCARAS = {
  cpf: v => { v = v.replace(/\D/g, '').slice(0, 11); return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); },
  cpfcnpj: v => { v = v.replace(/\D/g, '').slice(0, 14); if (v.length <= 11) return MASCARAS.cpf(v); return v.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); },
  phone: v => { v = v.replace(/\D/g, '').slice(0, 11); if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{1,4})$/, '($1) $2-$3'); if (v.length > 6) return v.replace(/^(\d{2})(\d{4})(\d{1,4})$/, '($1) $2-$3'); if (v.length > 2) return v.replace(/^(\d{2})(\d+)$/, '($1) $2'); return v; },
  cep: v => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
};
const mostra = (t, v) => (MASCARAS[t] && v ? MASCARAS[t](String(v)) : v);
function campoHTML(k, d, v, opts) {
  const cls = d.full ? 'full' : '', req = d.obrig ? ' required' : '', lab = `${esc(d.label || k)}${d.obrig ? ' <b class="rq" title="obrigatório">*</b>' : ''}`, err = `<span class="err" data-err="${k}"></span>`;
  if (d.t === 'enum') return `<label class="${cls}">${lab}<select name="${k}"${req}>${d.opcoes.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${err}</label>`;
  if (d.t === 'ref') { const ops = opts && opts[k] ? opts[k] : APP.refOpts(d.ref); return `<label class="${cls}">${lab}<select name="${k}"${req}>${d.obrig ? '' : '<option value="">— nenhum —</option>'}${ops.map(o => `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>${err}</label>`; }
  if (d.t === 'bool') return `<label class="${cls} chk"><input type="checkbox" name="${k}" ${v ? 'checked' : ''}> <span>${esc(d.label)}</span>${err}</label>`;
  if (d.t === 'textarea') return `<label class="${cls}">${lab}<textarea name="${k}" rows="3" maxlength="${d.max || 2000}">${esc(v)}</textarea>${err}</label>`;
  if (d.t === 'money') return `<label class="${cls}">${lab}<input name="${k}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(fmtMoneyIn(v))}"${req}>${err}</label>`;
  if (d.t === 'int' || d.t === 'num') return `<label class="${cls}">${lab}<input name="${k}" type="number" step="${d.t === 'int' ? 1 : 'any'}" min="${d.min ?? 0}"${d.max != null ? ` max="${d.max}"` : ''} value="${esc(v == null ? '' : v)}"${req}>${err}</label>`;
  if (d.t === 'date') return `<label class="${cls}">${lab}<input name="${k}" type="date" value="${esc(v || '')}"${req}>${err}</label>`;
  const tipo = d.t === 'email' ? 'email' : 'text', maxl = { cpf: 14, cpfcnpj: 18, phone: 15, cep: 9, uf: 2 }[d.t] || d.max || 200;
  return `<label class="${cls}">${lab}<input name="${k}" type="${tipo}" maxlength="${maxl}" autocomplete="off" ${d.t === 'uf' ? 'style="text-transform:uppercase"' : ''} value="${esc(mostra(d.t, v))}"${req}>${err}</label>`;
}
function lerCampos(fm, esquema, criando) {
  const out = {};
  for (const [k, d] of Object.entries(esquema)) {
    if (d.readonly || (d.virtual && !criando) || (d.criarSo && !criando)) continue; const el = fm.elements[k]; if (!el) continue;
    if (d.t === 'bool') out[k] = el.checked; else if (d.t === 'money') out[k] = APP.parseMoney(el.value); else if (d.t === 'int' || d.t === 'num') out[k] = el.value === '' ? '' : Number(el.value); else out[k] = el.value.trim();
  }
  return out;
}
function mostrarErros(fm, erros) {
  fm.querySelectorAll('[data-err]').forEach(s => { s.textContent = ''; }); let primeiro = null;
  for (const [k, m] of Object.entries(erros || {})) { const s = fm.querySelector(`[data-err="${k}"]`); if (s) { s.textContent = m; if (!primeiro) primeiro = fm.elements[k]; } }
  if (primeiro && primeiro.focus) primeiro.focus();
}
APP.campoHTML = campoHTML; APP.lerCampos = lerCampos; APP.mostrarErros = mostrarErros; APP.fmtMoneyIn = fmtMoneyIn; APP.mascaras = MASCARAS;
document.addEventListener('input', e => { const el = e.target; if (!el.closest || !el.closest('form') || !el.name) return; const ent = el.closest('form').dataset.ent, d = ent && APP.META.entidades[ent] && APP.META.entidades[ent].campos[el.name]; if (d && MASCARAS[d.t]) { const pos = el.value; el.value = MASCARAS[d.t](pos); } if (el.closest('form').dataset.ent) { const s = el.closest('label') && el.closest('label').querySelector('.err'); if (s) s.textContent = ''; } });

/** Abre o formulário de um cadastro (novo ou existente). `opts.valores` pré-preenche; `opts.aoSalvar` roda depois de salvar. */
async function openForm(ent, id, opts) {
  opts = opts || {}; const E = APP.META.entidades[ent]; if (!E) return toast('Cadastro indisponível para o seu perfil.', 'erro');
  let reg = {};
  if (id) { try { reg = await API.get(`/api/${ent}/${id}`); } catch (e) { return falha(e); } } else for (const [k, d] of Object.entries(E.campos)) if (d.padrao !== undefined && !d.readonly) reg[k] = d.padrao; Object.assign(reg, !id && opts.valores);
  const campos = Object.entries(E.campos).filter(([k, d]) => !d.readonly && (id ? !d.virtual && !d.criarSo : true) && !(opts.ocultar || []).includes(k));
  modal((id ? 'Editar ' : 'Novo(a) ') + E.rotulo.toLowerCase(), `<form class="form" id="frm" data-ent="${ent}" novalidate>${campos.map(([k, d]) => campoHTML(k, d, reg[k], opts.opcoes)).join('')}</form>${id && E.arquivavel && reg.ativo === false ? '<p class="sm down" style="margin-top:12px">Este registro está arquivado.</p>' : ''}`,
    `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Salvar</button>`, campos.length > 10);
  const fm = $('#frm'), ok = async () => {
    const b = $('#frmOk'); b.disabled = true; const dados = lerCampos(fm, E.campos, !id); if (id) dados.versao = reg.versao;
    try { const r = id ? await API.put(`/api/${ent}/${id}`, dados) : await API.post(`/api/${ent}`, dados); closeModal(); await reload(); render(); toast(id ? 'Alterações salvas.' : 'Cadastro criado: ' + E.rotulo.toLowerCase() + '.'); if (opts.aoSalvar) opts.aoSalvar(r && r.id || id); }
    catch (e) { b.disabled = false; if (e.status === 422 && Object.keys(e.erros).length) { mostrarErros(fm, e.erros); toast('Corrija os campos destacados.', 'erro'); } else falha(e); }
  };
  $('#frmOk').onclick = ok; fm.onsubmit = e => { e.preventDefault(); ok(); };
}
APP.openForm = openForm;
async function excluirRegistro(ent, id, nome) {
  const E = APP.META.entidades[ent];
  confirmBox(`Excluir <b>${esc(nome)}</b>? Se houver registros ligados a ele, o sistema avisa e sugere arquivar.`, async () => {
    try { await API.del(`/api/${ent}/${id}`); await reload(); render(); toast('Excluído.'); }
    catch (e) {
      if (e.status === 409 && e.data.vinculos) modal('Não dá para excluir', `<p>${esc(e.message.split(':')[0])}: este registro está ligado a:</p><ul class="vinc">${e.data.vinculos.map(v => `<li><b>${v.total}</b> ${esc(v.rotulo.toLowerCase())}</li>`).join('')}</ul>${e.data.podeArquivar ? '<p class="sm mut">Arquivar tira o registro das listas e dos formulários, mas preserva todo o histórico.</p>' : ''}`, `<button class="btn ghost" data-close>Fechar</button>${e.data.podeArquivar ? '<button class="btn" id="arqAgora">Arquivar em vez de excluir</button>' : ''}`);
      else return falha(e);
      const b = $('#arqAgora'); if (b) b.onclick = async () => { closeModal(); await agir(() => API.post(`/api/${ent}/${id}/arquivar`), 'Registro arquivado.'); };
    }
  }, 'Excluir');
}
APP.excluirRegistro = excluirRegistro;

/* ---------- listas genéricas com paginação no servidor ---------- */
const LS = {}; // estado por cadastro
const lst = ent => (LS[ent] = LS[ent] || { pagina: 1, filtros: {}, arq: '0', ordem: '', dir: 'asc' });
function celula(ent, k, row) {
  const d = APP.META.entidades[ent].campos[k] || {}, v = row[k];
  if (v == null || v === '') return '<span class="mut">—</span>';
  if (d.t === 'money') return brl(v); if (d.t === 'date') return dt(v); if (d.t === 'bool') return v ? 'Sim' : 'Não'; if (d.t === 'enum') return COLOR[v] ? pill(v) : esc(v);
  if (d.t === 'ref') return esc(row[k + 'Nome'] || APP.refName(d.ref, v)); if (d.t === 'num' || d.t === 'int') return num(v); return esc(mostra(d.t, v));
}
APP.celula = celula;
/** cfg: { ent, titulo, sub, cols:[k | {h,f}], filtros:[{k, label, ref|opcoes}], extra(row)->html de ações, acoesTopo, semNovo, onde:{...filtros fixos} } */
async function listPage(cfg) {
  const ent = cfg.ent, E = APP.META.entidades[ent]; APP.lists[ent] = cfg; const st = lst(ent);
  const query = Object.assign({ busca: APP.state.q, pagina: st.pagina, tamanho: 25, arquivados: E.arquivavel ? st.arq : undefined, ordem: st.ordem, dir: st.dir }, st.filtros, cfg.onde);
  let r; try { r = await API.get('/api/' + ent, query); } catch (e) { return `<div class="card empty">${esc(e.message)}</div>`; }
  const cols = (cfg.cols || E.lista).map(c => typeof c === 'string' ? { k: c, h: E.campos[c].label, f: row => celula(ent, c, row), o: c } : c);
  const pode = a => can(E.modulo + ':' + a), paginas = Math.max(1, Math.ceil(r.total / r.tamanho));
  const filtros = (cfg.filtros || []).map(f => `<select data-lsf="${ent}:${f.k}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: todos</option>${(f.opcoes ? f.opcoes.map(o => ({ v: o, l: o })) : APP.refOpts(f.ref)).map(o => `<option value="${esc(o.v)}" ${String(st.filtros[f.k]) === String(o.v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`).join('');
  const sub = `${r.total} ${r.total === 1 ? 'registro' : 'registros'}${APP.state.q ? ' para a busca' : ''}`;
  return header(cfg.titulo || E.plural, cfg.sub || sub, (cfg.acoesTopo || '') + `<button class="btn ghost" data-ls="csv:${ent}">⬇ CSV</button>` + (pode('criar') && !cfg.semNovo ? `<button class="btn" data-ls="novo:${ent}">+ Novo(a)</button>` : '')) +
    (cfg.antes || '') + `<div class="filters">${filtros}${E.arquivavel ? `<button class="chip ${st.arq === '1' ? 'on' : ''}" data-ls="arq:${ent}" aria-pressed="${st.arq === '1'}">🗄 Arquivados</button>` : ''}<span class="mut sm" style="margin-left:auto">${sub}</span></div>` +
    (r.itens.length ? `<div class="tw"><table><thead><tr>${cols.map(c => `<th${c.o ? ` class="ord" data-ls="ord:${ent}:${c.o}" aria-sort="${st.ordem === c.o ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${c.h}${st.ordem === c.o ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead><tbody>${r.itens.map(row => `<tr${row.ativo === false ? ' class="arq"' : ''}>${cols.map(c => `<td>${c.f(row)}</td>`).join('')}<td><div class="acts">${cfg.extra ? cfg.extra(row) : ''}${pode('editar') ? `<button class="btn ghost sm" data-ls="edit:${ent}:${row.id}" aria-label="Editar ${esc(row[E.titulo])}">✏️ Editar</button>` : ''}${pode('editar') && E.arquivavel ? (row.ativo === false ? `<button class="btn ghost sm" data-ls="rest:${ent}:${row.id}">Restaurar</button>` : `<button class="btn ghost sm" data-ls="arqv:${ent}:${row.id}" title="Tira das listas e preserva o histórico">🗄 Arquivar</button>`) : ''}${pode('excluir') ? `<button class="btn red sm" data-ls="del:${ent}:${row.id}" aria-label="Excluir ${esc(row[E.titulo])}" title="Excluir">🗑</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><button class="btn ghost sm" data-ls="pag:${ent}:${st.pagina - 1}" ${st.pagina <= 1 ? 'disabled' : ''}>◀ Anterior</button><span class="sm mut">Página ${st.pagina} de ${paginas}</span><button class="btn ghost sm" data-ls="pag:${ent}:${st.pagina + 1}" ${st.pagina >= paginas ? 'disabled' : ''}>Próxima ▶</button></div>` : `<div class="card empty">${APP.state.q || Object.values(st.filtros).some(Boolean) ? 'Nada encontrado com esses filtros.' : (st.arq === '1' ? 'Nenhum registro arquivado.' : 'Nada cadastrado ainda.' + (pode('criar') && !cfg.semNovo ? '<br><br><button class="btn sm" data-ls="novo:' + ent + '">+ Cadastrar o primeiro</button>' : ''))}</div>`);
}
APP.listPage = listPage;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-ls]'); if (!b) return; const [a, ent, x, y] = b.dataset.ls.split(':'), st = ent ? lst(ent) : null, cfg = APP.lists[ent];
  if (a === 'novo') openForm(ent, null, cfg && cfg.formNovo); else if (a === 'edit') openForm(ent, x, cfg && cfg.formEdit);
  else if (a === 'arq') { st.arq = st.arq === '1' ? '0' : '1'; st.pagina = 1; render(); } else if (a === 'pag') { st.pagina = Math.max(1, +x); render(); }
  else if (a === 'ord') { st.dir = st.ordem === x && st.dir === 'asc' ? 'desc' : 'asc'; st.ordem = x; render(); }
  else if (a === 'arqv') agir(() => API.post(`/api/${ent}/${x}/arquivar`), 'Arquivado.'); else if (a === 'rest') agir(() => API.post(`/api/${ent}/${x}/restaurar`), 'Restaurado.');
  else if (a === 'del') { const row = await API.get(`/api/${ent}/${x}`).catch(() => ({})); excluirRegistro(ent, x, row[APP.META.entidades[ent].titulo] || 'este registro'); }
  else if (a === 'csv') { try { await API.baixar(`/api/${ent}/exportar.csv` + API.qs(Object.assign({ busca: APP.state.q, arquivados: APP.META.entidades[ent].arquivavel ? st.arq : undefined }, st.filtros, cfg && cfg.onde)), ent + '.csv'); toast('Arquivo gerado.'); } catch (er) { falha(er); } }
});
document.addEventListener('change', e => { const s = e.target.closest('[data-lsf]'); if (!s) return; const [ent, k] = s.dataset.lsf.split(':'), st = lst(ent); st.filtros[k] = s.value; st.pagina = 1; render(); });
Object.assign(APP, { listState: lst });

/* ---------- roteador e desenho ---------- */
const NAV = [['dashboard', '📊', 'Painel geral', 'painel'], ['obras', '🏗️', 'Obras', 'obras'], ['andamento', '📈', 'Andamento', 'andamento'], ['empreendimentos', '🏢', 'Condomínios', 'empreendimentos'], ['vendas', '🤝', 'Vendas e clientes', 'vendas'], ['estoque', '📦', 'Estoque e insumos', 'estoque'], ['compras', '🛒', 'Compras', 'compras'],
  ['contratos', '📑', 'Contratos', 'contratos'], ['contas', '🧾', 'Contas a pagar/receber', 'financeiro'], ['financeiro', '💰', 'Financeiro', 'financeiro'], ['folha', '👷', 'Folha', 'folha'], ['funcionarios', '🪪', 'Funcionários', 'funcionarios'], ['fornecedores', '🚚', 'Fornecedores', 'fornecedores'], ['tarefas', '✅', 'Tarefas', 'tarefas'], ['diario', '📓', 'Diário de obra', 'diario'], ['documentos', '📎', 'Documentos', 'documentos'], ['admin', '⚙️', 'Administração', 'admin']];
const visivel = ([, , , m]) => (m === 'admin' ? APP.ME.permissoes.includes('*') || APP.ME.permissoes.some(p => p.startsWith('admin:')) : can(m + ':ver'));
const SEM_BUSCA = new Set(['dashboard', 'financeiro', 'andamento', 'admin', 'folha']);
const route = () => { const r = (location.hash.replace('#/', '').split('?')[0] || 'dashboard'); return APP.pages[r] && visivel(NAV.find(n => n[0] === r) || ['', '', '', 'painel']) ? r : (NAV.filter(visivel)[0] || ['dashboard'])[0]; };
let tokenRender = 0;
function render() {
  if (!APP.ME || !APP.S) return; const r = route(), tk = ++tokenRender, nav = NAV.filter(visivel), view = $('#view');
  const lowN = APP.S.materiais.filter(low).length, vencN = APP.alertas.filter(a => a.mod === 'financeiro' && /vencida/.test(a.t)).length, tarN = APP.S.tarefas.filter(t => t.status !== 'Resolvida').length;
  const navEl = $('#nav'), navTop = navEl.scrollTop;
  navEl.innerHTML = nav.map(([k, i, l]) => `<a href="#/${k}" class="${k === r ? 'on' : ''}" title="${l}"${k === r ? ' aria-current="page"' : ''}><i>${i}</i><span class="lbl">${l}</span>${k === 'estoque' && lowN ? `<em>${lowN}</em>` : ''}${k === 'contas' && vencN ? `<em>${vencN}</em>` : ''}${k === 'tarefas' && tarN ? `<em style="background:var(--blue)">${tarN}</em>` : ''}</a>`).join('');
  navEl.scrollTop = navTop;   // a posição do menu sobrevive à atualização da tela
  if (APP.navRota !== r) { APP.navRota = r; const on = navEl.querySelector('a.on'); if (on && (on.offsetTop < navEl.scrollTop || on.offsetTop + on.offsetHeight > navEl.scrollTop + navEl.clientHeight)) navEl.scrollTop = Math.max(0, on.offsetTop - (navEl.clientHeight - on.offsetHeight) / 2); }   // página ativa fora da área visível: traz para o meio
  $('.search').style.visibility = SEM_BUSCA.has(r) ? 'hidden' : 'visible';
  const pos = () => { if (tk !== tokenRender) return; const n = APP.alertas.length; $('#bellN').textContent = n; $('#bellN').style.display = n ? '' : 'none'; APP.hooks.forEach(h => h()); document.title = 'Império ERP | ' + ((NAV.find(x => x[0] === r) || [])[2] || ''); };
  const out = APP.pages[r]();
  if (out && typeof out.then === 'function') { if (!view.dataset.page || view.dataset.page !== r) view.innerHTML = '<div class="card empty">Carregando…</div>'; view.dataset.page = r; out.then(h => { if (tk === tokenRender) { view.innerHTML = h; pos(); } }).catch(e => { if (tk === tokenRender) { view.innerHTML = `<div class="card empty">${esc(e.message || 'Falha ao carregar.')}</div>`; falha(e); } }); }
  else { view.dataset.page = r; view.innerHTML = out; pos(); }
}
APP.render = render;
async function recarregarETela() { if (!APP.ME) return; try { await reload(); render(); } catch (e) { falha(e); } }
/** Abre/fecha o menu no celular (também liga o fundo escurecido, o aria-expanded e trava a rolagem da página enquanto aberto). */
APP.menu = abrir => {
  const s = $('#side'); abrir = abrir === undefined ? !s.classList.contains('open') : !!abrir;
  s.classList.toggle('open', abrir); $('#scrim').classList.toggle('on', abrir); document.body.classList.toggle('menu-aberto', abrir); $('#btnMenu').setAttribute('aria-expanded', abrir ? 'true' : 'false');
  if (abrir) requestAnimationFrame(() => { const a = $('#nav a.on') || $('#nav a'); if (a) a.focus({ preventScroll: true }); });
};
window.addEventListener('hashchange', () => { APP.state.q = ''; $('#q').value = ''; APP.menu(false); window.scrollTo(0, 0); render(); });
$('#q').addEventListener('input', debounce(e => { APP.state.q = e.target.value; Object.values(LS).forEach(s => { s.pagina = 1; }); render(); }, 280));

/* atualização automática quando outra pessoa altera algo */
setInterval(async () => {
  if (!APP.ME || document.hidden) return;
  try { const v = await API.silencioso('GET', '/api/versao'); if (APP.S && v.versao !== APP.S.versao) { if (modalAberto() || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.closest('#view'))) APP.pendente = true; else await recarregarETela(); } } catch (e) { /* offline: tenta no próximo ciclo */ }
}, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) recarregarETela(); });

/* ---------- acesso: configuração inicial, login, troca de senha ---------- */
function tela(html) { $('.app').hidden = true; const a = $('#auth'); a.hidden = false; a.innerHTML = `<div class="auth-box"><div class="logo">I</div>${html}</div>`; const f = a.querySelector('input'); if (f) f.focus(); }
function telaLogin(msg) {
  tela(`<h1>Império ERP</h1><p class="mut">Entre com o seu e-mail e senha.</p>${msg ? `<p class="err-box" role="alert">${esc(msg)}</p>` : ''}<form id="fl" class="form" novalidate><label class="full">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="full">Senha<input name="senha" type="password" autocomplete="current-password" required></label><span class="err" id="fe" role="alert"></span><button class="btn full">Entrar</button></form>`);
  $('#fl').onsubmit = async e => { e.preventDefault(); const f = e.target; try { await API.silencioso('POST', '/api/auth/login', { email: f.email.value, senha: f.senha.value }); await iniciar(); } catch (er) { $('#fe').textContent = er.message; } };
}
function telaSetup() {
  tela(`<h1>Bem-vindo ao Império ERP</h1><p class="mut">Crie o primeiro usuário, o administrador. Você poderá criar os outros usuários e perfis depois.</p><form id="fl" class="form" novalidate><label class="full">Seu nome<input name="nome" required></label><label class="full">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="full">Senha <small class="mut">(mínimo 10 caracteres, com letras e números)</small><input name="senha" type="password" autocomplete="new-password" required></label><span class="err" id="fe" role="alert"></span><button class="btn full">Criar administrador e entrar</button></form>`);
  $('#fl').onsubmit = async e => { e.preventDefault(); const f = e.target; try { await API.silencioso('POST', '/api/auth/setup', { nome: f.nome.value, email: f.email.value, senha: f.senha.value }); await iniciar(); } catch (er) { $('#fe').textContent = Object.values(er.erros || {}).join(' ') || er.message; } };
}
function telaTroca() {
  tela(`<h1>Defina uma nova senha</h1><p class="mut">A sua senha atual é temporária. Escolha uma nova para continuar.</p><form id="fl" class="form" novalidate><label class="full">Senha atual<input name="atual" type="password" autocomplete="current-password" required></label><label class="full">Nova senha <small class="mut">(mínimo 10, letras e números)</small><input name="nova" type="password" autocomplete="new-password" required></label><span class="err" id="fe" role="alert"></span><button class="btn full">Salvar e entrar</button></form>`);
  $('#fl').onsubmit = async e => { e.preventDefault(); const f = e.target; try { await API.silencioso('POST', '/api/auth/senha', { atual: f.atual.value, nova: f.nova.value }); await iniciar(); } catch (er) { $('#fe').textContent = Object.values(er.erros || {}).join(' ') || er.message; } };
}
APP.aoSairDaSessao = () => { if (APP.ME) { APP.ME = null; APP.S = null; telaLogin('Sua sessão expirou. Entre de novo.'); } };
function minhaConta() {
  modal('Minha conta', `<p><b>${esc(APP.ME.nome)}</b><br><span class="mut">${esc(APP.ME.email)} · ${esc(APP.ME.perfil)}</span></p><h3 style="margin:18px 0 10px;font-size:1rem">Trocar senha</h3><form id="frm" class="form" novalidate><label class="full">Senha atual<input name="atual" type="password" autocomplete="current-password"><span class="err" data-err="atual"></span></label><label class="full">Nova senha<input name="nova" type="password" autocomplete="new-password"><span class="err" data-err="nova"></span></label></form>`,
    `<button class="btn ghost" data-close>Fechar</button><button class="btn red" id="sair">Sair do sistema</button><button class="btn" id="frmOk">Trocar senha</button>`);
  $('#sair').onclick = async () => { await API.silencioso('POST', '/api/auth/logout'); closeModal(); APP.ME = null; APP.S = null; telaLogin(); };
  $('#frmOk').onclick = async () => { const f = $('#frm'); try { await API.post('/api/auth/senha', { atual: f.atual.value, nova: f.nova.value }); toast('Senha alterada.'); closeModal(); } catch (e) { if (e.status === 422) mostrarErros(f, e.erros); else falha(e); } };
}
$('#btnUser').onclick = minhaConta;
async function iniciar() {
  let est; try { est = await API.silencioso('GET', '/api/auth/estado'); } catch (e) { tela(`<h1>Servidor indisponível</h1><p class="mut">${esc(e.message)}</p><button class="btn" id="recarregar">Tentar de novo</button>`); $('#recarregar').onclick = () => location.reload(); return; }
  if (est.precisaSetup) return telaSetup(); if (!est.usuario) return telaLogin(); if (est.usuario.senhaTemp) return telaTroca();
  APP.ME = est.usuario; APP.META = await API.get('/api/meta'); await reload();
  $('#auth').hidden = true; $('#auth').innerHTML = ''; $('.app').hidden = false; $('#uNome').textContent = APP.ME.nome; $('#uPerfil').textContent = APP.ME.perfil; $('#uIni').textContent = initials(APP.ME.nome);
  if (!location.hash) location.hash = '#/' + route(); render();
}
APP.iniciar = iniciar; APP.NAV = NAV;
})();
