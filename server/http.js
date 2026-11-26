'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cfg = require('./config');
const log = require('./log');
const auth = require('./auth');
const { can } = require('./perms');
const { HttpError, forbidden } = require('./util');

const routes = [];
/** route('POST', '/api/x/:id', { perm:'obras:editar' | fn(ctx), publica:true, raw:true }, handler) */
function route(method, pattern, opts, handler) {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, opts, handler });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
function headersSeguros(res) {
  res.setHeader('Content-Security-Policy', CSP); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}
function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limite) { reject(new HttpError(413, 'Corpo da requisição grande demais.')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', reject);
  });
}
function enviar(req, res, status, obj, extraHeaders) {
  const body = Buffer.from(JSON.stringify(obj)); res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders || {})) res.setHeader(k, v);
  if (body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(body)); } else res.end(body);
}
function erroSql(e) {   // traduz erros do PostgreSQL (pelo código SQLSTATE) em mensagens para o usuário
  const c = e && e.code, m = String(e && e.message || '');
  if (c === '23505') return new HttpError(409, 'Já existe um registro com este valor (nome, documento ou código repetido).');
  if (c === '23503') return new HttpError(409, 'Este registro está ligado a outros e não pode ser alterado ou removido assim.');
  if (c === '23514') return new HttpError(422, 'Valor fora do permitido' + (e.constraint ? ' (' + e.constraint + ')' : '') + '.');
  if (c === '23502') return new HttpError(422, 'Campo obrigatório vazio' + (e.column ? ': ' + e.column : '') + '.');
  if (c === '22P02' || c === '22003' || c === '22001') return new HttpError(422, 'Valor inválido ou grande demais.');
  if (/duplicate key value|violates foreign key|violates check|violates not-null/.test(m)) return erroSql({ code: /duplicate/.test(m) ? '23505' : /foreign/.test(m) ? '23503' : /check/.test(m) ? '23514' : '23502' });
  return null;
}
function servirEstatico(req, res, urlPath) {
  let rel; try { rel = decodeURIComponent(urlPath); } catch (_) { res.statusCode = 400; return res.end('Requisição inválida'); } if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(cfg.publicDir, rel));
  if (!abs.startsWith(cfg.publicDir + path.sep) && abs !== cfg.publicDir) { res.statusCode = 403; return res.end('Proibido'); }
  fs.readFile(abs, (err, buf) => {
    if (err) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Não encontrado'); }
    res.statusCode = 200; res.setHeader('Content-Type', MIME[path.extname(abs)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-cache');
    if (buf.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg/.test(res.getHeader('Content-Type'))) { res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(buf)); } else res.end(buf);
  });
}
async function atender(req, res) {
  const t0 = Date.now(); headersSeguros(res);
  const u = new URL(req.url, 'http://x'); const remoto = req.socket.remoteAddress || '';
  const ip = cfg.trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || remoto : remoto;
  try {
    if (!u.pathname.startsWith('/api/')) { if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.'); return servirEstatico(req, res, u.pathname); }
    if (u.pathname === '/api/saude' && req.method === 'GET') { await require('./db').q.val('SELECT 1'); return enviar(req, res, 200, { ok: true, versao: require('../package.json').version }); }   // para o healthcheck do Coolify
    const r = routes.find(x => x.method === req.method && x.re.test(u.pathname));
    if (!r) { const outro = routes.some(x => x.re.test(u.pathname)); throw new HttpError(outro ? 405 : 404, outro ? 'Método não permitido.' : 'Rota não encontrada.'); }
    const m = u.pathname.match(r.re); const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (req.method !== 'GET') {   // CSRF: exige cabeçalho próprio e origem igual à do servidor
      if (req.headers['x-requested-with'] !== 'imperio') throw new HttpError(403, 'Requisição inválida.');
      const o = req.headers.origin; if (o) { let h = ''; try { h = new URL(o).host; } catch (_) { /* origem inválida */ } const ok = [req.headers.host, cfg.trustProxy && req.headers['x-forwarded-host'], cfg.publicUrl && new URL(cfg.publicUrl).host].filter(Boolean); if (!ok.includes(h)) throw new HttpError(403, 'Origem não permitida.'); }
    }
    const ctx = { req, res, params, query: Object.fromEntries(u.searchParams), ip, body: null, rawBody: null, user: null };
    if (!r.opts.publica) { ctx.user = await auth.autenticar(req); if (!ctx.user) throw new HttpError(401, 'Sessão expirada. Entre de novo.'); }
    if (ctx.user && ctx.user.senhaTemp && !r.opts.semTroca) throw new HttpError(403, 'Troque a senha temporária para continuar.', { trocarSenha: true });
    if (r.opts.perm) { const keys = [].concat(typeof r.opts.perm === 'function' ? r.opts.perm(ctx) : r.opts.perm); if (!keys.every(k => can(ctx.user, k))) throw forbidden(); }
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const buf = await lerCorpo(req, r.opts.raw ? cfg.maxUpload : cfg.maxJson);
      if (r.opts.raw) ctx.rawBody = buf; else if (buf.length) { try { ctx.body = JSON.parse(buf.toString('utf8')); } catch (_) { throw new HttpError(400, 'JSON inválido.'); } } else ctx.body = {};
    }
    const out = await r.handler(ctx);
    if (out && out.__raw) { res.statusCode = out.status || 200; for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v); res.end(out.body); }
    else if (out && out.__cookie) enviar(req, res, 200, out.data, { 'Set-Cookie': out.__cookie });
    else if (out && out.__status) enviar(req, res, out.__status, out.data);
    else enviar(req, res, 200, out === undefined ? { ok: true } : out);
    if (req.method !== 'GET') log.info('req', { m: req.method, p: u.pathname, ms: Date.now() - t0, u: ctx.user && ctx.user.id });
  } catch (e0) {
    const e = e0 instanceof HttpError ? e0 : (erroSql(e0) || e0);
    if (e instanceof HttpError) { if (e.status >= 500) log.error(e.message, { p: u.pathname }); enviar(req, res, e.status, Object.assign({ erro: e.message }, e.extra)); }
    else { const ref = Math.random().toString(36).slice(2, 8); log.error('falha não prevista', { ref, p: u.pathname, m: req.method, stack: String(e.stack || e).slice(0, 1500) }); enviar(req, res, 500, { erro: 'Erro interno. Informe o código ' + ref + ' ao administrador.' }); }
  }
}
function criarServidor() { return http.createServer((req, res) => { atender(req, res).catch(e => { log.error('falha geral', { erro: String(e && e.stack || e) }); try { res.statusCode = 500; res.end(); } catch (_) { /* socket fechado */ } }); }); }
module.exports = { route, criarServidor, routes };
