'use strict';
const fs = require('fs');
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
const listarUsuarios = () => q.all('SELECT u.*, r.nome perfil FROM users u JOIN roles r ON r.id = u.roleId ORDER BY u.nome').map(userApi);
function adminsAtivos(excetoId) { return q.val("SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.roleId WHERE u.ativo = 1 AND r.permissoes LIKE '%\"*\"%' AND u.id <> ?", excetoId || ''); }
function criarUsuario(ctx, d) { return tx(() => auth.criarUsuario(ctx, { nome: d.nome, email: d.email, senha: d.senha, roleId: d.roleId, senhaTemp: true })); }
function atualizarUsuario(ctx, id, d) {
  return tx(() => {
    const u = q.one('SELECT * FROM users WHERE id = ?', id); if (!u) throw U.notFound('Usuário não encontrado.'); if (+d.versao !== u.versao) throw U.conflict('Este usuário foi alterado por outra pessoa. Recarregue.');
    const erros = {}, nome = 'nome' in d ? String(d.nome || '').trim() : u.nome, roleId = d.roleId || u.roleId, ativo = 'ativo' in d ? (d.ativo ? 1 : 0) : u.ativo;
    if (nome.length < 2) erros.nome = 'Informe o nome.'; const role = q.one('SELECT * FROM roles WHERE id = ?', roleId); if (!role || !role.ativo) erros.roleId = 'Perfil inválido.';
    if (d.novaSenha) { const m = auth.validaSenha(d.novaSenha, u.email); if (m) erros.novaSenha = m; }
    const eraAdmin = JSON.parse(q.val('SELECT permissoes FROM roles WHERE id = ?', u.roleId)).includes('*'), seraAdmin = role && JSON.parse(role.permissoes).includes('*') && ativo;
    if (u.ativo && eraAdmin && !seraAdmin && adminsAtivos(id) === 0) erros.roleId = 'O sistema precisa de pelo menos um administrador ativo.';
    if (id === ctx.user.id && !ativo) erros.ativo = 'Você não pode desativar o próprio usuário.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    q.run('UPDATE users SET nome = ?, roleId = ?, ativo = ?, senhaHash = ?, senhaTemp = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?', nome, roleId, ativo, d.novaSenha ? auth.hashSenha(d.novaSenha) : u.senhaHash, d.novaSenha ? 1 : u.senhaTemp, U.nowIso(), ctx.user.id, id);
    if (!ativo || d.novaSenha || roleId !== u.roleId) q.run('DELETE FROM sessions WHERE userId = ?', id);
    audit(ctx, 'editar', 'users', id, `Usuário alterado: ${u.email}${d.novaSenha ? ' (senha redefinida)' : ''}`);
  });
}
/* ---------- perfis ---------- */
const roleApi = r => ({ id: r.id, nome: r.nome, descricao: r.descricao, permissoes: JSON.parse(r.permissoes), sistema: !!r.sistema, ativo: !!r.ativo, usuarios: q.val('SELECT COUNT(*) FROM users WHERE roleId = ?', r.id), versao: r.versao });
const listarPerfis = () => q.all('SELECT * FROM roles ORDER BY sistema DESC, nome').map(roleApi);
function salvarPerfil(ctx, id, d) {
  return tx(() => {
    const erros = {}, nome = String(d.nome || '').trim(); if (nome.length < 2) erros.nome = 'Dê um nome ao perfil.';
    let lista = []; try { lista = perms.normalizar(Array.isArray(d.permissoes) ? d.permissoes : []); } catch (e) { erros.permissoes = e.message; }
    const atual = id ? q.one('SELECT * FROM roles WHERE id = ?', id) : null; if (id && !atual) throw U.notFound('Perfil não encontrado.');
    if (atual && atual.sistema) throw U.conflict('O perfil Administrador é fixo e não pode ser alterado.');
    if (atual && +d.versao !== atual.versao) throw U.conflict('Este perfil foi alterado por outra pessoa. Recarregue.');
    if (Object.keys(erros).length) throw U.invalid(erros);
    if (atual) { q.run('UPDATE roles SET nome = ?, descricao = ?, permissoes = ?, ativo = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?', nome, String(d.descricao || '').slice(0, 200), JSON.stringify(lista), 'ativo' in d ? (d.ativo ? 1 : 0) : atual.ativo, U.nowIso(), ctx.user.id, id); q.run('DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE roleId = ?)', id); audit(ctx, 'editar', 'roles', id, `Perfil alterado: ${nome}`, JSON.parse(atual.permissoes), lista); return id; }
    const novo = U.newId('rol'); q.run('INSERT INTO roles (id, nome, descricao, permissoes, sistema, criadoEm, atualizadoEm, criadoPor) VALUES (?,?,?,?,0,?,?,?)', novo, nome, String(d.descricao || '').slice(0, 200), JSON.stringify(lista), U.nowIso(), U.nowIso(), ctx.user.id);
    audit(ctx, 'criar', 'roles', novo, `Perfil criado: ${nome}`, null, lista); return novo;
  });
}
function excluirPerfil(ctx, id) {
  return tx(() => { const r = q.one('SELECT * FROM roles WHERE id = ?', id); if (!r) throw U.notFound('Perfil não encontrado.'); if (r.sistema) throw U.conflict('O perfil Administrador não pode ser excluído.');
    const n = q.val('SELECT COUNT(*) FROM users WHERE roleId = ?', id); if (n) throw U.conflict(`Há ${n} usuário(s) com este perfil. Troque o perfil deles antes.`); q.run('DELETE FROM roles WHERE id = ?', id); audit(ctx, 'excluir', 'roles', id, `Perfil excluído: ${r.nome}`); });
}
/* ---------- auditoria ---------- */
function listarAuditoria(query) {
  const w = [], p = {}; for (const [k, c] of [['entidade', 'entidade'], ['entidadeId', 'entidadeId'], ['userId', 'userId'], ['acao', 'acao']]) if (query[k]) { w.push(`${c} = @${k}`); p[k] = query[k]; }
  if (U.isDate(query.de)) { w.push('ts >= @de'); p.de = query.de; } if (U.isDate(query.ate)) { w.push('ts < @ate'); p.ate = U.addDays(query.ate, 1); }
  if (query.busca) { w.push("resumo LIKE @b ESCAPE '\\'"); p.b = '%' + String(query.busca).replace(/[%_\\]/g, x => '\\' + x) + '%'; }
  const ws = w.length ? 'WHERE ' + w.join(' AND ') : '', tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const total = q.val(`SELECT COUNT(*) FROM auditLog ${ws}`, p), itens = q.all(`SELECT * FROM auditLog ${ws} ORDER BY id DESC LIMIT @lim OFFSET @off`, Object.assign({}, p, { lim: tam, off: (pag - 1) * tam }));
  return { total, pagina: pag, tamanho: tam, itens };
}
/* ---------- configurações ---------- */
const CONFIG_CHAVES = { empresaNome: v => (String(v).trim().length >= 2 && String(v).length <= 120 ? null : 'Nome inválido.'), encargosPctPadrao: v => (Number(v) >= 0 && Number(v) <= 300 ? null : 'Use 0 a 300.'), diaVencFolha: v => (Number.isInteger(Number(v)) && v >= 1 && v <= 28 ? null : 'Dia de 1 a 28.') };
const obterConfig = () => Object.fromEntries(q.all('SELECT chave, valor FROM meta').map(r => [r.chave, r.valor]).filter(([k]) => k in CONFIG_CHAVES));
function salvarConfig(ctx, d) {
  return tx(() => { const erros = {}; for (const [k, f] of Object.entries(CONFIG_CHAVES)) if (k in d) { const m = f(d[k]); if (m) erros[k] = m; } if (Object.keys(erros).length) throw U.invalid(erros);
    for (const k of Object.keys(CONFIG_CHAVES)) if (k in d) q.run('INSERT INTO meta (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', k, String(d[k]).trim()); audit(ctx, 'editar', 'config', null, 'Configurações alteradas', null, d); });
}
/* ---------- backup ---------- */
const TABELAS = ['roles', 'users', 'meta', 'empreendimentos', 'clientes', 'unidades', 'fornecedores', 'materiais', 'obras', 'funcionarios', 'passos', 'passoMateriais', 'pedidos', 'pedidoItens', 'movimentacoes', 'categoriasFin', 'bancos', 'contratos', 'vendas', 'medicoes', 'folhas', 'folhaItens', 'contas', 'liquidacoes', 'tarefas', 'diario', 'documentos', 'alocacoes', 'auditLog'];
const bdir = () => { const d = path.join(cfg.dataDir, 'backups'); fs.mkdirSync(d, { recursive: true }); return d; };
function snapshot(prefixo) {
  const nome = `${prefixo}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`, f = path.join(bdir(), nome);
  db.get().exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); return { nome, arquivo: f, tamanho: fs.statSync(f).size };
}
function limparBackupsAutomaticos(manter = 14) { try { const fs2 = fs.readdirSync(bdir()).filter(f => f.startsWith('auto-')).sort(); fs2.slice(0, Math.max(0, fs2.length - manter)).forEach(f => fs.rmSync(path.join(bdir(), f), { force: true })); } catch (_) { /* melhor esforço */ } }
function listarBackups() { return fs.readdirSync(bdir()).filter(f => f.endsWith('.db')).sort().reverse().map(f => ({ nome: f, tamanho: fs.statSync(path.join(bdir(), f)).size })); }
function exportarJson(ctx) {
  const dados = { formato: 'imperio-backup', versao: 1, geradoEm: U.nowIso(), tabelas: {} };
  for (const t of TABELAS) dados.tabelas[t] = q.all(`SELECT * FROM ${t}`);
  audit(ctx, 'exportar', 'backup', null, 'Backup completo exportado'); return dados;
}
/** Restaura um backup JSON. Faz um snapshot automático antes e valida tudo; se algo falhar, nada muda. */
function importarJson(ctx, dados) {
  if (!dados || dados.formato !== 'imperio-backup' || !dados.tabelas) throw U.bad('Arquivo de backup inválido.');
  for (const t of Object.keys(dados.tabelas)) if (!TABELAS.includes(t)) throw U.bad('Tabela desconhecida no backup: ' + t);
  const snap = snapshot('antes-da-importacao');
  tx(() => {
    db.get().exec('PRAGMA defer_foreign_keys = ON');
    for (const t of [...TABELAS].reverse()) if (t in dados.tabelas) { if (t === 'auditLog') continue; q.run(`DELETE FROM ${t}`); }
    for (const t of TABELAS) {
      const linhas = dados.tabelas[t]; if (!linhas || t === 'auditLog') continue;
      const cols = q.all(`PRAGMA table_info(${t})`).map(c => c.name);
      for (const l of linhas) { const ks = Object.keys(l); if (ks.some(k => !cols.includes(k))) throw U.bad(`Coluna desconhecida em ${t}.`); q.run(`INSERT INTO ${t} (${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ...ks.map(k => l[k])); }
    }
    const falhas = q.all('PRAGMA foreign_key_check'); if (falhas.length) throw U.bad('O backup tem registros ligados a algo que não existe (' + falhas.length + ').');
    if (!q.val("SELECT COUNT(*) FROM roles WHERE id = 'role_admin'")) throw U.bad('O backup não tem o perfil Administrador.');
    q.run('DELETE FROM sessions'); audit(ctx, 'importar', 'backup', null, 'Backup restaurado (snapshot anterior: ' + snap.nome + ')');
  });
  return { snapshot: snap.nome };
}
module.exports = { listarUsuarios, criarUsuario, atualizarUsuario, listarPerfis, salvarPerfil, excluirPerfil, listarAuditoria, obterConfig, salvarConfig, snapshot, listarBackups, exportarJson, importarJson, limparBackupsAutomaticos, userApi, TABELAS };
