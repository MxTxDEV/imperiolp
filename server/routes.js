'use strict';
const { route } = require('./http');
const auth = require('./auth');
const crud = require('./crud');
const db = require('./db');
const { q } = db;
const { ENTIDADES } = require('./entities');
const perms = require('./perms');
const U = require('./util');
const obras = require('./services/obras');
const estoque = require('./services/estoque');
const fin = require('./services/financeiro');
const contratos = require('./services/contratos');
const vendas = require('./services/vendas');
const compras = require('./services/compras');
const folha = require('./services/folha');
const documentos = require('./services/documentos');
const admin = require('./services/admin');
const alertas = require('./services/alertas');
const dataset = require('./services/dataset');
const log = require('./log');

const eu = u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: u.permissoes, senhaTemp: u.senhaTemp });
const novoCookie = (token, usuario) => ({ __cookie: auth.cookieHeader(token, require('./config').sessionHours * 3600), data: { usuario: eu(usuario) } });

/* ---------- autenticação ---------- */
route('GET', '/api/auth/estado', { publica: true }, async ctx => { const u = await auth.autenticar(ctx.req); return { precisaSetup: await auth.precisaSetup(), usuario: u ? eu(u) : null }; });
route('POST', '/api/auth/setup', { publica: true }, async ctx => { const r = await auth.setup(ctx.ip, ctx.body); return novoCookie(r.token, r.user); });
route('POST', '/api/auth/login', { publica: true }, async ctx => { const r = await auth.login(ctx.body.email, ctx.body.senha, ctx.ip, ctx.req.headers['user-agent']); return novoCookie(r.token, r.user); });
route('POST', '/api/auth/logout', { publica: true }, async ctx => { await auth.encerrarSessao(ctx.req); return { __cookie: auth.cookieHeader('', 0), data: { ok: true } }; });
route('GET', '/api/auth/eu', { semTroca: true }, ctx => eu(ctx.user));
route('POST', '/api/auth/senha', { semTroca: true }, async ctx => { await auth.trocarSenha(ctx, ctx.body.atual, ctx.body.nova); return { ok: true }; });

/* ---------- metadados e dados em cache ---------- */
route('GET', '/api/meta', ctx => {
  const entidades = {}; for (const [k, e] of Object.entries(ENTIDADES)) { if (!perms.can(ctx.user, e.modulo + ':ver')) continue; entidades[k] = { nome: k, rotulo: e.rotulo, plural: e.plural, modulo: e.modulo, titulo: e.titulo, arquivavel: !!e.arquivavel, lista: e.lista.cols, campos: Object.fromEntries(Object.entries(e.campos).map(([c, d]) => [c, { t: d.t, label: d.label, obrig: !!d.obrig, opcoes: d.opcoes, ref: d.ref, max: d.max, min: d.min, full: !!d.full, readonly: !!d.readonly, virtual: !!d.virtual, criarSo: !!d.criarSo, padrao: d.padrao, perm: d.perm }])) }; }
  return { entidades, catalogo: perms.CATALOGO, usuario: eu(ctx.user), documentoTipos: documentos.TIPOS, fases: obras.FASES };
});
route('GET', '/api/versao', ctx => ({ versao: db.dataVersion() }));
route('GET', '/api/dataset', async ctx => await dataset.montar(ctx.user));
route('GET', '/api/alertas', async ctx => await alertas.listar(ctx.user));

/* ---------- passos e andamento ---------- */
route('POST', '/api/obras/:id/passos/modelo', { perm: 'andamento:criar' }, async ctx => { await obras.modeloPadrao(ctx, ctx.params.id); return { ok: true }; });
route('POST', '/api/obras/:id/passos', { perm: 'andamento:criar' }, async ctx => ({ id: await obras.criarPasso(ctx, ctx.params.id, ctx.body) }));
route('PUT', '/api/passos/:id', { perm: 'andamento:editar' }, async ctx => { await obras.atualizarPasso(ctx, ctx.params.id, ctx.body); return { ok: true }; });
route('DELETE', '/api/passos/:id', { perm: 'andamento:excluir' }, async ctx => { await obras.excluirPasso(ctx, ctx.params.id); return { ok: true }; });
route('POST', '/api/passos/:id/mover', { perm: 'andamento:editar' }, async ctx => { await obras.moverPasso(ctx, ctx.params.id, +ctx.body.dir < 0 ? -1 : 1); return { ok: true }; });
route('POST', '/api/passos/:id/pct', { perm: 'andamento:editar' }, async ctx => { await obras.atualizarPasso(ctx, ctx.params.id, { pct: ctx.body.pct }); return { ok: true }; });
route('POST', '/api/passos/:id/baixar', { perm: ['andamento:editar', 'estoque:criar'] }, async ctx => { await obras.baixarPasso(ctx, ctx.params.id); return { ok: true }; });
route('POST', '/api/passos/:id/estornar-baixa', { perm: ['andamento:editar', 'estoque:estornar'] }, async ctx => { await obras.estornarBaixa(ctx, ctx.params.id, ctx.body.motivo); return { ok: true }; });

