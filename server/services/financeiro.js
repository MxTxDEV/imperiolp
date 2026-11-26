'use strict';
// Título (conta) -> baixa (liquidação) -> estorno. Nada é apagado e nenhum total é coluna:
// pago, saldo e situação são SEMPRE calculados a partir das baixas vigentes.
const { q, tx } = require('../db');
const { audit } = require('../audit');
const U = require('../util');

const PAGO_SQL = '(SELECT COALESCE(SUM(l.valorC),0) FROM liquidacoes l WHERE l.contaId = c.id AND l.estornadaEm IS NULL)';
const SITUACAO_SQL = `CASE WHEN c.status = 'Cancelada' THEN 'Cancelada' WHEN ${PAGO_SQL} >= c.valorC THEN 'Paga' WHEN c.vencimento < @hoje THEN 'Vencida' WHEN ${PAGO_SQL} > 0 THEN 'Parcial' ELSE 'Aberta' END`;
const money = U.fromC;

async function checarRef(tabela, id, campo, erros, ativoObrig = true) {
  if (!id) return null;
  const r = await q.one(`SELECT * FROM ${tabela} WHERE id = ?`, id);
  if (!r) { erros[campo] = 'Registro não encontrado.'; return null; }
  if (ativoObrig && 'ativo' in r && !r.ativo) { erros[campo] = 'Este registro está arquivado.'; return null; }
  return r;
}
function dividir(totalC, n) { const base = Math.floor(totalC / n); const out = Array(n).fill(base); out[n - 1] = totalC - base * (n - 1); return out; }
function vencimentos(primeiro, n, periodicidade, intervalo) { return Array.from({ length: n }, (_, i) => (periodicidade === 'dias' ? U.addDays(primeiro, i * (intervalo || 30)) : U.addMonths(primeiro, i))); }

