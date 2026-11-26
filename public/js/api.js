/* Camada de acesso à API do servidor. Tudo que muda dado passa por aqui (e é validado no servidor). */
(function () {
'use strict';
class ApiError extends Error {
  constructor(status, data) { super((data && data.erro) || 'Erro de comunicação com o servidor.'); this.status = status; this.data = data || {}; this.erros = this.data.erros || {}; }
}
async function req(method, path, body, opts) {
  opts = opts || {};
  const h = { 'X-Requested-With': 'imperio' }; let corpo;
  if (body instanceof Blob || body instanceof ArrayBuffer) { corpo = body; if (opts.tipo) h['Content-Type'] = opts.tipo; }
  else if (body !== undefined) { corpo = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch(path, { method, headers: h, body: corpo, credentials: 'same-origin' }); }
  catch (e) { throw new ApiError(0, { erro: 'Sem conexão com o servidor. Verifique se ele está ligado e tente de novo.' }); }
  if (opts.blob && r.ok) return r.blob();
  let data = null; try { data = await r.json(); } catch (e) { data = null; }
  if (!r.ok) { if (r.status === 401 && !opts.silencioso && window.APP && APP.aoSairDaSessao) APP.aoSairDaSessao(); throw new ApiError(r.status, data); }
  return data;
}
const qs = o => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };
async function baixar(path, nome) {
  const b = await req('GET', path, undefined, { blob: true }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
window.API = { get: (p, q) => req('GET', p + qs(q)), post: (p, b) => req('POST', p, b === undefined ? {} : b), put: (p, b) => req('PUT', p, b), del: p => req('DELETE', p), upload: (p, q, blob, tipo) => req('POST', p + qs(q), blob, { tipo }), baixar, qs, ApiError, silencioso: (m, p, b) => req(m, p, b, { silencioso: true }) };
})();
