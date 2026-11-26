'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir, massa, U } = require('./helpers');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('conteudo de teste')]);

test('documentos: upload validado, download íntegro, vencimento vira alerta', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  const up = (qs, buf, tipo) => admin.f('POST', '/api/documentos?' + qs, buf, { headers: { 'content-type': tipo } });
  await t.test('aceita PDF com assinatura correta e devolve o mesmo conteúdo, como anexo', async () => {
    const r = await ok(up(`entidade=obras&entidadeId=${M.obra}&nome=Alvar%C3%A1.pdf&tipo=Alvar%C3%A1&validade=${U.addDays(M.hoje, 10)}`, PDF, 'application/pdf'));
    const d = await admin.get(`/api/documentos/${r.id}/arquivo`); assert.equal(d.status, 200); assert.deepEqual(d.dados, PDF); assert.match(d.headers.get('content-disposition'), /attachment/); assert.equal(d.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await admin.get('/api/alertas')).dados.some(a => /Documento vence/.test(a.t)));
  });
  await t.test('recusa tipo perigoso, conteúdo que não bate, registro inexistente e arquivo vazio', async () => {
    assert.equal((await up(`entidade=obras&entidadeId=${M.obra}&nome=x.html`, Buffer.from('<script>alert(1)</script>'), 'text/html')).status, 422);
    assert.equal((await up(`entidade=obras&entidadeId=${M.obra}&nome=x.svg`, Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).status, 422);
    assert.equal((await up(`entidade=obras&entidadeId=${M.obra}&nome=falso.pdf`, Buffer.from('MZ executavel'), 'application/pdf')).status, 422);
    assert.equal((await up(`entidade=obras&entidadeId=obr_x&nome=x.pdf`, PDF, 'application/pdf')).status, 422); assert.equal((await up(`entidade=obras&entidadeId=${M.obra}&nome=x.pdf`, Buffer.alloc(0), 'application/pdf')).status, 422);
    assert.equal((await up(`entidade=users&entidadeId=x&nome=x.pdf`, PDF, 'application/pdf')).status, 422);
  });
  await t.test('registro com documento não pode ser excluído; documento exige permissão', async () => {
    const sem = await S.usuario('SemDoc', ['obras:ver']); assert.equal((await sem.get('/api/documentos')).status, 403);
    const v = (await admin.del('/api/obras/' + M.obra)); assert.equal(v.status, 409); assert.ok(v.dados.vinculos.some(x => /Documentos/.test(x.rotulo)));
  });
});

test('backup: exportar, restaurar e auditoria', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  await ok(admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 10, precoUnit: 30 }));
  let bak;
  await t.test('exporta tudo e a restauração devolve exatamente o estado anterior', async () => {
    bak = (await admin.get('/api/backup/exportar')).dados; assert.equal(bak.formato, 'imperio-backup'); assert.ok(bak.tabelas.materiais.length >= 2);
    await ok(admin.post('/api/estoque/saida', { matId: M.cim, qtd: 4, obraId: M.obra })); await ok(admin.post('/api/fornecedores', { nome: 'Criado depois do backup' }));
    const r = await ok(admin.f('POST', '/api/backup/importar', Buffer.from(JSON.stringify(bak)))); assert.ok(r.snapshot); assert.equal((await admin.get('/api/obras')).status, 401, 'a restauração encerra as sessões'); await ok(admin.post('/api/auth/login', { email: 'admin@teste.com', senha: 'SenhaForte123' }));
    assert.equal((await admin.get('/api/materiais/' + M.cim)).dados.estoque, 10); assert.equal((await admin.get('/api/fornecedores')).dados.itens.some(f => f.nome === 'Criado depois do backup'), false);
  });
  await t.test('backup inválido ou adulterado não muda nada', async () => {
    assert.equal((await admin.f('POST', '/api/backup/importar', Buffer.from('{"formato":"outro"}'))).status, 400); assert.equal((await admin.f('POST', '/api/backup/importar', Buffer.from('não é json'))).status, 400);
    const ruim = JSON.parse(JSON.stringify(bak)); ruim.tabelas.materiais[0].fornId = 'frn_inexistente'; assert.equal((await admin.f('POST', '/api/backup/importar', Buffer.from(JSON.stringify(ruim)))).status, 400);
    const ruim2 = JSON.parse(JSON.stringify(bak)); ruim2.tabelas.materiais[0].colunaFalsa = 1; assert.equal((await admin.f('POST', '/api/backup/importar', Buffer.from(JSON.stringify(ruim2)))).status, 400);
    assert.equal((await admin.get('/api/materiais/' + M.cim)).dados.estoque, 10, 'estado intacto depois das tentativas');
  });
  await t.test('auditoria registra autor, ação e antes/depois', async () => {
    const a = (await admin.get('/api/auditoria?entidade=movimentacoes')).dados; assert.ok(a.itens.some(i => /Entrada de 10/.test(i.resumo)) && a.itens.every(i => i.userNome));
    const e = (await admin.get('/api/auditoria?entidade=materiais')).dados.itens.find(i => i.acao === 'criar'); assert.ok(JSON.parse(e.depois).nome);
  });
});

