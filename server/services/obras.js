'use strict';
// Obras e passos. Status, avanço e custo da obra são SEMPRE derivados (nunca digitados):
//  - status: Pausada (marcada) | Planejamento (nenhum passo iniciado) | Em andamento | Concluída (todos os passos concluídos)
//  - avanço: soma dos pesos dos passos concluídos ÷ soma dos pesos
//  - custo:  material consumido (saídas, ao custo médio da época) + títulos a pagar de categorias que "entram no custo da obra"
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');
const estoque = require('./estoque');

const FASES = ['', 'terra', 'fundacao', 'placas', 'telhado'];
const MODELO_PADRAO = ['Serviços preliminares e canteiro', 'Fundação', 'Estrutura (pilares, vigas e lajes)', 'Alvenaria e vedação', 'Instalações hidráulicas e elétricas', 'Cobertura e impermeabilização', 'Revestimentos e pisos', 'Pintura e acabamento final', 'Vistoria, limpeza e entrega'].map(n => [n, '']);
const MODELO_PLACAS = [['Terraplanagem', 'terra'], ['Fundação', 'fundacao'], ['Levantamento das placas', 'placas'], ['Telhado', 'telhado']];
const inList = ids => ids.map(() => '?').join(',');

function statusCalc(pausada, passos) {
  if (pausada) return 'Pausada'; if (!passos.length) return 'Planejamento';
  if (passos.every(p => p.status === 'Concluído')) return 'Concluída';
  return passos.some(p => p.status !== 'Pendente' || p.pct > 0) ? 'Em andamento' : 'Planejamento';
}
const progCalc = passos => { const t = passos.reduce((s, p) => s + p.peso, 0); return t ? Math.round(passos.filter(p => p.status === 'Concluído').reduce((s, p) => s + p.peso, 0) / t * 100) : 0; };
function statusDe(obraId) { const o = q.one('SELECT pausada FROM obras WHERE id = ?', obraId); return statusCalc(!!o.pausada, q.all('SELECT status, pct, peso FROM passos WHERE obraId = ?', obraId)); }

/** Métricas derivadas de várias obras de uma vez. */
function metricas(ids) {
  const out = new Map(); if (!ids.length) return out;
  const passos = q.all(`SELECT obraId, status, pct, peso FROM passos WHERE obraId IN (${inList(ids)})`, ...ids);
  const pausadas = new Map(q.all(`SELECT id, pausada FROM obras WHERE id IN (${inList(ids)})`, ...ids).map(r => [r.id, !!r.pausada]));
  const mat = new Map(q.all(`SELECT obraId, COALESCE(SUM(ROUND(qtd * custoUnitC)),0) v FROM movimentacoes WHERE tipo = 'Saída' AND estornada = 0 AND obraId IN (${inList(ids)}) GROUP BY obraId`, ...ids).map(r => [r.obraId, r.v]));
  const ctas = new Map(q.all(`SELECT c.obraId, COALESCE(SUM(c.valorC),0) v FROM contas c JOIN categoriasFin k ON k.id = c.catId WHERE c.tipo = 'Pagar' AND c.status = 'Aberta' AND k.apropriaObra = 1 AND c.obraId IN (${inList(ids)}) GROUP BY c.obraId`, ...ids).map(r => [r.obraId, r.v]));
  for (const id of ids) {
    const ps = passos.filter(p => p.obraId === id), cm = mat.get(id) || 0, cc = ctas.get(id) || 0;
    out.set(id, { status: statusCalc(pausadas.get(id), ps), prog: progCalc(ps), passosTotal: ps.length, passosConcluidos: ps.filter(p => p.status === 'Concluído').length, custoMaterial: U.fromC(cm), custoContas: U.fromC(cc), gasto: U.fromC(cm + cc) });
  }
  return out;
}
function decorarObras(itens) { const m = metricas(itens.map(o => o.id)); return itens.map(o => Object.assign(o, m.get(o.id))); }

