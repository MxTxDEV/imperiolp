/* Inicialização: liga o painel BI, o financeiro e o holograma ao cache e às ações da API. */
(function () {
'use strict';
const { $, esc, brl, brlS, num, dt, daysTo, nm, by, prog, isLate, low, pill, COLOR, header, modal, closeModal, toast, can } = APP;
const S = new Proxy({}, { get: (_, k) => APP.S[k] });
const match = (r, extra = '') => !APP.state.q || (Object.values(r).filter(v => typeof v !== 'object').join(' ') + ' ' + extra).toLowerCase().includes(APP.state.q.toLowerCase());
function table(cols, rows, k) {
  if (!rows.length) return '<div class="tw"><p class="empty">Nada encontrado.</p></div>';
  return `<div class="tw"><table><thead><tr>${cols.map(c => `<th>${c.h}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c.f(r)}</td>`).join('')}<td>${k === 'lancamentos' ? `<div class="acts"><button class="btn ghost sm" data-act="lanDet" data-id="${r.id}">Ver conta</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
APP.pages.dashboard = () => BI.page();
APP.pages.financeiro = () => FIN.page();
APP.ACT.finCsv = () => { const l = S.lancamentos.map(x => [x.data, x.desc, x.tipo, x.cat, x.valor.toFixed(2).replace('.', ',')]); APP.baixarCsv('financeiro-caixa.csv', [['Data da baixa', 'Descrição', 'Tipo', 'Categoria', 'Valor (caixa)']].concat(l)); };
HOLO.init({ esc, dt });
FIN.init({ S: () => APP.S, can, nm, esc, brl, brlS, dt, daysTo, header, pill, table, match, render: () => APP.render() });
BI.init({ S: () => APP.S, by, nm, esc, brl, brlS, num, dt, daysTo, prog, isLate, low, pill, COLOR, header, modal, closeModal, toast, render: () => APP.render(), openObra: APP.openObra, can, alertas: () => APP.alertas });
/* alertas (sino) */
$('#btnBell').onclick = () => modal('🔔 Alertas e pendências', APP.alertas.length ? `<div class="list">${APP.alertas.map(x => `<a class="li" href="${x.h}" style="text-decoration:none;color:inherit" data-close><span class="dot c-${x.c}">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></a>`).join('')}</div>` : '<p class="empty">✅ Nenhuma pendência!</p>');
/* ação rápida e menu */
function quick() {
  const itens = [['🏗️', 'Nova obra', () => APP.openForm('obras'), 'obras:criar'], ['🏢', 'Novo empreendimento', () => APP.openForm('empreendimentos'), 'empreendimentos:criar'], ['📥', 'Entrada de material', () => APP.openEntrada(), 'estoque:criar'], ['📤', 'Saída de material', () => APP.openSaida(), 'estoque:criar'], ['🧾', 'Conta a pagar', () => APP.novaConta('Pagar'), 'financeiro:criar'], ['💵', 'Conta a receber', () => APP.novaConta('Receber'), 'financeiro:criar'], ['🛒', 'Novo pedido de compra', () => APP.openPedido(), 'compras:criar'], ['✅', 'Nova tarefa', () => APP.openForm('tarefas'), 'tarefas:criar'], ['📓', 'Registro no diário', () => APP.openForm('diario', null, { valores: { data: APP.todayISO() } }), 'diario:criar']].filter(i => can(i[3]));
  modal('⚡ Ação rápida', `<div class="grid" style="grid-template-columns:1fr 1fr">${itens.map((x, i) => `<button class="btn ghost" data-q="${i}" style="padding:16px;text-align:left">${x[0]} ${x[1]}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { closeModal(); itens[+b.dataset.q][2](); });
}
$('#btnQuick').onclick = quick; $('#fab').onclick = quick; $('#fab').hidden = false;
$('#btnMenu').onclick = () => $('#side').classList.toggle('open');
let pinned = false; try { pinned = localStorage.getItem('imperio_pin') === '1'; } catch (e) { /* sem armazenamento */ }
const setPin = v => { pinned = v; document.querySelector('.app').classList.toggle('pinned', v); $('#btnPin').setAttribute('aria-pressed', v); $('#btnPin').title = v ? 'Recolher menu' : 'Fixar menu aberto'; try { localStorage.setItem('imperio_pin', v ? '1' : '0'); } catch (e) { /* ignora */ } };
setPin(pinned); $('#btnPin').onclick = () => setPin(!pinned);
let theme = 'dark'; try { theme = localStorage.getItem('imperio_theme') || 'dark'; } catch (e) { /* ignora */ }
document.documentElement.dataset.theme = theme;
$('#btnTheme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('imperio_theme', theme); } catch (e) { /* ignora */ } };
APP.iniciar();
})();
