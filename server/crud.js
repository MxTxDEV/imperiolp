'use strict';
const { q, tx } = require('./db');
const { audit } = require('./audit');
const { can } = require('./perms');
const U = require('./util');

const TIPOS_NULOS = new Set(['ref', 'date', 'cpfcnpj', 'cpf']);
const col = (k, d) => (d.t === 'money' ? k + 'C' : k);

/** Valida e normaliza UM valor de entrada. Retorna [valor, erro]. */
async function normalizar(k, d, v, atual) {
  const vazio = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  if (vazio) {
    if (d.obrig) return [null, 'Campo obrigatório.'];
    return [TIPOS_NULOS.has(d.t) ? null : (d.t === 'int' || d.t === 'num' || d.t === 'money' ? (d.padrao ?? 0) : (d.t === 'bool' ? 0 : '')), null];
  }
  switch (d.t) {
    case 'text': case 'textarea': { const s = String(v).trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); if (s.length > (d.max || 200)) return [null, `Máximo de ${d.max || 200} caracteres.`]; if (d.min && s.length < d.min) return [null, `Mínimo de ${d.min} caracteres.`]; return [s, null]; }
    case 'email': { const s = String(v).trim().toLowerCase(); return emailOkOrErr(s); }
    case 'phone': { const s = String(v).trim(); if (!U.phoneOk(s)) return [null, 'Telefone inválido. Use DDD + número.']; return [U.onlyDigits(s), null]; }
    case 'cep': { const s = String(v).trim(); if (!U.cepOk(s)) return [null, 'CEP deve ter 8 dígitos.']; return [U.onlyDigits(s), null]; }
    case 'cpf': { if (!U.cpfOk(v)) return [null, 'CPF inválido.']; return [U.onlyDigits(v), null]; }
    case 'cpfcnpj': { const dg = U.onlyDigits(v); if (dg.length === 11 ? !U.cpfOk(dg) : dg.length === 14 ? !U.cnpjOk(dg) : true) return [null, 'CPF ou CNPJ inválido.']; return [dg, null]; }
    case 'uf': { const s = String(v).trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(s)) return [null, 'UF inválida.']; return [s, null]; }
    case 'int': { const n = Number(v); if (!Number.isInteger(n)) return [null, 'Informe um número inteiro.']; if (n < (d.min ?? 0)) return [null, `Mínimo ${d.min ?? 0}.`]; if (n > (d.max ?? 1e9)) return [null, `Máximo ${d.max ?? 1e9}.`]; return [n, null]; }
    case 'num': { const n = Number(v); if (!isFinite(n)) return [null, 'Número inválido.']; if (n < (d.min ?? 0)) return [null, `Mínimo ${d.min ?? 0}.`]; if (n > (d.max ?? 1e9)) return [null, `Máximo ${d.max ?? 1e9}.`]; return [U.round3(n), null]; }
    case 'money': { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v; if (!U.isMoney(n)) return [null, 'Valor inválido (máximo 2 casas decimais).']; if (n < 0) return [null, 'O valor não pode ser negativo.']; return [U.toC(n), null]; }
    case 'date': { if (!U.isDate(v)) return [null, 'Data inválida.']; return [v, null]; }
    case 'bool': return [v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0, null];
    case 'enum': { if (!d.opcoes.includes(v)) return [null, 'Opção inválida.']; return [v, null]; }
    case 'ref': { const s = String(v); const r = await q.one(`SELECT * FROM ${d.ref} WHERE id = ?`, s); if (!r) return [null, 'Registro não encontrado.']; if ('ativo' in r && !r.ativo && s !== atual) return [null, 'Este registro está arquivado.']; return [s, null]; }
    default: return [v, null];
  }
}
const emailOkOrErr = s => (U.emailOk(s) ? [s, null] : [null, 'E-mail inválido.']);