function passosDeObras(ids) {
  if (!ids.length) return new Map();
  const rows = q.all(`SELECT * FROM passos WHERE obraId IN (${inList(ids)}) ORDER BY obraId, ordem`, ...ids);
  const mats = q.all(`SELECT pm.passoId, pm.matId, pm.qtd FROM passoMateriais pm JOIN passos p ON p.id = pm.passoId WHERE p.obraId IN (${inList(ids)})`, ...ids);
  const baixados = new Set(q.all(`SELECT DISTINCT passoId FROM movimentacoes WHERE tipo = 'Saída' AND estornada = 0 AND passoId IS NOT NULL AND obraId IN (${inList(ids)})`, ...ids).map(r => r.passoId));
  const realMat = new Map(q.all(`SELECT passoId, SUM(ROUND(qtd * custoUnitC)) v FROM movimentacoes WHERE tipo = 'Saída' AND estornada = 0 AND passoId IS NOT NULL AND obraId IN (${inList(ids)}) GROUP BY passoId`, ...ids).map(r => [r.passoId, r.v]));
  const realCt = new Map(q.all(`SELECT c.passoId, SUM(c.valorC) v FROM contas c JOIN categoriasFin k ON k.id = c.catId WHERE c.tipo = 'Pagar' AND c.status = 'Aberta' AND k.apropriaObra = 1 AND c.passoId IS NOT NULL GROUP BY c.passoId`).map(r => [r.passoId, r.v]));
  const custo = new Map(q.all('SELECT id, custoMedioC FROM materiais').map(r => [r.id, r.custoMedioC]));
  const out = new Map(ids.map(i => [i, []]));
  for (const p of rows) {
    const ms = mats.filter(m => m.passoId === p.id).map(m => ({ matId: m.matId, qtd: m.qtd })), prevMat = ms.reduce((s, m) => s + Math.round(m.qtd * (custo.get(m.matId) || 0)), 0);
    out.get(p.obraId).push({ id: p.id, obraId: p.obraId, ordem: p.ordem, nome: p.nome, fase: p.fase, ini: p.ini, fim: p.fim, peso: p.peso, status: p.status, pct: p.pct, dataConc: p.dataConc || '', extra: U.fromC(p.extraC), obs: p.obs, mats: ms, baixado: baixados.has(p.id),
      custoMateriais: U.fromC(prevMat), custoPrevisto: U.fromC(prevMat + p.extraC), realizado: U.fromC((realMat.get(p.id) || 0) + (realCt.get(p.id) || 0)), versao: p.versao });
  }
  return out;
}
const obraAtiva = id => { const o = q.one('SELECT * FROM obras WHERE id = ?', id); if (!o) throw U.notFound('Obra não encontrada.'); return o; };

