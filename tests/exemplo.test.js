'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir } = require('./helpers');

test('dados de exemplo: carregam pelos serviços, cobrem todos os módulos e só entram em sistema vazio', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S;
  await ok(admin.post('/api/admin/exemplo', {}));
  const tot = async caminho => (await ok(admin.get(caminho))).total;
  assert.ok(await tot('/api/documentos') >= 10, 'documentos');
  assert.ok(await tot('/api/pedidos') >= 10, 'pedidos de compra');
  assert.ok(await tot('/api/estoque/movimentacoes') >= 50, 'movimentações de estoque');
  const alertas = (await ok(admin.get('/api/alertas'))).map(a => a.t).join('\n');
  for (const re of [/Documento vencido/, /Estoque baixo/, /conta\(s\) a receber vencida/, /aguardando aprovação/]) assert.match(alertas, re);
  assert.equal((await admin.post('/api/admin/exemplo', {})).status, 409, 'segunda carga é recusada');
});
