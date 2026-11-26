'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir, massa, U } = require('./helpers');

test('estoque, passos e custo da obra', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  const mat = async id => (await admin.get('/api/materiais/' + id)).dados, obra = async () => (await admin.get('/api/obras/' + M.obra)).dados;
  await t.test('entrada exige preço pago; custo médio é ponderado', async () => {
    assert.equal((await admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 100 })).status, 422);
    await ok(admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 100, precoUnit: 30 })); await ok(admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 100, precoUnit: 40 }));
    const m = await mat(M.cim); assert.equal(m.estoque, 200); assert.equal(m.custoMedio, 35);
    assert.equal((await admin.post('/api/estoque/entrada', { matId: M.cim, qtd: -1, precoUnit: 1 })).status, 422); assert.equal((await admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 1, precoUnit: 1, data: '2999-01-01' })).status, 422);
  });
  await t.test('saída exige obra e não passa do estoque; valoriza ao custo médio', async () => {
    assert.equal((await admin.post('/api/estoque/saida', { matId: M.cim, qtd: 10 })).status, 422);
    const r = await admin.post('/api/estoque/saida', { matId: M.cim, qtd: 500, obraId: M.obra }); assert.equal(r.status, 409); assert.match(r.dados.erro, /insuficiente/i);
    await ok(admin.post('/api/estoque/saida', { matId: M.cim, qtd: 20, obraId: M.obra })); assert.equal((await mat(M.cim)).estoque, 180);
    assert.equal((await obra()).custoMaterial, 700, '20 sacos × R$ 35,00');
  });
  await t.test('custo da obra é derivado de uma única fonte: material consumido + títulos que entram no custo', async () => {
    const antes = (await obra()).gasto;
    await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Empreiteiro', valor: 5000, vencimento: U.addDays(M.hoje, 10), catId: 'cat_empreit', obraId: M.obra }));
    await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Material p/ estoque', valor: 8000, vencimento: U.addDays(M.hoje, 10), catId: 'cat_estoque', obraId: M.obra }));
    await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Contador', valor: 900, vencimento: U.addDays(M.hoje, 10), catId: 'cat_adm', obraId: M.obra }));
    const o = await obra(); assert.equal(o.gasto, antes + 5000); assert.equal(o.gasto, o.custoMaterial + o.custoContas); assert.equal(o.custoContas, 5000, 'compra de estoque e administrativo não são custo da obra');
    const lista = (await admin.get('/api/obras')).dados.itens.find(x => x.id === M.obra); assert.equal(lista.gasto, o.gasto);
    const ds = (await admin.get('/api/dataset')).dados.obras.find(x => x.id === M.obra); assert.equal(ds.gasto, o.gasto, 'dataset do painel usa o mesmo número');
    assert.equal((await admin.put('/api/obras/' + M.obra, { versao: o.versao, gasto: 1 })).status, 200); assert.equal((await obra()).gasto, o.gasto, 'o gasto não é editável');
  });
  await t.test('estorno de saída devolve estoque e custo à obra; não se estorna duas vezes', async () => {
    const movs = (await admin.get('/api/estoque/movimentacoes?tipo=Sa%C3%ADda')).dados.itens; const id = movs[0].id, antesObra = (await obra()).custoMaterial;
    assert.equal((await admin.post(`/api/estoque/movimentacoes/${id}/estornar`, {})).status, 422); await ok(admin.post(`/api/estoque/movimentacoes/${id}/estornar`, { motivo: 'lançado na obra errada' }));
    assert.equal((await mat(M.cim)).estoque, 200); assert.equal((await obra()).custoMaterial, antesObra - 700);
    assert.equal((await admin.post(`/api/estoque/movimentacoes/${id}/estornar`, { motivo: 'de novo' })).status, 409);
    const todas = (await admin.get('/api/estoque/movimentacoes?matId=' + M.cim)).dados.itens; assert.ok(todas.some(m => m.tipo === 'Estorno' && m.estornoDe === id), 'o estorno fica registrado; nada é apagado');
  });
  await t.test('ajuste de inventário exige motivo e não deixa o estoque negativo', async () => {
    assert.equal((await admin.post('/api/estoque/ajuste', { matId: M.cim, qtd: -5 })).status, 422); assert.equal((await admin.post('/api/estoque/ajuste', { matId: M.cim, qtd: -9999, motivo: 'perda' })).status, 409);
    await ok(admin.post('/api/estoque/ajuste', { matId: M.cim, qtd: -5, motivo: 'perda na chuva' })); assert.equal((await mat(M.cim)).estoque, 195);
  });
  await t.test('baixa de passo: tudo ou nada, estorno devolve, e passo baixado não muda de materiais nem some', async () => {
    const o = await obra(); const ps = (await admin.get('/api/dataset')).dados.obras.find(x => x.id === M.obra).passos; const p = ps[1];
    await ok(admin.put('/api/passos/' + p.id, { versao: p.versao, mats: [{ matId: M.cim, qtd: 50 }, { matId: M.areia, qtd: 10 }] }));
    const f = await admin.post(`/api/passos/${p.id}/baixar`); assert.equal(f.status, 409); assert.match(f.dados.erro, /Areia/); assert.equal((await mat(M.cim)).estoque, 195, 'nada foi baixado do cimento (tudo ou nada)');
    await ok(admin.post('/api/estoque/entrada', { matId: M.areia, qtd: 20, precoUnit: 100 })); const gastoAntes = (await obra()).gasto;
    await ok(admin.post(`/api/passos/${p.id}/baixar`)); assert.equal((await mat(M.cim)).estoque, 145); assert.equal((await mat(M.areia)).estoque, 10);
    assert.equal((await obra()).gasto, gastoAntes + 50 * 35 + 10 * 100);
    assert.equal((await admin.post(`/api/passos/${p.id}/baixar`)).status, 409);
    const pa = (await admin.get('/api/dataset')).dados.obras.find(x => x.id === M.obra).passos[1]; assert.equal(pa.baixado, true);
    assert.equal((await admin.put('/api/passos/' + p.id, { versao: pa.versao, mats: [{ matId: M.cim, qtd: 1 }] })).status, 422);
    assert.equal((await admin.del('/api/passos/' + p.id)).status, 409);
    await ok(admin.post(`/api/passos/${p.id}/estornar-baixa`, { motivo: 'baixa duplicada' })); assert.equal((await mat(M.cim)).estoque, 195); assert.equal((await mat(M.areia)).estoque, 20); assert.equal((await obra()).gasto, gastoAntes);
  });
  await t.test('sugestão de compra: o que precisa dos passos menos estoque e o que já foi pedido', async () => {
    const ps = (await admin.get('/api/dataset')).dados.obras.find(x => x.id === M.obra).passos; await ok(admin.put('/api/passos/' + ps[2].id, { versao: ps[2].versao, mats: [{ matId: M.cim, qtd: 500 }] }));
    const s = (await admin.get('/api/estoque/sugestoes')).dados.find(x => x.matId === M.cim); assert.ok(s); assert.equal(s.falta, 500 + 50 - 195, 'passo da baixa estornada (50) + 500 − estoque 195');
  });
  await t.test('material com saldo inicial gera movimentação de ajuste (sem edição direta)', async () => {
    const id = (await ok(admin.post('/api/materiais', { nome: 'Tijolo', unidade: 'un', estoqueInicial: 1000, custoInicial: 0.8 }))).id; const m = await mat(id); assert.equal(m.estoque, 1000); assert.equal(m.custoMedio, 0.8);
    assert.equal((await admin.post('/api/materiais', { nome: 'Tijolo2', estoqueInicial: 10 })).status, 422);
    assert.ok((await admin.get('/api/estoque/movimentacoes?matId=' + id)).dados.itens.some(x => x.motivo === 'Saldo inicial'));
  });
  await t.test('passos: avanço, status derivado da obra, ordem e exclusão', async () => {
    const dsPassos = async () => (await admin.get('/api/dataset')).dados.obras.find(x => x.id === M.obra);
    let d = await dsPassos(); assert.equal(d.status, 'Planejamento'); const [p1, p2] = d.passos;
    await ok(admin.post(`/api/passos/${p1.id}/pct`, { pct: 40 })); d = await dsPassos(); assert.equal(d.status, 'Em andamento'); assert.equal(d.passos[0].status, 'Em andamento'); assert.equal(d.prog, 0);
    await ok(admin.post(`/api/passos/${p1.id}/pct`, { pct: 100 })); d = await dsPassos(); assert.equal(d.passos[0].status, 'Concluído'); assert.equal(d.passos[0].dataConc, U.hoje()); assert.ok(d.prog > 0);
    assert.equal((await admin.put('/api/obras/' + M.obra, { versao: d.versao, pausada: true })).status, 200); assert.equal((await dsPassos()).status, 'Pausada');
    const o = (await admin.get('/api/obras/' + M.obra)).dados; await ok(admin.put('/api/obras/' + M.obra, { versao: o.versao, pausada: false }));
    for (const p of d.passos.slice(1)) await ok(admin.post(`/api/passos/${p.id}/pct`, { pct: 100 })); d = await dsPassos(); assert.equal(d.status, 'Concluída'); assert.equal(d.prog, 100);
    const r = await admin.post(`/api/estoque/saida`, { matId: M.cim, qtd: 1, obraId: M.obra }); assert.equal(r.status, 409, 'obra concluída não recebe material');
    await ok(admin.post(`/api/passos/${d.passos[0].id}/pct`, { pct: 0 })); assert.equal((await dsPassos()).status, 'Em andamento', 'reabrir um passo reabre a obra sozinho');
    await ok(admin.post(`/api/passos/${d.passos[1].id}/mover`, { dir: -1 })); assert.equal((await dsPassos()).passos[0].id, d.passos[1].id);
    assert.equal((await admin.post('/api/obras/' + M.obra + '/passos', { nome: 'X', ini: '2026-05-10', fim: '2026-05-01' })).status, 422);
    const novo = await ok(admin.post('/api/obras/' + M.obra + '/passos', { nome: 'Extra', ini: M.hoje, fim: U.addDays(M.hoje, 5), peso: 2, extra: 1500 })); assert.equal((await admin.del('/api/passos/' + novo.id)).status, 200);
  });
});
