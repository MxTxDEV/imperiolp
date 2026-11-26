'use strict';
// Vendas: unidade -> venda -> parcelas (contas a receber). Reserva e venda mudam a situação da unidade.
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');
const fin = require('./financeiro');
const BRL = c => U.fromC(c).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function decorarEmps(itens) {
  return itens.map(e => {
    const c = Object.fromEntries(q.all("SELECT status, COUNT(*) n FROM unidades WHERE empId = ? AND ativo = 1 GROUP BY status", e.id).map(r => [r.status, r.n]));
    const cad = Object.values(c).reduce((s, n) => s + n, 0), vendidas = c['Vendida'] || 0, reservadas = c['Reservada'] || 0, bloqueadas = c['Bloqueada'] || 0;
    const base = Math.max(e.unidadesPrevistas, cad);
    const vv = q.val("SELECT COALESCE(SUM(v.valorTotalC),0) FROM vendas v JOIN unidades u ON u.id = v.unidadeId WHERE u.empId = ? AND v.status = 'Ativa'", e.id);
    const rec = q.val("SELECT COALESCE(SUM(l.valorC),0) FROM liquidacoes l JOIN contas c ON c.id = l.contaId WHERE c.empId = ? AND c.tipo = 'Receber' AND c.status = 'Aberta' AND l.estornadaEm IS NULL", e.id);
    return Object.assign(e, { unidadesCadastradas: cad, vendidas, reservadas, bloqueadas, disponiveis: Math.max(0, base - vendidas - reservadas - bloqueadas), vgvVendido: U.fromC(vv), recebido: U.fromC(rec) });
  });
}
function decorarUnidades(itens) {
  const nomeCli = new Map(q.all('SELECT id, nome FROM clientes').map(r => [r.id, r.nome])), nomeEmp = new Map(q.all('SELECT id, nome FROM empreendimentos').map(r => [r.id, r.nome]));
  return itens.map(u => Object.assign(u, { clienteNome: u.clienteId ? nomeCli.get(u.clienteId) : '', empNome: nomeEmp.get(u.empId) || '', vendaId: u.status === 'Vendida' ? q.val("SELECT id FROM vendas WHERE unidadeId = ? AND status = 'Ativa'", u.id) : null }));
}
const unidade = id => { const u = q.one('SELECT * FROM unidades WHERE id = ?', id); if (!u) throw U.notFound('Unidade não encontrada.'); if (!u.ativo) throw U.conflict('A unidade está arquivada.'); return u; };
function reservar(ctx, unidadeId, d) {
  return tx(() => {
    const u = unidade(unidadeId); if (u.status !== 'Disponível') throw U.conflict(`A unidade está "${u.status}" e não pode ser reservada.`);
    const erros = {}; const cli = q.one('SELECT * FROM clientes WHERE id = ?', d.clienteId); if (!cli || !cli.ativo) erros.clienteId = 'Escolha o cliente da reserva.';
    if (d.reservaAte && (!U.isDate(d.reservaAte) || d.reservaAte < U.hoje())) erros.reservaAte = 'A data limite da reserva não pode ser passada.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    q.run("UPDATE unidades SET status = 'Reservada', clienteId = ?, reservaAte = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", cli.id, d.reservaAte || null, U.nowIso(), ctx.user.id, unidadeId);
    audit(ctx, 'reservar', 'unidades', unidadeId, `Unidade ${u.codigo} reservada para ${cli.nome}`);
  });
}
function liberar(ctx, unidadeId) {
  return tx(() => {
    const u = unidade(unidadeId); if (u.status !== 'Reservada') throw U.conflict('A unidade não está reservada.');
    q.run("UPDATE unidades SET status = 'Disponível', clienteId = NULL, reservaAte = NULL, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", U.nowIso(), ctx.user.id, unidadeId);
    audit(ctx, 'liberar', 'unidades', unidadeId, `Reserva da unidade ${u.codigo} liberada`);
  });
}
/** Cria a venda e as contas a receber (entrada + parcelas). A soma das parcelas sempre fecha com o valor total. */
function criarVenda(ctx, d) {
  return tx(() => {
    const erros = {}, u = unidade(d.unidadeId);
    if (!['Disponível', 'Reservada'].includes(u.status)) throw U.conflict(`A unidade ${u.codigo} está "${u.status}".`);
    const cli = q.one('SELECT * FROM clientes WHERE id = ?', d.clienteId); if (!cli || !cli.ativo) erros.clienteId = 'Escolha o cliente.'; else if (u.status === 'Reservada' && u.clienteId !== cli.id) erros.clienteId = 'A unidade está reservada para outro cliente.';
    const data = d.data || U.hoje(); if (!U.isDate(data)) erros.data = 'Data inválida.';
    if (!U.isMoney(d.valorTotal) || d.valorTotal <= 0) erros.valorTotal = 'Informe o valor da venda.';
    const entrada = d.entradaValor == null || d.entradaValor === '' ? 0 : d.entradaValor; if (!U.isMoney(entrada) || entrada < 0) erros.entradaValor = 'Valor inválido.';
    const n = d.parcelas == null ? 1 : Number(d.parcelas); if (!Number.isInteger(n) || n < 0 || n > 360) erros.parcelas = 'Parcelas de 0 a 360.';
    if (!erros.valorTotal && !erros.entradaValor && entrada > d.valorTotal) erros.entradaValor = 'A entrada não pode passar do valor da venda.';
    const restante = !erros.valorTotal && !erros.entradaValor ? U.toC(d.valorTotal) - U.toC(entrada) : 0;
    if (!erros.entradaValor && entrada > 0 && !U.isDate(d.entradaVencimento)) erros.entradaVencimento = 'Informe o vencimento da entrada.';
    if (!erros.parcelas && restante > 0 && n < 1) erros.parcelas = 'Informe em quantas parcelas fica o restante.';
    if (restante > 0 && n >= 1 && !U.isDate(d.primeiroVencimento)) erros.primeiroVencimento = 'Informe o vencimento da 1ª parcela.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    const id = U.newId('vnd'), totalC = U.toC(d.valorTotal);
    q.run('INSERT INTO vendas (id, unidadeId, clienteId, data, valorTotalC, status, obs, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)', id, u.id, cli.id, data, totalC, 'Ativa', String(d.obs || '').slice(0, 300), U.nowIso(), U.nowIso(), ctx.user.id, ctx.user.id);
    q.run("UPDATE unidades SET status = 'Vendida', clienteId = ?, reservaAte = NULL, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", cli.id, U.nowIso(), ctx.user.id, u.id);
    const emp = q.one('SELECT nome FROM empreendimentos WHERE id = ?', u.empId), base = { tipo: 'Receber', catId: 'cat_venda', empId: u.empId, clienteId: cli.id, vendaId: id, competencia: data, periodicidade: 'mensal' };
    if (entrada > 0) fin.criarContas(ctx, Object.assign({}, base, { descricao: `Entrada — ${emp.nome} unidade ${u.codigo}`, valor: entrada, vencimento: d.entradaVencimento, origemChave: `venda:${id}:entrada` }));
    if (restante > 0) fin.criarContas(ctx, Object.assign({}, base, { descricao: `Parcela — ${emp.nome} unidade ${u.codigo}`, valor: U.fromC(restante), vencimento: d.primeiroVencimento, parcelas: n, origemChave: `venda:${id}:parc` }));
    audit(ctx, 'criar', 'vendas', id, `Venda da unidade ${u.codigo} (${emp.nome}) para ${cli.nome}: ${BRL(totalC)}`); return id;
  });
}
function cancelarVenda(ctx, id, motivo) {
  return tx(() => {
    const v = q.one('SELECT * FROM vendas WHERE id = ?', id); if (!v) throw U.notFound('Venda não encontrada.'); if (v.status === 'Cancelada') throw U.conflict('A venda já está cancelada.');
    motivo = String(motivo || '').trim(); if (motivo.length < 3) throw U.invalid({ motivo: 'Informe o motivo do cancelamento (distrato).' });
    const recebido = q.val("SELECT COUNT(*) FROM liquidacoes l JOIN contas c ON c.id = l.contaId WHERE c.vendaId = ? AND l.estornadaEm IS NULL", id);
    if (recebido) throw U.conflict('Há valores já recebidos desta venda. Estorne os recebimentos (e devolva ao cliente, se for o caso) antes de cancelar.');
    for (const c of q.all("SELECT id FROM contas WHERE vendaId = ? AND status = 'Aberta'", id)) fin.cancelarConta(ctx, c.id, 'Venda cancelada: ' + motivo, true);
    q.run("UPDATE vendas SET status = 'Cancelada', motivoCancelamento = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", motivo.slice(0, 300), U.nowIso(), ctx.user.id, id);
    q.run("UPDATE unidades SET status = 'Disponível', clienteId = NULL, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", U.nowIso(), ctx.user.id, v.unidadeId);
    audit(ctx, 'cancelar', 'vendas', id, `Venda cancelada: ${motivo}`);
  });
}
function listarVendas(query) {
  const w = [], p = {}; if (query.empId) { w.push('u.empId = @e'); p.e = query.empId; } if (query.clienteId) { w.push('v.clienteId = @c'); p.c = query.clienteId; } if (['Ativa', 'Cancelada'].includes(query.status)) { w.push('v.status = @s'); p.s = query.status; }
  const ws = w.length ? 'WHERE ' + w.join(' AND ') : '', tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const total = q.val(`SELECT COUNT(*) FROM vendas v JOIN unidades u ON u.id = v.unidadeId ${ws}`, p);
  const rows = q.all(`SELECT v.*, u.codigo, u.empId, e.nome empNome, c.nome clienteNome,
    (SELECT COALESCE(SUM(k.valorC),0) FROM contas k WHERE k.vendaId = v.id AND k.status = 'Aberta') contasC,
    (SELECT COALESCE(SUM(l.valorC),0) FROM liquidacoes l JOIN contas k ON k.id = l.contaId WHERE k.vendaId = v.id AND k.status = 'Aberta' AND l.estornadaEm IS NULL) recebidoC
    FROM vendas v JOIN unidades u ON u.id = v.unidadeId JOIN empreendimentos e ON e.id = u.empId JOIN clientes c ON c.id = v.clienteId ${ws} ORDER BY v.data DESC, v.criadoEm DESC LIMIT @lim OFFSET @off`, Object.assign({}, p, { lim: tam, off: (pag - 1) * tam }));
  return { total, pagina: pag, tamanho: tam, itens: rows.map(r => ({ id: r.id, data: r.data, unidadeId: r.unidadeId, codigo: r.codigo, empId: r.empId, empNome: r.empNome, clienteId: r.clienteId, clienteNome: r.clienteNome, valorTotal: U.fromC(r.valorTotalC), recebido: U.fromC(r.recebidoC), aReceber: U.fromC(r.contasC - r.recebidoC), status: r.status, motivoCancelamento: r.motivoCancelamento, obs: r.obs })) };
}
module.exports = { decorarEmps, decorarUnidades, reservar, liberar, criarVenda, cancelarVenda, listarVendas };
