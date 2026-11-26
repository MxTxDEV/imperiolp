'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const cfg = require('../config');
const db = require('../db');
const { q, tx } = db;
const { audit } = require('../audit');
const auth = require('../auth');
const perms = require('../perms');
const U = require('../util');

/* ---------- usuários ---------- */
const userApi = u => ({ id: u.id, nome: u.nome, email: u.email, roleId: u.roleId, perfil: u.perfil, ativo: !!u.ativo, ultimoLogin: u.ultimoLogin, senhaTemp: !!u.senhaTemp, versao: u.versao });
const listarUsuarios = async () => (await q.all('SELECT u.*, r.nome perfil FROM users u JOIN roles r ON r.id = u.roleId ORDER BY u.nome')).map(userApi);
async function adminsAtivos(excetoId) { return await q.val("SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.roleId WHERE u.ativo = 1 AND r.permissoes LIKE '%\"*\"%' AND u.id <> ?", excetoId || ''); }
async function criarUsuario(ctx, d) { return tx(async () => await auth.criarUsuario(ctx, { nome: d.nome, email: d.email, senha: d.senha, roleId: d.roleId, senhaTemp: true })); }
async function atualizarUsuario(ctx, id, d) {
  return tx(async () => {
    const u = await q.one('SELECT * FROM users WHERE id = ?', id); if (!u) throw U.notFound('Usuário não encontrado.'); if (+d.versao !== u.versao) throw U.conflict('Este usuário foi alterado por outra pessoa. Recarregue.');
    const erros = {}, nome = 'nome' in d ? String(d.nome || '').trim() : u.nome, roleId = d.roleId || u.roleId, ativo = 'ativo' in d ? (d.ativo ? 1 : 0) : u.ativo;
    if (nome.length < 2) erros.nome = 'Informe o nome.'; const role = await q.one('SELECT * FROM roles WHERE id = ?', roleId); if (!role || !role.ativo) erros.roleId = 'Perfil inválido.';
    if (d.novaSenha) { const m = auth.validaSenha(d.novaSenha, u.email); if (m) erros.novaSenha = m; }
    const eraAdmin = JSON.parse(await q.val('SELECT permissoes FROM roles WHERE id = ?', u.roleId)).includes('*'), seraAdmin = role && JSON.parse(role.permissoes).includes('*') && ativo;
    if (u.ativo && eraAdmin && !seraAdmin && await adminsAtivos(id) === 0) erros.roleId = 'O sistema precisa de pelo menos um administrador ativo.';
    if (id === ctx.user.id && !ativo) erros.ativo = 'Você não pode desativar o próprio usuário.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    await q.run('UPDATE users SET nome = ?, roleId = ?, ativo = ?, senhaHash = ?, senhaTemp = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?', nome, roleId, ativo, d.novaSenha ? auth.hashSenha(d.novaSenha) : u.senhaHash, d.novaSenha ? 1 : u.senhaTemp, U.nowIso(), ctx.user.id, id);
    if (!ativo || d.novaSenha || roleId !== u.roleId) await q.run('DELETE FROM sessions WHERE userId = ?', id);
    await audit(ctx, 'editar', 'users', id, `Usuário alterado: ${u.email}${d.novaSenha ? ' (senha redefinida)' : ''}`);
  });
}
/* ---------- perfis ---------- */
const roleApi = async r => ({ id: r.id, nome: r.nome, descricao: r.descricao, permissoes: JSON.parse(r.permissoes), sistema: !!r.sistema, ativo: !!r.ativo, usuarios: await q.val('SELECT COUNT(*) FROM users WHERE roleId = ?', r.id), versao: r.versao });
const listarPerfis = async () => Promise.all((await q.all('SELECT * FROM roles ORDER BY sistema DESC, nome')).map(roleApi));
async function salvarPerfil(ctx, id, d) {
  return tx(async () => {
    const erros = {}, nome = String(d.nome || '').trim(); if (nome.length < 2) erros.nome = 'Dê um nome ao perfil.';
    let lista = []; try { lista = perms.normalizar(Array.isArray(d.permissoes) ? d.permissoes : []); } catch (e) { erros.permissoes = e.message; }
    const atual = id ? await q.one('SELECT * FROM roles WHERE id = ?', id) : null; if (id && !atual) throw U.notFound('Perfil não encontrado.');
    if (atual && atual.sistema) throw U.conflict('O perfil Administrador é fixo e não pode ser alterado.');
    if (atual && +d.versao !== atual.versao) throw U.conflict('Este perfil foi alterado por outra pessoa. Recarregue.');
    if (Object.keys(erros).length) throw U.invalid(erros);
    if (atual) { await q.run('UPDATE roles SET nome = ?, descricao = ?, permissoes = ?, ativo = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?', nome, String(d.descricao || '').slice(0, 200), JSON.stringify(lista), 'ativo' in d ? (d.ativo ? 1 : 0) : atual.ativo, U.nowIso(), ctx.user.id, id); await q.run('DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE roleId = ?)', id); await audit(ctx, 'editar', 'roles', id, `Perfil alterado: ${nome}`, JSON.parse(atual.permissoes), lista); return id; }
    const novo = U.newId('rol'); await q.run('INSERT INTO roles (id, nome, descricao, permissoes, sistema, criadoEm, atualizadoEm, criadoPor) VALUES (?,?,?,?,0,?,?,?)', novo, nome, String(d.descricao || '').slice(0, 200), JSON.stringify(lista), U.nowIso(), U.nowIso(), ctx.user.id);
    await audit(ctx, 'criar', 'roles', novo, `Perfil criado: ${nome}`, null, lista); return novo;
  });
}
async function excluirPerfil(ctx, id) {
  return tx(async () => { const r = await q.one('SELECT * FROM roles WHERE id = ?', id); if (!r) throw U.notFound('Perfil não encontrado.'); if (r.sistema) throw U.conflict('O perfil Administrador não pode ser excluído.');
    const n = await q.val('SELECT COUNT(*) FROM users WHERE roleId = ?', id); if (n) throw U.conflict(`Há ${n} usuário(s) com este perfil. Troque o perfil deles antes.`); await q.run('DELETE FROM roles WHERE id = ?', id); await audit(ctx, 'excluir', 'roles', id, `Perfil excluído: ${r.nome}`); });
}
/* ---------- auditoria ---------- */
async function listarAuditoria(query) {
  const w = [], p = {}; for (const [k, c] of [['entidade', 'entidade'], ['entidadeId', 'entidadeId'], ['userId', 'userId'], ['acao', 'acao']]) if (query[k]) { w.push(`${c} = @${k}`); p[k] = query[k]; }
  if (U.isDate(query.de)) { w.push('ts >= @de'); p.de = query.de; } if (U.isDate(query.ate)) { w.push('ts < @ate'); p.ate = U.addDays(query.ate, 1); }
  if (query.busca) { w.push("resumo LIKE @b ESCAPE '\\'"); p.b = '%' + String(query.busca).replace(/[%_\\]/g, x => '\\' + x) + '%'; }
  const ws = w.length ? 'WHERE ' + w.join(' AND ') : '', tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const total = await q.val(`SELECT COUNT(*) FROM auditLog ${ws}`, p), itens = await q.all(`SELECT * FROM auditLog ${ws} ORDER BY id DESC LIMIT @lim OFFSET @off`, Object.assign({}, p, { lim: tam, off: (pag - 1) * tam }));
  return { total, pagina: pag, tamanho: tam, itens };
}
/* ---------- configurações ---------- */
const CONFIG_CHAVES = { empresaNome: v => (String(v).trim().length >= 2 && String(v).length <= 120 ? null : 'Nome inválido.'), encargosPctPadrao: v => (Number(v) >= 0 && Number(v) <= 300 ? null : 'Use 0 a 300.'), diaVencFolha: v => (Number.isInteger(Number(v)) && v >= 1 && v <= 28 ? null : 'Dia de 1 a 28.') };
const obterConfig = async () => Object.fromEntries((await q.all('SELECT chave, valor FROM meta')).map(r => [r.chave, r.valor]).filter(([k]) => k in CONFIG_CHAVES));
async function salvarConfig(ctx, d) {
  return tx(async () => { const erros = {}; for (const [k, f] of Object.entries(CONFIG_CHAVES)) if (k in d) { const m = f(d[k]); if (m) erros[k] = m; } if (Object.keys(erros).length) throw U.invalid(erros);
    for (const k of Object.keys(CONFIG_CHAVES)) if (k in d) await q.run('INSERT INTO meta (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', k, String(d[k]).trim()); await audit(ctx, 'editar', 'config', null, 'Configurações alteradas', null, d); });
}
/* ---------- backup ---------- */
const TABELAS = ['roles', 'users', 'meta', 'empreendimentos', 'clientes', 'unidades', 'fornecedores', 'materiais', 'obras', 'funcionarios', 'passos', 'passoMateriais', 'pedidos', 'pedidoItens', 'movimentacoes', 'categoriasFin', 'bancos', 'contratos', 'vendas', 'medicoes', 'folhas', 'folhaItens', 'contas', 'liquidacoes', 'tarefas', 'diario', 'documentos', 'alocacoes', 'auditLog'];
const bdir = () => { const d = path.join(cfg.dataDir, 'backups'); fs.mkdirSync(d, { recursive: true }); return d; };
/** Lê todas as tabelas de uma vez só (visão consistente, sem gravações no meio). */
async function lerTudo(comAuditoria) { return tx(async () => { const t = {}; for (const n of TABELAS) { if (n === 'auditLog' && !comAuditoria) continue; t[n] = await q.all(`SELECT * FROM ${n}`); } return t; }); }
/** Cópia de segurança em arquivo (JSON compactado) dentro do volume de dados; pode ser enviada de volta em "Importar backup". */
async function snapshot(prefixo) {
  const nome = `${prefixo}-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`, f = path.join(bdir(), nome);
  const dados = { formato: 'imperio-backup', versao: 1, geradoEm: U.nowIso(), tabelas: await lerTudo(false) };
  fs.writeFileSync(f, zlib.gzipSync(Buffer.from(JSON.stringify(dados)))); return { nome, arquivo: f, tamanho: fs.statSync(f).size };
}
async function limparBackupsAutomaticos(manter = 14) { try { const fs2 = fs.readdirSync(bdir()).filter(f => f.startsWith('auto-')).sort(); fs2.slice(0, Math.max(0, fs2.length - manter)).forEach(f => fs.rmSync(path.join(bdir(), f), { force: true })); } catch (_) { /* melhor esforço */ } }
async function listarBackups() { return fs.readdirSync(bdir()).filter(f => f.endsWith('.json.gz')).sort().reverse().map(f => ({ nome: f, tamanho: fs.statSync(path.join(bdir(), f)).size })); }
async function exportarJson(ctx) {
  const dados = { formato: 'imperio-backup', versao: 1, geradoEm: U.nowIso(), tabelas: {} };
  dados.tabelas = await lerTudo(true);
  await audit(ctx, 'exportar', 'backup', null, 'Backup completo exportado'); return dados;
}
/** Restaura um backup JSON. Faz um snapshot automático antes e valida tudo; se algo falhar, nada muda. */
async function importarJson(ctx, dados) {
  if (!dados || dados.formato !== 'imperio-backup' || !dados.tabelas) throw U.bad('Arquivo de backup inválido.');
  for (const t of Object.keys(dados.tabelas)) if (!TABELAS.includes(t)) throw U.bad('Tabela desconhecida no backup: ' + t);
  const snap = await snapshot('antes-da-importacao');
  await tx(async () => {
    await db.exec('SET CONSTRAINTS ALL DEFERRED');
    for (const t of [...TABELAS].reverse()) if (t in dados.tabelas) { if (t === 'auditLog') continue; await q.run(`DELETE FROM ${t}`); }
    for (const t of TABELAS) {
      const linhas = dados.tabelas[t]; if (!linhas || t === 'auditLog') continue;
      const cols = (await q.all('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?', t)).map(c => c.column_name);
      for (const l of linhas) { const ks = Object.keys(l); if (ks.some(k => !cols.includes(k))) throw U.bad(`Coluna desconhecida em ${t}.`); await q.run(`INSERT INTO ${t} (${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ...ks.map(k => l[k])); }
    }
    try { await db.exec('SET CONSTRAINTS ALL IMMEDIATE'); } catch (e) { if (e.code === '23503') throw U.bad('O backup tem registros ligados a algo que não existe.'); throw e; }
    for (const t of ['alocacoes']) await q.run(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
    if (!await q.val("SELECT COUNT(*) FROM roles WHERE id = 'role_admin'")) throw U.bad('O backup não tem o perfil Administrador.');
    await q.run('DELETE FROM sessions'); await audit(ctx, 'importar', 'backup', null, 'Backup restaurado (snapshot anterior: ' + snap.nome + ')');
  });
  return { snapshot: snap.nome };
}
module.exports = { listarUsuarios, criarUsuario, atualizarUsuario, listarPerfis, salvarPerfil, excluirPerfil, listarAuditoria, obterConfig, salvarConfig, snapshot, listarBackups, exportarJson, importarJson, limparBackupsAutomaticos, userApi, TABELAS };