/* ---------- estoque ---------- */
route('POST', '/api/estoque/entrada', { perm: 'estoque:criar' }, async ctx => await estoque.entrada(ctx, ctx.body));
route('POST', '/api/estoque/saida', { perm: 'estoque:criar' }, async ctx => await estoque.saida(ctx, ctx.body));
route('POST', '/api/estoque/ajuste', { perm: 'estoque:editar' }, async ctx => await estoque.ajuste(ctx, ctx.body));
route('POST', '/api/estoque/movimentacoes/:id/estornar', { perm: 'estoque:estornar' }, async ctx => await estoque.estornar(ctx, ctx.params.id, ctx.body.motivo));
route('GET', '/api/estoque/movimentacoes', { perm: 'estoque:ver' }, async ctx => await estoque.listarMovs(ctx.query));
route('GET', '/api/estoque/sugestoes', { perm: 'compras:ver' }, async () => await estoque.sugestoesCompra());

/* ---------- compras ---------- */
route('GET', '/api/pedidos', { perm: 'compras:ver' }, async ctx => await compras.listar(ctx.query));
route('GET', '/api/pedidos/:id', { perm: 'compras:ver' }, async ctx => await compras.pedidoApi(await compras.ped(ctx.params.id)));
route('POST', '/api/pedidos', { perm: 'compras:criar' }, async ctx => ({ id: await compras.criarPedido(ctx, ctx.body) }));
route('PUT', '/api/pedidos/:id', { perm: 'compras:editar' }, async ctx => { await compras.atualizarPedido(ctx, ctx.params.id, ctx.body); return { ok: true }; });
route('POST', '/api/pedidos/:id/enviar', { perm: 'compras:editar' }, async ctx => { await compras.enviar(ctx, ctx.params.id); return { ok: true }; });
route('POST', '/api/pedidos/:id/receber', { perm: ['compras:editar', 'estoque:criar'] }, async ctx => await compras.receber(ctx, ctx.params.id, ctx.body));
route('POST', '/api/pedidos/:id/recebimentos/:recId/estornar', { perm: ['compras:editar', 'estoque:estornar'] }, async ctx => { await compras.estornarRecebimento(ctx, ctx.params.id, ctx.params.recId, ctx.body.motivo); return { ok: true }; });
route('POST', '/api/pedidos/:id/cancelar', { perm: 'compras:editar' }, async ctx => { await compras.cancelar(ctx, ctx.params.id, ctx.body.motivo); return { ok: true }; });

/* ---------- financeiro ---------- */
route('GET', '/api/contas', { perm: 'financeiro:ver' }, async ctx => await fin.listarContas(ctx.query));
route('GET', '/api/contas/:id', { perm: 'financeiro:ver' }, async ctx => await fin.obterConta(ctx.params.id));
route('POST', '/api/contas', { perm: 'financeiro:criar' }, async ctx => ({ ids: await fin.criarContas(ctx, ctx.body) }));
route('PUT', '/api/contas/:id', { perm: 'financeiro:editar' }, async ctx => { await fin.atualizarConta(ctx, ctx.params.id, ctx.body); return { ok: true }; });
route('POST', '/api/contas/:id/liquidar', { perm: 'financeiro:liquidar' }, async ctx => ({ id: await fin.liquidar(ctx, ctx.params.id, ctx.body) }));
route('POST', '/api/contas/:id/cancelar', { perm: 'financeiro:estornar' }, async ctx => { await fin.cancelarConta(ctx, ctx.params.id, ctx.body.motivo); return { ok: true }; });
route('POST', '/api/liquidacoes/:id/estornar', { perm: 'financeiro:estornar' }, async ctx => { await fin.estornarLiquidacao(ctx, ctx.params.id, ctx.body.motivo); return { ok: true }; });
route('GET', '/api/financeiro/resumo', { perm: 'financeiro:ver' }, async () => await fin.resumo());
route('GET', '/api/financeiro/fluxo', { perm: 'financeiro:ver' }, async ctx => await fin.fluxo(ctx.query.de, ctx.query.ate));