/** Cria 1..n títulos. Retorna os ids. `origemChave` torna a operação idempotente. */
async function criarContas(ctx, d) {
  return tx(async () => {
    const erros = {};
    if (!['Pagar', 'Receber'].includes(d.tipo)) erros.tipo = 'Informe se é a pagar ou a receber.';
    const descricao = String(d.descricao || '').trim(); if (descricao.length < 2) erros.descricao = 'Descreva o lançamento.'; if (descricao.length > 200) erros.descricao = 'Descrição longa demais.';
    if (!U.isMoney(d.valor) || d.valor <= 0) erros.valor = 'Informe um valor maior que zero.';
    if (!U.isDate(d.vencimento)) erros.vencimento = 'Informe o vencimento.';
    const competencia = d.competencia || U.hoje(); if (!U.isDate(competencia)) erros.competencia = 'Competência inválida.';
    const n = d.parcelas == null ? 1 : Number(d.parcelas); if (!Number.isInteger(n) || n < 1 || n > 60) erros.parcelas = 'Parcelas de 1 a 60.';
    const cat = await checarRef('categoriasFin', d.catId, 'catId', erros); if (!d.catId) erros.catId = 'Escolha a categoria.';
    if (cat && (cat.tipo === 'Despesa') !== (d.tipo === 'Pagar')) erros.catId = `A categoria "${cat.nome}" é de ${cat.tipo.toLowerCase()} e não combina com este lançamento.`;
    const obra = await checarRef('obras', d.obraId, 'obraId', erros); await checarRef('empreendimentos', d.empId, 'empId', erros);
    const passo = d.passoId ? await q.one('SELECT * FROM passos WHERE id = ?', d.passoId) : null; if (d.passoId && !passo) erros.passoId = 'Passo não encontrado.'; if (passo && d.obraId && passo.obraId !== d.obraId) erros.passoId = 'O passo é de outra obra.';
    await checarRef('fornecedores', d.fornId, 'fornId', erros); await checarRef('clientes', d.clienteId, 'clienteId', erros);
    const ctr = d.contratoId ? await q.one('SELECT * FROM contratos WHERE id = ?', d.contratoId) : null;
    if (d.contratoId && !ctr) erros.contratoId = 'Contrato não encontrado.';
    if (ctr) {
      if (ctr.status !== 'Vigente') erros.contratoId = `O contrato está "${ctr.status}"; só contratos vigentes recebem lançamentos.`;
      if (d.obraId && d.obraId !== ctr.obraId) erros.obraId = 'A obra não é a do contrato.';
      if (!erros.valor && U.isMoney(d.valor)) { const comp = await q.val("SELECT COALESCE(SUM(valorC),0) FROM contas WHERE contratoId = ? AND status = 'Aberta'", ctr.id); if (ctr.valorC > 0 && comp + U.toC(d.valor) > ctr.valorC) erros.valor = `Passa do valor do contrato: já lançado ${money(comp).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de ${money(ctr.valorC).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`; }
    }
    if (d.jaPago && n > 1) erros.parcelas = 'Para lançar já pago, use uma parcela só.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    const totalC = U.toC(d.valor), partes = dividir(totalC, n), vencs = vencimentos(d.vencimento, n, d.periodicidade, d.intervaloDias), ids = [], agora = U.nowIso();
    const obraId = d.obraId || (ctr ? ctr.obraId : null) || (passo ? passo.obraId : null) || null;
    for (let i = 0; i < n; i++) {
      const id = U.newId('cta'), chave = d.origemChave ? d.origemChave + (n > 1 ? '#' + (i + 1) : '') : null;
      if (chave && await q.one('SELECT 1 FROM contas WHERE origemChave = ?', chave)) throw U.conflict('Este lançamento já foi feito antes (proteção contra duplicidade).');
      await q.run(`INSERT INTO contas (id, tipo, descricao, valorC, vencimento, competencia, catId, obraId, empId, passoId, contratoId, medicaoId, fornId, clienteId, vendaId, pedidoId, folhaId, parcela, parcelas, doc, obs, origemChave, versao, criadoEm, atualizadoEm, criadoPor, atualizadoPor)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`, id, d.tipo, n > 1 ? `${descricao} (${i + 1}/${n})` : descricao, partes[i], vencs[i], competencia, d.catId, obraId, d.empId || null, d.passoId || null, d.contratoId || null,
        d.medicaoId || null, d.fornId || null, d.clienteId || null, d.vendaId || null, d.pedidoId || null, d.folhaId || null, i + 1, n, String(d.doc || '').slice(0, 60), String(d.obs || '').slice(0, 500), chave, agora, agora, ctx.user.id, ctx.user.id);
      ids.push(id);
    }
    await audit(ctx, 'criar', 'contas', ids[0], `${d.tipo === 'Pagar' ? 'Conta a pagar' : 'Conta a receber'} criada: ${descricao} — ${money(totalC).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em ${n}x`, null, { ids, total: money(totalC) });
    if (d.jaPago) await liquidar(ctx, ids[0], Object.assign({ valor: d.valor }, d.jaPago));
    return ids;
  });
}
async function saldoC(contaId) { const c = await q.one('SELECT valorC FROM contas WHERE id = ?', contaId); return c.valorC - await q.val('SELECT COALESCE(SUM(valorC),0) FROM liquidacoes WHERE contaId = ? AND estornadaEm IS NULL', contaId); }

