-- Índices de cobertura para os totais derivados (pago/saldo de cada conta) e filtros mais usados.
CREATE INDEX ix_liq_conta_cov ON liquidacoes(contaId, estornadaEm, valorC);
CREATE INDEX ix_contas_status_venc ON contas(status, vencimento);
CREATE INDEX ix_contas_forn ON contas(fornId);
CREATE INDEX ix_contas_cliente ON contas(clienteId);
CREATE INDEX ix_mov_tipo_data ON movimentacoes(tipo, data);
CREATE INDEX ix_tarefas_status ON tarefas(status, prazo);
CREATE INDEX ix_diario_data ON diario(obraId, data);
