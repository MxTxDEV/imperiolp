'use strict';
// Catálogo de permissões. O perfil "Administrador" tem '*'. Os demais perfis são criados pelo próprio
// administrador na tela Perfis; nenhum perfil além do Administrador vem pré-criado.
const MODULOS = [
  ['painel', 'Painel geral'], ['obras', 'Obras'], ['andamento', 'Andamento e passos'], ['empreendimentos', 'Empreendimentos e unidades'],
  ['clientes', 'Clientes'], ['vendas', 'Vendas'], ['estoque', 'Estoque'], ['compras', 'Compras'], ['contratos', 'Contratos e medições'],
  ['financeiro', 'Financeiro'], ['folha', 'Folha'], ['funcionarios', 'Funcionários'], ['fornecedores', 'Fornecedores'],
  ['tarefas', 'Tarefas'], ['diario', 'Diário de obra'], ['documentos', 'Documentos'],
];
const BASE = [['ver', 'Ver'], ['criar', 'Criar'], ['editar', 'Editar / arquivar'], ['excluir', 'Excluir']];
const CATALOGO = [];
for (const [m, nome] of MODULOS) for (const [a, an] of BASE) if (!(m === 'painel' && a !== 'ver')) CATALOGO.push({ key: m + ':' + a, grupo: nome, label: an });
CATALOGO.push(
  { key: 'financeiro:liquidar', grupo: 'Financeiro', label: 'Baixar (pagar/receber)' },
  { key: 'financeiro:estornar', grupo: 'Financeiro', label: 'Estornar baixas e cancelar títulos' },
  { key: 'estoque:estornar', grupo: 'Estoque', label: 'Estornar movimentações' },
  { key: 'folha:fechar', grupo: 'Folha', label: 'Fechar e reabrir folha' },
  { key: 'funcionarios:salario', grupo: 'Funcionários', label: 'Ver salários' },
  { key: 'admin:usuarios', grupo: 'Administração', label: 'Gerenciar usuários' },
  { key: 'admin:perfis', grupo: 'Administração', label: 'Gerenciar perfis' },
  { key: 'admin:auditoria', grupo: 'Administração', label: 'Ver auditoria' },
  { key: 'admin:backup', grupo: 'Administração', label: 'Backup, importação e dados de exemplo' },
  { key: 'admin:config', grupo: 'Administração', label: 'Configurações' },
);
const VALIDAS = new Set(CATALOGO.map(c => c.key));
const can = (user, key) => !!user && (user.permissoes.includes('*') || user.permissoes.includes(key));
function normalizar(lista) {
  const out = new Set();
  for (const k of lista) { if (k === '*') continue; if (!VALIDAS.has(k)) throw new Error('Permissão desconhecida: ' + k); out.add(k); const m = k.split(':')[0]; if (MODULOS.some(x => x[0] === m)) out.add(m + ':ver'); }
  return [...out].sort();
}
module.exports = { MODULOS, CATALOGO, can, normalizar };
