'use strict';
// Compras: pedido -> (enviado) -> recebimento(s) -> entrada no estoque + conta a pagar. Recebimento pode ser estornado inteiro.
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');
const estoque = require('./estoque');
const fin = require('./financeiro');
const BRL = c => U.fromC(c).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ped = async id => { const p = await q.one('SELECT * FROM pedidos WHERE id = ?', id); if (!p) throw U.notFound('Pedido não encontrado.'); return p; };
async function validarPedido(d, parcial) {
  const erros = {};
  if (!parcial || 'fornId' in d) { const f = await q.one('SELECT ativo FROM fornecedores WHERE id = ?', d.fornId); if (!f || !f.ativo) erros.fornId = 'Escolha o fornecedor.'; }
  if (d.obraId) { const o = await q.one('SELECT ativo FROM obras WHERE id = ?', d.obraId); if (!o || !o.ativo) erros.obraId = 'Obra inválida.'; }
  if (d.data && !U.isDate(d.data)) erros.data = 'Data inválida.';
  if (d.primeiroVenc && !U.isDate(d.primeiroVenc)) erros.primeiroVenc = 'Data inválida.';
  if (d.parcelas != null && !(Number.isInteger(Number(d.parcelas)) && d.parcelas >= 1 && d.parcelas <= 60)) erros.parcelas = 'Parcelas de 1 a 60.';
  if (!parcial || 'itens' in d) {
    if (!Array.isArray(d.itens) || !d.itens.length) erros.itens = 'Inclua pelo menos um item.';
    else { const vistos = new Set(); for (const i of d.itens) { const m = await q.one('SELECT ativo FROM materiais WHERE id = ?', i.matId); if (!m || !m.ativo) erros.itens = 'Há material inválido na lista.'; else if (vistos.has(i.matId)) erros.itens = 'O mesmo material aparece duas vezes.'; else if (!(Number(i.qtd) > 0)) erros.itens = 'Quantidade inválida.'; else if (!U.isMoney(Number(i.precoUnit)) || Number(i.precoUnit) < 0) erros.itens = 'Preço inválido.'; vistos.add(i.matId); } }
  }
  return erros;
}
async function gravarItens(id, itens) { for (const i of itens) await q.run('INSERT INTO pedidoItens (id, pedidoId, matId, qtd, precoUnitC) VALUES (?,?,?,?,?)', U.newId('pit'), id, i.matId, U.round3(Number(i.qtd)), U.toC(i.precoUnit)); }
async function criarPedido(ctx, d) {
  return tx(async () => {
    const erros = await validarPedido(d, false); if (Object.keys(erros).length) throw U.invalid(erros);
    const id = U.newId('ped'), numero = (await q.val('SELECT MAX(numero) FROM pedidos') || 0) + 1;
    await q.run('INSERT INTO pedidos (id, numero, fornId, obraId, data, status, parcelas, primeiroVenc, intervaloDias, obs, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
      id, numero, d.fornId, d.obraId || null, d.data || U.hoje(), 'Rascunho', d.parcelas || 1, d.primeiroVenc || null, d.intervaloDias || 30, String(d.obs || '').slice(0, 500), U.nowIso(), U.nowIso(), ctx.user.id, ctx.user.id);
    await gravarItens(id, d.itens); await audit(ctx, 'criar', 'pedidos', id, `Pedido de compra nº ${numero} criado`); return id;
  });
}
async function atualizarPedido(ctx, id, d) {
  return tx(async () => {
    const p = await ped(id); if (+d.versao !== p.versao) throw U.conflict('Este pedido foi alterado por outra pessoa. Recarregue.', { versaoAtual: p.versao });
    if (p.status !== 'Rascunho') throw U.conflict('Só pedido em rascunho pode ser alterado.');
    const erros = await validarPedido(d, true); if (Object.keys(erros).length) throw U.invalid(erros);
    await q.run('UPDATE pedidos SET fornId = ?, obraId = ?, data = ?, parcelas = ?, primeiroVenc = ?, intervaloDias = ?, obs = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?',
      d.fornId || p.fornId, 'obraId' in d ? (d.obraId || null) : p.obraId, d.data || p.data, d.parcelas || p.parcelas, 'primeiroVenc' in d ? (d.primeiroVenc || null) : p.primeiroVenc, d.intervaloDias || p.intervaloDias, 'obs' in d ? String(d.obs || '').slice(0, 500) : p.obs, U.nowIso(), ctx.user.id, id);
    if (d.itens) { await q.run('DELETE FROM pedidoItens WHERE pedidoId = ?', id); await gravarItens(id, d.itens); }
    await audit(ctx, 'editar', 'pedidos', id, `Pedido nº ${p.numero} alterado`);
  });
}
async function enviar(ctx, id) {
  return tx(async () => { const p = await ped(id); if (p.status !== 'Rascunho') throw U.conflict('Só pedido em rascunho pode ser enviado.'); if (!await q.val('SELECT COUNT(*) FROM pedidoItens WHERE pedidoId = ?', id)) throw U.conflict('O pedido não tem itens.');
    await q.run("UPDATE pedidos SET status = 'Enviado', versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", U.nowIso(), ctx.user.id, id); await audit(ctx, 'enviar', 'pedidos', id, `Pedido nº ${p.numero} enviado ao fornecedor`); });
}
async function statusPorItens(id) {
  const r = await q.one('SELECT COALESCE(SUM(qtd),0) q, COALESCE(SUM(qtdRecebida),0) r FROM pedidoItens WHERE pedidoId = ?', id);
  return r.r <= 1e-9 ? 'Enviado' : r.r + 1e-9 >= r.q ? 'Recebido' : 'Recebido parcial';
}
async function receber(ctx, id, d) {
  return tx(async () => {
    const p = await ped(id); if (!['Enviado', 'Recebido parcial'].includes(p.status)) throw U.conflict(`O pedido está "${p.status}" e não pode receber material.`);
    const itens = await q.all('SELECT * FROM pedidoItens WHERE pedidoId = ?', id), erros = {}, recebe = (d.itens && d.itens.length) ? d.itens : itens.map(i => ({ itemId: i.id, qtd: U.round3(i.qtd - i.qtdRecebida) })).filter(i => i.qtd > 0);
    if (!recebe.length) throw U.conflict('Não há nada pendente de recebimento neste pedido.');
    const geraConta = d.geraConta !== false; if (geraConta && !U.isDate(d.primeiroVenc || p.primeiroVenc)) erros.primeiroVenc = 'Informe o vencimento da conta a pagar.';
    const data = d.data || U.hoje(); if (!U.isDate(data) || data > U.hoje()) erros.data = 'Data de recebimento inválida (não pode ser futura).';
    for (const r of recebe) { const it = itens.find(i => i.id === r.itemId); if (!it) erros.itens = 'Item de pedido inválido.'; else if (!(Number(r.qtd) > 0) || Number(r.qtd) > it.qtd - it.qtdRecebida + 1e-9) erros.itens = 'Quantidade recebida maior que a pendente.'; }
    if (Object.keys(erros).length) throw U.invalid(erros);
    const recId = U.newId('rec'); let totalC = 0;
    for (const r of recebe) {
      const it = itens.find(i => i.id === r.itemId), qtd = U.round3(Number(r.qtd));
      await estoque.entrada(ctx, { matId: it.matId, qtd, precoUnit: U.fromC(it.precoUnitC), data, fornId: p.fornId, pedidoId: id, doc: d.doc || '', recId }, true);
      await q.run('UPDATE pedidoItens SET qtdRecebida = ? WHERE id = ?', U.round3(it.qtdRecebida + qtd), it.id); totalC += Math.round(qtd * it.precoUnitC);
    }
    await q.run('UPDATE pedidos SET status = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?', await statusPorItens(id), U.nowIso(), ctx.user.id, id);
    if (geraConta) await fin.criarContas(ctx, { tipo: 'Pagar', descricao: `Compra nº ${p.numero}${d.doc ? ' — NF ' + d.doc : ''}`, valor: U.fromC(totalC), vencimento: d.primeiroVenc || p.primeiroVenc, competencia: data, catId: 'cat_estoque', fornId: p.fornId, pedidoId: id, doc: d.doc, parcelas: p.parcelas, intervaloDias: p.intervaloDias, periodicidade: p.intervaloDias === 30 ? 'mensal' : 'dias', origemChave: 'rec:' + recId });
    await audit(ctx, 'receber', 'pedidos', id, `Recebimento do pedido nº ${p.numero}: ${BRL(totalC)}`); return { recId };
  });
}
async function estornarRecebimento(ctx, id, recId, motivo) {
  return tx(async () => {
    const p = await ped(id), movs = await q.all("SELECT * FROM movimentacoes WHERE recId = ? AND pedidoId = ? AND estornada = 0 AND tipo = 'Entrada'", recId, id); if (!movs.length) throw U.notFound('Recebimento não encontrado ou já estornado.');
    for (const m of movs) { await estoque.estornar(ctx, m.id, motivo, { recebimento: true }); const it = await q.one('SELECT * FROM pedidoItens WHERE pedidoId = ? AND matId = ?', id, m.matId); await q.run('UPDATE pedidoItens SET qtdRecebida = ? WHERE id = ?', Math.max(0, U.round3(it.qtdRecebida - m.qtd)), it.id); }
    await q.run('UPDATE pedidos SET status = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?', await statusPorItens(id), U.nowIso(), ctx.user.id, id);
    await audit(ctx, 'estornar', 'pedidos', id, `Recebimento do pedido nº ${p.numero} estornado: ${motivo}`);
  });
}
async function cancelar(ctx, id, motivo) {
  return tx(async () => { const p = await ped(id); if (p.status === 'Cancelado') throw U.conflict('O pedido já está cancelado.'); if (await q.val('SELECT COUNT(*) FROM movimentacoes WHERE pedidoId = ? AND estornada = 0 AND tipo = ?', id, 'Entrada')) throw U.conflict('Há recebimentos vigentes. Estorne-os antes de cancelar o pedido.');
    await q.run("UPDATE pedidos SET status = 'Cancelado', obs = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", (p.obs + (motivo ? ' [Cancelado: ' + motivo + ']' : '')).slice(0, 500), U.nowIso(), ctx.user.id, id); await audit(ctx, 'cancelar', 'pedidos', id, `Pedido nº ${p.numero} cancelado`); });
}
async function pedidoApi(p) {
  const itens = await q.all('SELECT i.*, m.nome matNome, m.unidade FROM pedidoItens i JOIN materiais m ON m.id = i.matId WHERE i.pedidoId = ? ORDER BY m.nome', p.id);
  const recs = await q.all("SELECT recId, MIN(data) data, MIN(doc) doc, SUM(qtd * custoUnitC) vC FROM movimentacoes WHERE pedidoId = ? AND tipo = 'Entrada' AND estornada = 0 GROUP BY recId", p.id);
  return { id: p.id, numero: p.numero, fornId: p.fornId, fornNome: (await q.one('SELECT nome FROM fornecedores WHERE id = ?', p.fornId) || {}).nome, obraId: p.obraId, data: p.data, status: p.status, parcelas: p.parcelas, primeiroVenc: p.primeiroVenc, intervaloDias: p.intervaloDias, obs: p.obs, versao: p.versao,
    total: U.fromC(itens.reduce((s, i) => s + Math.round(i.qtd * i.precoUnitC), 0)), recebido: U.fromC(itens.reduce((s, i) => s + Math.round(i.qtdRecebida * i.precoUnitC), 0)),
    itens: itens.map(i => ({ id: i.id, matId: i.matId, matNome: i.matNome, unidade: i.unidade, qtd: i.qtd, precoUnit: U.fromC(i.precoUnitC), qtdRecebida: i.qtdRecebida })), recebimentos: recs.map(r => ({ recId: r.recId, data: r.data, doc: r.doc, valor: U.fromC(Math.round(r.vC)) })) };
}
async function listar(query) {
  const w = [], pr = {}; if (query.fornId) { w.push('fornId = @f'); pr.f = query.fornId; } if (query.status) { w.push('status = @s'); pr.s = query.status; } if (query.obraId) { w.push('obraId = @o'); pr.o = query.obraId; }
  const ws = w.length ? 'WHERE ' + w.join(' AND ') : '', tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const total = await q.val(`SELECT COUNT(*) FROM pedidos ${ws}`, pr); const rows = await q.all(`SELECT * FROM pedidos ${ws} ORDER BY numero DESC LIMIT @lim OFFSET @off`, Object.assign({}, pr, { lim: tam, off: (pag - 1) * tam }));
  return { total, pagina: pag, tamanho: tam, itens: await Promise.all(rows.map(pedidoApi)) };
}
module.exports = { criarPedido, atualizarPedido, enviar, receber, estornarRecebimento, cancelar, pedidoApi, ped, listar };
