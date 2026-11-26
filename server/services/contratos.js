'use strict';
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');
const fin = require('./financeiro');
const BRL = c => U.fromC(c).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valores do contrato, todos derivados dos títulos, baixas e medições. */
function decorarContratos(itens) {
  return itens.map(c => {
    const comp = q.val("SELECT COALESCE(SUM(valorC),0) FROM contas WHERE contratoId = ? AND status = 'Aberta'", c.id);
    const pago = q.val("SELECT COALESCE(SUM(l.valorC),0) FROM liquidacoes l JOIN contas k ON k.id = l.contaId WHERE k.contratoId = ? AND k.status = 'Aberta' AND l.estornadaEm IS NULL", c.id);
    const med = q.one("SELECT COALESCE(SUM(valorBrutoC),0) bruto, COALESCE(SUM(retencaoC),0) ret FROM medicoes WHERE contratoId = ? AND status = 'Aprovada'", c.id);
    const valorC = U.toC(c.valor);
    return Object.assign(c, { comprometido: U.fromC(comp), pago: U.fromC(pago), aPagar: U.fromC(comp - pago), medido: U.fromC(med.bruto), retido: U.fromC(med.ret), saldoContratual: U.fromC(valorC - comp), quitado: valorC > 0 && pago >= valorC });
  });
}
const contrato = id => { const c = q.one('SELECT * FROM contratos WHERE id = ?', id); if (!c) throw U.notFound('Contrato não encontrado.'); return c; };
function medApi(m) { return { id: m.id, contratoId: m.contratoId, numero: m.numero, data: m.data, descricao: m.descricao, valorBruto: U.fromC(m.valorBrutoC), retencao: U.fromC(m.retencaoC), desconto: U.fromC(m.descontoC), valorLiquido: U.fromC(m.valorBrutoC - m.retencaoC - m.descontoC), status: m.status, vencimento: m.vencimento, versao: m.versao }; }
function listarMedicoes(contratoId) { contrato(contratoId); return q.all('SELECT * FROM medicoes WHERE contratoId = ? ORDER BY numero', contratoId).map(medApi); }
function criarMedicao(ctx, contratoId, d) {
  return tx(() => {
    const c = contrato(contratoId), erros = {};
    if (c.status !== 'Vigente') throw U.conflict(`O contrato está "${c.status}"; só contratos vigentes recebem medições.`);
    const data = d.data || U.hoje(); if (!U.isDate(data)) erros.data = 'Data inválida.'; else if (data > U.hoje()) erros.data = 'A medição não pode ter data futura.';
    if (!U.isMoney(d.valorBruto) || d.valorBruto <= 0) erros.valorBruto = 'Informe o valor medido.';
    if (d.desconto != null && d.desconto !== '' && (!U.isMoney(d.desconto) || d.desconto < 0)) erros.desconto = 'Valor inválido.';
    if (d.vencimento && !U.isDate(d.vencimento)) erros.vencimento = 'Data inválida.';
    if (!erros.valorBruto) {
      const ja = q.val("SELECT COALESCE(SUM(valorBrutoC),0) FROM medicoes WHERE contratoId = ? AND status <> 'Cancelada'", contratoId), brutoC = U.toC(d.valorBruto);
      if (c.valorC > 0 && ja + brutoC > c.valorC) erros.valorBruto = `Passa do valor do contrato: já medido ${BRL(ja)} de ${BRL(c.valorC)}.`;
    }
    if (Object.keys(erros).length) throw U.invalid(erros);
    const brutoC = U.toC(d.valorBruto), retC = Math.round(brutoC * c.retencaoPct / 100), descC = U.toC(d.desconto || 0);
    if (descC + retC >= brutoC) throw U.invalid({ desconto: 'Retenção e desconto consomem toda a medição.' });
    const id = U.newId('med'), numero = (q.val('SELECT MAX(numero) FROM medicoes WHERE contratoId = ?', contratoId) || 0) + 1;
    q.run('INSERT INTO medicoes (id, contratoId, numero, data, descricao, valorBrutoC, retencaoC, descontoC, status, vencimento, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
      id, contratoId, numero, data, String(d.descricao || '').slice(0, 300), brutoC, retC, descC, 'Rascunho', d.vencimento || null, U.nowIso(), U.nowIso(), ctx.user.id, ctx.user.id);
    audit(ctx, 'criar', 'medicoes', id, `Medição nº ${numero} de ${c.nome}: ${BRL(brutoC)}`); return id;
  });
}
function aprovarMedicao(ctx, id, d) {
  return tx(() => {
    const m = q.one('SELECT * FROM medicoes WHERE id = ?', id); if (!m) throw U.notFound('Medição não encontrada.'); if (m.status !== 'Rascunho') throw U.conflict('Só medição em rascunho pode ser aprovada.');
    const c = contrato(m.contratoId), venc = (d && d.vencimento) || m.vencimento; if (!U.isDate(venc)) throw U.invalid({ vencimento: 'Informe o vencimento do pagamento.' });
    const [contaId] = fin.criarContas(ctx, { tipo: 'Pagar', descricao: `Medição nº ${m.numero} — ${c.nome}`, valor: U.fromC(m.valorBrutoC - m.retencaoC - m.descontoC), vencimento: venc, competencia: m.data, catId: (d && d.catId) || 'cat_empreit', obraId: c.obraId, contratoId: c.id, medicaoId: m.id, fornId: c.fornId, origemChave: 'med:' + m.id });
    q.run("UPDATE medicoes SET status = 'Aprovada', vencimento = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", venc, U.nowIso(), ctx.user.id, id);
    audit(ctx, 'aprovar', 'medicoes', id, `Medição nº ${m.numero} aprovada: gera conta a pagar`); return contaId;
  });
}
function cancelarMedicao(ctx, id, motivo) {
  return tx(() => {
    const m = q.one('SELECT * FROM medicoes WHERE id = ?', id); if (!m) throw U.notFound('Medição não encontrada.'); if (m.status === 'Cancelada') throw U.conflict('A medição já está cancelada.');
    for (const k of q.all("SELECT id FROM contas WHERE medicaoId = ? AND status = 'Aberta'", id)) fin.cancelarConta(ctx, k.id, `Medição cancelada: ${motivo || ''}`, true);
    q.run("UPDATE medicoes SET status = 'Cancelada', versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", U.nowIso(), ctx.user.id, id);
    audit(ctx, 'cancelar', 'medicoes', id, `Medição nº ${m.numero} cancelada`);
  });
}
module.exports = { decorarContratos, listarMedicoes, criarMedicao, aprovarMedicao, cancelarMedicao };
