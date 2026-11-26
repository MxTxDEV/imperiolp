'use strict';
const crypto = require('crypto');
const cfg = require('./config');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);
const conflict = (msg, extra) => new HttpError(409, msg, extra);
const forbidden = (msg = 'Sem permissão para esta ação.') => new HttpError(403, msg);
const notFound = (msg = 'Registro não encontrado.') => new HttpError(404, msg);
/** erros por campo: { campo: 'mensagem' } → HTTP 422 */
const invalid = (erros, msg = 'Há campos inválidos.') => new HttpError(422, msg, { erros });

const newId = prefix => prefix + '_' + crypto.randomBytes(6).toString('hex');
const nowIso = () => new Date().toISOString();
/** "hoje" no fuso da empresa (e não em UTC): corrige a data errada depois das 21h em Brasília. */
function hoje(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // AAAA-MM-DD
}
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
function addDays(s, n) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function addMonths(s, n) { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1, 12)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); }
const diffDays = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);

/* dinheiro: API fala em reais (número com 2 casas); banco guarda centavos inteiros */
const toC = v => Math.round(Number(v) * 100);
const fromC = c => (c == null ? null : Math.round(c) / 100);
const isMoney = v => typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e11 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const round3 = n => Math.round(n * 1000) / 1000;

/* validadores */
function onlyDigits(s) { return String(s || '').replace(/\D+/g, ''); }
function cpfOk(s) {
  const d = onlyDigits(s); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = n => { let t = 0; for (let i = 0; i < n; i++) t += +d[i] * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}
function cnpjOk(s) {
  const d = onlyDigits(s); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let t = 0; for (let i = 0; i < n; i++) t += +d[i] * w[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +d[12] && dv(13) === +d[13];
}
const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 160;
const phoneOk = s => { const d = onlyDigits(s); return d.length === 10 || d.length === 11 || (d.length >= 12 && d.length <= 13 && d.startsWith('55')); };
const cepOk = s => onlyDigits(s).length === 8;

module.exports = { HttpError, bad, conflict, forbidden, notFound, invalid, newId, nowIso, hoje, isDate, addDays, addMonths, diffDays, toC, fromC, isMoney, round3, onlyDigits, cpfOk, cnpjOk, emailOk, phoneOk, cepOk };
