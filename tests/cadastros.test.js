'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir, massa, U } = require('./helpers');

test('cadastros: validação, duplicidade, versão, arquivar e vínculos', async t => {
  const S = await subir(); t.after(() => S.fechar()); const { admin, ok } = S; const M = await massa(S);
  await t.test('CPF/CNPJ/e-mail/telefone/CEP são validados no servidor', async () => {
    const casos = [['fornecedores', { nome: 'F1', documento: '111.111.111-11' }, 'documento'], ['fornecedores', { nome: 'F2', email: 'isto nao é email' }, 'email'], ['fornecedores', { nome: 'F3', telefone: 'abc' }, 'telefone'],
      ['clientes', { nome: 'C1', cep: '123' }, 'cep'], ['funcionarios', { nome: 'P1', cpf: '123.456.789-00' }, 'cpf'], ['clientes', { nome: 'C2', uf: 'XYZ' }, 'uf']];
    for (const [ent, corpo, campo] of casos) { const r = await admin.post('/api/' + ent, corpo); assert.equal(r.status, 422, ent + campo); assert.ok(r.dados.erros[campo], campo); }
    const bom = await admin.post('/api/clientes', { nome: 'Maria Silva', documento: '529.982.247-25', telefone: '(11) 98800-1100', email: 'Maria@Teste.com', cep: '01310-100' }); assert.equal(bom.status, 200);
    const c = (await admin.get('/api/clientes/' + bom.dados.id)).dados; assert.equal(c.documento, '52998224725'); assert.equal(c.email, 'maria@teste.com'); assert.equal(c.telefone, '11988001100');
  });
  await t.test('duplicidade: mesmo nome (sem diferenciar maiúsculas) e mesmo documento são recusados', async () => {
    assert.equal((await admin.post('/api/fornecedores', { nome: 'fornecedor teste' })).status, 409);
    assert.equal((await admin.post('/api/fornecedores', { nome: 'Outro nome', documento: '11222333000181' })).status, 409);
    assert.equal((await admin.post('/api/clientes', { nome: 'Outra Maria', documento: '52998224725' })).status, 409);
  });
  await t.test('campos obrigatórios e limites', async () => {
    assert.equal((await admin.post('/api/obras', { nome: 'Sem datas' })).status, 422);
    assert.equal((await admin.post('/api/obras', { nome: 'Datas ruins', inicio: '2026-12-01', previsao: '2026-01-01' })).dados.erros.previsao.length > 0, true);
    assert.equal((await admin.post('/api/obras', { nome: 'Data falsa', inicio: '2026-02-30', previsao: '2026-12-01' })).status, 422);
    assert.equal((await admin.post('/api/materiais', { nome: 'Neg', minimo: -5 })).status, 422);
    assert.equal((await admin.post('/api/empreendimentos', { nome: 'Vgv ruim', vgv: -1 })).status, 422);
    assert.equal((await admin.post('/api/empreendimentos', { nome: 'Centavos', vgv: 10.005 })).status, 422);
  });
  await t.test('quantidade em estoque e custo médio NÃO são editáveis no cadastro', async () => {
    const m = (await admin.get('/api/materiais/' + M.cim)).dados; await ok(admin.put('/api/materiais/' + M.cim, { versao: m.versao, estoque: 9999, custoMedio: 99, nome: 'Cimento CP-II' }));
    const d = (await admin.get('/api/materiais/' + M.cim)).dados; assert.equal(d.estoque, 0); assert.equal(d.custoMedio, 0); assert.equal(d.nome, 'Cimento CP-II');
  });
  await t.test('edição concorrente: segunda gravação com versão antiga é recusada (409)', async () => {
    const f = (await admin.get('/api/fornecedores/' + M.forn)).dados;
    assert.equal((await admin.put('/api/fornecedores/' + M.forn, { versao: f.versao, categoria: 'A' })).status, 200);
    const r = await admin.put('/api/fornecedores/' + M.forn, { versao: f.versao, categoria: 'B' }); assert.equal(r.status, 409); assert.match(r.dados.erro, /outra pessoa/);
    assert.equal((await admin.put('/api/fornecedores/' + M.forn, { categoria: 'B' })).status, 400);
  });
  await t.test('excluir com vínculo é bloqueado e informa o impacto; arquivar funciona; sem vínculo exclui', async () => {
    const r = await admin.del('/api/obras/' + M.obra); assert.equal(r.status, 409); assert.ok(r.dados.vinculos.some(v => v.rotulo === 'Passos')); assert.equal(r.dados.podeArquivar, true);
    const e = await admin.del('/api/empreendimentos/' + M.emp); assert.equal(e.status, 409); assert.ok(e.dados.vinculos.some(v => v.rotulo === 'Obras'));
    const novo = (await ok(admin.post('/api/fornecedores', { nome: 'Sem vínculo' }))).id; assert.equal((await admin.del('/api/fornecedores/' + novo)).status, 200);
    const arq = (await ok(admin.post('/api/fornecedores', { nome: 'Para arquivar' }))).id; await ok(admin.post(`/api/fornecedores/${arq}/arquivar`)); assert.equal((await admin.get('/api/fornecedores')).dados.itens.some(i => i.id === arq), false);
    assert.equal((await admin.get('/api/fornecedores?arquivados=1')).dados.itens.some(i => i.id === arq), true);
    assert.equal((await admin.post('/api/fornecedores', { nome: 'Para arquivar' })).status, 200);   // nome liberado depois de arquivar
    assert.equal((await admin.post(`/api/fornecedores/${arq}/restaurar`)).status, 409);               // mas restaurar bate no nome já em uso
  });
  await t.test('não é possível vincular a um registro arquivado nem a um que não existe', async () => {
    const arq = (await ok(admin.post('/api/fornecedores', { nome: 'Arquivado ref' }))).id; await ok(admin.post(`/api/fornecedores/${arq}/arquivar`));
    assert.equal((await admin.post('/api/materiais', { nome: 'Mat ref', fornId: arq })).status, 422); assert.equal((await admin.post('/api/materiais', { nome: 'Mat ref2', fornId: 'frn_nao_existe' })).status, 422);
  });
  await t.test('unidades: respeita o total previsto e a situação só muda pelo fluxo de venda', async () => {
    const e2 = (await ok(admin.post('/api/empreendimentos', { nome: 'Pequeno', unidadesPrevistas: 3 }))).id;
    await ok(admin.post('/api/unidades', { empId: e2, codigo: '101' })); await ok(admin.post('/api/unidades', { empId: e2, codigo: '102' }));
    assert.equal((await admin.post('/api/unidades', { empId: e2, codigo: '101' })).status, 409, 'código repetido no mesmo empreendimento');
    await ok(admin.post('/api/unidades', { empId: e2, codigo: '103' })); assert.equal((await admin.post('/api/unidades', { empId: e2, codigo: '104' })).status, 422, 'passou do total previsto');
    const u = (await admin.get('/api/unidades?empId=' + e2)).dados.itens[0]; assert.equal((await admin.put('/api/unidades/' + u.id, { versao: u.versao, status: 'Vendida' })).status, 422);
  });
  await t.test('funcionário: salário só aparece para quem tem a permissão; alocação gera histórico', async () => {
    const f = (await ok(admin.post('/api/funcionarios', { nome: 'João Pedreiro', cpf: '529.982.247-25', salario: 3400, obraId: M.obra, admissao: '2026-01-10' }))).id;
    const sem = await S.usuario('SemSalario', ['funcionarios:ver', 'funcionarios:editar']); assert.equal((await sem.get('/api/funcionarios/' + f)).dados.salario, 0);
    const fs = (await sem.get('/api/funcionarios/' + f)).dados; const r = await sem.put('/api/funcionarios/' + f, { versao: fs.versao, salario: 9999 }); assert.equal(r.status, 422);
    assert.equal((await admin.get('/api/funcionarios/' + f)).dados.salario, 3400);
    const des = (await admin.get('/api/funcionarios/' + f)).dados; await ok(admin.put('/api/funcionarios/' + f, { versao: des.versao, status: 'Desligado', obraId: '' }));
    const d = (await admin.get('/api/funcionarios/' + f)).dados; assert.equal(d.status, 'Desligado'); assert.equal(d.desligamento, U.hoje());
  });
  await t.test('exportação CSV: nomes em vez de ids, vírgula decimal e proteção contra fórmula', async () => {
    await ok(admin.post('/api/fornecedores', { nome: '=HYPERLINK("http://x","clique")' })); await ok(admin.post('/api/materiais', { nome: 'Tubo', minimo: 2.5, fornId: M.forn }));
    const f = await admin.get('/api/fornecedores/exportar.csv'); const txt = f.dados.toString('utf8'); assert.ok(txt.startsWith('﻿')); assert.ok(txt.includes('"\'=HYPERLINK'), 'fórmula neutralizada');
    const m = (await admin.get('/api/materiais/exportar.csv')).dados.toString('utf8'); assert.ok(m.includes('Fornecedor Teste') && !m.includes('frn_'), 'mostra o nome do fornecedor, não o id'); assert.ok(m.includes('2,5'));
  });
});
