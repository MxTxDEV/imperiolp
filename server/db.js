'use strict';
// Acesso ao PostgreSQL (driver `pg` em produção; PGlite — Postgres em WebAssembly — para desenvolvimento e testes).
// A API de consulta é a mesma do resto do código: q.all / q.one / q.run / q.val (todas assíncronas) e tx(async () => ...).
//  - SQL escrito com `?` ou `@nome` vira `$1…`; nomes camelCase são entre aspas (o Postgres preserva a caixa);
//    LIKE vira ILIKE (busca sem diferenciar maiúsculas).
//  - Escrita é serializada (uma transação por vez): preserva a segurança do "ler, conferir e gravar" (estoque, saldo da conta…).
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('node:async_hooks');
const cfg = require('./config');
const { nowIso } = require('./util');

const als = new AsyncLocalStorage();
let driver = null, version = 0;
const bootId = Math.random().toString(36).slice(2, 8);

class Mutex { constructor() { this.cauda = Promise.resolve(); } acquire() { let solta; const anterior = this.cauda; this.cauda = new Promise(r => { solta = r; }); return anterior.then(() => solta); } }
const mutex = new Mutex();

/* ---------- adaptação do SQL ---------- */
const LIT = /('(?:[^']|'')*')/;
const cacheSql = new Map();
function adaptar(sql) {   // devolve { texto, nomes[] } — nomes é a ordem dos parâmetros nomeados (ou null se posicional)
  let c = cacheSql.get(sql); if (c) return c;
  const nomes = [], idx = new Map(); let pos = 0, usaNome = false;
  const texto = sql.split(LIT).map((seg, i) => {
    if (i % 2) return seg;   // texto literal entre aspas simples: não mexe
    seg = seg.replace(/@([A-Za-z_]\w*)/g, (_, n) => { usaNome = true; if (!idx.has(n)) { nomes.push(n); idx.set(n, nomes.length); } return '$' + idx.get(n); });
    seg = seg.replace(/\?/g, () => '$' + (++pos));
    seg = seg.replace(/\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g, '"$1"');
    return seg.replace(/\bLIKE\b/g, 'ILIKE');
  }).join('');
  c = { texto, nomes: usaNome ? nomes : null }; if (cacheSql.size > 2000) cacheSql.clear(); cacheSql.set(sql, c); return c;
}
function valores(a, params) {
  if (a.nomes) { const o = params[0] || {}; return a.nomes.map(n => (o[n] === undefined ? null : o[n])); }
  return params.map(x => (x === undefined ? null : x));
}

