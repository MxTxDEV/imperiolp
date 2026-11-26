'use strict';
// Estoque: a quantidade e o custo médio do material só mudam por movimentações; nada é editado "no braço".
// Saída exige obra (é o que apropria o custo na obra). Estorno nunca apaga: cria o movimento oposto.
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');
const fin = require('./financeiro');

const BRL = c => U.fromC(c).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mat = async id => { const m = await q.one('SELECT * FROM materiais WHERE id = ?', id); if (!m) throw U.invalid({ matId: 'Material não encontrado.' }); if (!m.ativo) throw U.invalid({ matId: 'Este material está arquivado.' }); return m; };
function validarQtd(v, campo = 'qtd') { const n = Number(v); if (!isFinite(n) || n <= 0) throw U.invalid({ [campo]: 'Informe uma quantidade maior que zero.' }); if (n > 1e9) throw U.invalid({ [campo]: 'Quantidade grande demais.' }); return U.round3(n); }
function validarData(d) { const data = d || U.hoje(); if (!U.isDate(data)) throw U.invalid({ data: 'Data inválida.' }); if (data > U.hoje()) throw U.invalid({ data: 'A data não pode ser futura.' }); return data; }
async function gravar(ctx, m, { data, tipo, sinal, qtd, custoUnitC, obraId, passoId, fornId, pedidoId, doc, motivo, recId, estornoDe }) {
  const novoEstoque = U.round3(m.estoque + sinal * qtd);
  if (novoEstoque < -1e-9) throw U.conflict(`Estoque insuficiente de ${m.nome}: há ${m.estoque} ${m.unidade} e a operação pede ${qtd}.`);
  let custoMedioC = m.custoMedioC;
  if (sinal > 0 && tipo !== 'Estorno') custoMedioC = novoEstoque > 0 ? Math.round((m.estoque * m.custoMedioC + qtd * custoUnitC) / novoEstoque) : custoUnitC;
  if (tipo === 'Estorno') {   // devolve ao custo do movimento original
    if (sinal > 0) custoMedioC = novoEstoque > 0 ? Math.round((m.estoque * m.custoMedioC + qtd * custoUnitC) / novoEstoque) : custoUnitC;
    else custoMedioC = novoEstoque > 0 ? Math.max(0, Math.round((m.estoque * m.custoMedioC - qtd * custoUnitC) / novoEstoque)) : m.custoMedioC;
  }
  const id = U.newId('mov');
  await q.run('INSERT INTO movimentacoes (id, data, matId, tipo, sinal, qtd, custoUnitC, obraId, passoId, fornId, pedidoId, doc, motivo, recId, estornoDe, estoqueAntes, custoMedioAntesC, criadoEm, criadoPor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, data, m.id, tipo, sinal, qtd, custoUnitC, obraId || null, passoId || null, fornId || null, pedidoId || null, doc || '', motivo || '', recId || null, estornoDe || null, m.estoque, m.custoMedioC, U.nowIso(), ctx.user.id);
  await q.run('UPDATE materiais SET estoque = ?, custoMedioC = ?, versao = versao + 1, atualizadoEm = ? WHERE id = ?', Math.max(0, novoEstoque), custoMedioC, U.nowIso(), m.id);
  return id;
}
/** Entrada. `geraConta` cria o título a pagar do fornecedor (com parcelas) no mesmo ato. */
async function entrada(ctx, d, interno) {
  return tx(async () => {
    const m = await mat(d.matId), qtd = validarQtd(d.qtd), data = validarData(d.data), erros = {};
    if (d.precoUnit == null || d.precoUnit === '' || !U.isMoney(Number(d.precoUnit)) || Number(d.precoUnit) < 0) erros.precoUnit = 'Informe o preço unitário pago.';
    if (d.fornId && !await q.one('SELECT 1 FROM fornecedores WHERE id = ?', d.fornId)) erros.fornId = 'Fornecedor não encontrado.';
    if (d.geraConta) { if (!d.fornId) erros.fornId = 'Escolha o fornecedor para gerar a conta a pagar.'; if (!U.isDate(d.vencimento)) erros.vencimento = 'Informe o vencimento.'; }
    if (Object.keys(erros).length) throw U.invalid(erros);
    const precoC = U.toC(d.precoUnit), recId = d.recId || (d.geraConta ? U.newId('rec') : null);
    const id = await gravar(ctx, m, { data, tipo: 'Entrada', sinal: 1, qtd, custoUnitC: precoC, fornId: d.fornId, pedidoId: d.pedidoId, doc: String(d.doc || '').slice(0, 60), motivo: String(d.motivo || '').slice(0, 200), recId });
    await audit(ctx, 'entrada', 'movimentacoes', id, `Entrada de ${qtd} ${m.unidade} de ${m.nome} a ${BRL(precoC)}/un`, null, { matId: m.id, qtd, precoUnit: U.fromC(precoC) });
    let contas = [];
    if (d.geraConta && !interno) contas = await fin.criarContas(ctx, { tipo: 'Pagar', descricao: `Compra: ${m.nome}`, valor: U.fromC(Math.round(qtd * precoC)), vencimento: d.vencimento, competencia: data, catId: 'cat_estoque', fornId: d.fornId, doc: d.doc, parcelas: d.parcelas || 1, origemChave: 'rec:' + recId });
    return { id, contas };
  });
}
/** Saída para uma obra (consumo). O custo é o custo médio da época. */
async function saida(ctx, d) {
  return tx(async () => {
    const m = await mat(d.matId), qtd = validarQtd(d.qtd), data = validarData(d.data), erros = {};
    if (!d.obraId) erros.obraId = 'Escolha a obra que recebe o material.';
    const obra = d.obraId ? await q.one('SELECT * FROM obras WHERE id = ?', d.obraId) : null; if (d.obraId && (!obra || !obra.ativo)) erros.obraId = 'Obra inválida ou arquivada.';
    if (d.passoId) { const p = await q.one('SELECT obraId FROM passos WHERE id = ?', d.passoId); if (!p || p.obraId !== d.obraId) erros.passoId = 'O passo não é desta obra.'; }
    if (Object.keys(erros).length) throw U.invalid(erros);
    if (await require('./obras').statusDe(obra.id) === 'Concluída' && !d.passoId) throw U.conflict('A obra está concluída e não recebe mais material.');
    const id = await gravar(ctx, m, { data, tipo: 'Saída', sinal: -1, qtd, custoUnitC: m.custoMedioC, obraId: d.obraId, passoId: d.passoId, doc: String(d.doc || '').slice(0, 60), motivo: String(d.motivo || '').slice(0, 200) });
    await audit(ctx, 'saida', 'movimentacoes', id, `Saída de ${qtd} ${m.unidade} de ${m.nome} para ${obra.nome}`, null, { matId: m.id, qtd, obraId: d.obraId, custo: U.fromC(Math.round(qtd * m.custoMedioC)) });
    return { id };
  });
}
/** Ajuste de inventário (perda, sobra, contagem). Exige motivo. */
async function ajuste(ctx, d) {
  return tx(async () => {
    const m = await mat(d.matId), data = validarData(d.data), n = Number(d.qtd);
    if (!isFinite(n) || n === 0) throw U.invalid({ qtd: 'Informe a quantidade do ajuste (positiva para sobra, negativa para perda).' });
    const motivo = String(d.motivo || '').trim(); if (motivo.length < 3) throw U.invalid({ motivo: 'Informe o motivo do ajuste.' });
    const sinal = n > 0 ? 1 : -1, qtd = validarQtd(Math.abs(n));
    const custo = sinal > 0 && d.precoUnit != null && d.precoUnit !== '' ? U.toC(d.precoUnit) : m.custoMedioC;
    const id = await gravar(ctx, m, { data, tipo: 'Ajuste', sinal, qtd, custoUnitC: custo, motivo: motivo.slice(0, 200), obraId: d.obraId || null });
    await audit(ctx, 'ajuste', 'movimentacoes', id, `Ajuste de ${sinal * qtd} ${m.unidade} em ${m.nome}: ${motivo}`);
    return { id };
  });
}
async function ajusteInicial(ctx, matId, qtd, custo) {
  const m = await q.one('SELECT * FROM materiais WHERE id = ?', matId);
  await gravar(ctx, m, { data: U.hoje(), tipo: 'Ajuste', sinal: 1, qtd: U.round3(qtd), custoUnitC: custo, motivo: 'Saldo inicial' });
}
/** Estorno: cria o movimento oposto. Entradas que geraram conta só estornam se a conta ainda não tem baixa. */
async function estornar(ctx, movId, motivo, opts) {
  return tx(async () => {
    const o = await q.one('SELECT * FROM movimentacoes WHERE id = ?', movId); if (!o) throw U.notFound('Movimentação não encontrada.');
    if (o.tipo === 'Estorno') throw U.conflict('Um estorno não pode ser estornado.'); if (o.estornada) throw U.conflict('Esta movimentação já foi estornada.');
    motivo = String(motivo || '').trim(); if (motivo.length < 3) throw U.invalid({ motivo: 'Informe o motivo do estorno.' });
    if (o.recId && o.pedidoId && !(opts && opts.recebimento)) throw U.conflict('Esta entrada veio de um recebimento de pedido. Estorne o recebimento inteiro pelo pedido de compra.');
    const m = await q.one('SELECT * FROM materiais WHERE id = ?', o.matId);
    if (o.recId) for (const c of await q.all("SELECT id FROM contas WHERE origemChave LIKE ? AND status = 'Aberta'", 'rec:' + o.recId + '%')) await fin.cancelarConta(ctx, c.id, 'Estorno da entrada de estoque: ' + motivo, true);
    const id = await gravar(ctx, m, { data: U.hoje(), tipo: 'Estorno', sinal: -o.sinal, qtd: o.qtd, custoUnitC: o.custoUnitC, obraId: o.obraId, passoId: o.passoId, fornId: o.fornId, motivo: motivo.slice(0, 200), estornoDe: o.id });
    await q.run('UPDATE movimentacoes SET estornada = 1 WHERE id = ?', o.id);
    await audit(ctx, 'estornar', 'movimentacoes', o.id, `Estorno de ${o.tipo.toLowerCase()} de ${o.qtd} ${m.unidade} de ${m.nome}: ${motivo}`);
    return { id };
  });
}
async function listarMovs(query) {
  const w = [], p = {}; const add = (sql, k, v) => { w.push(sql); p[k] = v; };
  if (query.matId) add('m.matId = @matId', 'matId', query.matId); if (query.obraId) add('m.obraId = @obraId', 'obraId', query.obraId); if (['Entrada', 'Saída', 'Ajuste', 'Estorno'].includes(query.tipo)) add('m.tipo = @tipo', 'tipo', query.tipo);
  if (U.isDate(query.de)) add('m.data >= @de', 'de', query.de); if (U.isDate(query.ate)) add('m.data <= @ate', 'ate', query.ate);
  if (query.busca) { w.push("(mt.nome LIKE @b ESCAPE '\\' OR m.doc LIKE @b ESCAPE '\\' OR m.motivo LIKE @b ESCAPE '\\')"); p.b = '%' + String(query.busca).replace(/[%_\\]/g, x => '\\' + x) + '%'; }
  const ws = w.length ? 'WHERE ' + w.join(' AND ') : '', tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const total = await q.val(`SELECT COUNT(*) FROM movimentacoes m JOIN materiais mt ON mt.id = m.matId ${ws}`, ...(ws ? [p] : []));
  const rows = await q.all(`SELECT m.*, mt.nome matNome, mt.unidade, o.nome obraNome, f.nome fornNome, u.nome porNome FROM movimentacoes m JOIN materiais mt ON mt.id = m.matId LEFT JOIN obras o ON o.id = m.obraId LEFT JOIN fornecedores f ON f.id = m.fornId LEFT JOIN users u ON u.id = m.criadoPor ${ws} ORDER BY m.data DESC, m.criadoEm DESC LIMIT @lim OFFSET @off`, Object.assign({}, p, { lim: tam, off: (pag - 1) * tam }));
  return { total, pagina: pag, tamanho: tam, itens: rows.map(r => ({ id: r.id, data: r.data, matId: r.matId, matNome: r.matNome, unidade: r.unidade, tipo: r.tipo, sinal: r.sinal, qtd: r.qtd, custoUnit: U.fromC(r.custoUnitC), valor: U.fromC(Math.round(r.qtd * r.custoUnitC)), obraId: r.obraId, obraNome: r.obraNome, passoId: r.passoId, fornId: r.fornId, fornNome: r.fornNome, doc: r.doc, motivo: r.motivo, estornada: !!r.estornada, estornoDe: r.estornoDe, recId: r.recId, pedidoId: r.pedidoId, por: r.porNome, criadoEm: r.criadoEm })) };
}
/** O que falta comprar: materiais dos passos ainda não baixados, menos o estoque e o que já está pedido. */
async function sugestoesCompra() {
  const rows = await q.all(`SELECT pm.matId, SUM(pm.qtd) precisa FROM passoMateriais pm JOIN passos p ON p.id = pm.passoId JOIN obras o ON o.id = p.obraId
    WHERE o.ativo = 1 AND p.status <> 'Concluído' AND NOT EXISTS (SELECT 1 FROM movimentacoes mv WHERE mv.passoId = p.id AND mv.tipo = 'Saída' AND mv.estornada = 0) GROUP BY pm.matId`);
  const out = await Promise.all(rows.map(async r => {
    const m = await q.one('SELECT * FROM materiais WHERE id = ?', r.matId); if (!m || !m.ativo) return null;
    const pedido = await q.val("SELECT COALESCE(SUM(i.qtd - i.qtdRecebida),0) FROM pedidoItens i JOIN pedidos p ON p.id = i.pedidoId WHERE i.matId = ? AND p.status IN ('Enviado','Recebido parcial')", r.matId);
    const falta = U.round3(Math.max(0, r.precisa - m.estoque - pedido));
    return falta > 0 ? { matId: m.id, nome: m.nome, unidade: m.unidade, fornId: m.fornId, precisa: r.precisa, estoque: m.estoque, jaPedido: pedido, falta, custoUnit: U.fromC(m.custoMedioC), custoEstimado: U.fromC(Math.round(falta * m.custoMedioC)) } : null;
  }));
  return out.filter(Boolean).sort((a, b) => b.custoEstimado - a.custoEstimado);
}
module.exports = { entrada, saida, ajuste, ajusteInicial, estornar, listarMovs, sugestoesCompra, gravar };