test('dataset do painel: formato esperado pelo front e números consistentes', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  await ok(admin.post('/api/estoque/entrada', { matId: M.cim, qtd: 100, precoUnit: 30 })); await ok(admin.post('/api/estoque/saida', { matId: M.cim, qtd: 10, obraId: M.obra }));
  const c = (await ok(admin.post('/api/contas', { tipo: 'Receber', descricao: 'Venda', valor: 1000, vencimento: M.hoje, catId: 'cat_venda', empId: M.emp, jaPago: { data: M.hoje } }))).ids[0];
  const d = (await admin.get('/api/dataset')).dados;
  await t.test('chaves e tipos', async () => {
    for (const k of ['empreendimentos', 'obras', 'materiais', 'movs', 'funcionarios', 'fornecedores', 'tarefas', 'contratos', 'lancamentos']) assert.ok(Array.isArray(d[k]), k);
    const o = d.obras[0]; assert.ok(o.id && o.nome && 'empId' in o && o.status && typeof o.gasto === 'number' && Array.isArray(o.passos)); assert.ok(o.passos[0].mats !== undefined && 'baixado' in o.passos[0] && 'fase' in o.passos[0] && 'pct' in o.passos[0]);
    const m = d.materiais[0]; assert.ok('qtd' in m && 'min' in m && 'custo' in m && 'un' in m);
  });
  await t.test('lançamentos do financeiro são as BAIXAS (caixa), não os títulos', async () => {
    assert.equal(d.lancamentos.length, 1); assert.equal(d.lancamentos[0].tipo, 'Receita'); assert.equal(d.lancamentos[0].valor, 1000); assert.equal(d.lancamentos[0].empId, M.emp); assert.equal(d.lancamentos[0].contaId, c);
    assert.equal(d.empreendimentos[0].unidades, 10);
  });
  await t.test('uma baixa estornada some do caixa; movs trazem a saída com a obra', async () => {
    const liq = (await admin.get('/api/contas/' + c)).dados.liquidacoes[0].id; await ok(admin.post(`/api/liquidacoes/${liq}/estornar`, { motivo: 'teste' })); assert.equal((await admin.get('/api/dataset')).dados.lancamentos.length, 0);
    assert.ok(d.movs.some(m => m.tipo === 'Saída' && m.obraId === M.obra));
  });
  await t.test('versão do dado muda a cada alteração (o front usa para atualizar sozinho)', async () => { const v1 = (await admin.get('/api/versao')).dados.versao; await ok(admin.post('/api/fornecedores', { nome: 'Novo F' })); assert.notEqual((await admin.get('/api/versao')).dados.versao, v1); });
});