/* ---------- contratos, vendas, folha ---------- */
route('GET', '/api/contratos/:id/medicoes', { perm: 'contratos:ver' }, async ctx => await contratos.listarMedicoes(ctx.params.id));
route('POST', '/api/contratos/:id/medicoes', { perm: 'contratos:criar' }, async ctx => ({ id: await contratos.criarMedicao(ctx, ctx.params.id, ctx.body) }));
route('POST', '/api/medicoes/:id/aprovar', { perm: ['contratos:editar', 'financeiro:criar'] }, async ctx => ({ contaId: await contratos.aprovarMedicao(ctx, ctx.params.id, ctx.body) }));
route('POST', '/api/medicoes/:id/cancelar', { perm: 'contratos:editar' }, async ctx => { await contratos.cancelarMedicao(ctx, ctx.params.id, ctx.body.motivo); return { ok: true }; });
route('POST', '/api/contratos/:id/titulos', { perm: ['contratos:editar', 'financeiro:criar'] }, async ctx => ({ ids: await fin.criarContas(ctx, Object.assign({}, ctx.body, { tipo: 'Pagar', contratoId: ctx.params.id })) }));
route('GET', '/api/vendas', { perm: 'vendas:ver' }, async ctx => await vendas.listarVendas(ctx.query));
route('POST', '/api/vendas', { perm: ['vendas:criar', 'financeiro:criar'] }, async ctx => ({ id: await vendas.criarVenda(ctx, ctx.body) }));
route('POST', '/api/vendas/:id/cancelar', { perm: ['vendas:editar', 'financeiro:estornar'] }, async ctx => { await vendas.cancelarVenda(ctx, ctx.params.id, ctx.body.motivo); return { ok: true }; });
route('POST', '/api/unidades/:id/reservar', { perm: 'vendas:criar' }, async ctx => { await vendas.reservar(ctx, ctx.params.id, ctx.body); return { ok: true }; });
route('POST', '/api/unidades/:id/liberar', { perm: 'vendas:editar' }, async ctx => { await vendas.liberar(ctx, ctx.params.id); return { ok: true }; });
route('GET', '/api/folhas', { perm: 'folha:ver' }, async () => await folha.listar());
route('POST', '/api/folhas/gerar', { perm: 'folha:criar' }, async ctx => ({ id: await folha.gerar(ctx, ctx.body.competencia) }));
route('GET', '/api/folhas/:id', { perm: 'folha:ver' }, async ctx => await folha.obter(ctx.params.id));
route('PUT', '/api/folha-itens/:id', { perm: 'folha:editar' }, async ctx => { await folha.atualizarItem(ctx, ctx.params.id, ctx.body); return { ok: true }; });
route('POST', '/api/folhas/:id/fechar', { perm: 'folha:fechar' }, async ctx => { await folha.fechar(ctx, ctx.params.id); return { ok: true }; });
route('POST', '/api/folhas/:id/reabrir', { perm: 'folha:fechar' }, async ctx => { await folha.reabrir(ctx, ctx.params.id); return { ok: true }; });

/* ---------- documentos ---------- */
route('GET', '/api/documentos', { perm: 'documentos:ver' }, async ctx => await documentos.listar(ctx.query));
route('POST', '/api/documentos', { perm: 'documentos:criar', raw: true }, async ctx => ({ id: await documentos.enviar(ctx, ctx.query, ctx.rawBody, ctx.req.headers['content-type']) }));
route('GET', '/api/documentos/:id/arquivo', { perm: 'documentos:ver' }, async ctx => await documentos.baixar(ctx.params.id));
route('DELETE', '/api/documentos/:id', { perm: 'documentos:excluir' }, async ctx => { await documentos.excluir(ctx, ctx.params.id); return { ok: true }; });

