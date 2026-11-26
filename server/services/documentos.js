'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');

const ENTIDADES_OK = ['obras', 'empreendimentos', 'contratos', 'fornecedores', 'funcionarios', 'clientes', 'diario', 'contas'];
const TIPOS = ['Alvará', 'ART/RRT', 'Projeto', 'Contrato', 'Nota fiscal', 'Foto', 'Laudo', 'Certidão', 'Outro'];
// tipo -> assinatura (primeiros bytes). SVG e HTML ficam de fora de propósito (poderiam executar script).
const ASSINATURAS = { 'application/pdf': [[0x25, 0x50, 0x44, 0x46]], 'image/png': [[0x89, 0x50, 0x4e, 0x47]], 'image/jpeg': [[0xff, 0xd8, 0xff]], 'image/webp': [[0x52, 0x49, 0x46, 0x46]], 'image/gif': [[0x47, 0x49, 0x46, 0x38]] };
const LIVRES = ['text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const dir = () => { const d = path.join(cfg.dataDir, 'uploads'); fs.mkdirSync(d, { recursive: true }); return d; };
const limpaNome = n => String(n || 'arquivo').replace(/[\r\n"\\/:*?<>|]+/g, '_').trim().slice(0, 120) || 'arquivo';

async function enviar(ctx, query, buf, mimeHeader) {
  const erros = {}, entidade = query.entidade, entidadeId = query.entidadeId, mime = String(mimeHeader || '').split(';')[0].trim().toLowerCase();
  if (!ENTIDADES_OK.includes(entidade)) erros.entidade = 'Tipo de registro inválido.';
  else if (!await q.one(`SELECT 1 FROM ${entidade} WHERE id = ?`, entidadeId)) erros.entidadeId = 'Registro não encontrado.';
  if (!buf || !buf.length) erros.arquivo = 'Arquivo vazio.';
  if (!ASSINATURAS[mime] && !LIVRES.includes(mime)) erros.arquivo = 'Tipo de arquivo não permitido. Use PDF, imagem (PNG/JPG/WebP/GIF), Word, Excel, CSV ou texto.';
  else if (ASSINATURAS[mime] && buf && !ASSINATURAS[mime].some(sig => sig.every((b, i) => buf[i] === b))) erros.arquivo = 'O conteúdo não corresponde ao tipo informado.';
  const tipo = TIPOS.includes(query.tipo) ? query.tipo : 'Outro'; if (query.tipo && !TIPOS.includes(query.tipo)) erros.tipo = 'Tipo de documento inválido.';
  if (query.validade && !U.isDate(query.validade)) erros.validade = 'Data inválida.';
  if (Object.keys(erros).length) throw U.invalid(erros);
  return tx(async () => {
    const id = U.newId('doc'), arquivo = id, sha = crypto.createHash('sha256').update(buf).digest('hex');
    fs.writeFileSync(path.join(dir(), arquivo), buf, { flag: 'wx' });
    try {
      await q.run('INSERT INTO documentos (id, entidade, entidadeId, nome, tipo, validade, mime, tamanho, arquivo, sha256, criadoEm, criadoPor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, entidade, entidadeId, limpaNome(query.nome), tipo, query.validade || null, mime, buf.length, arquivo, sha, U.nowIso(), ctx.user.id);
      await audit(ctx, 'anexar', 'documentos', id, `Documento anexado em ${entidade}: ${limpaNome(query.nome)}`);
    } catch (e) { fs.rmSync(path.join(dir(), arquivo), { force: true }); throw e; }
    return id;
  });
}
const api = r => ({ id: r.id, entidade: r.entidade, entidadeId: r.entidadeId, nome: r.nome, tipo: r.tipo, validade: r.validade, mime: r.mime, tamanho: r.tamanho, criadoEm: r.criadoEm, por: r.por });
async function listar(query) {
  const w = [], p = {}; if (query.entidade) { w.push('d.entidade = @e'); p.e = query.entidade; } if (query.entidadeId) { w.push('d.entidadeId = @i'); p.i = query.entidadeId; } if (query.tipo) { w.push('d.tipo = @t'); p.t = query.tipo; }
  if (query.busca) { w.push("d.nome LIKE @b ESCAPE '\\'"); p.b = '%' + String(query.busca).replace(/[%_\\]/g, x => '\\' + x) + '%'; } if (query.vencendo === '1') { w.push('d.validade IS NOT NULL AND d.validade <= @v'); p.v = U.addDays(U.hoje(), 30); }
  const ws = w.length ? 'WHERE ' + w.join(' AND ') : '', tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const total = await q.val(`SELECT COUNT(*) FROM documentos d ${ws}`, ...(ws ? [p] : []));
  const rows = await q.all(`SELECT d.*, u.nome por FROM documentos d LEFT JOIN users u ON u.id = d.criadoPor ${ws} ORDER BY d.criadoEm DESC LIMIT @lim OFFSET @off`, Object.assign({}, p, { lim: tam, off: (pag - 1) * tam }));
  return { total, pagina: pag, tamanho: tam, itens: rows.map(api) };
}
async function baixar(id) {
  const d = await q.one('SELECT * FROM documentos WHERE id = ?', id); if (!d) throw U.notFound('Documento não encontrado.');
  let buf; try { buf = fs.readFileSync(path.join(dir(), d.arquivo)); } catch (_) { throw U.notFound('O arquivo não está mais no servidor.'); }
  if (crypto.createHash('sha256').update(buf).digest('hex') !== d.sha256) throw U.conflict('O arquivo está corrompido (a verificação de integridade falhou).');
  return { __raw: true, status: 200, body: buf, headers: { 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.nome)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } };
}
async function excluir(ctx, id) {
  return tx(async () => { const d = await q.one('SELECT * FROM documentos WHERE id = ?', id); if (!d) throw U.notFound('Documento não encontrado.'); await q.run('DELETE FROM documentos WHERE id = ?', id); fs.rmSync(path.join(dir(), d.arquivo), { force: true }); await audit(ctx, 'excluir', 'documentos', id, `Documento excluído: ${d.nome}`); });
}
module.exports = { enviar, listar, baixar, excluir, TIPOS, ENTIDADES_OK };
