'use strict';
const { q } = require('../db');
const { can } = require('../perms');
const U = require('../util');
const obras = require('./obras');
const fin = require('./financeiro');
const BRL = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dt = s => s ? s.split('-').reverse().join('/') : '—';

/** Alertas e pendências, filtrados pelo que o usuário pode ver. Uma única fonte para o sino e para o painel. */
function listar(user) {
  const out = [], hoje = U.hoje(), add = (mod, c, ic, t, s, h) => { if (can(user, mod + ':ver')) out.push({ c, ic, t, s, h, mod }); };
  for (const m of q.all('SELECT * FROM materiais WHERE ativo = 1 AND estoque < minimo ORDER BY nome')) add('estoque', 'red', '📦', 'Estoque baixo: ' + m.nome, `${m.estoque} ${m.unidade} em estoque (mínimo ${m.minimo})`, '#/estoque');
  const ob = q.all('SELECT * FROM obras WHERE ativo = 1'), met = obras.metricas(ob.map(o => o.id));
  for (const o of ob) {
    const m = met.get(o.id); if (m.status === 'Concluída') continue;
    if (m.status === 'Em andamento' && o.previsao < hoje) add('obras', 'orange', '⏰', 'Obra atrasada: ' + o.nome, `Previsão era ${dt(o.previsao)} (${U.diffDays(hoje, o.previsao)} dias de atraso)`, '#/obras');
    if (o.orcamentoC && m.gasto / U.fromC(o.orcamentoC) * 100 > m.prog + 20) add('obras', 'red', '💸', 'Gasto acima do ritmo: ' + o.nome, `${Math.round(m.gasto / U.fromC(o.orcamentoC) * 100)}% do orçamento gasto para ${m.prog}% de avanço`, '#/obras');
    if (m.status === 'Em andamento') { const l = q.all("SELECT nome FROM passos WHERE obraId = ? AND status <> 'Concluído' AND fim < ?", o.id, hoje); if (l.length) add('andamento', 'orange', '🪜', `${l.length} passo(s) atrasado(s): ${o.nome}`, l.slice(0, 2).map(x => x.nome).join(', '), '#/andamento'); }
  }
  for (const t of q.all("SELECT * FROM tarefas WHERE ativo = 1 AND status <> 'Resolvida' AND prazo IS NOT NULL AND prazo < ? AND (prio = 'Alta' OR prazo < ?)", U.addDays(hoje, 8), hoje)) add('tarefas', t.prazo < hoje ? 'red' : 'purple', '✅', (t.prazo < hoje ? 'Tarefa vencida: ' : 'Tarefa urgente: ') + t.titulo, 'Prazo ' + dt(t.prazo), '#/tarefas');
  for (const c of q.all("SELECT * FROM contratos WHERE ativo = 1 AND status = 'Vigente' AND fim IS NOT NULL AND fim <= ?", U.addDays(hoje, 30))) add('contratos', 'purple', '📑', (c.fim < hoje ? 'Contrato vencido: ' : `Contrato vence em ${U.diffDays(c.fim, hoje)} dias: `) + c.nome, 'Término ' + dt(c.fim), '#/contratos');
  const r = fin.resumo();
  if (r.pagar.qtdVencidas) add('financeiro', 'red', '💳', `${r.pagar.qtdVencidas} conta(s) a pagar vencida(s)`, 'Total vencido ' + BRL(r.pagar.vencido), '#/contas');
  if (r.receber.qtdVencidas) add('financeiro', 'orange', '💵', `${r.receber.qtdVencidas} conta(s) a receber vencida(s)`, 'Total vencido ' + BRL(r.receber.vencido), '#/contas');
  if (r.pagar.prox7 > 0) add('financeiro', 'purple', '🗓️', 'A pagar nos próximos 7 dias', BRL(r.pagar.prox7), '#/contas');
  for (const d of q.all('SELECT * FROM documentos WHERE validade IS NOT NULL AND validade <= ? ORDER BY validade', U.addDays(hoje, 30))) add('documentos', d.validade < hoje ? 'red' : 'orange', '📎', (d.validade < hoje ? 'Documento vencido: ' : 'Documento vence em breve: ') + d.nome, `${d.tipo} · validade ${dt(d.validade)}`, '#/documentos');
  for (const u of q.all("SELECT u.codigo, e.nome emp, u.reservaAte FROM unidades u JOIN empreendimentos e ON e.id = u.empId WHERE u.status = 'Reservada' AND u.reservaAte IS NOT NULL AND u.reservaAte < ?", hoje)) add('vendas', 'orange', '🔖', `Reserva vencida: unidade ${u.codigo}`, `${u.emp} · limite ${dt(u.reservaAte)}`, '#/vendas');
  for (const m of q.all("SELECT m.numero, c.nome FROM medicoes m JOIN contratos c ON c.id = m.contratoId WHERE m.status = 'Rascunho'")) add('contratos', 'purple', '📐', `Medição nº ${m.numero} aguardando aprovação`, m.nome, '#/contratos');
  return out;
}
module.exports = { listar };
