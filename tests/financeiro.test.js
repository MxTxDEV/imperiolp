'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir, massa, U } = require('./helpers');

test('financeiro: título, baixa parcial, juros/multa/desconto, estorno, cancelamento e idempotência', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  const conta = async id => (await admin.get('/api/contas/' + id)).dados;
  let c3;
  await t.test('parcelamento: soma das parcelas fecha com o total, vencimentos mensais', async () => {
    const r = await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Empreitada fundação', valor: 1000, vencimento: '2026-12-31', catId: 'cat_empreit', obraId: M.obra, parcelas: 3 }));
    const l = (await admin.get('/api/contas?obraId=' + M.obra)).dados; const cs = l.itens.filter(i => r.ids.includes(i.id)); assert.equal(cs.length, 3);
    assert.deepEqual(cs.map(c => c.valor), [333.33, 333.33, 333.34]); assert.deepEqual(cs.map(c => c.vencimento), ['2026-12-31', '2027-01-31', '2027-02-28']); c3 = r.ids;
    assert.equal(+cs.reduce((s, c) => s + c.valor, 0).toFixed(2), 1000);
  });
  await t.test('categoria precisa combinar com o tipo; refs inexistentes e valores ruins são recusados', async () => {
    assert.equal((await admin.post('/api/contas', { tipo: 'Pagar', descricao: 'X', valor: 10, vencimento: M.hoje, catId: 'cat_venda' })).status, 422);
    assert.equal((await admin.post('/api/contas', { tipo: 'Receber', descricao: 'X', valor: 10, vencimento: M.hoje, catId: 'cat_estoque' })).status, 422);
    for (const valor of [0, -5, 10.005, 'abc']) assert.equal((await admin.post('/api/contas', { tipo: 'Pagar', descricao: 'X', valor, vencimento: M.hoje, catId: 'cat_adm' })).status, 422, String(valor));
    assert.equal((await admin.post('/api/contas', { tipo: 'Pagar', descricao: 'X', valor: 10, vencimento: M.hoje, catId: 'cat_adm', obraId: 'obr_x' })).status, 422);
  });
  await t.test('baixa parcial com desconto, juros e multa; caixa = valor − desconto + juros + multa', async () => {
    const id = c3[0]; const l = await ok(admin.post(`/api/contas/${id}/liquidar`, { valor: 300, desconto: 10, juros: 5, multa: 2, data: M.hoje, forma: 'PIX', doc: 'COMP-1' }));
    const c = await conta(id); assert.equal(c.pago, 300); assert.equal(c.saldo, 33.33); assert.equal(c.situacao, 'Parcial'); assert.equal(c.liquidacoes[0].caixa, 297);
    assert.equal((await admin.post(`/api/contas/${id}/liquidar`, { valor: 100 })).status, 422, 'passa do saldo');
    assert.equal((await admin.post(`/api/contas/${id}/liquidar`, { valor: 10, data: '2999-01-01' })).status, 422, 'data futura');
    assert.equal((await admin.post(`/api/contas/${id}/liquidar`, { valor: 10, desconto: 20 })).status, 422, 'desconto maior que o valor');
    assert.equal((await admin.post(`/api/contas/${id}/cancelar`, { motivo: 'teste' })).status, 409, 'com baixa vigente não cancela');
    assert.equal((await admin.put('/api/contas/' + id, { versao: c.versao, valor: 5 })).status, 422, 'com baixa vigente não muda o valor');
    await ok(admin.post(`/api/contas/${id}/liquidar`, { valor: 33.33, data: M.hoje })); assert.equal((await conta(id)).situacao, 'Paga'); assert.equal((await admin.post(`/api/contas/${id}/liquidar`, { valor: 1 })).status, 409);
    assert.equal((await admin.post(`/api/liquidacoes/${l.id}/estornar`, {})).status, 422, 'estorno exige motivo');
    await ok(admin.post(`/api/liquidacoes/${l.id}/estornar`, { motivo: 'valor digitado errado' })); const d = await conta(id);
    assert.equal(d.pago, 33.33); assert.equal(d.liquidacoes.find(x => x.id === l.id).estornada, true, 'o estorno não apaga a baixa'); assert.equal((await admin.post(`/api/liquidacoes/${l.id}/estornar`, { motivo: 'outra vez' })).status, 409);
  });
  await t.test('situação Vencida e resumo (a pagar, vencido, próximos dias, saldo por conta)', async () => {
    const vencida = await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Atrasada', valor: 700, vencimento: U.addDays(M.hoje, -3), catId: 'cat_adm' }));
    assert.equal((await conta(vencida.ids[0])).situacao, 'Vencida'); const r = (await admin.get('/api/financeiro/resumo')).dados; assert.ok(r.pagar.vencido >= 700); assert.ok(r.pagar.qtdVencidas >= 1);
    const lv = (await admin.get('/api/contas?situacao=Vencida')).dados; assert.ok(lv.itens.every(i => i.situacao === 'Vencida')); assert.ok(lv.somaSaldo >= 700);
    const bancos = r.saldos.find(b => b.id === 'banco_caixa'); assert.ok(bancos.saldo < 0, 'pagamentos reduzem o saldo do caixa');
  });
  await t.test('cancelar título sem baixa; título cancelado não aceita baixa nem alteração', async () => {
    const id = (await ok(admin.post('/api/contas', { tipo: 'Receber', descricao: 'Aluguel', valor: 500, vencimento: M.hoje, catId: 'cat_outrasrec' }))).ids[0];
    assert.equal((await admin.post(`/api/contas/${id}/cancelar`, {})).status, 422); await ok(admin.post(`/api/contas/${id}/cancelar`, { motivo: 'lançado em duplicidade' }));
    const c = await conta(id); assert.equal(c.situacao, 'Cancelada'); assert.equal((await admin.post(`/api/contas/${id}/liquidar`, { valor: 1 })).status, 409); assert.equal((await admin.put('/api/contas/' + id, { versao: c.versao, descricao: 'x' })).status, 409);
  });
  await t.test('prevenção de duplicidade: mesma origemChave não gera dois títulos', async () => {
    const corpo = { tipo: 'Pagar', descricao: 'Boleto 123', valor: 50, vencimento: M.hoje, catId: 'cat_adm', origemChave: 'boleto:123' }; assert.equal((await admin.post('/api/contas', corpo)).status, 200); assert.equal((await admin.post('/api/contas', corpo)).status, 409);
  });
  await t.test('lançar já pago: título e baixa no mesmo ato', async () => {
    const id = (await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Taxa', valor: 120, vencimento: M.hoje, catId: 'cat_projetos', obraId: M.obra, jaPago: { data: M.hoje, forma: 'Dinheiro' } }))).ids[0]; assert.equal((await conta(id)).situacao, 'Paga');
    assert.equal((await admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Y', valor: 120, vencimento: M.hoje, catId: 'cat_adm', parcelas: 2, jaPago: {} })).status, 422);
  });
  await t.test('fluxo mensal separa REALIZADO (baixas) de PREVISTO (saldos a vencer)', async () => {
    const f = (await admin.get(`/api/financeiro/fluxo?de=${M.hoje.slice(0, 7)}&ate=${U.addMonths(M.hoje, 3).slice(0, 7)}`)).dados; assert.ok(f.length >= 4); assert.ok(f[0].saidas > 0, 'baixas do mês atual'); assert.ok(f.some(m => m.aPagar > 0), 'parcelas futuras como previsto');
  });
  await t.test('data de "hoje" respeita o fuso da empresa e não UTC', async () => {
    const tz = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const noite = new Date('2026-11-27T01:30:00Z'); assert.equal(U.hoje(noite), tz.format(noite)); assert.equal(U.hoje(noite), '2026-11-26', '22:30 em Brasília ainda é dia 26');
  });
});

test('contratos: limite, medição com retenção, pagamento e quitação derivados', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  const ctr = (await ok(admin.post('/api/contratos', { nome: 'Empreitada estrutura', obraId: M.obra, empresa: 'Alicerce Ltda', fornId: M.forn, valor: 100000, retencaoPct: 5, inicio: U.addDays(M.hoje, -10), fim: U.addDays(M.hoje, 100) }))).id;
  const c = async () => (await admin.get('/api/contratos/' + ctr)).dados;
  await t.test('medição: retenção calculada, aprovação gera a conta a pagar, limite do contrato', async () => {
    const m = await ok(admin.post(`/api/contratos/${ctr}/medicoes`, { valorBruto: 40000, desconto: 500, vencimento: U.addDays(M.hoje, 15), descricao: 'Fundação' }));
    const med = (await admin.get(`/api/contratos/${ctr}/medicoes`)).dados[0]; assert.equal(med.retencao, 2000); assert.equal(med.valorLiquido, 37500); assert.equal(med.numero, 1);
    assert.equal((await admin.post(`/api/contratos/${ctr}/medicoes`, { valorBruto: 70000 })).status, 422, 'passa do valor do contrato');
    const ap = await ok(admin.post(`/api/medicoes/${m.id}/aprovar`, {})); const cta = (await admin.get('/api/contas/' + ap.contaId)).dados; assert.equal(cta.valor, 37500); assert.equal(cta.contratoId, ctr);
    assert.equal((await admin.post(`/api/medicoes/${m.id}/aprovar`, {})).status, 409);
    const d = await c(); assert.equal(d.medido, 40000); assert.equal(d.retido, 2000); assert.equal(d.comprometido, 37500); assert.equal(d.pago, 0); assert.equal(d.saldoContratual, 62500);
    await ok(admin.post(`/api/contas/${ap.contaId}/liquidar`, { valor: 20000, data: M.hoje })); assert.equal((await c()).pago, 20000); assert.equal((await c()).aPagar, 17500);
    assert.equal((await admin.post(`/api/medicoes/${m.id}/cancelar`, { motivo: 'x' })).status, 409, 'conta já tem baixa');
  });
  await t.test('pagamento direto no contrato respeita o saldo contratual e o status', async () => {
    assert.equal((await admin.post(`/api/contratos/${ctr}/titulos`, { descricao: 'Adiantamento', valor: 70000, vencimento: M.hoje, catId: 'cat_empreit' })).status, 422);
    await ok(admin.post(`/api/contratos/${ctr}/titulos`, { descricao: 'Adiantamento', valor: 1000, vencimento: M.hoje, catId: 'cat_empreit' }));
    const d = await c(); await ok(admin.put('/api/contratos/' + ctr, { versao: d.versao, status: 'Encerrado' })); assert.equal((await admin.post(`/api/contratos/${ctr}/titulos`, { descricao: 'Y', valor: 1, vencimento: M.hoje, catId: 'cat_empreit' })).status, 422);
    assert.equal((await admin.put('/api/contratos/' + ctr, { versao: (await c()).versao, valor: 1000 })).status, 422, 'não dá para reduzir abaixo do que já foi lançado');
  });
});

test('compras: pedido → recebimento (estoque + conta a pagar) → estorno', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S); let ped;
  await t.test('pedido em rascunho, envio e validações', async () => {
    assert.equal((await admin.post('/api/pedidos', { fornId: M.forn, itens: [] })).status, 422);
    ped = (await ok(admin.post('/api/pedidos', { fornId: M.forn, obraId: M.obra, parcelas: 2, primeiroVenc: U.addDays(M.hoje, 30), itens: [{ matId: M.cim, qtd: 100, precoUnit: 32 }, { matId: M.areia, qtd: 10, precoUnit: 120 }] }))).id;
    assert.equal((await admin.post(`/api/pedidos/${ped}/receber`, {})).status, 409, 'rascunho não recebe'); await ok(admin.post(`/api/pedidos/${ped}/enviar`)); const p = (await admin.get('/api/pedidos/' + ped)).dados; assert.equal(p.total, 4400); assert.equal(p.status, 'Enviado');
  });
  await t.test('sugestão de compra desconta o que já foi pedido', async () => {
    const ps = (await admin.get('/api/dataset')).dados.obras[0].passos; await ok(admin.put('/api/passos/' + ps[0].id, { versao: ps[0].versao, mats: [{ matId: M.cim, qtd: 300 }] }));
    assert.equal((await admin.get('/api/estoque/sugestoes')).dados.find(x => x.matId === M.cim).falta, 200);
  });
  let rec;
  await t.test('recebimento parcial gera entrada ao preço do pedido e conta a pagar parcelada', async () => {
    const itens = (await admin.get('/api/pedidos/' + ped)).dados.itens, ic = itens.find(i => i.matId === M.cim);
    assert.equal((await admin.post(`/api/pedidos/${ped}/receber`, { itens: [{ itemId: ic.id, qtd: 500 }], doc: '1' })).status, 422, 'mais que o pedido');
    rec = (await ok(admin.post(`/api/pedidos/${ped}/receber`, { itens: [{ itemId: ic.id, qtd: 60 }], doc: 'NF 4521' }))).recId;
    const m = (await admin.get('/api/materiais/' + M.cim)).dados; assert.equal(m.estoque, 60); assert.equal(m.custoMedio, 32);
    const cs = (await admin.get('/api/contas?pedidoId=' + ped)).dados.itens; assert.equal(cs.length, 2); assert.equal(+(cs[0].valor + cs[1].valor).toFixed(2), 1920); assert.equal(cs[0].tipo, 'Pagar'); assert.equal(cs[0].obraId, null, 'compra de estoque não é custo da obra');
    assert.equal((await admin.get('/api/pedidos/' + ped)).dados.status, 'Recebido parcial');
  });
  await t.test('estornar entrada solta de pedido é bloqueado; estorna-se o recebimento inteiro', async () => {
    const mv = (await admin.get('/api/estoque/movimentacoes?tipo=Entrada')).dados.itens.find(x => x.pedidoId === ped); assert.equal((await admin.post(`/api/estoque/movimentacoes/${mv.id}/estornar`, { motivo: 'x y z' })).status, 409);
    const cs = (await admin.get('/api/contas?pedidoId=' + ped)).dados.itens; await ok(admin.post(`/api/contas/${cs[0].id}/liquidar`, { valor: 100, data: M.hoje }));
    assert.equal((await admin.post(`/api/pedidos/${ped}/recebimentos/${rec}/estornar`, { motivo: 'nota errada' })).status, 409, 'há baixa vigente na conta');
    await ok(admin.post(`/api/liquidacoes/${(await admin.get('/api/contas/' + cs[0].id)).dados.liquidacoes[0].id}/estornar`, { motivo: 'cancelando pagamento' }));
    await ok(admin.post(`/api/pedidos/${ped}/recebimentos/${rec}/estornar`, { motivo: 'nota errada' }));
    assert.equal((await admin.get('/api/materiais/' + M.cim)).dados.estoque, 0); assert.equal((await admin.get('/api/pedidos/' + ped)).dados.status, 'Enviado');
    assert.ok((await admin.get('/api/contas?pedidoId=' + ped)).dados.itens.every(c => c.status === 'Cancelada'));
    await ok(admin.post(`/api/pedidos/${ped}/cancelar`, { motivo: 'fornecedor desistiu' })); assert.equal((await admin.get('/api/pedidos/' + ped)).dados.status, 'Cancelado');
  });
  await t.test('entrada direta com "gerar conta a pagar" e estorno que cancela a conta', async () => {
    const r = await ok(admin.post('/api/estoque/entrada', { matId: M.areia, qtd: 5, precoUnit: 100, fornId: M.forn, geraConta: true, vencimento: U.addDays(M.hoje, 10), doc: 'NF 9' })); assert.equal(r.contas.length, 1);
    const cs = (await admin.get('/api/contas?fornId=' + M.forn + '&busca=Areia')).dados.itens; assert.equal(cs[0].valor, 500); await ok(admin.post(`/api/estoque/movimentacoes/${r.id}/estornar`, { motivo: 'entrada duplicada' })); assert.equal((await admin.get('/api/contas/' + cs[0].id)).dados.situacao, 'Cancelada');
    assert.equal((await admin.post('/api/estoque/entrada', { matId: M.areia, qtd: 1, precoUnit: 1, geraConta: true })).status, 422, 'sem fornecedor/vencimento não gera conta');
  });
});
