'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');
const { nowIso } = require('./util');

let db = null, depth = 0, version = 0;
const bootId = Math.random().toString(36).slice(2, 8);

function open(file) {
  if (db) return db;
  const f = file || path.join(cfg.dataDir, 'imperio.db');
  if (f !== ':memory:') fs.mkdirSync(path.dirname(f), { recursive: true });
  db = new DatabaseSync(f);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate();
  return db;
}
function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schemaMigrations (nome TEXT PRIMARY KEY, aplicadaEm TEXT NOT NULL)');
  const dir = path.join(__dirname, 'migrations');
  const done = new Set(db.prepare('SELECT nome FROM schemaMigrations').all().map(r => r.nome));
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.exec('BEGIN');
    try { db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); db.prepare('INSERT INTO schemaMigrations (nome, aplicadaEm) VALUES (?, ?)').run(f, nowIso()); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw new Error('Migração ' + f + ' falhou: ' + e.message); }
  }
}
const get = () => { if (!db) throw new Error('Banco não aberto'); return db; };
/** Transação com aninhamento (savepoints). Qualquer exceção desfaz tudo. */
function tx(fn) {
  const d = get();
  if (depth === 0) {
    d.exec('BEGIN IMMEDIATE'); depth++;
    try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { try { d.exec('ROLLBACK'); } catch (_) { /* já desfeito */ } throw e; } finally { depth--; }
  }
  const sp = 'sp' + depth; d.exec('SAVEPOINT ' + sp); depth++;
  try { const r = fn(); d.exec('RELEASE ' + sp); return r; } catch (e) { d.exec('ROLLBACK TO ' + sp); d.exec('RELEASE ' + sp); throw e; } finally { depth--; }
}
// parâmetros nomeados: só repassa os que aparecem no SQL (o node:sqlite recusa os sobrando)
const ajusta = (sql, p) => {
  p = p.map(x => (x === undefined ? null : x));
  if (p.length === 1 && p[0] && typeof p[0] === 'object' && !Array.isArray(p[0]) && !(p[0] instanceof Uint8Array)) {
    const usados = new Set([...sql.matchAll(/@(\w+)/g)].map(m => m[1])); const o = {}; for (const k of usados) if (k in p[0]) o[k] = p[0][k] === undefined ? null : p[0][k]; return [o];
  }
  return p;
};
const q = {
  all: (sql, ...p) => get().prepare(sql).all(...ajusta(sql, p)),
  one: (sql, ...p) => get().prepare(sql).get(...ajusta(sql, p)),
  run: (sql, ...p) => get().prepare(sql).run(...ajusta(sql, p)),
  val: (sql, ...p) => { const r = get().prepare(sql).get(...ajusta(sql, p)); return r ? Object.values(r)[0] : null; },
};
const bump = () => { version++; };
const dataVersion = () => bootId + '-' + version;
function close() { if (db) { db.close(); db = null; depth = 0; } }
module.exports = { open, get, tx, q, bump, dataVersion, close };