function modeloPadrao(ctx, obraId, silencioso) {
  return tx(() => {
    const o = obraAtiva(obraId);
    if (q.val('SELECT COUNT(*) FROM passos WHERE obraId = ?', obraId)) throw U.conflict('Esta obra já tem passos.');
    const tpl = o.tipoObra === 'Placas' ? MODELO_PLACAS : MODELO_PADRAO, span = U.diffDays(o.previsao, o.inicio) + 1, step = Math.max(1, Math.floor(span / tpl.length));
    tpl.forEach(([nome, fase], i) => {
      const ini = U.addDays(o.inicio, i * step), fim = i === tpl.length - 1 ? o.previsao : U.addDays(o.inicio, (i + 1) * step - 1);
      q.run('INSERT INTO passos (id, obraId, ordem, nome, fase, ini, fim, peso, status, pct, extraC, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?,?,?,?,?,?,?,1,?,0,0,1,?,?,?,?)',
        U.newId('pas'), obraId, i + 1, nome, fase, ini <= fim ? ini : fim, fim, 'Pendente', U.nowIso(), U.nowIso(), ctx.user.id, ctx.user.id);
    });
    if (!silencioso) audit(ctx, 'criar', 'passos', obraId, `Modelo padrão de passos aplicado em ${o.nome}`);
  });
}
function lerPasso(id) { const p = q.one('SELECT * FROM passos WHERE id = ?', id); if (!p) throw U.notFound('Passo não encontrado.'); return p; }
function aplicarStatus(p, status, pct) {
  if (status === 'Concluído') return { status, pct: 100, dataConc: p.status === 'Concluído' && p.dataConc ? p.dataConc : U.hoje() };
  if (status === 'Pendente') return { status, pct: 0, dataConc: null };
  const v = Math.min(99, Math.max(0, Math.round(pct == null ? p.pct : pct))); return { status: 'Em andamento', pct: v, dataConc: null };
}
function validarMats(mats) {
  if (!Array.isArray(mats)) return {}; const erros = {}, vistos = new Set();
  mats.forEach(m => { const mt = q.one('SELECT ativo FROM materiais WHERE id = ?', m.matId); if (!mt || !mt.ativo) erros.mats = 'Há material inválido ou arquivado na lista.'; else if (vistos.has(m.matId)) erros.mats = 'O mesmo material aparece duas vezes.'; else if (!(Number(m.qtd) > 0) || Number(m.qtd) > 1e9) erros.mats = 'Quantidade de material inválida.'; vistos.add(m.matId); });
  return erros;
}
function validarPassoDados(d, o, parcial) {
  const erros = {};
  if (!parcial || 'nome' in d) { const n = String(d.nome || '').trim(); if (n.length < 2) erros.nome = 'Dê um nome ao passo.'; else if (n.length > 140) erros.nome = 'Nome longo demais.'; }
  if (!parcial || 'ini' in d) if (!U.isDate(d.ini)) erros.ini = 'Data inválida.'; if (!parcial || 'fim' in d) if (!U.isDate(d.fim)) erros.fim = 'Data inválida.';
  if (d.fase !== undefined && !FASES.includes(d.fase)) erros.fase = 'Etapa inválida.';
  if (d.peso !== undefined && !(Number.isInteger(Number(d.peso)) && d.peso >= 1 && d.peso <= 100)) erros.peso = 'Peso de 1 a 100.';
  if (d.extra !== undefined && !(U.isMoney(Number(d.extra)) && Number(d.extra) >= 0)) erros.extra = 'Valor inválido.';
  if (d.status !== undefined && !['Pendente', 'Em andamento', 'Concluído'].includes(d.status)) erros.status = 'Situação inválida.';
  if (d.pct !== undefined && !(Number(d.pct) >= 0 && Number(d.pct) <= 100)) erros.pct = 'Avanço de 0 a 100.';
  return erros;
}
function criarPasso(ctx, obraId, d) {
  return tx(() => {
    const o = obraAtiva(obraId); if (!o.ativo) throw U.conflict('Obra arquivada.');
    const erros = Object.assign(validarPassoDados(d, o, false), validarMats(d.mats)); if (U.isDate(d.ini) && U.isDate(d.fim) && d.fim < d.ini) erros.fim = 'O prazo não pode ser antes do início.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    const id = U.newId('pas'), ordem = (q.val('SELECT MAX(ordem) FROM passos WHERE obraId = ?', obraId) || 0) + 1, st = aplicarStatus({ status: 'Pendente', pct: 0 }, d.status || 'Pendente', d.pct);
    q.run('INSERT INTO passos (id, obraId, ordem, nome, fase, ini, fim, peso, status, pct, dataConc, extraC, obs, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
      id, obraId, ordem, String(d.nome).trim(), d.fase || '', d.ini, d.fim, Number(d.peso || 1), st.status, st.pct, st.dataConc, U.toC(d.extra || 0), String(d.obs || '').slice(0, 500), U.nowIso(), U.nowIso(), ctx.user.id, ctx.user.id);
    for (const m of d.mats || []) q.run('INSERT INTO passoMateriais (passoId, matId, qtd) VALUES (?,?,?)', id, m.matId, U.round3(Number(m.qtd)));
    audit(ctx, 'criar', 'passos', id, `Passo criado em ${o.nome}: ${d.nome}`); return id;
  });
}
const baixado = id => q.val("SELECT COUNT(*) FROM movimentacoes WHERE passoId = ? AND tipo = 'Saída' AND estornada = 0", id) > 0;
function atualizarPasso(ctx, id, d) {
  return tx(() => {
    const p = lerPasso(id); if (d.versao != null && +d.versao !== p.versao) throw U.conflict('Este passo foi alterado por outra pessoa. Recarregue.', { versaoAtual: p.versao });
    const erros = Object.assign(validarPassoDados(d, null, true), 'mats' in d ? validarMats(d.mats) : {});
    const ini = d.ini || p.ini, fim = d.fim || p.fim; if (fim < ini) erros.fim = 'O prazo não pode ser antes do início.';
    if ('mats' in d && baixado(id)) erros.mats = 'Os materiais deste passo já foram baixados. Estorne a baixa para alterá-los.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    const st = 'status' in d || 'pct' in d ? aplicarStatus(p, d.status || (d.pct != null ? (Number(d.pct) >= 100 ? 'Concluído' : Number(d.pct) > 0 ? 'Em andamento' : 'Pendente') : p.status), d.pct) : { status: p.status, pct: p.pct, dataConc: p.dataConc };
    q.run('UPDATE passos SET nome = ?, fase = ?, ini = ?, fim = ?, peso = ?, status = ?, pct = ?, dataConc = ?, extraC = ?, obs = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?',
      'nome' in d ? String(d.nome).trim() : p.nome, 'fase' in d ? d.fase : p.fase, ini, fim, 'peso' in d ? Number(d.peso) : p.peso, st.status, st.pct, st.dataConc, 'extra' in d ? U.toC(d.extra) : p.extraC, 'obs' in d ? String(d.obs || '').slice(0, 500) : p.obs, U.nowIso(), ctx.user.id, id);
    if ('mats' in d) { q.run('DELETE FROM passoMateriais WHERE passoId = ?', id); for (const m of d.mats) q.run('INSERT INTO passoMateriais (passoId, matId, qtd) VALUES (?,?,?)', id, m.matId, U.round3(Number(m.qtd))); }
    audit(ctx, 'editar', 'passos', id, `Passo alterado: ${p.nome}${st.status !== p.status ? ` (${p.status} → ${st.status})` : ''}`);
  });
}
function excluirPasso(ctx, id) {
  return tx(() => {
    const p = lerPasso(id), v = [];
    const nm = q.val('SELECT COUNT(*) FROM movimentacoes WHERE passoId = ?', id), nc = q.val('SELECT COUNT(*) FROM contas WHERE passoId = ?', id), nt = q.val('SELECT COUNT(*) FROM tarefas WHERE passoId = ?', id);
    if (nm) v.push({ rotulo: 'Movimentações de estoque', total: nm }); if (nc) v.push({ rotulo: 'Contas financeiras', total: nc }); if (nt) v.push({ rotulo: 'Tarefas', total: nt });
    if (v.length) throw U.conflict(`Não é possível excluir o passo: há registros ligados (${v.map(x => x.total + ' ' + x.rotulo.toLowerCase()).join(', ')}).`, { vinculos: v });
    q.run('DELETE FROM passos WHERE id = ?', id); q.run('UPDATE passos SET ordem = ordem - 1 WHERE obraId = ? AND ordem > ?', p.obraId, p.ordem);
    audit(ctx, 'excluir', 'passos', id, `Passo excluído: ${p.nome}`);
  });
}
function moverPasso(ctx, id, dir) {
  return tx(() => {
    const p = lerPasso(id), alvo = q.one('SELECT * FROM passos WHERE obraId = ? AND ordem = ?', p.obraId, p.ordem + (dir < 0 ? -1 : 1)); if (!alvo) return;
    q.run('UPDATE passos SET ordem = -1 WHERE id = ?', p.id); q.run('UPDATE passos SET ordem = ? WHERE id = ?', p.ordem, alvo.id); q.run('UPDATE passos SET ordem = ? WHERE id = ?', alvo.ordem, p.id);
    audit(ctx, 'editar', 'passos', id, `Passo reordenado: ${p.nome}`);
  });
}
function baixarPasso(ctx, id) {
  return tx(() => {
    const p = lerPasso(id), o = obraAtiva(p.obraId), mats = q.all('SELECT * FROM passoMateriais WHERE passoId = ?', id);
    if (!mats.length) throw U.conflict('Este passo não tem materiais para baixar.'); if (baixado(id)) throw U.conflict('Os materiais deste passo já foram baixados.');
    const falta = []; for (const m of mats) { const x = q.one('SELECT nome, unidade, estoque, ativo FROM materiais WHERE id = ?', m.matId); if (!x.ativo) falta.push(`${x.nome} (arquivado)`); else if (x.estoque < m.qtd) falta.push(`${x.nome} (faltam ${U.round3(m.qtd - x.estoque)} ${x.unidade})`); }
    if (falta.length) throw U.conflict('Estoque insuficiente: ' + falta.join(', '), { falta });
    for (const m of mats) estoque.saida(ctx, { matId: m.matId, qtd: m.qtd, obraId: o.id, passoId: id, motivo: `${p.nome}` });
    audit(ctx, 'baixar', 'passos', id, `Materiais baixados para ${o.nome}: ${p.nome}`);
  });
}
function estornarBaixa(ctx, id, motivo) {
  return tx(() => {
    const p = lerPasso(id); if (!baixado(id)) throw U.conflict('Este passo não tem baixa vigente.');
    for (const mv of q.all("SELECT id FROM movimentacoes WHERE passoId = ? AND tipo = 'Saída' AND estornada = 0", id)) estoque.estornar(ctx, mv.id, motivo);
    audit(ctx, 'estornar', 'passos', id, `Baixa de materiais estornada: ${p.nome} — ${motivo}`);
  });
}
module.exports = { statusDe, metricas, decorarObras, passosDeObras, modeloPadrao, criarPasso, atualizarPasso, excluirPasso, moverPasso, baixarPasso, estornarBaixa, FASES, statusCalc, progCalc };