/* ---------- drivers ---------- */
async function abrirPg(url, schema, descartar) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, v => Number(v)); types.setTypeParser(1700, v => Number(v));
  const base = { connectionString: url, max: cfg.pgPool, ssl: cfg.pgSsl ? { rejectUnauthorized: false } : undefined };
  if (schema) { const admin = new Pool(Object.assign({}, base, { max: 1 })); await admin.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`); await admin.end(); base.options = `-c search_path="${schema}",public`; }
  const pool = new Pool(base); pool.on('error', e => require('./log').error('erro no pool do banco', { erro: e.message }));
  await pool.query('SELECT 1');
  return { kind: 'pg', pool, query: (t, v) => pool.query(t, v), exec: t => pool.query(t), fechar: async () => { if (schema && descartar) { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } catch (_) { /* melhor esforço */ } } await pool.end(); } };
}
async function abrirLite(dir) {
  let PGlite; try { ({ PGlite } = require('@electric-sql/pglite')); } catch (e) { throw new Error('Defina DATABASE_URL (PostgreSQL). O Postgres embutido (PGlite) só existe nas dependências de desenvolvimento.'); }
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir || undefined, { parsers: { 20: v => Number(v), 1700: v => Number(v) } }); await db.waitReady;
  // o PGlite devolve numeric como texto: converte para número (o `pg` faz isso pelo parser de tipos)
  const norm = r => { const num = (r.fields || []).filter(f => f.dataTypeID === 1700).map(f => f.name); if (num.length) for (const row of r.rows) for (const n of num) if (row[n] != null) row[n] = Number(row[n]); return { rows: r.rows, rowCount: r.affectedRows != null ? r.affectedRows : (r.rows ? r.rows.length : 0) }; };
  return { kind: 'pglite', query: async (t, v) => norm(await db.query(t, v)), exec: async t => { await db.exec(t); }, fechar: () => db.close() };
}
async function open(opt = {}) {
  if (driver) return;
  const url = opt.url || (opt.memoria ? '' : cfg.databaseUrl);
  if (url) driver = await abrirPg(url, opt.schema || cfg.pgSchema, !!opt.descartar);
  else driver = await abrirLite(opt.memoria ? null : path.join(cfg.dataDir, 'pgdata'));
  await migrate();
}
async function migrate() {
  await exec('CREATE TABLE IF NOT EXISTS schemaMigrations (nome TEXT PRIMARY KEY, aplicadaEm TEXT NOT NULL)');
  const dir = path.join(__dirname, 'migrations');
  const feitas = new Set((await q.all('SELECT nome FROM schemaMigrations')).map(r => r.nome));
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    if (feitas.has(f)) continue;
    try { await tx(async () => { await exec(fs.readFileSync(path.join(dir, f), 'utf8')); await q.run('INSERT INTO schemaMigrations (nome, aplicadaEm) VALUES (?, ?)', f, nowIso()); }); }
    catch (e) { throw new Error('Migração ' + f + ' falhou: ' + e.message); }
  }
}

/* ---------- consultas ---------- */
const guarda = () => { if (!driver) throw new Error('Banco não aberto'); return driver; };
/** SQL cru (várias instruções, sem parâmetros), respeitando a transação em curso. */
async function exec(sql) {
  const a = adaptar(sql), st = als.getStore(); guarda();
  if (st) return st.exec(a.texto);
  if (driver.kind === 'pg') return driver.exec(a.texto);
  const solta = await mutex.acquire(); try { return await driver.exec(a.texto); } finally { solta(); }
}
async function consulta(sql, params) {
  guarda(); const a = adaptar(sql), v = valores(a, params), st = als.getStore();
  if (st) return st.query(a.texto, v);
  if (driver.kind === 'pg') return driver.query(a.texto, v);
  const solta = await mutex.acquire(); try { return await driver.query(a.texto, v); } finally { solta(); }
}
const q = {
  all: async (sql, ...p) => (await consulta(sql, p)).rows,
  one: async (sql, ...p) => (await consulta(sql, p)).rows[0],
  run: async (sql, ...p) => ({ changes: (await consulta(sql, p)).rowCount || 0 }),
  val: async (sql, ...p) => { const r = (await consulta(sql, p)).rows[0]; return r ? Object.values(r)[0] : null; },
};
/** Transação com aninhamento (savepoints). Qualquer exceção desfaz tudo. Uma transação de escrita por vez. */
async function tx(fn) {
  const aninhada = als.getStore();
  if (aninhada) {
    const sp = 'sp' + (++aninhada.depth);
    await aninhada.query('SAVEPOINT ' + sp);
    try { const r = await fn(); await aninhada.query('RELEASE ' + sp); return r; } catch (e) { await aninhada.query('ROLLBACK TO ' + sp); await aninhada.query('RELEASE ' + sp); throw e; } finally { aninhada.depth--; }
  }
  guarda(); const solta = await mutex.acquire(); let client = null;
  try {
    client = driver.kind === 'pg' ? await driver.pool.connect() : null;
    const query = client ? (t, v) => client.query(t, v) : (t, v) => driver.query(t, v);
    await query('BEGIN'); if (client) await query('SELECT pg_advisory_xact_lock(727001)');
    try { const r = await als.run({ query, exec: client ? t => client.query(t) : t => driver.exec(t), depth: 0 }, fn); await query('COMMIT'); return r; }
    catch (e) { try { await query('ROLLBACK'); } catch (_) { /* já desfeito */ } throw e; }
  } finally { if (client) client.release(); solta(); }
}
const bump = () => { version++; };
const dataVersion = () => bootId + '-' + version;
// resultado em cache enquanto nada foi gravado (versão do dado) e a hora não virou; zera sozinho a cada gravação
const caches = new Map();
async function memo(chave, fn) { const v = bootId + version + ':' + new Date().toISOString().slice(0, 13); const c = caches.get(chave); if (c && c.v === v) return c.r; const r = await fn(); if (caches.size > 200) caches.clear(); if (v === bootId + version + ':' + new Date().toISOString().slice(0, 13)) caches.set(chave, { v, r }); return r; }
async function close() { if (driver) { const d = driver; driver = null; cacheSql.clear(); caches.clear(); await d.fechar(); } }
const aberto = () => !!driver;
module.exports = { open, tx, q, exec, bump, dataVersion, close, memo, aberto, adaptar };