/** Converte linha do banco para o formato da API. */
function paraApi(def, r, user) {
  if (!r) return null;
  const o = { id: r.id };
  for (const [k, d] of Object.entries(def.campos)) {
    if (d.virtual) continue;
    let v = r[col(k, d)];
    if (d.t === 'money') v = U.fromC(v); else if (d.t === 'bool') v = !!v;
    if (d.perm && !can(user, d.perm)) v = d.t === 'money' ? 0 : null;
    o[k] = v === undefined ? null : v;
  }
  if ('ativo' in r) o.ativo = !!r.ativo;
  o.versao = r.versao; o.atualizadoEm = r.atualizadoEm; o.criadoEm = r.criadoEm;
  return o;
}
async function lerRegra(def, id) { return await q.one(`SELECT * FROM ${def.tabela} WHERE id = ?`, id); }
async function vinculos(def, id) {
  const out = [];
  for (const [tabela, coluna, rotulo, extra] of def.vinculos || []) {
    const n = await q.val(`SELECT COUNT(*) FROM ${tabela} WHERE ${coluna} = ?${extra ? ' AND ' + extra : ''}`, id);
    if (n > 0) out.push({ rotulo, total: n });
  }
  const docs = await q.val("SELECT COUNT(*) FROM documentos WHERE entidade = ? AND entidadeId = ?", def.nome, id); if (docs) out.push({ rotulo: 'Documentos anexados', total: docs });
  return out;
}
async function montarDados(def, corpo, atual, ctx, criando) {
  const dados = {}, erros = {};
  for (const [k, d] of Object.entries(def.campos)) {
    if (d.readonly || (d.virtual && !criando) || (d.criarSo && !criando)) continue;
    if (!(k in corpo)) { if (criando && d.obrig && d.padrao === undefined) erros[k] = 'Campo obrigatório.'; else if (criando && d.padrao !== undefined) dados[d.virtual ? k : col(k, d)] = d.t === 'money' ? U.toC(d.padrao) : d.padrao; continue; }
    if (d.perm && !can(ctx.user, d.perm)) { erros[k] = 'Sem permissão para alterar este campo.'; continue; }
    const [v, e] = await normalizar(k, d, corpo[k], atual ? atual[col(k, d)] : null); if (e) erros[k] = e; else dados[d.virtual ? k : col(k, d)] = v;
  }
  return { dados, erros };
}
async function criar(def, corpo, ctx) {
  return tx(async () => {
    const { dados, erros } = await montarDados(def, corpo, null, ctx, true);
    if (def.validar) Object.assign(erros, (await def.validar(dados, null, ctx)) || {});
    if (Object.keys(erros).length) throw U.invalid(erros);
    const virtuais = {}; for (const [k, d] of Object.entries(def.campos)) if (d.virtual && k in dados) { virtuais[k] = dados[k]; delete dados[k]; }
    const id = U.newId(def.prefixo), agora = U.nowIso();
    const cols = Object.keys(dados);
    await q.run(`INSERT INTO ${def.tabela} (id, ${cols.join(', ')}${def.arquivavel ? ', ativo' : ''}, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?, ${cols.map(() => '?').join(', ')}${def.arquivavel ? ', 1' : ''}, 1, ?, ?, ?, ?)`,
      id, ...cols.map(c => dados[c]), agora, agora, ctx.user.id, ctx.user.id);
    if (def.depois) await def.depois(id, null, dados, virtuais, ctx);
    const novo = await lerRegra(def, id);
    await audit(ctx, 'criar', def.nome, id, `${def.rotulo} criado: ${novo[def.titulo] ?? id}`, null, paraApi(def, novo, ctx.user));
    return id;
  });
}
async function atualizar(def, id, corpo, ctx) {
  return tx(async () => {
    const atual = await lerRegra(def, id); if (!atual) throw U.notFound();
    if (corpo.versao == null) throw U.bad('Informe a versão do registro para salvar.');
    if (+corpo.versao !== atual.versao) throw U.conflict(`Este registro foi alterado por outra pessoa${atual.atualizadoPor ? '' : ''} (versão ${atual.versao}). Recarregue e refaça a alteração.`, { versaoAtual: atual.versao });
    const { dados, erros } = await montarDados(def, corpo, atual, ctx, false);
    if (def.validar) Object.assign(erros, (await def.validar(dados, atual, ctx)) || {});
    if (Object.keys(erros).length) throw U.invalid(erros);
    const antes = paraApi(def, atual, ctx.user), cols = Object.keys(dados);
    if (cols.length) {
      const r = await q.run(`UPDATE ${def.tabela} SET ${cols.map(c => c + ' = ?').join(', ')}, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ? AND versao = ?`, ...cols.map(c => dados[c]), U.nowIso(), ctx.user.id, id, atual.versao);
      if (!r.changes) throw U.conflict('Registro alterado por outra pessoa. Recarregue.');
    }
    if (def.depois) await def.depois(id, atual, dados, {}, ctx);
    await audit(ctx, 'editar', def.nome, id, `${def.rotulo} alterado: ${atual[def.titulo] ?? id}`, antes, paraApi(def, await lerRegra(def, id), ctx.user));
  });
}
async function arquivar(def, id, ctx, restaurar) {
  return tx(async () => {
    const atual = await lerRegra(def, id); if (!atual) throw U.notFound(); if (!def.arquivavel) throw U.bad('Este cadastro não pode ser arquivado.');
    if (!restaurar && def.podeArquivar) { const m = await def.podeArquivar(atual); if (m) throw U.conflict(m); }
    await q.run(`UPDATE ${def.tabela} SET ativo = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?`, restaurar ? 1 : 0, U.nowIso(), ctx.user.id, id);
    await audit(ctx, restaurar ? 'restaurar' : 'arquivar', def.nome, id, `${def.rotulo} ${restaurar ? 'restaurado' : 'arquivado'}: ${atual[def.titulo] ?? id}`);
  });
}
async function excluir(def, id, ctx) {
  return tx(async () => {
    const atual = await lerRegra(def, id); if (!atual) throw U.notFound();
    const v = await vinculos(def, id);
    if (v.length) throw U.conflict(`Não é possível excluir: há registros ligados (${v.map(x => `${x.total} ${x.rotulo.toLowerCase()}`).join(', ')}).` + (def.arquivavel ? ' Arquive em vez de excluir.' : ''), { vinculos: v, podeArquivar: !!def.arquivavel });
    if (def.aoExcluir) await def.aoExcluir(atual, ctx);
    await q.run(`DELETE FROM ${def.tabela} WHERE id = ?`, id);
    await audit(ctx, 'excluir', def.nome, id, `${def.rotulo} excluído: ${atual[def.titulo] ?? id}`, paraApi(def, atual, ctx.user));
  });
}
/** Listagem paginada no servidor, com busca e filtros. */
async function listar(def, query, user, semPaginar) {
  const where = [], params = [];
  const arq = query.arquivados || '0';
  if (def.arquivavel) { if (arq === '0') where.push('t.ativo = 1'); else if (arq === '1') where.push('t.ativo = 0'); }
  const busca = String(query.busca || '').trim();
  if (busca) { const like = '%' + busca.replace(/[%_\\]/g, m => '\\' + m) + '%'; where.push('(' + def.lista.busca.map(c => `t.${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')'); def.lista.busca.forEach(() => params.push(like)); }
  for (const [k, d] of Object.entries(def.campos)) {
    if (query[k] !== undefined && query[k] !== '' && ['enum', 'ref', 'bool'].includes(d.t)) { where.push(`t.${col(k, d)} = ?`); params.push(d.t === 'bool' ? (query[k] === 'true' || query[k] === '1' ? 1 : 0) : query[k]); }
    if (d.t === 'date') { if (U.isDate(query[k + '_de'])) { where.push(`t.${k} >= ?`); params.push(query[k + '_de']); } if (U.isDate(query[k + '_ate'])) { where.push(`t.${k} <= ?`); params.push(query[k + '_ate']); } }
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const permitidos = Object.entries(def.campos).filter(([, d]) => !d.virtual).map(([k, d]) => col(k, d)).concat(['criadoEm', 'atualizadoEm']);
  const ordemCol = permitidos.includes(query.ordem) || permitidos.includes(String(query.ordem || '') + 'C') ? (permitidos.includes(query.ordem) ? query.ordem : query.ordem + 'C') : (def.lista.ordem || 'nome');
  const dDef = Object.entries(def.campos).find(([k, d]) => col(k, d) === ordemCol), numerica = dDef && ['int', 'num', 'money', 'bool'].includes(dDef[1].t);
  const ordenaPor = numerica || ordemCol === 'criadoEm' || ordemCol === 'atualizadoEm' ? `t.${ordemCol}` : `lower(t.${ordemCol}::text)`;
  const dir = String(query.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const total = await q.val(`SELECT COUNT(*) FROM ${def.tabela} t ${w}`, ...params);
  const tam = semPaginar ? 100000 : Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const rows = await q.all(`SELECT t.* FROM ${def.tabela} t ${w} ORDER BY ${ordenaPor} ${dir}, t.id LIMIT ? OFFSET ?`, ...params, tam, (pag - 1) * tam);
  let itens = rows.map(r => paraApi(def, r, user));
  if (def.decorar) itens = await def.decorar(itens, user);
  return { itens, total, pagina: pag, tamanho: tam };
}
const ptNum = n => (n == null ? '' : String(n).replace('.', ','));
const seguroCsv = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
async function csv(def, query, user) {
  const { itens } = await listar(def, Object.assign({}, query), user, true);
  const cols = (def.lista.csv || def.lista.cols);
  const nomeDe = async (d, v) => { if (v == null || v === '') return ''; if (d.t === 'ref') { const r = await q.one(`SELECT * FROM ${d.ref} WHERE id = ?`, v); return r ? (r.nome ?? r.titulo ?? r.codigo ?? v) : v; } if (d.t === 'bool') return v ? 'Sim' : 'Não'; if (d.t === 'money') return ptNum(v.toFixed ? v.toFixed(2) : v); if (d.t === 'num') return ptNum(v); return v; };
  const linhas = [cols.map(c => seguroCsv(def.campos[c].label || c)).join(';')];
  for (const it of itens) { const cel = []; for (const c of cols) cel.push(seguroCsv(await nomeDe(def.campos[c], it[c]))); linhas.push(cel.join(';')); }
  return '﻿' + linhas.join('\r\n') + '\r\n';
}
module.exports = { criar, atualizar, arquivar, excluir, listar, csv, vinculos, paraApi, lerRegra, normalizar };
