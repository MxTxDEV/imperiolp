'use strict';
// Conjunto de dados que o navegador mantém em cache (mesmo formato que o painel, o financeiro e o holograma já usavam).
// Pesado (movimentos e baixas) fica limitado aos últimos 36 meses.
const { q } = require('../db');
const { can } = require('../perms');
const U = require('../util');
const obrasSvc = require('./obras');
const vendas = require('./vendas');
const contratos = require('./contratos');
const crud = require('../crud');
const { ENTIDADES } = require('../entities');

async function montar(user) { const chave = 'dataset:' + [...user.permissoes].sort().join(',') + ':' + U.hoje(); return require('../db').memo(chave, async () => await calcular(user)); }
async function calcular(user) {
  const ver = m => can(user, m + ':ver'), desde = U.addMonths(U.hoje(), -36);
  const S = { versao: require('../db').dataVersion(), hoje: U.hoje(), empreendimentos: [], obras: [], materiais: [], movs: [], funcionarios: [], fornecedores: [], tarefas: [], contratos: [], lancamentos: [], clientes: [], categorias: [], bancos: [], usuarios: await q.all('SELECT id, nome FROM users WHERE ativo = 1 ORDER BY nome') };
  const lista = async ent => (await crud.listar(ENTIDADES[ent], { arquivados: '0', tamanho: 200 }, user, true)).itens;
  if (ver('empreendimentos') || ver('painel') || ver('obras')) S.empreendimentos = (await lista('empreendimentos')).map(e => ({ id: e.id, nome: e.nome, tipo: e.tipo, status: e.status, cidade: e.cidade, bairro: e.bairro, unidades: Math.max(e.unidadesPrevistas, e.unidadesCadastradas), unidadesPrevistas: e.unidadesPrevistas, vendidas: e.vendidas, reservadas: e.reservadas, disponiveis: e.disponiveis, vgv: e.vgv, vgvVendido: e.vgvVendido, recebido: e.recebido, entrega: e.entrega, versao: e.versao }));
  if (ver('obras') || ver('painel') || ver('andamento')) {
    const obs = await lista('obras'), ps = await obrasSvc.passosDeObras(obs.map(o => o.id));
    S.obras = obs.map(o => ({ id: o.id, nome: o.nome, empId: o.empId || '', status: o.status, tipoObra: o.tipoObra, planta: o.planta, pausada: o.pausada, orcamento: o.orcamento, gasto: o.gasto, custoMaterial: o.custoMaterial, custoContas: o.custoContas, prog: o.prog, inicio: o.inicio, previsao: o.previsao, resp: o.resp, endereco: o.endereco, versao: o.versao, passos: ps.get(o.id) || [] }));
  }
  if (ver('estoque') || ver('painel') || ver('andamento')) {
    S.materiais = (await lista('materiais')).map(m => ({ id: m.id, nome: m.nome, cat: m.categoria, un: m.unidade, qtd: m.estoque, min: m.minimo, custo: m.custoMedio, forn: m.fornId || '', local: m.local, versao: m.versao }));
    S.movs = (await q.all("SELECT id, data, matId, tipo, qtd, obraId, motivo, doc, estornada FROM movimentacoes WHERE data >= ? ORDER BY data DESC, criadoEm DESC LIMIT 20000", desde)).map(m => ({ id: m.id, data: m.data, matId: m.matId, tipo: m.tipo, qtd: m.qtd, obraId: m.obraId || '', obs: m.motivo || m.doc || '', estornada: !!m.estornada }));
  }
  if (ver('funcionarios') || ver('painel') || ver('obras')) S.funcionarios = (await lista('funcionarios')).map(f => ({ id: f.id, nome: f.nome, cargo: f.cargo, obraId: f.obraId || '', status: f.status, salario: f.salario, adm: f.admissao || '', tel: f.telefone, vinculo: f.vinculo, versao: f.versao }));
  if (ver('fornecedores') || ver('estoque') || ver('compras') || ver('contratos')) S.fornecedores = (await lista('fornecedores')).map(f => ({ id: f.id, nome: f.nome, cat: f.categoria, prazo: f.prazo, tel: f.telefone, email: f.email, versao: f.versao }));
  if (ver('tarefas') || ver('painel') || ver('obras')) S.tarefas = (await lista('tarefas')).map(t => ({ id: t.id, titulo: t.titulo, obraId: t.obraId || '', prio: t.prio, status: t.status, prazo: t.prazo || '', respId: t.respId || '', versao: t.versao }));
  if (ver('contratos') || ver('painel') || ver('financeiro') || ver('andamento')) S.contratos = (await lista('contratos')).map(c => ({ id: c.id, obraId: c.obraId, nome: c.nome, empresa: c.empresa, tipo: c.tipo, status: c.status, valor: c.valor, pago: c.pago, comprometido: c.comprometido, aPagar: c.aPagar, medido: c.medido, retido: c.retido, retencaoPct: c.retencaoPct, inicio: c.inicio || '', fim: c.fim || '', fornId: c.fornId || '', versao: c.versao }));
  if (ver('financeiro') || ver('painel')) {
    S.lancamentos = (await q.all(`SELECT l.id, l.contaId, l.data, l.caixaC, c.descricao, c.tipo, c.obraId, c.empId, k.nome cat FROM liquidacoes l JOIN contas c ON c.id = l.contaId JOIN categoriasFin k ON k.id = c.catId WHERE l.estornadaEm IS NULL AND l.data >= ? ORDER BY l.data DESC LIMIT 30000`, desde))
      .map(l => ({ id: l.id, contaId: l.contaId, data: l.data, desc: l.descricao, tipo: l.tipo === 'Receber' ? 'Receita' : 'Despesa', valor: U.fromC(l.caixaC), obraId: l.obraId || '', empId: l.empId || '', cat: l.cat }));
    S.categorias = (await q.all('SELECT id, nome, tipo, apropriaObra, ativo FROM categoriasFin WHERE ativo = 1 ORDER BY tipo, nome')).map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, apropriaObra: !!c.apropriaObra }));
    S.bancos = await q.all('SELECT id, nome, tipo FROM bancos WHERE ativo = 1 ORDER BY nome');
  }
  if (ver('clientes') || ver('vendas')) S.clientes = await q.all('SELECT id, nome, documento FROM clientes WHERE ativo = 1 ORDER BY nome LIMIT 5000');
  return S;
}
module.exports = { montar };
