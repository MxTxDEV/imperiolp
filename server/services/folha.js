'use strict';
// Folha: itens por funcionário na competência; ao FECHAR gera um título a pagar por obra (entra no custo da obra).
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');
const fin = require('./financeiro');

const folha = async id => { const f = await q.one('SELECT * FROM folhas WHERE id = ?', id); if (!f) throw U.notFound('Folha não encontrada.'); return f; };
const itemTotal = i => i.salarioBaseC + i.encargosC + i.adicionaisC - i.descontosC;
async function gerar(ctx, competencia) {
  return tx(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia || '')) throw U.invalid({ competencia: 'Use o formato AAAA-MM.' });
    let f = await q.one('SELECT * FROM folhas WHERE competencia = ?', competencia);
    if (f && f.status === 'Fechada') throw U.conflict('Esta folha já está fechada. Reabra para recalcular.');
    if (!f) { const id = U.newId('flh'); await q.run('INSERT INTO folhas (id, competencia, status, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?,?,?,1,?,?,?,?)', id, competencia, 'Aberta', U.nowIso(), U.nowIso(), ctx.user.id, ctx.user.id); f = await folha(id); }
    let novos = 0;
    for (const fn of await q.all("SELECT * FROM funcionarios WHERE ativo = 1 AND status IN ('Ativo','Férias') AND salarioC > 0")) {
      if (fn.admissao && fn.admissao.slice(0, 7) > competencia) continue; if (fn.desligamento && fn.desligamento.slice(0, 7) < competencia) continue;
      if (await q.one('SELECT 1 FROM folhaItens WHERE folhaId = ? AND funcId = ?', f.id, fn.id)) continue;
      await q.run('INSERT INTO folhaItens (id, folhaId, funcId, obraId, salarioBaseC, encargosC) VALUES (?,?,?,?,?,?)', U.newId('fit'), f.id, fn.id, fn.obraId, fn.salarioC, Math.round(fn.salarioC * fn.encargosPct / 100)); novos++;
    }
    await audit(ctx, 'gerar', 'folhas', f.id, `Folha ${competencia}: ${novos} funcionário(s) incluído(s)`); return f.id;
  });
}
async function obter(idOuComp) {
  const f = await q.one('SELECT * FROM folhas WHERE id = ? OR competencia = ?', idOuComp, idOuComp); if (!f) throw U.notFound('Folha não encontrada.');
  const itens = (await q.all('SELECT i.*, fn.nome, fn.cargo, o.nome obraNome FROM folhaItens i JOIN funcionarios fn ON fn.id = i.funcId LEFT JOIN obras o ON o.id = i.obraId WHERE i.folhaId = ? ORDER BY fn.nome', f.id))
    .map(i => ({ id: i.id, funcId: i.funcId, nome: i.nome, cargo: i.cargo, obraId: i.obraId, obraNome: i.obraNome, salarioBase: U.fromC(i.salarioBaseC), encargos: U.fromC(i.encargosC), adicionais: U.fromC(i.adicionaisC), descontos: U.fromC(i.descontosC), custoTotal: U.fromC(itemTotal(i)) }));
  const contas = await q.all("SELECT id, valorC, obraId FROM contas WHERE folhaId = ? AND status = 'Aberta'", f.id);
  return { id: f.id, competencia: f.competencia, status: f.status, versao: f.versao, fechadaEm: f.fechadaEm, total: itens.reduce((s, i) => s + i.custoTotal, 0), itens, contas: contas.map(c => ({ id: c.id, valor: U.fromC(c.valorC), obraId: c.obraId })) };
}
async function atualizarItem(ctx, itemId, d) {
  return tx(async () => {
    const i = await q.one('SELECT * FROM folhaItens WHERE id = ?', itemId); if (!i) throw U.notFound('Item não encontrado.'); const f = await folha(i.folhaId); if (f.status !== 'Aberta') throw U.conflict('A folha está fechada.');
    const erros = {}; const par = k => { if (!(k in d)) return null; if (!U.isMoney(Number(d[k])) || Number(d[k]) < 0) { erros[k] = 'Valor inválido.'; return null; } return U.toC(d[k]); };
    const ad = par('adicionais'), de = par('descontos'), en = par('encargos'); if (Object.keys(erros).length) throw U.invalid(erros);
    await q.run('UPDATE folhaItens SET adicionaisC = ?, descontosC = ?, encargosC = ? WHERE id = ?', ad ?? i.adicionaisC, de ?? i.descontosC, en ?? i.encargosC, itemId);
    const n = await q.one('SELECT * FROM folhaItens WHERE id = ?', itemId); if (itemTotal(n) < 0) throw U.invalid({ descontos: 'Os descontos passam do total do funcionário.' });
    await audit(ctx, 'editar', 'folhaItens', itemId, `Item da folha ${f.competencia} ajustado`);
  });
}
async function fechar(ctx, id) {
  return tx(async () => {
    const f = await folha(id); if (f.status !== 'Aberta') throw U.conflict('A folha já está fechada.');
    const itens = await q.all('SELECT * FROM folhaItens WHERE folhaId = ?', id); if (!itens.length) throw U.conflict('A folha não tem funcionários.');
    const dia = Math.min(28, Math.max(1, parseInt(await q.val("SELECT valor FROM meta WHERE chave = 'diaVencFolha'")) || 5)), prox = U.addMonths(f.competencia + '-01', 1), venc = prox.slice(0, 8) + String(dia).padStart(2, '0'), fimMes = U.addDays(U.addMonths(f.competencia + '-01', 1), -1);
    const grupos = new Map(); itens.forEach(i => grupos.set(i.obraId || '', (grupos.get(i.obraId || '') || 0) + itemTotal(i)));
    for (const [obraId, totalC] of grupos) {
      if (totalC <= 0) continue; const o = obraId ? await q.one('SELECT nome FROM obras WHERE id = ?', obraId) : null;
      await fin.criarContas(ctx, { tipo: 'Pagar', descricao: `Folha ${f.competencia} — ${o ? o.nome : 'Administrativo'}`, valor: U.fromC(totalC), vencimento: venc, competencia: fimMes, catId: 'cat_folha', obraId: obraId || null, folhaId: id, origemChave: `folha:${id}:${obraId || 'adm'}` });
    }
    await q.run("UPDATE folhas SET status = 'Fechada', fechadaEm = ?, fechadaPor = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", U.nowIso(), ctx.user.id, U.nowIso(), ctx.user.id, id);
    await audit(ctx, 'fechar', 'folhas', id, `Folha ${f.competencia} fechada: contas a pagar geradas por obra`);
  });
}
async function reabrir(ctx, id) {
  return tx(async () => {
    const f = await folha(id); if (f.status !== 'Fechada') throw U.conflict('A folha não está fechada.');
    for (const c of await q.all("SELECT id FROM contas WHERE folhaId = ? AND status = 'Aberta'", id)) await fin.cancelarConta(ctx, c.id, 'Folha reaberta', true);
    await q.run("UPDATE contas SET origemChave = origemChave || '#cancelada-' || id WHERE folhaId = ? AND status = 'Cancelada' AND origemChave IS NOT NULL AND origemChave NOT LIKE '%#cancelada-%'", id);
    await q.run("UPDATE folhas SET status = 'Aberta', fechadaEm = NULL, fechadaPor = NULL, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", U.nowIso(), ctx.user.id, id);
    await audit(ctx, 'reabrir', 'folhas', id, `Folha ${f.competencia} reaberta`);
  });
}
const listar = async () => (await q.all('SELECT f.id, f.competencia, f.status, (SELECT COUNT(*) FROM folhaItens i WHERE i.folhaId = f.id) n, (SELECT COALESCE(SUM(salarioBaseC + encargosC + adicionaisC - descontosC),0) FROM folhaItens i WHERE i.folhaId = f.id) totalC FROM folhas f ORDER BY f.competencia DESC')).map(r => ({ id: r.id, competencia: r.competencia, status: r.status, funcionarios: r.n, total: U.fromC(r.totalC) }));
module.exports = { gerar, obter, atualizarItem, fechar, reabrir, listar };
