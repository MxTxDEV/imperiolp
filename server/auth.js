'use strict';
const crypto = require('crypto');
const cfg = require('./config');
const { tx, q } = require('./db');
const { HttpError, newId, nowIso, emailOk, invalid } = require('./util');
const { audit } = require('./audit');

const COOKIE = 'imperio_sid';
const N = 16384;
function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64, { N, r: 8, p: 1 });
  return ['scrypt', N, salt.toString('base64'), h.toString('base64')].join('$');
}
function confereSenha(senha, stored) {
  try {
    const [alg, n, salt, h] = stored.split('$'); if (alg !== 'scrypt') return false;
    const calc = crypto.scryptSync(senha, Buffer.from(salt, 'base64'), 64, { N: +n, r: 8, p: 1 });
    const esperado = Buffer.from(h, 'base64'); return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
  } catch (_) { return false; }
}
// Hash falso para gastar o mesmo tempo quando o e-mail não existe (evita descobrir quem tem conta).
const FALSO = hashSenha('senha-falsa-para-igualar-tempo');
function validaSenha(senha, email) {
  if (typeof senha !== 'string' || senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 200) return 'Senha longa demais.';
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
  if (email && senha.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) return 'A senha não pode conter o seu e-mail.';
  return null;
}
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function parseCookies(h) { const o = {}; String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function cookieHeader(token, maxAgeS) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeS}${cfg.cookieSecure ? '; Secure' : ''}`;
}
function carregarUsuario(row) {
  if (!row) return null;
  const role = q.one('SELECT id, nome, permissoes, ativo FROM roles WHERE id = ?', row.roleId);
  return { id: row.id, nome: row.nome, email: row.email, senhaTemp: !!row.senhaTemp, roleId: row.roleId, perfil: role ? role.nome : '', permissoes: role && role.ativo ? JSON.parse(role.permissoes) : [] };
}
function autenticar(req) {
  const tok = parseCookies(req.headers.cookie)[COOKIE]; if (!tok) return null;
  const s = q.one('SELECT s.tokenHash, s.userId, s.expiraEm, u.* FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?', sha(tok));
  if (!s || s.expiraEm < nowIso() || !s.ativo) { if (s) q.run('DELETE FROM sessions WHERE tokenHash = ?', s.tokenHash); return null; }
  q.run('UPDATE sessions SET ultimoUso = ? WHERE tokenHash = ?', nowIso(), s.tokenHash);
  return carregarUsuario(s);
}
function criarSessao(userId, ip, ua) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = new Date(Date.now() + cfg.sessionHours * 3600e3).toISOString();
  q.run('INSERT INTO sessions (tokenHash, userId, criadoEm, expiraEm, ultimoUso, ip, ua) VALUES (?,?,?,?,?,?,?)', sha(token), userId, nowIso(), exp, nowIso(), ip || '', String(ua || '').slice(0, 200));
  q.run('DELETE FROM sessions WHERE expiraEm < ?', nowIso());
  return token;
}
function encerrarSessao(req) { const tok = parseCookies(req.headers.cookie)[COOKIE]; if (tok) q.run('DELETE FROM sessions WHERE tokenHash = ?', sha(tok)); }

const MAX_FALHAS = 5, BLOQUEIO_MIN = 15;
function checaBloqueio(chave) {
  const r = q.one('SELECT falhas, bloqueadoAte FROM loginAttempts WHERE chave = ?', chave);
  if (r && r.bloqueadoAte && r.bloqueadoAte > nowIso()) throw new HttpError(429, `Muitas tentativas. Tente de novo em ${Math.ceil((Date.parse(r.bloqueadoAte) - Date.now()) / 60000)} min.`);
}
function registraFalha(chave) {
  const r = q.one('SELECT falhas FROM loginAttempts WHERE chave = ?', chave); const f = (r ? r.falhas : 0) + 1;
  const bloq = f >= MAX_FALHAS ? new Date(Date.now() + BLOQUEIO_MIN * 60e3).toISOString() : null;
  q.run('INSERT INTO loginAttempts (chave, falhas, bloqueadoAte, atualizadoEm) VALUES (?,?,?,?) ON CONFLICT(chave) DO UPDATE SET falhas = ?, bloqueadoAte = ?, atualizadoEm = ?', chave, f, bloq, nowIso(), f, bloq, nowIso());
}
function login(email, senha, ip, ua) {
  email = String(email || '').trim().toLowerCase();
  const chave = ip + '|' + email; checaBloqueio(chave);
  const u = q.one('SELECT * FROM users WHERE email = ?', email);
  const ok = u ? confereSenha(String(senha || ''), u.senhaHash) : (confereSenha(String(senha || ''), FALSO), false);
  if (!u || !ok || !u.ativo) { registraFalha(chave); throw new HttpError(401, 'E-mail ou senha inválidos.'); }
  q.run('DELETE FROM loginAttempts WHERE chave = ?', chave);
  q.run('UPDATE users SET ultimoLogin = ? WHERE id = ?', nowIso(), u.id);
  const token = criarSessao(u.id, ip, ua);
  const user = carregarUsuario(u); audit({ user }, 'login', 'users', u.id, 'Entrou no sistema');
  return { token, user };
}
function precisaSetup() { return q.val('SELECT COUNT(*) FROM users') === 0; }
function criarUsuario(ctx, { nome, email, senha, roleId, senhaTemp }) {
  const erros = {};
  nome = String(nome || '').trim(); email = String(email || '').trim().toLowerCase();
  if (nome.length < 2) erros.nome = 'Informe o nome.';
  if (!emailOk(email)) erros.email = 'E-mail inválido.';
  const ps = validaSenha(senha, email); if (ps) erros.senha = ps;
  const role = q.one('SELECT id, ativo FROM roles WHERE id = ?', roleId); if (!role || !role.ativo) erros.roleId = 'Perfil inválido.';
  if (q.one('SELECT 1 FROM users WHERE email = ?', email)) erros.email = 'Já existe um usuário com este e-mail.';
  if (Object.keys(erros).length) throw invalid(erros);
  const id = newId('usr'), agora = nowIso();
  q.run('INSERT INTO users (id, nome, email, senhaHash, senhaTemp, roleId, criadoEm, atualizadoEm, criadoPor) VALUES (?,?,?,?,?,?,?,?,?)', id, nome, email, hashSenha(senha), senhaTemp ? 1 : 0, roleId, agora, agora, ctx.user ? ctx.user.id : null);
  audit(ctx, 'criar', 'users', id, 'Usuário criado: ' + email, null, { nome, email, roleId });
  return id;
}
function setup(ip, { nome, email, senha }) {
  return tx(() => {
    if (!precisaSetup()) throw new HttpError(409, 'O sistema já foi configurado.');
    const id = criarUsuario({ user: null }, { nome, email, senha, roleId: 'role_admin', senhaTemp: false });
    return login(email, senha, ip, 'setup');
  });
}
function trocarSenha(ctx, atual, nova) {
  const u = q.one('SELECT * FROM users WHERE id = ?', ctx.user.id);
  if (!confereSenha(String(atual || ''), u.senhaHash)) throw invalid({ atual: 'Senha atual incorreta.' });
  const ps = validaSenha(nova, u.email); if (ps) throw invalid({ nova: ps });
  if (confereSenha(nova, u.senhaHash)) throw invalid({ nova: 'A nova senha deve ser diferente da atual.' });
  tx(() => {
    q.run('UPDATE users SET senhaHash = ?, senhaTemp = 0, atualizadoEm = ?, versao = versao + 1 WHERE id = ?', hashSenha(nova), nowIso(), u.id);
    q.run('DELETE FROM sessions WHERE userId = ? AND tokenHash NOT IN (SELECT tokenHash FROM sessions WHERE userId = ? ORDER BY ultimoUso DESC LIMIT 1)', u.id, u.id);
    audit(ctx, 'senha', 'users', u.id, 'Trocou a própria senha');
  });
}
module.exports = { hashSenha, confereSenha, validaSenha, autenticar, login, setup, precisaSetup, criarUsuario, trocarSenha, encerrarSessao, cookieHeader, COOKIE, sha, parseCookies };
