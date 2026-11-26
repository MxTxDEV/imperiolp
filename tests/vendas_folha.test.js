'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir, massa, U } = require('./helpers');

test('vendas: reserva, venda parcelada, recebimento e distrato', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  const und = (await ok(admin.post('/api/unidades', { empId: M.emp, codigo: '101', valorTabela: 450000 }))).id; const cli = (await ok(admin.post('/api/clientes', { nome: 'Maria Silva', documento: '529.982.247-25' }))).id, cli2 = (await ok(admin.post('/api/clientes', { nome: 'José Santos' }))).id;
  const emp = async () => (await admin.get('/api/empreendimentos/' + M.emp)).dados;
  await t.test('reserva muda a situação e vira indisponível para outro cliente', async () => {
    assert.equal((await admin.post(`/api/unidades/${und}/reservar`, {})).status, 422); await ok(admin.post(`/api/unidades/${und}/reservar`, { clienteId: cli, reservaAte: U.addDays(M.hoje, 7) }));
    assert.equal((await emp()).reservadas, 1); assert.equal((await admin.post(`/api/unidades/${und}/reservar`, { clienteId: cli2 })).status, 409);
    assert.equal((await admin.post('/api/vendas', { unidadeId: und, clienteId: cli2, valorTotal: 1000, parcelas: 1, primeiroVencimento: M.hoje })).status, 422, 'reservada para outro cliente');
  });
  let venda;
  await t.test('venda cria entrada + parcelas que somam exatamente o valor total', async () => {
    assert.equal((await admin.post('/api/vendas', { unidadeId: und, clienteId: cli, valorTotal: 450000, entradaValor: 50000, parcelas: 7 })).status, 422);
    venda = (await ok(admin.post('/api/vendas', { unidadeId: und, clienteId: cli, valorTotal: 450000, entradaValor: 50000, entradaVencimento: M.hoje, parcelas: 7, primeiroVencimento: U.addDays(M.hoje, 30) }))).id;
    const cs = (await admin.get('/api/contas?vendaId=' + venda)).dados; assert.equal(cs.itens.length, 8); assert.equal(cs.somaValor, 450000); assert.ok(cs.itens.every(c => c.tipo === 'Receber' && c.empId === M.emp));
    const e = await emp(); assert.equal(e.vendidas, 1); assert.equal(e.reservadas, 0); assert.equal(e.vgvVendido, 450000);
    assert.equal((await admin.post('/api/vendas', { unidadeId: und, clienteId: cli, valorTotal: 1, parcelas: 1, primeiroVencimento: M.hoje })).status, 409, 'unidade vendida não vende de novo');
  });
  await t.test('recebimento entra no caixa; distrato é bloqueado enquanto houver recebimento', async () => {
    const entrada = (await admin.get('/api/contas?vendaId=' + venda)).dados.itens[0]; await ok(admin.post(`/api/contas/${entrada.id}/liquidar`, { valor: 50000, data: M.hoje, bancoId: 'banco_caixa' }));
    assert.equal((await admin.get('/api/financeiro/resumo')).dados.saldos.find(b => b.id === 'banco_caixa').saldo, 50000); assert.equal((await emp()).recebido, 50000);
    assert.equal((await admin.post(`/api/vendas/${venda}/cancelar`, { motivo: 'cliente desistiu' })).status, 409);
    const liq = (await admin.get('/api/contas/' + entrada.id)).dados.liquidacoes[0].id; await ok(admin.post(`/api/liquidacoes/${liq}/estornar`, { motivo: 'devolvido ao cliente' }));
    assert.equal((await admin.post(`/api/vendas/${venda}/cancelar`, {})).status, 422); await ok(admin.post(`/api/vendas/${venda}/cancelar`, { motivo: 'cliente desistiu' }));
    assert.ok((await admin.get('/api/contas?vendaId=' + venda)).dados.itens.every(c => c.status === 'Cancelada')); assert.equal((await emp()).vendidas, 0); assert.equal((await admin.get('/api/unidades/' + und)).dados.status, 'Disponível');
  });
});

test('folha: gerar, ajustar, fechar (vira custo da obra) e reabrir', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S); const comp = M.hoje.slice(0, 7);
  await ok(admin.post('/api/funcionarios', { nome: 'Carlos Mestre', cpf: '529.982.247-25', salario: 7000, encargosPct: 70, obraId: M.obra, admissao: '2025-01-10' }));
  await ok(admin.post('/api/funcionarios', { nome: 'Ana Admin', salario: 5000, encargosPct: 0 })); await ok(admin.post('/api/funcionarios', { nome: 'Sem salário' }));
  let folha;
  await t.test('gera itens só de quem tem salário; encargos pelo percentual do cadastro', async () => {
    assert.equal((await admin.post('/api/folhas/gerar', { competencia: '2026-13' })).status, 422); const id = (await ok(admin.post('/api/folhas/gerar', { competencia: comp }))).id; folha = (await admin.get('/api/folhas/' + id)).dados;
    assert.equal(folha.itens.length, 2); const c = folha.itens.find(i => i.nome === 'Carlos Mestre'); assert.equal(c.encargos, 4900); assert.equal(c.custoTotal, 11900); assert.equal(folha.total, 16900);
    assert.equal((await admin.post('/api/folhas/gerar', { competencia: comp })).status, 200, 'gerar de novo é idempotente');
    assert.equal((await admin.get('/api/folhas/' + id)).dados.itens.length, 2);
  });
  await t.test('ajustes e fechamento: um título por obra, o da obra entra no custo; reabrir cancela', async () => {
    const it = folha.itens.find(i => i.nome === 'Carlos Mestre'); await ok(admin.put('/api/folha-itens/' + it.id, { adicionais: 500, descontos: 200 }));
    assert.equal((await admin.put('/api/folha-itens/' + it.id, { descontos: 999999 })).status, 422);
    const antes = (await admin.get('/api/obras/' + M.obra)).dados.gasto; await ok(admin.post(`/api/folhas/${folha.id}/fechar`));
    const cs = (await admin.get('/api/contas?folhaId=' + folha.id)).dados.itens; assert.equal(cs.length, 2); assert.equal(cs.find(c => c.obraId === M.obra).valor, 12200);
    assert.equal((await admin.get('/api/obras/' + M.obra)).dados.gasto, antes + 12200); assert.equal((await admin.put('/api/folha-itens/' + it.id, { adicionais: 1 })).status, 409, 'folha fechada não muda');
    assert.equal((await admin.post(`/api/folhas/${folha.id}/fechar`)).status, 409);
    await ok(admin.post(`/api/contas/${cs[0].id}/liquidar`, { valor: 100, data: M.hoje })); assert.equal((await admin.post(`/api/folhas/${folha.id}/reabrir`)).status, 409, 'há pagamento vigente');
    await ok(admin.post(`/api/liquidacoes/${(await admin.get('/api/contas/' + cs[0].id)).dados.liquidacoes[0].id}/estornar`, { motivo: 'teste' })); await ok(admin.post(`/api/folhas/${folha.id}/reabrir`));
    assert.equal((await admin.get('/api/obras/' + M.obra)).dados.gasto, antes); await ok(admin.post(`/api/folhas/${folha.id}/fechar`)); assert.equal((await admin.get('/api/obras/' + M.obra)).dados.gasto, antes + 12200, 'fecha de novo sem erro de duplicidade');
  });
});
