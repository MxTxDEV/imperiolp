'use strict';
const { q, bump } = require('./db');
const { nowIso } = require('./util');
/** Registra quem fez o quê. Chamado dentro da mesma transação da alteração. */
function audit(ctx, acao, entidade, entidadeId, resumo, antes, depois) {
  const cortar = v => (v == null ? null : JSON.stringify(v).slice(0, 6000));
  q.run('INSERT INTO auditLog (ts, userId, userNome, acao, entidade, entidadeId, resumo, antes, depois) VALUES (?,?,?,?,?,?,?,?,?)',
    nowIso(), ctx && ctx.user ? ctx.user.id : null, ctx && ctx.user ? ctx.user.nome : 'sistema', acao, entidade, entidadeId || null, resumo || '', cortar(antes), cortar(depois));
  bump();
}
module.exports = { audit };
