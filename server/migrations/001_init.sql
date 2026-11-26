-- Império ERP — esquema inicial.
-- Convenções: ids TEXT gerados no servidor; dinheiro em CENTAVOS inteiros (colunas terminadas em C);
-- datas 'AAAA-MM-DD'; carimbos de tempo em ISO UTC; totais NUNCA são colunas (sempre derivados).
-- "ativo = 0" significa arquivado (nunca apagamos o que tem histórico).

CREATE TABLE roles (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, descricao TEXT NOT NULL DEFAULT '',
  permissoes TEXT NOT NULL DEFAULT '[]', sistema INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE TABLE users (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, senhaHash TEXT NOT NULL,
  senhaTemp INTEGER NOT NULL DEFAULT 0, roleId TEXT NOT NULL REFERENCES roles(id), ultimoLogin TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE TABLE sessions (
  tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criadoEm TEXT NOT NULL, expiraEm TEXT NOT NULL, ultimoUso TEXT NOT NULL, ip TEXT, ua TEXT
);
CREATE INDEX ix_sessions_user ON sessions(userId);
CREATE TABLE loginAttempts (chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL DEFAULT 0, bloqueadoAte TEXT, atualizadoEm TEXT NOT NULL);
CREATE TABLE auditLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, userId TEXT, userNome TEXT, acao TEXT NOT NULL,
  entidade TEXT NOT NULL, entidadeId TEXT, resumo TEXT NOT NULL DEFAULT '', antes TEXT, depois TEXT
);
CREATE INDEX ix_audit_ts ON auditLog(ts);
CREATE INDEX ix_audit_ent ON auditLog(entidade, entidadeId);
CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

-- ---------- cadastros ----------
CREATE TABLE empreendimentos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'Condomínio de apartamentos',
  status TEXT NOT NULL DEFAULT 'Lançamento' CHECK (status IN ('Lançamento','Em obras','Entregue')),
  cidade TEXT NOT NULL DEFAULT '', bairro TEXT NOT NULL DEFAULT '', unidadesPrevistas INTEGER NOT NULL DEFAULT 0 CHECK (unidadesPrevistas >= 0),
  vgvC INTEGER NOT NULL DEFAULT 0 CHECK (vgvC >= 0), entrega TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_emp_nome ON empreendimentos(nome COLLATE NOCASE) WHERE ativo = 1;

CREATE TABLE clientes (
  id TEXT PRIMARY KEY, tipo TEXT NOT NULL DEFAULT 'PF' CHECK (tipo IN ('PF','PJ')), nome TEXT NOT NULL, documento TEXT,
  email TEXT NOT NULL DEFAULT '', telefone TEXT NOT NULL DEFAULT '', cep TEXT NOT NULL DEFAULT '', endereco TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '', obs TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_clientes_doc ON clientes(documento) WHERE documento IS NOT NULL AND documento <> '';

CREATE TABLE unidades (
  id TEXT PRIMARY KEY, empId TEXT NOT NULL REFERENCES empreendimentos(id), codigo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT '',
  area REAL NOT NULL DEFAULT 0 CHECK (area >= 0), valorTabelaC INTEGER NOT NULL DEFAULT 0 CHECK (valorTabelaC >= 0),
  status TEXT NOT NULL DEFAULT 'Disponível' CHECK (status IN ('Disponível','Reservada','Vendida','Bloqueada')),
  clienteId TEXT REFERENCES clientes(id), reservaAte TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_unidades_cod ON unidades(empId, codigo COLLATE NOCASE) WHERE ativo = 1;
CREATE INDEX ix_unidades_emp ON unidades(empId, status);

CREATE TABLE fornecedores (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, documento TEXT, categoria TEXT NOT NULL DEFAULT '', prazo INTEGER NOT NULL DEFAULT 0 CHECK (prazo >= 0),
  telefone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', contato TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_forn_nome ON fornecedores(nome COLLATE NOCASE) WHERE ativo = 1;
CREATE UNIQUE INDEX ux_forn_doc ON fornecedores(documento) WHERE documento IS NOT NULL AND documento <> '';

CREATE TABLE materiais (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT 'Outros', unidade TEXT NOT NULL DEFAULT 'un',
  estoque REAL NOT NULL DEFAULT 0 CHECK (estoque >= 0),      -- mantido SÓ pelas movimentações
  minimo REAL NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  custoMedioC INTEGER NOT NULL DEFAULT 0 CHECK (custoMedioC >= 0),
  fornId TEXT REFERENCES fornecedores(id), local TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_mat_nome ON materiais(nome COLLATE NOCASE) WHERE ativo = 1;

CREATE TABLE funcionarios (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, cpf TEXT, cargo TEXT NOT NULL DEFAULT '',
  vinculo TEXT NOT NULL DEFAULT 'CLT' CHECK (vinculo IN ('CLT','Terceiro','Autônomo','Estagiário')),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Férias','Afastado','Desligado')),
  obraId TEXT REFERENCES obras(id), salarioC INTEGER NOT NULL DEFAULT 0 CHECK (salarioC >= 0), encargosPct REAL NOT NULL DEFAULT 0 CHECK (encargosPct >= 0 AND encargosPct <= 300),
  admissao TEXT, desligamento TEXT, telefone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', ctps TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_func_cpf ON funcionarios(cpf) WHERE cpf IS NOT NULL AND cpf <> '';

-- ---------- obras ----------
CREATE TABLE obras (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, empId TEXT REFERENCES empreendimentos(id),
  tipoObra TEXT NOT NULL DEFAULT 'Padrão' CHECK (tipoObra IN ('Padrão','Placas')),
  planta TEXT NOT NULL DEFAULT 'Retangular' CHECK (planta IN ('Retangular','Quadrada','Em L','Em U')),
  pausada INTEGER NOT NULL DEFAULT 0, orcamentoC INTEGER NOT NULL DEFAULT 0 CHECK (orcamentoC >= 0),
  inicio TEXT NOT NULL, previsao TEXT NOT NULL, resp TEXT NOT NULL DEFAULT '', endereco TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT,
  CHECK (previsao >= inicio)
);
CREATE UNIQUE INDEX ux_obras_nome ON obras(nome COLLATE NOCASE) WHERE ativo = 1;
CREATE INDEX ix_obras_emp ON obras(empId);

CREATE TABLE passos (
  id TEXT PRIMARY KEY, obraId TEXT NOT NULL REFERENCES obras(id), ordem INTEGER NOT NULL, nome TEXT NOT NULL,
  fase TEXT NOT NULL DEFAULT '', ini TEXT NOT NULL, fim TEXT NOT NULL, peso INTEGER NOT NULL DEFAULT 1 CHECK (peso >= 1),
  status TEXT NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Em andamento','Concluído')),
  pct INTEGER NOT NULL DEFAULT 0 CHECK (pct >= 0 AND pct <= 100), dataConc TEXT, extraC INTEGER NOT NULL DEFAULT 0 CHECK (extraC >= 0), obs TEXT NOT NULL DEFAULT '',
  versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT,
  CHECK (fim >= ini)
);
CREATE INDEX ix_passos_obra ON passos(obraId, ordem);
CREATE TABLE passoMateriais (
  passoId TEXT NOT NULL REFERENCES passos(id) ON DELETE CASCADE, matId TEXT NOT NULL REFERENCES materiais(id), qtd REAL NOT NULL CHECK (qtd > 0),
  PRIMARY KEY (passoId, matId)
);

-- ---------- estoque ----------
CREATE TABLE pedidos (
  id TEXT PRIMARY KEY, numero INTEGER NOT NULL UNIQUE, fornId TEXT NOT NULL REFERENCES fornecedores(id), obraId TEXT REFERENCES obras(id),
  data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Rascunho','Enviado','Recebido parcial','Recebido','Cancelado')),
  parcelas INTEGER NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 60), primeiroVenc TEXT, intervaloDias INTEGER NOT NULL DEFAULT 30 CHECK (intervaloDias BETWEEN 1 AND 365),
  obs TEXT NOT NULL DEFAULT '', versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE TABLE pedidoItens (
  id TEXT PRIMARY KEY, pedidoId TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE, matId TEXT NOT NULL REFERENCES materiais(id),
  qtd REAL NOT NULL CHECK (qtd > 0), precoUnitC INTEGER NOT NULL CHECK (precoUnitC >= 0), qtdRecebida REAL NOT NULL DEFAULT 0 CHECK (qtdRecebida >= 0)
);
CREATE INDEX ix_pitens_ped ON pedidoItens(pedidoId);

CREATE TABLE movimentacoes (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, matId TEXT NOT NULL REFERENCES materiais(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('Entrada','Saída','Ajuste','Estorno')), sinal INTEGER NOT NULL CHECK (sinal IN (-1,1)),
  qtd REAL NOT NULL CHECK (qtd > 0), custoUnitC INTEGER NOT NULL DEFAULT 0 CHECK (custoUnitC >= 0),
  obraId TEXT REFERENCES obras(id), passoId TEXT REFERENCES passos(id), fornId TEXT REFERENCES fornecedores(id), pedidoId TEXT REFERENCES pedidos(id),
  doc TEXT NOT NULL DEFAULT '', motivo TEXT NOT NULL DEFAULT '', recId TEXT, estornoDe TEXT REFERENCES movimentacoes(id), estornada INTEGER NOT NULL DEFAULT 0,
  estoqueAntes REAL NOT NULL DEFAULT 0, custoMedioAntesC INTEGER NOT NULL DEFAULT 0,
  criadoEm TEXT NOT NULL, criadoPor TEXT,
  CHECK (tipo <> 'Saída' OR obraId IS NOT NULL)
);
CREATE UNIQUE INDEX ux_mov_estorno ON movimentacoes(estornoDe) WHERE estornoDe IS NOT NULL;
CREATE INDEX ix_mov_mat ON movimentacoes(matId, data);
CREATE INDEX ix_mov_obra ON movimentacoes(obraId);
CREATE INDEX ix_mov_passo ON movimentacoes(passoId);
CREATE INDEX ix_mov_data ON movimentacoes(data);
CREATE INDEX ix_mov_rec ON movimentacoes(recId);

-- ---------- financeiro: título (conta) -> liquidação (baixa) -> estorno ----------
CREATE TABLE categoriasFin (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, tipo TEXT NOT NULL CHECK (tipo IN ('Receita','Despesa')),
  apropriaObra INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE TABLE bancos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, tipo TEXT NOT NULL DEFAULT 'Banco' CHECK (tipo IN ('Caixa','Banco')),
  saldoInicialC INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE TABLE contratos (
  id TEXT PRIMARY KEY, obraId TEXT NOT NULL REFERENCES obras(id), nome TEXT NOT NULL, empresa TEXT NOT NULL DEFAULT '', fornId TEXT REFERENCES fornecedores(id),
  tipo TEXT NOT NULL DEFAULT 'Empreitada' CHECK (tipo IN ('Empreitada','Fornecimento','Serviço','Projeto','Locação','Outro')),
  status TEXT NOT NULL DEFAULT 'Vigente' CHECK (status IN ('Rascunho','Vigente','Encerrado','Rescindido')),
  valorC INTEGER NOT NULL DEFAULT 0 CHECK (valorC >= 0), inicio TEXT, fim TEXT, retencaoPct REAL NOT NULL DEFAULT 0 CHECK (retencaoPct >= 0 AND retencaoPct <= 100), obs TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE INDEX ix_contratos_obra ON contratos(obraId);
CREATE TABLE vendas (
  id TEXT PRIMARY KEY, unidadeId TEXT NOT NULL REFERENCES unidades(id), clienteId TEXT NOT NULL REFERENCES clientes(id), data TEXT NOT NULL,
  valorTotalC INTEGER NOT NULL CHECK (valorTotalC > 0), status TEXT NOT NULL DEFAULT 'Ativa' CHECK (status IN ('Ativa','Cancelada')),
  motivoCancelamento TEXT NOT NULL DEFAULT '', obs TEXT NOT NULL DEFAULT '', versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE UNIQUE INDEX ux_vendas_unid ON vendas(unidadeId) WHERE status = 'Ativa';
CREATE TABLE medicoes (
  id TEXT PRIMARY KEY, contratoId TEXT NOT NULL REFERENCES contratos(id), numero INTEGER NOT NULL, data TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '',
  valorBrutoC INTEGER NOT NULL CHECK (valorBrutoC > 0), retencaoC INTEGER NOT NULL DEFAULT 0 CHECK (retencaoC >= 0), descontoC INTEGER NOT NULL DEFAULT 0 CHECK (descontoC >= 0),
  status TEXT NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Rascunho','Aprovada','Cancelada')), vencimento TEXT,
  versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT,
  UNIQUE (contratoId, numero)
);
CREATE TABLE folhas (
  id TEXT PRIMARY KEY, competencia TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Fechada')),
  fechadaEm TEXT, fechadaPor TEXT, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE TABLE folhaItens (
  id TEXT PRIMARY KEY, folhaId TEXT NOT NULL REFERENCES folhas(id) ON DELETE CASCADE, funcId TEXT NOT NULL REFERENCES funcionarios(id), obraId TEXT REFERENCES obras(id),
  salarioBaseC INTEGER NOT NULL DEFAULT 0, encargosC INTEGER NOT NULL DEFAULT 0, adicionaisC INTEGER NOT NULL DEFAULT 0, descontosC INTEGER NOT NULL DEFAULT 0,
  UNIQUE (folhaId, funcId)
);
CREATE TABLE contas (
  id TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('Pagar','Receber')), descricao TEXT NOT NULL, valorC INTEGER NOT NULL CHECK (valorC > 0),
  vencimento TEXT NOT NULL, competencia TEXT NOT NULL, catId TEXT NOT NULL REFERENCES categoriasFin(id),
  obraId TEXT REFERENCES obras(id), empId TEXT REFERENCES empreendimentos(id), passoId TEXT REFERENCES passos(id), contratoId TEXT REFERENCES contratos(id),
  medicaoId TEXT REFERENCES medicoes(id), fornId TEXT REFERENCES fornecedores(id), clienteId TEXT REFERENCES clientes(id), vendaId TEXT REFERENCES vendas(id),
  pedidoId TEXT REFERENCES pedidos(id), folhaId TEXT REFERENCES folhas(id), parcela INTEGER NOT NULL DEFAULT 1, parcelas INTEGER NOT NULL DEFAULT 1,
  doc TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Cancelada')), motivoCancelamento TEXT NOT NULL DEFAULT '',
  obs TEXT NOT NULL DEFAULT '', origemChave TEXT UNIQUE,
  versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE INDEX ix_contas_tipo_venc ON contas(tipo, vencimento);
CREATE INDEX ix_contas_obra ON contas(obraId);
CREATE INDEX ix_contas_contrato ON contas(contratoId);
CREATE INDEX ix_contas_venda ON contas(vendaId);
CREATE INDEX ix_contas_comp ON contas(competencia);
CREATE TABLE liquidacoes (
  id TEXT PRIMARY KEY, contaId TEXT NOT NULL REFERENCES contas(id), data TEXT NOT NULL,
  valorC INTEGER NOT NULL CHECK (valorC > 0),            -- quanto do título foi baixado
  descontoC INTEGER NOT NULL DEFAULT 0 CHECK (descontoC >= 0), jurosC INTEGER NOT NULL DEFAULT 0 CHECK (jurosC >= 0), multaC INTEGER NOT NULL DEFAULT 0 CHECK (multaC >= 0),
  caixaC INTEGER NOT NULL,                               -- dinheiro que realmente entrou/saiu = valor - desconto + juros + multa
  forma TEXT NOT NULL DEFAULT '', bancoId TEXT REFERENCES bancos(id), doc TEXT NOT NULL DEFAULT '', obs TEXT NOT NULL DEFAULT '',
  estornadaEm TEXT, estornadaPor TEXT, motivoEstorno TEXT NOT NULL DEFAULT '', criadoEm TEXT NOT NULL, criadoPor TEXT,
  CHECK (descontoC <= valorC)
);
CREATE INDEX ix_liq_conta ON liquidacoes(contaId);
CREATE INDEX ix_liq_data ON liquidacoes(data);
CREATE INDEX ix_liq_banco ON liquidacoes(bancoId);

-- ---------- rotina de obra ----------
CREATE TABLE tarefas (
  id TEXT PRIMARY KEY, titulo TEXT NOT NULL, obraId TEXT REFERENCES obras(id), passoId TEXT REFERENCES passos(id), respId TEXT REFERENCES users(id),
  prio TEXT NOT NULL DEFAULT 'Média' CHECK (prio IN ('Alta','Média','Baixa')), status TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Em andamento','Resolvida')),
  prazo TEXT, obs TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT
);
CREATE INDEX ix_tarefas_obra ON tarefas(obraId);
CREATE TABLE diario (
  id TEXT PRIMARY KEY, obraId TEXT NOT NULL REFERENCES obras(id), data TEXT NOT NULL,
  clima TEXT NOT NULL DEFAULT 'Bom' CHECK (clima IN ('Bom','Nublado','Chuva leve','Chuva forte')), equipe INTEGER NOT NULL DEFAULT 0 CHECK (equipe >= 0),
  servicos TEXT NOT NULL DEFAULT '', ocorrencias TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1,
  versao INTEGER NOT NULL DEFAULT 1, criadoEm TEXT NOT NULL, atualizadoEm TEXT NOT NULL, criadoPor TEXT, atualizadoPor TEXT,
  UNIQUE (obraId, data)
);
CREATE TABLE documentos (
  id TEXT PRIMARY KEY, entidade TEXT NOT NULL, entidadeId TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'Outro', validade TEXT,
  mime TEXT NOT NULL, tamanho INTEGER NOT NULL, arquivo TEXT NOT NULL, sha256 TEXT NOT NULL, criadoEm TEXT NOT NULL, criadoPor TEXT
);
CREATE INDEX ix_docs_ent ON documentos(entidade, entidadeId);
CREATE TABLE alocacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, funcId TEXT NOT NULL REFERENCES funcionarios(id), obraId TEXT REFERENCES obras(id), de TEXT NOT NULL, ate TEXT
);
CREATE INDEX ix_aloc_func ON alocacoes(funcId);

-- ---------- dados de referência obrigatórios (não são dados de exemplo) ----------
INSERT INTO roles (id, nome, descricao, permissoes, sistema, criadoEm, atualizadoEm)
  VALUES ('role_admin', 'Administrador', 'Acesso total. Perfil fixo do sistema.', '["*"]', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO categoriasFin (id, nome, tipo, apropriaObra, criadoEm, atualizadoEm) VALUES
  ('cat_venda',    'Venda de unidades',             'Receita', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_outrasrec','Outras receitas',               'Receita', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_estoque',  'Compra de materiais (estoque)', 'Despesa', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_empreit',  'Empreitadas e serviços',        'Despesa', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_folha',    'Mão de obra (folha)',           'Despesa', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_projetos', 'Projetos, taxas e licenças',    'Despesa', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_adm',      'Administrativo',                'Despesa', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat_outrasdsp','Outras despesas',               'Despesa', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO bancos (id, nome, tipo, criadoEm, atualizadoEm) VALUES ('banco_caixa', 'Caixa', 'Caixa', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO meta (chave, valor) VALUES ('encargosPctPadrao', '0'), ('empresaNome', 'Império Negócios Imobiliários'), ('diaVencFolha', '5');