/* ---------- administração ---------- */
route('GET', '/api/usuarios', { perm: 'admin:usuarios' }, async () => await admin.listarUsuarios());
route('POST', '/api/usuarios', { perm: 'admin:usuarios' }, async ctx => ({ id: await admin.criarUsuario(ctx, ctx.body) }));
route('PUT', '/api/usuarios/:id', { perm: 'admin:usuarios' }, async ctx => { await admin.atualizarUsuario(ctx, ctx.params.id, ctx.body); return { ok: true }; });
route('GET', '/api/perfis', { perm: c => (perms.can(c.user, 'admin:perfis') ? [] : 'admin:usuarios') }, async () => await admin.listarPerfis());
route('POST', '/api/perfis', { perm: 'admin:perfis' }, async ctx => ({ id: await admin.salvarPerfil(ctx, null, ctx.body) }));
route('PUT', '/api/perfis/:id', { perm: 'admin:perfis' }, async ctx => ({ id: await admin.salvarPerfil(ctx, ctx.params.id, ctx.body) }));
route('DELETE', '/api/perfis/:id', { perm: 'admin:perfis' }, async ctx => { await admin.excluirPerfil(ctx, ctx.params.id); return { ok: true }; });
route('GET', '/api/auditoria', { perm: 'admin:auditoria' }, async ctx => await admin.listarAuditoria(ctx.query));
route('GET', '/api/config', async () => await admin.obterConfig());
route('PUT', '/api/config', { perm: 'admin:config' }, async ctx => { await admin.salvarConfig(ctx, ctx.body); return { ok: true }; });
route('GET', '/api/backup/lista', { perm: 'admin:backup' }, async () => await admin.listarBackups());
route('POST', '/api/backup/snapshot', { perm: 'admin:backup' }, async ctx => { const s = await admin.snapshot('manual'); return { nome: s.nome, tamanho: s.tamanho }; });
route('GET', '/api/backup/exportar', { perm: 'admin:backup' }, async ctx => { const d = await admin.exportarJson(ctx); return { __raw: true, status: 200, body: Buffer.from(JSON.stringify(d)), headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="imperio-backup-${U.hoje()}.json"`, 'Cache-Control': 'no-store' } }; });
route('POST', '/api/backup/importar', { perm: 'admin:backup', raw: true }, async ctx => { let d; try { const buf = ctx.rawBody[0] === 0x1f && ctx.rawBody[1] === 0x8b ? require('zlib').gunzipSync(ctx.rawBody) : ctx.rawBody; d = JSON.parse(buf.toString('utf8')); } catch (_) { throw U.bad('O arquivo não é um JSON válido.'); } return await admin.importarJson(ctx, d); });
route('POST', '/api/admin/exemplo', { perm: 'admin:backup' }, async ctx => { await require('./seed').carregarExemplo(ctx); return { ok: true }; });

/* ---------- cadastros genéricos (por último, para não encobrir rotas próprias) ---------- */
const ent = ctx => ENTIDADES[ctx.params.ent] || null;
const ERRO_ENT = () => { throw U.notFound('Cadastro não encontrado.'); };
const permEnt = acao => ctx => { const e = ent(ctx); return e ? e.modulo + ':' + acao : []; };
route('GET', '/api/:ent/exportar.csv', { perm: permEnt('ver') }, async ctx => { const e = ent(ctx) || ERRO_ENT(); return { __raw: true, status: 200, body: Buffer.from(await crud.csv(e, ctx.query, ctx.user)), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${e.nome || ctx.params.ent}-${U.hoje()}.csv"`, 'Cache-Control': 'no-store' } }; });
route('GET', '/api/:ent', { perm: permEnt('ver') }, async ctx => await crud.listar(ent(ctx) || ERRO_ENT(), ctx.query, ctx.user));
route('POST', '/api/:ent', { perm: permEnt('criar') }, async ctx => { const e = ent(ctx) || ERRO_ENT(); const id = await crud.criar(e, ctx.body, ctx); return { id }; });
route('GET', '/api/:ent/:id', { perm: permEnt('ver') }, async ctx => { const e = ent(ctx) || ERRO_ENT(); const r = await crud.lerRegra(e, ctx.params.id); if (!r) throw U.notFound(); let o = crud.paraApi(e, r, ctx.user); if (e.decorar) o = (await e.decorar([o], ctx.user))[0]; return o; });
route('PUT', '/api/:ent/:id', { perm: permEnt('editar') }, async ctx => { await crud.atualizar(ent(ctx) || ERRO_ENT(), ctx.params.id, ctx.body, ctx); return { ok: true }; });
route('POST', '/api/:ent/:id/arquivar', { perm: permEnt('editar') }, async ctx => { await crud.arquivar(ent(ctx) || ERRO_ENT(), ctx.params.id, ctx, false); return { ok: true }; });
route('POST', '/api/:ent/:id/restaurar', { perm: permEnt('editar') }, async ctx => { await crud.arquivar(ent(ctx) || ERRO_ENT(), ctx.params.id, ctx, true); return { ok: true }; });
route('GET', '/api/:ent/:id/vinculos', { perm: permEnt('ver') }, async ctx => await crud.vinculos(ent(ctx) || ERRO_ENT(), ctx.params.id));
route('DELETE', '/api/:ent/:id', { perm: permEnt('excluir') }, async ctx => { await crud.excluir(ent(ctx) || ERRO_ENT(), ctx.params.id, ctx); return { ok: true }; });
log.info('rotas carregadas');
