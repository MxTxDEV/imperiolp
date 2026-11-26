'use strict';
process.env.LOG_QUIET = '1';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'imperio-test-' + process.pid + '-' + Math.random().toString(36).slice(2, 6));
const { iniciar } = require('../server/index.js');
const U = require('../server/util');

/** Sobe o servidor com banco em memória e devolve um cliente HTTP com cookie de sessão por usuário. */
async function subir() {
  // Por padrão: Postgres embutido (PGlite) em memória. Com TEST_DATABASE_URL: Postgres de verdade, num schema próprio descartado no fim.
  const url = process.env.TEST_DATABASE_URL;
  const srv = await iniciar({ port: 0, dbFile: ':memory:', semBackupAutomatico: true, dbUrl: url, schema: url ? 'teste_' + process.pid + '_' + Math.random().toString(36).slice(2, 6) : undefined });
  const base = 'http://127.0.0.1:' + srv.port;
  const cliente = () => {
    let cookie = '';
    const f = async (metodo, caminho, corpo, extra) => {
      const h = Object.assign({ 'content-type': 'application/json', 'x-requested-with': 'imperio', cookie }, extra && extra.headers);
      const r = await fetch(base + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : (Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo)) });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const tipo = r.headers.get('content-type') || ''; let dados = null;
      if (tipo.includes('json')) dados = await r.json(); else dados = Buffer.from(await r.arrayBuffer());
      return { status: r.status, dados, headers: r.headers };
    };
    const api = { f, get: (p) => f('GET', p), post: (p, b) => f('POST', p, b === undefined ? {} : b), put: (p, b) => f('PUT', p, b), del: (p) => f('DELETE', p), cookie: () => cookie };
    return api;
  };
  const admin = cliente();
  const r = await admin.post('/api/auth/setup', { nome: 'Admin Teste', email: 'admin@teste.com', senha: 'SenhaForte123' });
  if (r.status !== 200) throw new Error('setup falhou: ' + JSON.stringify(r.dados));
  /** Cria usuário com um perfil de permissões e devolve o cliente já logado (troca a senha temporária). */
  const usuario = async (nome, permissoes) => {
    const p = await admin.post('/api/perfis', { nome: 'Perfil ' + nome + Math.random().toString(36).slice(2, 5), permissoes });
    if (p.status !== 200) throw new Error('perfil: ' + JSON.stringify(p.dados));
    const email = nome.toLowerCase().replace(/\W/g, '') + Math.random().toString(36).slice(2, 5) + '@teste.com';
    const u = await admin.post('/api/usuarios', { nome, email, senha: 'Temporaria123', roleId: p.dados.id });
    if (u.status !== 200) throw new Error('usuário: ' + JSON.stringify(u.dados));
    const c = cliente(); const l = await c.post('/api/auth/login', { email, senha: 'Temporaria123' });
    const t = await c.post('/api/auth/senha', { atual: 'Temporaria123', nova: 'NovaSenha12345' });
    if (t.status !== 200) throw new Error('troca de senha falhou ' + JSON.stringify(t.dados));
    return Object.assign(c, { id: u.dados.id, email });
  };
  const ok = async (p) => { const r = await p; if (r.status >= 300) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.dados)}`); return r.dados; };
  return { srv, base, cliente, admin, usuario, ok, fechar: () => srv.close() };
}
/** Massa de dados mínima para os fluxos. */
async function massa(t) {
  const { admin, ok } = t, hoje = U.hoje(), M = {};
  M.emp = (await ok(admin.post('/api/empreendimentos', { nome: 'Residencial Teste', unidadesPrevistas: 10, vgv: 5000000 }))).id;
  M.obra = (await ok(admin.post('/api/obras', { nome: 'Obra Teste', empId: M.emp, orcamento: 1000000, inicio: U.addDays(hoje, -30), previsao: U.addDays(hoje, 200), usarModelo: true }))).id;
  M.forn = (await ok(admin.post('/api/fornecedores', { nome: 'Fornecedor Teste', documento: '11.222.333/0001-81' }))).id;
  M.cim = (await ok(admin.post('/api/materiais', { nome: 'Cimento', unidade: 'saco', minimo: 50, fornId: M.forn }))).id;
  M.areia = (await ok(admin.post('/api/materiais', { nome: 'Areia', unidade: 'm³', minimo: 5 }))).id;
  M.hoje = hoje; return M;
}
module.exports = { subir, massa, U };