async function liquidar(ctx, contaId, d) {
  return tx(async () => {
    const c = await q.one('SELECT * FROM contas WHERE id = ?', contaId); if (!c) throw U.notFound('Conta não encontrada.');
    if (c.status === 'Cancelada') throw U.conflict('Esta conta está cancelada.');
    const erros = {}, saldo = await saldoC(contaId);
    if (saldo <= 0) throw U.conflict('Esta conta já está quitada.');
    const valorC = d.valor == null ? saldo : U.toC(d.valor);
    if (d.valor != null && !U.isMoney(d.valor)) erros.valor = 'Valor inválido.'; else if (valorC <= 0) erros.valor = 'Informe um valor maior que zero.'; else if (valorC > saldo) erros.valor = `O valor passa do saldo da conta (${money(saldo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`;
    const data = d.data || U.hoje(); if (!U.isDate(data)) erros.data = 'Data inválida.'; else if (data > U.hoje()) erros.data = 'Não dá para registrar baixa com data futura.';
    const par = k => { const v = d[k] == null || d[k] === '' ? 0 : d[k]; if (!U.isMoney(v) || v < 0) { erros[k] = 'Valor inválido.'; return 0; } return U.toC(v); };
    const descontoC = par('desconto'), jurosC = par('juros'), multaC = par('multa');
    if (!erros.valor && descontoC > valorC) erros.desconto = 'O desconto não pode ser maior que o valor baixado.';
    const bancoId = d.bancoId || 'banco_caixa'; const banco = await q.one('SELECT id, ativo FROM bancos WHERE id = ?', bancoId); if (!banco || !banco.ativo) erros.bancoId = 'Conta de caixa/banco inválida.';
    if (Object.keys(erros).length) throw U.invalid(erros);
    const id = U.newId('liq'), caixaC = valorC - descontoC + jurosC + multaC;
    await q.run('INSERT INTO liquidacoes (id, contaId, data, valorC, descontoC, jurosC, multaC, caixaC, forma, bancoId, doc, obs, criadoEm, criadoPor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, contaId, data, valorC, descontoC, jurosC, multaC, caixaC, String(d.forma || '').slice(0, 40), bancoId, String(d.doc || '').slice(0, 60), String(d.obs || '').slice(0, 300), U.nowIso(), ctx.user.id);
    await audit(ctx, 'baixar', 'contas', contaId, `Baixa de ${money(valorC).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em "${c.descricao}"`, null, { liquidacaoId: id, valor: money(valorC), desconto: money(descontoC), juros: money(jurosC), multa: money(multaC) });
    return id;
  });
}
async function estornarLiquidacao(ctx, id, motivo) {
  return tx(async () => {
    const l = await q.one('SELECT l.*, c.descricao FROM liquidacoes l JOIN contas c ON c.id = l.contaId WHERE l.id = ?', id); if (!l) throw U.notFound('Baixa não encontrada.');
    if (l.estornadaEm) throw U.conflict('Esta baixa já foi estornada.');
    motivo = String(motivo || '').trim(); if (motivo.length < 3) throw U.invalid({ motivo: 'Informe o motivo do estorno.' });
    await q.run('UPDATE liquidacoes SET estornadaEm = ?, estornadaPor = ?, motivoEstorno = ? WHERE id = ?', U.nowIso(), ctx.user.id, motivo.slice(0, 300), id);
    await audit(ctx, 'estornar', 'contas', l.contaId, `Estorno de baixa em "${l.descricao}": ${motivo}`, { liquidacaoId: id, valor: money(l.valorC) });
  });
}
async function cancelarConta(ctx, id, motivo, silencioso) {
  return tx(async () => {
    const c = await q.one('SELECT * FROM contas WHERE id = ?', id); if (!c) throw U.notFound('Conta não encontrada.');
    if (c.status === 'Cancelada') { if (silencioso) return; throw U.conflict('A conta já está cancelada.'); }
    if (await q.val('SELECT COUNT(*) FROM liquidacoes WHERE contaId = ? AND estornadaEm IS NULL', id)) throw U.conflict('Há baixas vigentes nesta conta. Estorne as baixas antes de cancelar.');
    motivo = String(motivo || '').trim(); if (motivo.length < 3 && !silencioso) throw U.invalid({ motivo: 'Informe o motivo do cancelamento.' });
    await q.run("UPDATE contas SET status = 'Cancelada', motivoCancelamento = ?, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?", motivo.slice(0, 300), U.nowIso(), ctx.user.id, id);
    await audit(ctx, 'cancelar', 'contas', id, `Conta cancelada: ${c.descricao} — ${motivo}`);
  });
}
const EDITAVEIS_SEMPRE = ['descricao', 'doc', 'obs', 'vencimento', 'competencia', 'catId', 'obraId', 'empId', 'passoId'];
async function atualizarConta(ctx, id, d) {
  return tx(async () => {
    const c = await q.one('SELECT * FROM contas WHERE id = ?', id); if (!c) throw U.notFound('Conta não encontrada.');
    if (+d.versao !== c.versao) throw U.conflict('Esta conta foi alterada por outra pessoa. Recarregue.', { versaoAtual: c.versao });
    if (c.status === 'Cancelada') throw U.conflict('Conta cancelada não pode ser alterada.');
    const temBaixa = await q.val('SELECT COUNT(*) FROM liquidacoes WHERE contaId = ? AND estornadaEm IS NULL', id) > 0, erros = {}, set = {};
    for (const k of EDITAVEIS_SEMPRE) if (k in d) set[k] = d[k] === '' ? null : d[k];
    if ('descricao' in set && String(set.descricao || '').trim().length < 2) erros.descricao = 'Descreva o lançamento.';
    if ('vencimento' in set && !U.isDate(set.vencimento)) erros.vencimento = 'Data inválida.'; if ('competencia' in set && !U.isDate(set.competencia)) erros.competencia = 'Data inválida.';
    if ('catId' in set) { const cat = await q.one('SELECT * FROM categoriasFin WHERE id = ?', set.catId); if (!cat) erros.catId = 'Categoria inválida.'; else if ((cat.tipo === 'Despesa') !== (c.tipo === 'Pagar')) erros.catId = 'Categoria de tipo diferente.'; }
    if ('obraId' in set && set.obraId && !await q.one('SELECT 1 FROM obras WHERE id = ?', set.obraId)) erros.obraId = 'Obra inválida.'; if ('empId' in set && set.empId && !await q.one('SELECT 1 FROM empreendimentos WHERE id = ?', set.empId)) erros.empId = 'Empreendimento inválido.';
    if ('valor' in d) {
      if (temBaixa) erros.valor = 'Há baixas vigentes: estorne antes de mudar o valor.'; else if (c.parcelas > 1 && (c.vendaId || c.pedidoId || c.medicaoId || c.folhaId)) erros.valor = 'O valor deste título vem de outra operação.';
      else if (c.vendaId || c.medicaoId || c.folhaId || c.pedidoId) erros.valor = 'O valor deste título vem de outra operação (venda, medição, folha ou compra). Altere lá.';
      else if (!U.isMoney(d.valor) || d.valor <= 0) erros.valor = 'Valor inválido.'; else set.valorC = U.toC(d.valor);
    }
    if (Object.keys(erros).length) throw U.invalid(erros);
    const cols = Object.keys(set); if (!cols.length) return;
    await q.run(`UPDATE contas SET ${cols.map(k => k + ' = ?').join(', ')}, versao = versao + 1, atualizadoEm = ?, atualizadoPor = ? WHERE id = ?`, ...cols.map(k => set[k]), U.nowIso(), ctx.user.id, id);
    await audit(ctx, 'editar', 'contas', id, `Conta alterada: ${c.descricao}`, c, await q.one('SELECT * FROM contas WHERE id = ?', id));
  });
}
function paraApi(r) {
  const pago = r.pagoC || 0;
  return { id: r.id, tipo: r.tipo, descricao: r.descricao, valor: money(r.valorC), pago: money(pago), saldo: r.status === 'Cancelada' ? 0 : money(r.valorC - pago), vencimento: r.vencimento, competencia: r.competencia,
    catId: r.catId, catNome: r.catNome, obraId: r.obraId, obraNome: r.obraNome, empId: r.empId, passoId: r.passoId, contratoId: r.contratoId, medicaoId: r.medicaoId, fornId: r.fornId, fornNome: r.fornNome,
    clienteId: r.clienteId, clienteNome: r.clienteNome, vendaId: r.vendaId, pedidoId: r.pedidoId, folhaId: r.folhaId, parcela: r.parcela, parcelas: r.parcelas, doc: r.doc, obs: r.obs, status: r.status, situacao: r.situacao, versao: r.versao, motivoCancelamento: r.motivoCancelamento };
}
const BASE_SELECT = `SELECT c.*, ${PAGO_SQL} AS pagoC, ${SITUACAO_SQL} AS situacao, cat.nome AS catNome, o.nome AS obraNome, f.nome AS fornNome, cl.nome AS clienteNome
  FROM contas c JOIN categoriasFin cat ON cat.id = c.catId LEFT JOIN obras o ON o.id = c.obraId LEFT JOIN fornecedores f ON f.id = c.fornId LEFT JOIN clientes cl ON cl.id = c.clienteId`;
async function listarContas(query) {
  const where = [], p = { hoje: U.hoje() }; let i = 0; const add = (sql, v) => { const k = 'p' + i++; where.push(sql.replace('?', '@' + k)); p[k] = v; };
  if (['Pagar', 'Receber'].includes(query.tipo)) add('c.tipo = ?', query.tipo);
  for (const k of ['obraId', 'empId', 'catId', 'fornId', 'clienteId', 'contratoId', 'vendaId', 'pedidoId', 'folhaId']) if (query[k]) add(`c.${k} = ?`, query[k]);
  if (U.isDate(query.venc_de)) add('c.vencimento >= ?', query.venc_de); if (U.isDate(query.venc_ate)) add('c.vencimento <= ?', query.venc_ate);
  if (/^\d{4}-\d{2}$/.test(query.competencia || '')) add('substr(c.competencia,1,7) = ?', query.competencia);
  if (query.busca) { const like = '%' + String(query.busca).replace(/[%_\\]/g, m => '\\' + m) + '%'; const k1 = 'p' + i++; p[k1] = like; where.push(`(c.descricao LIKE @${k1} ESCAPE '\\' OR c.doc LIKE @${k1} ESCAPE '\\' OR f.nome LIKE @${k1} ESCAPE '\\' OR cl.nome LIKE @${k1} ESCAPE '\\')`); }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const sit = query.situacao; const outer = sit && ['Aberta', 'Parcial', 'Vencida', 'Paga', 'Cancelada'].includes(sit) ? ' WHERE x.situacao = @sit' : (sit === 'EmAberto' ? " WHERE x.situacao IN ('Aberta','Parcial','Vencida')" : ''); if (outer.includes('@sit')) p.sit = sit;
  const tam = Math.min(200, Math.max(1, parseInt(query.tamanho) || 50)), pag = Math.max(1, parseInt(query.pagina) || 1);
  const ordem = ['vencimento', 'valorC', 'descricao', 'competencia', 'criadoEm'].includes(query.ordem) ? query.ordem : 'vencimento', dir = String(query.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const sub = `SELECT * FROM (${BASE_SELECT}${w}) x${outer}`;
  const tot = await q.one(`SELECT COUNT(*) n, COALESCE(SUM(valorC),0) v, COALESCE(SUM(pagoC),0) pg FROM (${sub}) tt`, p);
  const rows = await q.all(`${sub} ORDER BY x.${ordem} ${dir}, x.id LIMIT @lim OFFSET @off`, Object.assign({}, p, { lim: tam, off: (pag - 1) * tam }));
  return { itens: rows.map(paraApi), total: tot.n, pagina: pag, tamanho: tam, somaValor: money(tot.v), somaPago: money(tot.pg), somaSaldo: money(tot.v - tot.pg) };
}
async function obterConta(id) {
  const r = await q.one(`${BASE_SELECT} WHERE c.id = @id`, { hoje: U.hoje(), id }); if (!r) throw U.notFound('Conta não encontrada.');
  const liqs = (await q.all('SELECT l.*, b.nome AS bancoNome, u.nome AS porNome, ue.nome AS estornoPorNome FROM liquidacoes l LEFT JOIN bancos b ON b.id = l.bancoId LEFT JOIN users u ON u.id = l.criadoPor LEFT JOIN users ue ON ue.id = l.estornadaPor WHERE l.contaId = ? ORDER BY l.data, l.criadoEm', id))
    .map(l => ({ id: l.id, data: l.data, valor: money(l.valorC), desconto: money(l.descontoC), juros: money(l.jurosC), multa: money(l.multaC), caixa: money(l.caixaC), forma: l.forma, bancoId: l.bancoId, bancoNome: l.bancoNome, doc: l.doc, obs: l.obs, por: l.porNome, estornada: !!l.estornadaEm, estornadaEm: l.estornadaEm, motivoEstorno: l.motivoEstorno, estornoPor: l.estornoPorNome }));
  return Object.assign(paraApi(r), { liquidacoes: liqs });
}
async function resumo() { return require('../db').memo('fin:resumo:' + U.hoje(), resumoCalc); }
async function resumoCalc() {
  const hoje = U.hoje(), p = { hoje, d7: U.addDays(hoje, 7), d30: U.addDays(hoje, 30), mes: hoje.slice(0, 7) };
  const rows = await q.all(`WITH s AS (SELECT c.tipo, c.vencimento, c.valorC - ${PAGO_SQL} AS saldo FROM contas c WHERE c.status = 'Aberta')
    SELECT tipo, COALESCE(SUM(CASE WHEN saldo > 0 THEN saldo END),0) aberto, COALESCE(SUM(CASE WHEN saldo > 0 AND vencimento < @hoje THEN saldo END),0) vencido,
      COALESCE(SUM(CASE WHEN saldo > 0 AND vencimento BETWEEN @hoje AND @d7 THEN saldo END),0) prox7, COALESCE(SUM(CASE WHEN saldo > 0 AND vencimento BETWEEN @hoje AND @d30 THEN saldo END),0) prox30,
      COUNT(CASE WHEN saldo > 0 AND vencimento < @hoje THEN 1 END) qtdVencidas FROM s GROUP BY tipo`, p);
  const por = t => { const r = rows.find(x => x.tipo === t) || {}; return { aberto: money(r.aberto || 0), vencido: money(r.vencido || 0), prox7: money(r.prox7 || 0), prox30: money(r.prox30 || 0), qtdVencidas: r.qtdVencidas || 0 }; };
  const mes = await q.one(`SELECT COALESCE(SUM(CASE WHEN c.tipo='Receber' THEN l.caixaC END),0) ent, COALESCE(SUM(CASE WHEN c.tipo='Pagar' THEN l.caixaC END),0) sai FROM liquidacoes l JOIN contas c ON c.id = l.contaId WHERE l.estornadaEm IS NULL AND substr(l.data,1,7) = @mes`, p);
  return { pagar: por('Pagar'), receber: por('Receber'), caixaMes: { entradas: money(mes.ent), saidas: money(mes.sai), saldo: money(mes.ent - mes.sai) }, saldos: await saldosBancos() };
}
async function saldosBancos() {
  return (await q.all(`SELECT b.id, b.nome, b.tipo, b.ativo, b.saldoInicialC + COALESCE(SUM(CASE WHEN c.tipo = 'Receber' THEN l.caixaC WHEN c.tipo = 'Pagar' THEN -l.caixaC END), 0) AS saldoC
    FROM bancos b LEFT JOIN liquidacoes l ON l.bancoId = b.id AND l.estornadaEm IS NULL LEFT JOIN contas c ON c.id = l.contaId GROUP BY b.id ORDER BY b.nome`)).map(b => ({ id: b.id, nome: b.nome, tipo: b.tipo, ativo: !!b.ativo, saldo: money(b.saldoC) }));
}
/** Fluxo mensal: REALIZADO (baixas) e PREVISTO (saldos em aberto por vencimento) nunca se somam. */
async function fluxo(de, ate) {
  de = U.isDate(de + '-01') ? de : U.addMonths(U.hoje(), -5).slice(0, 7); ate = U.isDate(ate + '-01') ? ate : U.addMonths(U.hoje(), 3).slice(0, 7);
  const real = await q.all(`SELECT substr(l.data,1,7) m, c.tipo, SUM(l.caixaC) v FROM liquidacoes l JOIN contas c ON c.id = l.contaId WHERE l.estornadaEm IS NULL AND substr(l.data,1,7) BETWEEN ? AND ? GROUP BY 1,2`, de, ate);
  const prev = await q.all(`WITH s AS (SELECT c.tipo, substr(c.vencimento,1,7) m, c.valorC - ${PAGO_SQL} AS saldo FROM contas c WHERE c.status = 'Aberta') SELECT m, tipo, SUM(saldo) v FROM s WHERE saldo > 0 AND m BETWEEN @de AND @ate GROUP BY 1,2`, { hoje: U.hoje(), de, ate });
  const meses = []; for (let m = de; m <= ate; m = U.addMonths(m + '-01', 1).slice(0, 7)) meses.push(m);
  const g = (arr, m, t) => money((arr.find(x => x.m === m && x.tipo === t) || {}).v || 0);
  return meses.map(m => ({ mes: m, entradas: g(real, m, 'Receber'), saidas: g(real, m, 'Pagar'), aReceber: g(prev, m, 'Receber'), aPagar: g(prev, m, 'Pagar') }));
}
module.exports = { criarContas, liquidar, estornarLiquidacao, cancelarConta, atualizarConta, listarContas, obterConta, resumo, saldosBancos, fluxo, saldoC, PAGO_SQL };
