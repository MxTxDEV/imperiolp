'use strict';
// Várias pessoas gravando ao mesmo tempo: "ler, conferir e gravar" não pode furar o estoque nem o saldo da conta.
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir, massa, U } = require('./helpers');

test('concorrência: saídas simultâneas nunca passam do estoque', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  await ok(admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 100, precoUnit: 30 }));
  const rs = await Promise.all(Array.from({ length: 25 }, () => admin.post('/api/estoque/saida', { matId: M.cim, qtd: 10, obraId: M.obra })));
  const certas = rs.filter(r => r.status === 200).length;
  assert.equal(certas, 10, 'só 10 saídas de 10 cabem em 100'); assert.ok(rs.filter(r => r.status !== 200).every(r => r.status === 409));
  assert.equal((await admin.get('/api/materiais/' + M.cim)).dados.estoque, 0);
});

test('concorrência: baixas simultâneas não passam do saldo do título', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  const id = (await ok(admin.post('/api/contas', { tipo: 'Pagar', descricao: 'Fornecedor', valor: 1000, vencimento: U.addDays(M.hoje, 5), catId: 'cat_empreit', obraId: M.obra }))).ids[0];
  const rs = await Promise.all(Array.from({ length: 12 }, () => admin.post(`/api/contas/${id}/liquidar`, { valor: 300, data: M.hoje, forma: 'PIX' })));
  assert.equal(rs.filter(r => r.status === 200).length, 3, 'só 3 baixas de 300 cabem em 1000');
  const c = (await admin.get('/api/contas/' + id)).dados; assert.equal(c.pago, 900); assert.equal(c.saldo, 100);
});
