'use strict';
// Definição declarativa dos cadastros. O mesmo esquema é enviado ao navegador (/api/meta) para montar
// formulários e listas, e é a fonte das validações no servidor.
const { q } = require('./db');
const U = require('./util');

const T = (label, extra) => Object.assign({ t: 'text', label }, extra);
const vf = (...l) => l; // vínculos: [tabela, coluna, rótulo, filtroExtra]

const ENTIDADES = {
  empreendimentos: {
    prefixo: 'emp', tabela: 'empreendimentos', modulo: 'empreendimentos', rotulo: 'Empreendimento', plural: 'Empreendimentos', titulo: 'nome', arquivavel: true,
    campos: {
      nome: T('Nome', { obrig: 1, max: 120, full: 1 }),
      tipo: { t: 'enum', label: 'Tipo', opcoes: ['Condomínio de apartamentos', 'Condomínio de casas', 'Comercial / salas', 'Loteamento'], padrao: 'Condomínio de apartamentos' },
      status: { t: 'enum', label: 'Situação', opcoes: ['Lançamento', 'Em obras', 'Entregue'], padrao: 'Lançamento' },
      cidade: T('Cidade', { max: 80 }), bairro: T('Bairro', { max: 80 }),
      unidadesPrevistas: { t: 'int', label: 'Unidades previstas', min: 0, max: 100000, padrao: 0 },
      vgv: { t: 'money', label: 'VGV (R$)', padrao: 0 }, entrega: { t: 'date', label: 'Entrega prevista' },
    },
    lista: { cols: ['nome', 'tipo', 'status', 'cidade', 'bairro', 'unidadesPrevistas', 'vgv', 'entrega'], busca: ['nome', 'cidade', 'bairro'], ordem: 'nome' },
    vinculos: [vf('unidades', 'empId', 'Unidades'), vf('obras', 'empId', 'Obras'), vf('contas', 'empId', 'Contas financeiras')],
    decorar: itens => require('./services/vendas').decorarEmps(itens),
  },
  unidades: {
    prefixo: 'und', tabela: 'unidades', modulo: 'empreendimentos', rotulo: 'Unidade', plural: 'Unidades', titulo: 'codigo', arquivavel: true,
    campos: {
      empId: { t: 'ref', ref: 'empreendimentos', label: 'Empreendimento', obrig: 1, criarSo: 1 }, codigo: T('Código / número', { obrig: 1, max: 30 }),
      tipo: T('Tipologia', { max: 60 }), area: { t: 'num', label: 'Área (m²)', min: 0, max: 100000, padrao: 0 }, valorTabela: { t: 'money', label: 'Valor de tabela (R$)', padrao: 0 },
      status: { t: 'enum', label: 'Situação', opcoes: ['Disponível', 'Bloqueada'], padrao: 'Disponível' },
    },
    lista: { cols: ['empId', 'codigo', 'tipo', 'area', 'valorTabela', 'status', 'clienteId'], busca: ['codigo', 'tipo'], ordem: 'codigo' },
    vinculos: [vf('vendas', 'unidadeId', 'Vendas')],
    decorar: itens => require('./services/vendas').decorarUnidades(itens),
    async validar(d, atual) {
      const e = {};
      if (!atual && d.empId) { const emp = await q.one('SELECT unidadesPrevistas FROM empreendimentos WHERE id = ?', d.empId); const n = await q.val('SELECT COUNT(*) FROM unidades WHERE empId = ? AND ativo = 1', d.empId); if (emp && emp.unidadesPrevistas && n >= emp.unidadesPrevistas) e.codigo = `O empreendimento prevê ${emp.unidadesPrevistas} unidades e já tem ${n}. Aumente as unidades previstas antes.`; }
      if (atual && atual.status !== 'Disponível' && atual.status !== 'Bloqueada' && d.status) e.status = 'Reservada e vendida mudam pelo fluxo de venda.';
      return e;
    },
    podeArquivar: r => (r.status === 'Vendida' || r.status === 'Reservada' ? 'Unidade vendida ou reservada não pode ser arquivada.' : null),
  },
  clientes: {
    prefixo: 'cli', tabela: 'clientes', modulo: 'clientes', rotulo: 'Cliente', plural: 'Clientes', titulo: 'nome', arquivavel: true,
    campos: {
      tipo: { t: 'enum', label: 'Tipo', opcoes: ['PF', 'PJ'], padrao: 'PF' }, nome: T('Nome / razão social', { obrig: 1, max: 140, full: 1 }),
      documento: { t: 'cpfcnpj', label: 'CPF / CNPJ' }, email: { t: 'email', label: 'E-mail' }, telefone: { t: 'phone', label: 'Telefone' },
      cep: { t: 'cep', label: 'CEP' }, endereco: T('Endereço', { max: 160, full: 1 }), cidade: T('Cidade', { max: 80 }), uf: { t: 'uf', label: 'UF' }, obs: T('Observações', { max: 500, full: 1 }),
    },
    lista: { cols: ['nome', 'tipo', 'documento', 'telefone', 'email', 'cidade'], busca: ['nome', 'documento', 'email', 'telefone'], ordem: 'nome' },
    vinculos: [vf('unidades', 'clienteId', 'Unidades'), vf('vendas', 'clienteId', 'Vendas'), vf('contas', 'clienteId', 'Contas a receber')],
  },
  fornecedores: {
    prefixo: 'frn', tabela: 'fornecedores', modulo: 'fornecedores', rotulo: 'Fornecedor', plural: 'Fornecedores', titulo: 'nome', arquivavel: true,
    campos: {
      nome: T('Razão social / nome', { obrig: 1, max: 140, full: 1 }), documento: { t: 'cpfcnpj', label: 'CPF / CNPJ' }, categoria: T('Categoria', { max: 60 }),
      prazo: { t: 'int', label: 'Prazo de entrega (dias)', min: 0, max: 365, padrao: 0 }, telefone: { t: 'phone', label: 'Telefone' }, email: { t: 'email', label: 'E-mail' }, contato: T('Pessoa de contato', { max: 80 }),
    },
    lista: { cols: ['nome', 'documento', 'categoria', 'prazo', 'telefone', 'email'], busca: ['nome', 'documento', 'categoria', 'email'], ordem: 'nome' },
    vinculos: [vf('materiais', 'fornId', 'Materiais'), vf('pedidos', 'fornId', 'Pedidos de compra'), vf('contas', 'fornId', 'Contas a pagar'), vf('contratos', 'fornId', 'Contratos'), vf('movimentacoes', 'fornId', 'Movimentações de estoque')],
  },
  materiais: {
    prefixo: 'mat', tabela: 'materiais', modulo: 'estoque', rotulo: 'Material', plural: 'Materiais', titulo: 'nome', arquivavel: true,
    campos: {
      nome: T('Material / insumo', { obrig: 1, max: 140, full: 1 }),
      categoria: { t: 'enum', label: 'Categoria', opcoes: ['Aglomerantes', 'Agregados', 'Aço', 'Alvenaria', 'Hidráulica', 'Elétrica', 'Acabamento', 'EPI', 'Ferramentas', 'Placas', 'Outros'], padrao: 'Outros' },
      unidade: T('Unidade (un, m³, saco…)', { obrig: 1, max: 12, padrao: 'un' }), minimo: { t: 'num', label: 'Estoque mínimo', min: 0, max: 1e9, padrao: 0 },
      fornId: { t: 'ref', ref: 'fornecedores', label: 'Fornecedor principal' }, local: T('Local de armazenagem', { max: 80 }),
      estoque: { t: 'num', label: 'Em estoque', readonly: 1 }, custoMedio: { t: 'money', label: 'Custo médio (R$)', readonly: 1 },
      estoqueInicial: { t: 'num', label: 'Estoque inicial', min: 0, max: 1e9, virtual: 1, criarSo: 1, padrao: 0 }, custoInicial: { t: 'money', label: 'Custo unitário inicial (R$)', virtual: 1, criarSo: 1, padrao: 0 },
    },
    lista: { cols: ['nome', 'categoria', 'unidade', 'estoque', 'minimo', 'custoMedio', 'fornId', 'local'], busca: ['nome', 'categoria', 'local'], ordem: 'nome' },
    vinculos: [vf('movimentacoes', 'matId', 'Movimentações'), vf('passoMateriais', 'matId', 'Passos de obra'), vf('pedidoItens', 'matId', 'Pedidos de compra')],
    validar(d) { const e = {}; if (d.estoqueInicial > 0 && !(d.custoInicial > 0)) e.custoInicial = 'Informe o custo unitário do estoque inicial.'; return e; },
    async depois(id, atual, d, virt, ctx) { if (virt.estoqueInicial > 0) await require('./services/estoque').ajusteInicial(ctx, id, virt.estoqueInicial, virt.custoInicial); },
  },
  funcionarios: {
    prefixo: 'fun', tabela: 'funcionarios', modulo: 'funcionarios', rotulo: 'Funcionário', plural: 'Funcionários', titulo: 'nome', arquivavel: true,
    campos: {
      nome: T('Nome completo', { obrig: 1, max: 140, full: 1 }), cpf: { t: 'cpf', label: 'CPF' }, cargo: T('Cargo', { max: 80 }),
      vinculo: { t: 'enum', label: 'Vínculo', opcoes: ['CLT', 'Terceiro', 'Autônomo', 'Estagiário'], padrao: 'CLT' },
      status: { t: 'enum', label: 'Situação', opcoes: ['Ativo', 'Férias', 'Afastado', 'Desligado'], padrao: 'Ativo' },
      obraId: { t: 'ref', ref: 'obras', label: 'Alocado na obra' }, salario: { t: 'money', label: 'Salário (R$)', padrao: 0, perm: 'funcionarios:salario' },
      encargosPct: { t: 'num', label: 'Encargos (% sobre o salário)', min: 0, max: 300, padrao: 0 },
      admissao: { t: 'date', label: 'Admissão' }, desligamento: { t: 'date', label: 'Desligamento' }, telefone: { t: 'phone', label: 'Telefone' }, email: { t: 'email', label: 'E-mail' }, ctps: T('CTPS', { max: 30 }),
    },
    lista: { cols: ['nome', 'cpf', 'cargo', 'vinculo', 'status', 'obraId', 'salario', 'admissao', 'telefone'], busca: ['nome', 'cpf', 'cargo'], ordem: 'nome' },
    vinculos: [vf('folhaItens', 'funcId', 'Itens de folha')],
    validar(d, atual) {
      const e = {}; const st = d.status || (atual && atual.status);
      if (d.desligamento && d.admissao && d.desligamento < d.admissao) e.desligamento = 'Desligamento antes da admissão.';
      if (st === 'Desligado' && d.obraId) e.obraId = 'Funcionário desligado não fica alocado em obra.';
      return e;
    },
    async depois(id, atual, d, virt, ctx) {
      const novo = await q.one('SELECT obraId, status, desligamento FROM funcionarios WHERE id = ?', id); const hoje = U.hoje();
      if (novo.status === 'Desligado' && !novo.desligamento) await q.run('UPDATE funcionarios SET desligamento = ? WHERE id = ?', hoje, id);
      const aberta = await q.one('SELECT id, obraId FROM alocacoes WHERE funcId = ? AND ate IS NULL', id);
      if (!aberta || (aberta.obraId || null) !== (novo.obraId || null)) { if (aberta) await q.run('UPDATE alocacoes SET ate = ? WHERE id = ?', hoje, aberta.id); if (novo.obraId) await q.run('INSERT INTO alocacoes (funcId, obraId, de) VALUES (?,?,?)', id, novo.obraId, hoje); }
    },
  },
  obras: {
    prefixo: 'obr', tabela: 'obras', modulo: 'obras', rotulo: 'Obra', plural: 'Obras', titulo: 'nome', arquivavel: true,
    campos: {
      nome: T('Nome da obra', { obrig: 1, max: 140, full: 1 }), empId: { t: 'ref', ref: 'empreendimentos', label: 'Empreendimento' },
      tipoObra: { t: 'enum', label: 'Tipo de obra', opcoes: ['Padrão', 'Placas'], padrao: 'Padrão' },
      planta: { t: 'enum', label: 'Formato da planta (obras de placas)', opcoes: ['Retangular', 'Quadrada', 'Em L', 'Em U'], padrao: 'Retangular' },
      orcamento: { t: 'money', label: 'Orçamento (R$)', padrao: 0 }, inicio: { t: 'date', label: 'Início', obrig: 1 }, previsao: { t: 'date', label: 'Previsão de término', obrig: 1 },
      resp: T('Engenheiro responsável', { max: 100 }), endereco: T('Endereço', { max: 200, full: 1 }), pausada: { t: 'bool', label: 'Obra pausada' },
      usarModelo: { t: 'bool', label: 'Criar os passos padrão', virtual: 1, criarSo: 1 },
    },
    lista: { cols: ['nome', 'empId', 'tipoObra', 'orcamento', 'inicio', 'previsao', 'resp'], busca: ['nome', 'resp', 'endereco'], ordem: 'nome' },
    vinculos: [vf('passos', 'obraId', 'Passos'), vf('contratos', 'obraId', 'Contratos'), vf('contas', 'obraId', 'Contas financeiras'), vf('movimentacoes', 'obraId', 'Movimentações de estoque'), vf('funcionarios', 'obraId', 'Funcionários alocados'), vf('tarefas', 'obraId', 'Tarefas'), vf('diario', 'obraId', 'Diário de obra'), vf('pedidos', 'obraId', 'Pedidos de compra'), vf('folhaItens', 'obraId', 'Itens de folha'), vf('alocacoes', 'obraId', 'Histórico de alocações')],
    validar(d) { const e = {}; if (d.inicio && d.previsao && d.previsao < d.inicio) e.previsao = 'A previsão de término não pode ser antes do início.'; return e; },
    decorar: (itens) => require('./services/obras').decorarObras(itens),
    async depois(id, atual, d, virt, ctx) { if (virt.usarModelo) await require('./services/obras').modeloPadrao(ctx, id, true); },
  },
  contratos: {
    prefixo: 'ctr', tabela: 'contratos', modulo: 'contratos', rotulo: 'Contrato', plural: 'Contratos', titulo: 'nome', arquivavel: true,
    campos: {
      nome: T('Objeto do contrato', { obrig: 1, max: 160, full: 1 }), obraId: { t: 'ref', ref: 'obras', label: 'Obra', obrig: 1 }, empresa: T('Contratada (empresa / pessoa)', { max: 140 }),
      fornId: { t: 'ref', ref: 'fornecedores', label: 'Fornecedor cadastrado' }, tipo: { t: 'enum', label: 'Tipo', opcoes: ['Empreitada', 'Fornecimento', 'Serviço', 'Projeto', 'Locação', 'Outro'], padrao: 'Empreitada' },
      status: { t: 'enum', label: 'Situação', opcoes: ['Rascunho', 'Vigente', 'Encerrado', 'Rescindido'], padrao: 'Vigente' },
      valor: { t: 'money', label: 'Valor do contrato (R$)', padrao: 0 }, inicio: { t: 'date', label: 'Início' }, fim: { t: 'date', label: 'Término' },
      retencaoPct: { t: 'num', label: 'Retenção nas medições (%)', min: 0, max: 100, padrao: 0 }, obs: T('Observações', { max: 500, full: 1 }),
    },
    lista: { cols: ['nome', 'obraId', 'empresa', 'tipo', 'status', 'valor', 'inicio', 'fim'], busca: ['nome', 'empresa'], ordem: 'nome' },
    vinculos: [vf('contas', 'contratoId', 'Contas financeiras'), vf('medicoes', 'contratoId', 'Medições')],
    async validar(d, atual) { const e = {}; if (d.inicio && d.fim && d.fim < d.inicio) e.fim = 'O término não pode ser antes do início.'; if (atual && d.valorC !== undefined) { const comp = await q.val("SELECT COALESCE(SUM(valorC),0) FROM contas WHERE contratoId = ? AND status = 'Aberta'", atual.id); if (d.valorC < comp) e.valor = `O valor não pode ficar abaixo do que já foi lançado (${U.fromC(comp).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`; } return e; },
    decorar: (itens) => require('./services/contratos').decorarContratos(itens),
  },
  tarefas: {
    prefixo: 'tar', tabela: 'tarefas', modulo: 'tarefas', rotulo: 'Tarefa', plural: 'Tarefas', titulo: 'titulo', arquivavel: true,
    campos: {
      titulo: T('Título', { obrig: 1, max: 160, full: 1 }), obraId: { t: 'ref', ref: 'obras', label: 'Obra' }, respId: { t: 'ref', ref: 'users', label: 'Responsável' },
      prio: { t: 'enum', label: 'Prioridade', opcoes: ['Alta', 'Média', 'Baixa'], padrao: 'Média' }, status: { t: 'enum', label: 'Situação', opcoes: ['Aberta', 'Em andamento', 'Resolvida'], padrao: 'Aberta' },
      prazo: { t: 'date', label: 'Prazo' }, obs: T('Observações', { max: 500, full: 1 }),
    },
    lista: { cols: ['titulo', 'obraId', 'prio', 'status', 'prazo', 'respId'], busca: ['titulo', 'obs'], ordem: 'prazo' }, vinculos: [],
  },
  diario: {
    prefixo: 'dia', tabela: 'diario', modulo: 'diario', rotulo: 'Registro do diário', plural: 'Diário de obra', titulo: 'data', arquivavel: true,
    campos: {
      obraId: { t: 'ref', ref: 'obras', label: 'Obra', obrig: 1, criarSo: 1 }, data: { t: 'date', label: 'Data', obrig: 1 },
      clima: { t: 'enum', label: 'Clima', opcoes: ['Bom', 'Nublado', 'Chuva leve', 'Chuva forte'], padrao: 'Bom' }, equipe: { t: 'int', label: 'Pessoas na obra', min: 0, max: 5000, padrao: 0 },
      servicos: T('Serviços executados', { max: 2000, full: 1 }), ocorrencias: T('Ocorrências', { max: 2000, full: 1 }),
    },
    lista: { cols: ['data', 'obraId', 'clima', 'equipe', 'servicos', 'ocorrencias'], busca: ['servicos', 'ocorrencias'], ordem: 'data' }, vinculos: [],
    validar(d) { const e = {}; if (d.data && d.data > U.hoje()) e.data = 'Não é possível registrar o diário de uma data futura.'; return e; },
  },
  categoriasFin: {
    prefixo: 'cat', tabela: 'categoriasFin', modulo: 'financeiro', rotulo: 'Categoria financeira', plural: 'Categorias financeiras', titulo: 'nome', arquivavel: true,
    campos: { nome: T('Nome', { obrig: 1, max: 80 }), tipo: { t: 'enum', label: 'Tipo', opcoes: ['Receita', 'Despesa'], obrig: 1, criarSo: 1 }, apropriaObra: { t: 'bool', label: 'Entra no custo da obra' } },
    lista: { cols: ['nome', 'tipo', 'apropriaObra'], busca: ['nome'], ordem: 'nome' }, vinculos: [vf('contas', 'catId', 'Contas financeiras')],
    podeArquivar: r => (r.id.startsWith('cat_') && ['cat_venda', 'cat_estoque', 'cat_folha', 'cat_empreit'].includes(r.id) ? 'Categoria usada pelo próprio sistema.' : null),
  },
  bancos: {
    prefixo: 'bco', tabela: 'bancos', modulo: 'financeiro', rotulo: 'Conta (caixa/banco)', plural: 'Caixas e bancos', titulo: 'nome', arquivavel: true,
    campos: { nome: T('Nome', { obrig: 1, max: 80 }), tipo: { t: 'enum', label: 'Tipo', opcoes: ['Caixa', 'Banco'], padrao: 'Banco' }, saldoInicial: { t: 'money', label: 'Saldo inicial (R$)', padrao: 0, criarSo: 1 } },
    lista: { cols: ['nome', 'tipo', 'saldoInicial'], busca: ['nome'], ordem: 'nome' }, vinculos: [vf('liquidacoes', 'bancoId', 'Baixas')],
    podeArquivar: r => (r.id === 'banco_caixa' ? 'O Caixa é usado pelo sistema.' : null),
  },
};
for (const [k, e] of Object.entries(ENTIDADES)) e.nome = k;
// quais entidades o CRUD genérico expõe (as demais têm rotas próprias)
module.exports = { ENTIDADES };
