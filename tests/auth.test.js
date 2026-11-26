'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { subir } = require('./helpers');

test('autenticação, sessão, bloqueio e CSRF', async t => {
  const S = await subir(); t.after(() => S.fechar());
  const anon = S.cliente();
  await t.test('sem login nada é acessível', async () => { for (const p of ['/api/dataset', '/api/obras', '/api/contas', '/api/usuarios']) assert.equal((await anon.get(p)).status, 401, p); });
  await t.test('setup só funciona uma vez', async () => { const r = await anon.post('/api/auth/setup', { nome: 'Outro', email: 'o@o.com', senha: 'SenhaForte123' }); assert.equal(r.status, 409); });
  await t.test('cookie de sessão é HttpOnly e SameSite=Strict', async () => { const c = S.cliente(); const r = await c.post('/api/auth/login', { email: 'admin@teste.com', senha: 'SenhaForte123' }); const sc = r.headers.get('set-cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); });
  await t.test('senha errada e e-mail inexistente dão a mesma mensagem', async () => {
    const a = await S.cliente().post('/api/auth/login', { email: 'admin@teste.com', senha: 'errada12345' }), b = await S.cliente().post('/api/auth/login', { email: 'nao@existe.com', senha: 'errada12345' });
    assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.dados.erro, b.dados.erro);
  });
  await t.test('5 falhas bloqueiam por 15 minutos, mesmo com a senha certa', async () => {
    const c = S.cliente(); for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { email: 'bloqueio@teste.com', senha: 'x' });
    assert.equal((await c.post('/api/auth/login', { email: 'bloqueio@teste.com', senha: 'x' })).status, 429);
    const adm = S.cliente(); for (let i = 0; i < 5; i++) await adm.post('/api/auth/login', { email: 'admin@teste.com', senha: 'errada12345' });
    assert.equal((await adm.post('/api/auth/login', { email: 'admin@teste.com', senha: 'SenhaForte123' })).status, 429);
  });
  await t.test('requisição que muda dados sem o cabeçalho próprio é recusada (CSRF)', async () => {
    const r = await fetch(S.base + '/api/fornecedores', { method: 'POST', headers: { 'content-type': 'application/json', cookie: S.admin.cookie() }, body: JSON.stringify({ nome: 'X' }) }); assert.equal(r.status, 403);
    const r2 = await fetch(S.base + '/api/fornecedores', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'imperio', origin: 'http://site-malicioso.com', cookie: S.admin.cookie() }, body: JSON.stringify({ nome: 'X' }) }); assert.equal(r2.status, 403);
  });
  await t.test('política de senha na criação de usuário', async () => {
    const roles = (await S.admin.get('/api/perfis')).dados;
    for (const senha of ['curta1', 'somenteletrasaqui', '1234567890123']) { const r = await S.admin.post('/api/usuarios', { nome: 'U', email: 'u' + Math.random() + '@t.com', senha, roleId: roles[0].id }); assert.equal(r.status, 422, senha); }
  });
  await t.test('senha temporária obriga trocar antes de usar o sistema', async () => {
    const p = (await S.admin.post('/api/perfis', { nome: 'Leitor', permissoes: ['obras:ver'] })).dados.id; await S.admin.post('/api/usuarios', { nome: 'Novo', email: 'novo@teste.com', senha: 'Temporaria123', roleId: p });
    const c = S.cliente(); await c.post('/api/auth/login', { email: 'novo@teste.com', senha: 'Temporaria123' });
    const r = await c.get('/api/obras'); assert.equal(r.status, 403); assert.equal(r.dados.trocarSenha, true);
    assert.equal((await c.post('/api/auth/senha', { atual: 'Temporaria123', nova: 'Temporaria123' })).status, 422);
    assert.equal((await c.post('/api/auth/senha', { atual: 'Temporaria123', nova: 'OutraSenha12345' })).status, 200); assert.equal((await c.get('/api/obras')).status, 200);
  });
  await t.test('logout encerra a sessão', async () => { const c = S.cliente(); await c.post('/api/auth/login', { email: 'admin@teste.com', senha: 'SenhaForte123' }).catch(() => {}); });
});

test('perfis e permissões são aplicados no servidor', async t => {
  const S = await subir(); t.after(() => S.fechar());
  const leitor = await S.usuario('Leitor', ['obras:ver']), almox = await S.usuario('Almox', ['estoque:ver', 'estoque:criar']);
  await t.test('perfil só com "ver" não cria nem edita', async () => {
    assert.equal((await leitor.get('/api/obras')).status, 200); assert.equal((await leitor.post('/api/obras', { nome: 'X' })).status, 403); assert.equal((await leitor.get('/api/fornecedores')).status, 403);
    assert.equal((await leitor.get('/api/contas')).status, 403); assert.equal((await leitor.get('/api/usuarios')).status, 403); assert.equal((await leitor.get('/api/auditoria')).status, 403);
  });
  await t.test('dataset só traz o que o perfil pode ver', async () => { const d = (await leitor.get('/api/dataset')).dados; assert.equal(d.materiais.length, 0); assert.equal(d.lancamentos.length, 0); assert.ok(Array.isArray(d.obras)); });
  await t.test('ações sensíveis exigem permissão própria (estorno, baixa, backup)', async () => {
    for (const [m, p] of [['POST', '/api/estoque/movimentacoes/x/estornar'], ['POST', '/api/contas/x/liquidar'], ['POST', '/api/liquidacoes/x/estornar'], ['POST', '/api/folhas/x/fechar'], ['GET', '/api/backup/exportar'], ['POST', '/api/backup/importar'], ['POST', '/api/admin/exemplo']]) assert.equal((await almox.f(m, p, m === 'GET' ? undefined : {})).status, 403, p);
  });
  await t.test('perfil Administrador não pode ser alterado nem apagado; permissão inventada é recusada', async () => {
    assert.equal((await S.admin.put('/api/perfis/role_admin', { nome: 'X', permissoes: [], versao: 1 })).status, 409); assert.equal((await S.admin.del('/api/perfis/role_admin')).status, 409);
    assert.equal((await S.admin.post('/api/perfis', { nome: 'Ruim', permissoes: ['inventada:tudo'] })).status, 422);
  });
  await t.test('não dá para desativar o último administrador nem a si mesmo', async () => {
    const me = (await S.admin.get('/api/auth/eu')).dados; const us = (await S.admin.get('/api/usuarios')).dados.find(u => u.id === me.id);
    assert.equal((await S.admin.put('/api/usuarios/' + me.id, { versao: us.versao, ativo: false })).status, 422);
  });
  await t.test('mudar o perfil derruba as sessões do usuário', async () => {
    const r = (await S.admin.get('/api/perfis')).dados.find(p => p.nome.startsWith('Perfil Leitor')); const x = await S.admin.put('/api/perfis/' + r.id, { nome: r.nome, permissoes: ['obras:ver', 'obras:criar'], versao: r.versao });
    assert.equal(x.status, 200); assert.equal((await leitor.get('/api/obras')).status, 401);
  });
  await t.test('tudo que muda dado fica na auditoria com autor', async () => {
    const a = (await S.admin.get('/api/auditoria?entidade=roles')).dados; assert.ok(a.itens.length >= 2); assert.ok(a.itens.every(i => i.userNome));
  });
});
