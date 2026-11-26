'use strict';
// Dados de EXEMPLO (fictícios). Nunca são carregados sozinhos: só por `npm run seed:demo` ou pelo botão do administrador,
// e só se o sistema ainda estiver vazio. Tudo passa pelos mesmos serviços das telas, então nasce consistente.
const crypto = require('crypto');
const db = require('./db');
const { q } = db;
const U = require('./util');
const crud = require('./crud');
const { ENTIDADES } = require('./entities');
const obras = require('./services/obras');
const estoque = require('./services/estoque');
const fin = require('./services/financeiro');
const contratos = require('./services/contratos');
const vendas = require('./services/vendas');
const compras = require('./services/compras');
const folha = require('./services/folha');
const documentos = require('./services/documentos');

function dvCpf(arr) { let s = 0; arr.forEach((x, i) => { s += x * (arr.length + 1 - i); }); const r = (s * 10) % 11; return r === 10 ? 0 : r; }
const cpf = n => { const d = String(n).padStart(9, '0').split('').map(Number); d.push(dvCpf(d)); d.push(dvCpf(d)); return d.join(''); };
function cnpj(n) {
  const d = String(n).padStart(8, '0').split('').map(Number).concat([0, 0, 0, 1]);
  const dv = (a, w) => { const s = a.reduce((t, x, i) => t + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  d.push(dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); return d.join('');
}
const NOMES = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Elisa Prado', 'Fábio Nunes', 'Gabriela Dias', 'Henrique Alves', 'Isabela Torres', 'João Batista', 'Karina Melo', 'Leonardo Costa', 'Marina Ribeiro', 'Nelson Pires', 'Olívia Fontes', 'Paulo Duarte', 'Quésia Barros', 'Rafael Moura', 'Sabrina Lopes', 'Tiago Araújo', 'Úrsula Reis', 'Vitor Gomes', 'Wanda Cruz', 'Xavier Pinto', 'Yara Teixeira', 'Zeca Martins', 'Aline Barbosa', 'Caio Freitas', 'Débora Cunha', 'Eduardo Veiga'];

async function vazio() { for (const t of ['obras', 'fornecedores', 'materiais', 'empreendimentos', 'clientes', 'funcionarios']) if (await q.val(`SELECT COUNT(*) FROM ${t}`) > 0) return false; return true; }

async function carregarExemplo(ctx) {
  if (!await vazio()) throw U.conflict('O sistema já tem dados. Os dados de exemplo só podem ser carregados em um sistema vazio.');
  return db.tx(async () => {
    const H = U.hoje(), d = n => U.addDays(H, n), mk = (ent, corpo) => crud.criar(ENTIDADES[ent], corpo, ctx);

    /* fornecedores e clientes */
    const F = {}, FORN = [['Cimentos Brasil S.A.', 'Aglomerantes', 3], ['Aços Paulista', 'Aço', 5], ['Pedreira Santa Luzia', 'Agregados', 2], ['Cerâmica Vale Verde', 'Alvenaria', 7], ['Hidroelétrica Casa Forte', 'Hidráulica / Elétrica', 4], ['Acabamentos Prime', 'Acabamento', 10], ['Segura Obra EPI', 'EPI', 3]];
    for (const [i, [nome, cat, prazo]] of FORN.entries()) { F[i + 1] = await mk('fornecedores', { nome, categoria: cat, prazo, documento: cnpj(10000000 + i * 777), telefone: '1130001' + String(100 + i), email: 'vendas@' + nome.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) + '.example.com' }); }
    const CL = []; for (const [i, nome] of NOMES.entries()) CL.push(await mk('clientes', { nome, documento: cpf(100000000 + i * 3137), telefone: '119' + String(80000000 + i * 1111), email: nome.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.') + '@example.com', cidade: 'São Paulo', uf: 'SP' }));

    /* empreendimentos e unidades */
    const EMP = {};
    const EMPD = [['e1', 'Residencial Império Park', 'Condomínio de apartamentos', 'Em obras', 'São Paulo', 'Vila Mariana', 40, 54000000, 420, 28, 4], ['e2', 'Villa Imperial Alphaville', 'Condomínio de casas', 'Em obras', 'Barueri', 'Alphaville', 24, 38400000, 300, 16, 2],
      ['e3', 'Torre Business Center', 'Comercial / salas', 'Lançamento', 'Campinas', 'Cambuí', 30, 29600000, 610, 8, 3], ['e4', 'Jardins do Império', 'Loteamento', 'Entregue', 'Sorocaba', 'Campolim', 40, 24000000, -40, 39, 0]];
    for (const [k, nome, tipo, status, cidade, bairro, prev, vgv, ent, vend, res] of EMPD) EMP[k] = { id: await mk('empreendimentos', { nome, tipo, status, cidade, bairro, unidadesPrevistas: prev, vgv, entrega: d(ent) }), prev, vgv, vend, res, un: [] };
    for (const e of Object.values(EMP)) for (let i = 1; i <= e.prev; i++) e.un.push(await mk('unidades', { empId: e.id, codigo: String(100 + i), tipo: e.vgv > 40e6 ? '3 dormitórios' : 'Padrão', area: 60 + (i % 5) * 8, valorTabela: Math.round(e.vgv / e.prev / 1000) * 1000 }));

    /* materiais (estoque inicial já considera o que as obras consomem abaixo) */
    const MATS = [['Cimento CP-II 50kg', 'Aglomerantes', 'saco', 800, 36.9, 1850, 1], ['Aço CA-50 10mm', 'Aço', 'barra', 600, 58, 420, 2], ['Areia média', 'Agregados', 'm³', 60, 118, 140, 3], ['Brita 1', 'Agregados', 'm³', 60, 132, 95, 3], ['Tijolo cerâmico 9x19x19', 'Alvenaria', 'milheiro', 40, 1190, 38, 4],
      ['Bloco de concreto 14cm', 'Alvenaria', 'un', 5000, 4.9, 12500, 4], ['Tubo PVC 100mm', 'Hidráulica', 'barra', 120, 72, 210, 5], ['Fio flexível 2,5mm (100m)', 'Elétrica', 'rolo', 40, 289, 26, 5], ['Tinta acrílica 18L', 'Acabamento', 'lata', 30, 342, 85, 6], ['Porcelanato 80x80', 'Acabamento', 'm²', 400, 94, 920, 6], ['Capacete de segurança', 'EPI', 'un', 50, 24, 34, 7], ['Luva de proteção', 'EPI', 'par', 150, 9.5, 260, 7]];
    const consumo = { 0: 900 + 80, 1: 350, 2: 80 + 50, 3: 60 }; // sacos/barras/m³ que os passos baixados abaixo vão consumir (índice do material)
    const MT = []; for (const [i, [nome, categoria, unidade, minimo, custo, alvo, forn]] of MATS.entries()) MT.push(await mk('materiais', { nome, categoria, unidade, minimo, fornId: F[forn], local: 'Depósito ' + 'ABCD'[i % 4], estoqueInicial: alvo + (consumo[i] || 0), custoInicial: custo }));

    /* obras e passos */
    const OB = [['Império Park - Torre A', 'e1', 18500000, -310, 160, 'Eng. Carlos Mendes', 5, 1, 'Padrão'], ['Império Park - Torre B', 'e1', 17200000, -150, 300, 'Eng. Carlos Mendes', 3, 1, 'Padrão'], ['Villa Imperial - Fase 1', 'e2', 12800000, -280, -12, 'Eng. Juliana Prado', 6, 1, 'Padrão'],
      ['Torre Business - Fundação', 'e3', 21000000, 25, 560, 'Eng. Rafael Torres', 0, 0, 'Padrão'], ['Jardins - Infraestrutura', 'e4', 7800000, -700, -60, 'Eng. Juliana Prado', 9, 0, 'Padrão'], ['Villa Imperial - Clube', 'e2', 3200000, -90, 200, 'Eng. Juliana Prado', 2, 0, 'Padrão'],
      ['Villa Imperial - Casas de placas', 'e2', 1800000, -45, 135, 'Eng. Juliana Prado', 1, 1, 'Placas']];
    const OBRAS = []; for (const [nome, e, orc, ini, fim, resp, feitos, andamento, tipo] of OB) OBRAS.push({ id: await mk('obras', { nome, empId: EMP[e].id, orcamento: orc, inicio: d(ini), previsao: d(fim), resp, endereco: 'Endereço de exemplo', tipoObra: tipo, planta: tipo === 'Placas' ? 'Em L' : 'Retangular', usarModelo: true, pausada: nome.includes('Clube') }), feitos, andamento, nome });
    const matId = i => MT[i];
    // materiais previstos em passos (fundação e estrutura da Torre A / Fase 1)
    const usa = { 0: { 1: [[0, 900], [2, 80], [3, 60]], 2: [[1, 350], [0, 80]] }, 2: { 1: [[2, 50]] } };
    for (const [oi, passosMat] of Object.entries(usa)) { const ps = await q.all('SELECT id FROM passos WHERE obraId = ? ORDER BY ordem', OBRAS[oi].id); for (const [pi, lista] of Object.entries(passosMat)) await obras.atualizarPasso(ctx, ps[pi].id, { mats: lista.map(([m, qt]) => ({ matId: matId(m), qtd: qt })) }); }
    for (const o of OBRAS) {
      const ps = await q.all('SELECT * FROM passos WHERE obraId = ? ORDER BY ordem', o.id);
      for (const p of ps.slice(0, o.feitos)) { if (await q.val('SELECT COUNT(*) FROM passoMateriais WHERE passoId = ?', p.id)) await obras.baixarPasso(ctx, p.id); await obras.atualizarPasso(ctx, p.id, { status: 'Concluído' }); await q.run('UPDATE passos SET dataConc = ? WHERE id = ?', p.fim, p.id); }
      if (o.andamento && ps[o.feitos]) await obras.atualizarPasso(ctx, ps[o.feitos].id, { pct: o.nome.includes('placas') ? 40 : 50 });
    }

    /* funcionários */
    const FUNC = [['Carlos Mendes', 'Engenheiro Civil', 0, 14500], ['Juliana Prado', 'Engenheira Civil', 2, 14000], ['Rafael Torres', 'Engenheiro Civil', 3, 13800], ['Marcos Oliveira', 'Mestre de obras', 0, 7200], ['José Almeida', 'Pedreiro', 0, 3400], ['Paulo Santos', 'Pedreiro', 1, 3400], ['Antônio Lima', 'Armador', 1, 3600],
      ['Ricardo Souza', 'Eletricista', 2, 4100, 'Férias'], ['Fernanda Costa', 'Técnica de Segurança', 0, 5600], ['Luciana Rocha', 'Almoxarife', 2, 3300], ['Diego Ferreira', 'Encanador', 2, 3800, 'Afastado'], ['Patrícia Nunes', 'Arquiteta', -1, 9800]];
    for (const [i, [nome, cargo, oi, sal, status]] of FUNC.entries()) await mk('funcionarios', { nome, cpf: cpf(200000000 + i * 4231), cargo, vinculo: 'CLT', status: status || 'Ativo', obraId: oi >= 0 ? OBRAS[oi].id : '', salario: sal, encargosPct: 68, admissao: d(-400 - i * 40), telefone: '119' + String(70000000 + i * 999) });

    /* contratos, medições e pagamentos */
    const CT = [[0, 'Empreitada de estrutura - Torre A', 'Construtora Alicerce Ltda', 'Empreitada', 4200000, 5, [1200000, 1100000, 900000], 'Vigente', 40], [0, 'Fornecimento de concreto usinado', 'Concreto Forte S.A.', 'Fornecimento', 2800000, 0, [1000000, 900000, 700000], 'Vigente', 25], [0, 'Projeto de instalações', 'Projeta Engenharia', 'Projeto', 380000, 0, [380000], 'Encerrado', -200],
      [1, 'Empreitada de estrutura - Torre B', 'Construtora Alicerce Ltda', 'Empreitada', 3900000, 5, [700000, 500000], 'Vigente', 300], [2, 'Empreitada de acabamento', 'Acabamentos Prime', 'Empreitada', 2200000, 3, [600000, 500000], 'Vigente', -5], [3, 'Sondagem e projeto de fundação', 'GeoSolo Engenharia', 'Projeto', 290000, 0, [145000], 'Vigente', 60], [5, 'Empreitada do clube', 'Lazer & Obras Ltda', 'Empreitada', 1500000, 0, [], 'Rascunho', 190]];
    for (const [oi, nome, empresa, tipo, valor, ret, meds, status, fim] of CT) {
      const id = await mk('contratos', { nome, obraId: OBRAS[oi].id, empresa, tipo, valor, retencaoPct: ret, status: status === 'Encerrado' ? 'Vigente' : status, inicio: d(-250), fim: d(fim) });
      for (const [i, v] of meds.entries()) { const data = d(-(meds.length - i) * 35), m = await contratos.criarMedicao(ctx, id, { valorBruto: v, data, vencimento: U.addDays(data, 10), descricao: 'Medição ' + (i + 1) }); const conta = await contratos.aprovarMedicao(ctx, m, {}); const c = await fin.obterConta(conta); if (U.addDays(data, 10) <= H && !(i === meds.length - 1 && status !== 'Encerrado' && oi === 0)) await fin.liquidar(ctx, conta, { valor: c.valor, data: U.addDays(data, 10), forma: 'Transferência' }); }
      if (status === 'Encerrado') { const cur = await q.one('SELECT versao FROM contratos WHERE id = ?', id); await crud.atualizar(ENTIDADES.contratos, id, { versao: cur.versao, status: 'Encerrado' }, ctx); }
    }

    /* vendas */
    let ci = 0;
    for (const e of Object.values(EMP)) {
      for (const [i, u] of e.un.slice(0, e.vend).entries()) {
        const un = await q.one('SELECT valorTabelaC FROM unidades WHERE id = ?', u), data = d(-(15 + (i * 13) % 340)), total = U.fromC(un.valorTabelaC), entrada = Math.round(total * 0.1);
        const v = await vendas.criarVenda(ctx, { unidadeId: u, clienteId: CL[ci++ % CL.length], data, valorTotal: total, entradaValor: entrada, entradaVencimento: data, parcelas: 12, primeiroVencimento: U.addMonths(data, 1) });
        const atrasa = ci % 13 === 0; // alguns compradores estão com as parcelas dos últimos 60 dias em atraso
        for (const c of (await fin.listarContas({ vendaId: v, tamanho: 50 })).itens) if (c.vencimento <= H && !(atrasa && c.vencimento > d(-60))) await fin.liquidar(ctx, c.id, { valor: c.valor, data: c.vencimento, forma: 'Boleto' });
      }
      for (const u of e.un.slice(e.vend, e.vend + e.res)) await vendas.reservar(ctx, u, { clienteId: CL[ci++ % CL.length], reservaAte: d(10) });
    }

    /* despesas dos últimos 12 meses (administrativas e de obra) */
    for (let m = 11; m >= 0; m--) {
      const base = U.addMonths(H, -m), dia = U.addDays(base, 0 - 0);
      for (const [desc, cat, val] of [['Aluguel do escritório', 'cat_adm', 8500, null], ['Contabilidade', 'cat_adm', 3200, null], ['Software e internet', 'cat_adm', 1450, null]]) { const venc = base; if (venc <= H) await fin.criarContas(ctx, { tipo: 'Pagar', descricao: desc, valor: val, vencimento: venc, competencia: venc, catId: cat, jaPago: { data: venc, forma: 'Débito' } }); }
      for (const [i, o] of OBRAS.slice(0, 3).entries()) { const venc = U.addDays(base, 5 + i); if (venc <= H && m < 10 - i) await fin.criarContas(ctx, { tipo: 'Pagar', descricao: 'Mão de obra e serviços', valor: 380000 + i * 140000 + m * 9000, vencimento: venc, competencia: venc, catId: 'cat_empreit', obraId: o.id, jaPago: { data: venc, forma: 'PIX' } }); }
    }
    /* folha: 3 meses fechados e pagos + o mês atual aberto */
    for (let m = 3; m >= 0; m--) {
      const comp = U.addMonths(H, -m).slice(0, 7), id = await folha.gerar(ctx, comp);
      if (m > 0) { await folha.fechar(ctx, id); for (const c of (await fin.listarContas({ folhaId: id })).itens) if (c.vencimento <= H) await fin.liquidar(ctx, c.id, { valor: c.valor, data: c.vencimento, forma: 'Transferência' }); }
    }
    /* compras */
    const p1 = await compras.criarPedido(ctx, { fornId: F[2], obraId: OBRAS[1].id, parcelas: 2, primeiroVenc: d(20), itens: [{ matId: matId(1), qtd: 400, precoUnit: 58 }] }); await compras.enviar(ctx, p1);
    const p2 = await compras.criarPedido(ctx, { fornId: F[7], parcelas: 1, primeiroVenc: d(-2), itens: [{ matId: matId(10), qtd: 30, precoUnit: 24 }, { matId: matId(11), qtd: 100, precoUnit: 9.5 }] }); await compras.enviar(ctx, p2); await compras.receber(ctx, p2, { data: d(-5), doc: 'NF 8841' });
    /* tarefas e diário */
    const TAR = [['Repor estoque de aço CA-50', 1, 'Alta', 'Aberta', 3], ['Vistoria do corpo de bombeiros - Torre A', 0, 'Alta', 'Em andamento', 10], ['Replanejar cronograma da Fase 1 (atrasada)', 2, 'Alta', 'Aberta', 5], ['Liberar alvará da Torre Business', 3, 'Média', 'Em andamento', 20], ['Comprar EPIs (capacetes)', 0, 'Média', 'Aberta', 7], ['Entrega das chaves - Jardins', 4, 'Baixa', 'Resolvida', -30]];
    for (const [titulo, oi, prio, status, prazo] of TAR) await mk('tarefas', { titulo, obraId: OBRAS[oi].id, prio, status, prazo: d(prazo) });
    for (let i = 1; i <= 5; i++) await mk('diario', { obraId: OBRAS[0].id, data: d(-i), clima: i === 2 ? 'Chuva leve' : 'Bom', equipe: 18 + i, servicos: 'Concretagem e armação do pavimento ' + (14 - i), ocorrencias: i === 2 ? 'Paralisação de 2h por chuva' : '' });

    /* materiais das casas de placas */
    MT.push(await mk('materiais', { nome: 'Placa de concreto pré-moldada', categoria: 'Placas', unidade: 'un', minimo: 60, fornId: F[1], local: 'Pátio', estoqueInicial: 140, custoInicial: 310 }));
    MT.push(await mk('materiais', { nome: 'Telha de fibrocimento 2,44m', categoria: 'Outros', unidade: 'un', minimo: 200, fornId: F[4], local: 'Pátio', estoqueInicial: 380, custoInicial: 46 }));

    /* materiais previstos nos passos que ainda não foram concluídos (aparecem em Andamento > Materiais e custos) */
    const NEC = [['preliminares', [[10, 20], [11, 60]]], ['Fundação', [[0, 600], [1, 200], [2, 50], [3, 40]]], ['Estrutura', [[0, 1800], [1, 700], [2, 120], [3, 110]]], ['Alvenaria', [[4, 40], [5, 7000], [0, 350], [2, 70]]],
      ['Instalações', [[6, 240], [7, 55]]], ['Cobertura', [[0, 220]]], ['Revestimentos', [[9, 1100], [0, 300]]], ['Pintura', [[8, 120]]], ['Levantamento das placas', [[12, 120], [0, 150]]], ['Telhado', [[13, 900]]]];
    for (const [oi, o] of OBRAS.entries()) {
      const esc = Math.max(0.15, OB[oi][2] / 18500000), placas = OB[oi][8] === 'Placas';
      for (const p of await q.all("SELECT id, nome FROM passos WHERE obraId = ? AND status <> 'Concluído' ORDER BY ordem", o.id)) {
        if (await q.val('SELECT COUNT(*) FROM passoMateriais WHERE passoId = ?', p.id)) continue;
        const r = NEC.find(([k]) => p.nome.includes(k)); if (!r) continue;
        await obras.atualizarPasso(ctx, p.id, { mats: r[1].map(([m, qt]) => ({ matId: matId(m), qtd: Math.max(1, Math.round(qt * (placas ? 0.2 : esc))) })) });
      }
    }

    /* mão de obra e serviços previstos em cada passo (parte do orçamento de cada etapa) */
    const FRAC = { Padrão: [.03, .10, .24, .14, .14, .07, .12, .10, .06], Placas: [.10, .25, .45, .20] };
    for (const [oi, o] of OBRAS.entries()) { const fr = FRAC[OB[oi][8]], ps = await q.all('SELECT id FROM passos WHERE obraId = ? ORDER BY ordem', o.id); for (const [i, p] of ps.entries()) if (fr[i]) await obras.atualizarPasso(ctx, p.id, { extra: Math.round(OB[oi][2] * fr[i] * 0.85 / 100) * 100 }); }

    /* compras dos últimos 9 meses: pedido -> recebimento com NF -> conta a pagar; o material recebido é consumido pelas obras */
    const COMPRA = [[1, [[0, 300, 36.9]]], [2, [[1, 120, 58]]], [3, [[2, 40, 118], [3, 30, 132]]], [4, [[5, 2500, 4.9]]], [5, [[6, 60, 72], [7, 12, 289]]], [1, [[0, 260, 36.9]]], [6, [[9, 200, 94]]], [2, [[1, 90, 58]]], [7, [[10, 20, 24], [11, 80, 9.5]]]];
    for (const [k, [forn, itens]] of COMPRA.entries()) {
      const m = 9 - k, dataRec = U.addDays(U.addMonths(H, -m), 2); if (dataRec > H) continue;
      const reaj = 1 + k * 0.006; // reajuste de preço ao longo do ano
      const pid = await compras.criarPedido(ctx, { fornId: F[forn], parcelas: 1, primeiroVenc: U.addDays(dataRec, 28), itens: itens.map(([mi, qt, pr]) => ({ matId: matId(mi), qtd: qt, precoUnit: Math.round(pr * reaj * 100) / 100 })) });
      await compras.enviar(ctx, pid); await compras.receber(ctx, pid, { data: dataRec, doc: String(40100 + k * 37) });
      for (const c of (await fin.listarContas({ pedidoId: pid })).itens) if (c.vencimento <= H) await fin.liquidar(ctx, c.id, { valor: c.valor, data: c.vencimento, forma: 'Boleto' });
      for (const [j, [mi, qt]] of itens.entries()) {
        const dataSai = U.addDays(dataRec, 4 + j); if (dataSai > H) continue;
        const desde = U.diffDays(H, dataSai), oi = [1, 2].find(x => -OB[x][3] >= desde) ?? 0, parte = Math.round(qt * 0.6);
        await estoque.saida(ctx, { matId: matId(mi), qtd: parte, obraId: OBRAS[oi].id, data: dataSai, doc: 'Requisição ' + (300 + k * 2 + j) });
        await estoque.saida(ctx, { matId: matId(mi), qtd: qt - parte, obraId: OBRAS[0].id, data: U.addDays(dataSai, 6) > H ? dataSai : U.addDays(dataSai, 6), doc: 'Requisição ' + (301 + k * 2 + j) });
      }
    }
    await estoque.ajuste(ctx, { matId: matId(0), qtd: -12, data: d(-20), motivo: 'Sacos rasgados pela chuva no depósito' });
    // pedido em rascunho (materiais em falta) e pedido recebido pela metade
    await compras.criarPedido(ctx, { fornId: F[6], obraId: OBRAS[0].id, parcelas: 2, primeiroVenc: d(30), itens: [{ matId: matId(9), qtd: 600, precoUnit: 96.5 }, { matId: matId(8), qtd: 80, precoUnit: 349 }] });
    const p3 = await compras.criarPedido(ctx, { fornId: F[5], obraId: OBRAS[1].id, parcelas: 1, primeiroVenc: d(15), itens: [{ matId: matId(7), qtd: 60, precoUnit: 295 }] }); await compras.enviar(ctx, p3);
    const it3 = await q.one('SELECT id FROM pedidoItens WHERE pedidoId = ?', p3); await compras.receber(ctx, p3, { data: d(-3), doc: '51877', itens: [{ itemId: it3.id, qtd: 30 }] });

    /* custos (pagos) das obras que o histórico acima não cobre: Jardins (concluída), Clube (pausada) e Casas de placas */
    for (const [oi, meses, valor] of [[4, [11, 10, 9, 8, 7, 6, 5, 4, 3], 760000], [5, [3, 2, 1], 205000], [6, [1, 0], 190000]])
      for (const m of meses) { const venc = U.addDays(U.addMonths(H, -m), 8); if (venc <= H) await fin.criarContas(ctx, { tipo: 'Pagar', descricao: 'Mão de obra e serviços', valor: valor + m * 4000, vencimento: venc, competencia: venc, catId: 'cat_empreit', obraId: OBRAS[oi].id, jaPago: { data: venc, forma: 'PIX' } }); }

    /* contas a pagar em aberto: vencidas e a vencer */
    for (const [desc, val, venc, cat, oi] of [['Locação de andaimes', 18400, -6, 'cat_empreit', 0], ['Taxa de aprovação na prefeitura', 7350, -2, 'cat_projetos', 3], ['Seguro de obra (parcela)', 12900, 4, 'cat_projetos', 2], ['Locação de grua', 42000, 6, 'cat_empreit', 1], ['Energia do canteiro', 3870, 9, 'cat_empreit', 0], ['Aluguel do escritório (próximo mês)', 8500, 18, 'cat_adm', null]])
      await fin.criarContas(ctx, Object.assign({ tipo: 'Pagar', descricao: desc, valor: val, vencimento: d(venc), competencia: d(Math.min(venc, 0)), catId: cat }, oi == null ? {} : { obraId: OBRAS[oi].id }));
    // receita avulsa recebida todo mês (aluguel de uma sala comercial)
    for (let m = 5; m >= 0; m--) { const venc = U.addDays(U.addMonths(H, -m), -3); await fin.criarContas(ctx, { tipo: 'Receber', descricao: 'Aluguel de sala comercial', valor: 6200, vencimento: venc, competencia: venc, catId: 'cat_outrasrec', jaPago: { data: venc, forma: 'PIX' } }); }

    /* medição aguardando aprovação */
    const ctB = await q.one("SELECT id FROM contratos WHERE nome = 'Empreitada de estrutura - Torre B'");
    await contratos.criarMedicao(ctx, ctB.id, { valorBruto: 460000, data: d(-1), vencimento: d(9), descricao: 'Medição 3 — lajes do 6º ao 8º pavimento' });

    /* documentos com validade (geram alertas quando vencem) */
    const pdf = t => { const txt = t.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, ''), st = `BT /F1 16 Tf 60 780 Td (${txt}) Tj ET`; return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${st.length}>>stream\n${st}\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n${'% conteudo de exemplo\n'.repeat(300 + txt.length * 40)}%%EOF\n`, 'latin1'); };
    const fornIds = Object.values(F), ctIds = (await q.all('SELECT id FROM contratos ORDER BY criadoEm, id')).map(x => x.id);
    const DOCS = [['obras', OBRAS[0].id, 'Alvará de construção - Torre A', 'Alvará', 210], ['obras', OBRAS[0].id, 'AVCB - Torre A (bombeiros)', 'Certidão', 22], ['obras', OBRAS[1].id, 'ART de execução da estrutura - Torre B', 'ART/RRT', 300], ['obras', OBRAS[2].id, 'Apólice de seguro de obra - Fase 1', 'Contrato', 45],
      ['obras', OBRAS[3].id, 'Laudo de sondagem do terreno', 'Laudo', null], ['obras', OBRAS[4].id, 'Licença ambiental de operação - Jardins', 'Alvará', -10], ['obras', OBRAS[6].id, 'Projeto das casas de placas', 'Projeto', null],
      ['fornecedores', fornIds[0], 'Certidão negativa de débitos - Cimentos Brasil', 'Certidão', 12], ['fornecedores', fornIds[1], 'Certidão negativa de débitos - Aços Paulista', 'Certidão', -4],
      ['contratos', ctIds[0], 'Contrato assinado - Empreitada de estrutura Torre A', 'Contrato', null], ['empreendimentos', EMP.e1.id, 'Memorial descritivo - Residencial Império Park', 'Projeto', null], ['empreendimentos', EMP.e3.id, 'Registro de incorporação - Torre Business', 'Certidão', 160]];
    for (const [entidade, entidadeId, nome, tipo, val] of DOCS) await documentos.enviar(ctx, { entidade, entidadeId, nome: nome + '.pdf', tipo, validade: val == null ? '' : d(val) }, pdf(nome + ' (documento de exemplo)'), 'application/pdf');

    /* diário de obra das obras em andamento (dias úteis) */
    const SERV = { 0: ['Concretagem da laje do 15º pavimento', 'Armação de pilares do 16º pavimento', 'Alvenaria do 9º e 10º pavimentos', 'Instalações elétricas do 6º pavimento', 'Desforma e escoramento'], 1: ['Armação das vigas do 8º pavimento', 'Concretagem de pilares', 'Montagem de fôrmas da laje', 'Impermeabilização do subsolo'],
      2: ['Revestimento cerâmico das casas 1 a 6', 'Pintura externa das casas 7 a 12', 'Instalação de esquadrias', 'Limpeza e retirada de entulho'], 6: ['Levantamento de placas da casa 3', 'Fundação radier da casa 5', 'Montagem do telhado da casa 2'] };
    const CLIMA = ['Bom', 'Bom', 'Nublado', 'Bom', 'Chuva leve', 'Bom', 'Chuva forte', 'Nublado'];
    for (const [oi, lista] of Object.entries(SERV)) {
      let n = 0;
      for (let i = 1; i <= 34 && n < 22; i++) {
        const dia = d(-i), sem = new Date(dia + 'T12:00:00').getDay(); if (sem === 0 || (oi === '0' && i <= 5)) continue;
        const cl = sem === 6 ? 'Bom' : CLIMA[(i + +oi) % CLIMA.length];
        await mk('diario', { obraId: OBRAS[oi].id, data: dia, clima: cl, equipe: Math.round((oi === '0' ? 22 : oi === '1' ? 16 : 10) * (sem === 6 ? 0.5 : 1)) + (i % 4), servicos: lista[i % lista.length], ocorrencias: cl === 'Chuva forte' ? 'Serviço externo parado por 3h por causa da chuva' : i % 11 === 0 ? 'Entrega de material atrasou meio dia' : '' });
        n++;
      }
    }

    /* mais tarefas */
    for (const [titulo, oi, prio, status, prazo] of [['Aprovar medição 3 da Torre B', 1, 'Alta', 'Aberta', 2], ['Renovar AVCB da Torre A', 0, 'Alta', 'Em andamento', 15], ['Cobrar parcelas em atraso de compradores', 0, 'Média', 'Aberta', 4], ['Comprar porcelanato para a Fase 1', 2, 'Alta', 'Aberta', -2],
      ['Contratar equipe de pintura', 2, 'Média', 'Em andamento', 12], ['Renovar certidão negativa da Aços Paulista', 1, 'Média', 'Aberta', 6], ['Retomar obra do clube', 5, 'Baixa', 'Aberta', 45], ['Entregar casa modelo de placas', 6, 'Média', 'Aberta', 30], ['Treinamento de segurança (NR-18)', 0, 'Média', 'Resolvida', -12]])
      await mk('tarefas', { titulo, obraId: OBRAS[oi].id, prio, status, prazo: d(prazo) });
    return { ok: true };
  });
}
module.exports = { carregarExemplo, cpf, cnpj };

if (require.main === module) (async () => {
  process.env.LOG_QUIET = process.env.LOG_QUIET || '1'; await db.open();
  const auth = require('./auth'); let user = await q.one("SELECT * FROM users WHERE roleId = 'role_admin' AND ativo = 1 ORDER BY criadoEm LIMIT 1");
  if (!user) { const senha = process.env.ADMIN_SENHA || crypto.randomBytes(9).toString('base64url') + 'a1'; const email = process.env.ADMIN_EMAIL || 'admin@imperio.local'; await auth.criarUsuario({ user: null }, { nome: 'Administrador', email, senha, roleId: 'role_admin', senhaTemp: !process.env.ADMIN_SENHA }); user = await q.one('SELECT * FROM users WHERE email = ?', email); console.log(`Usuário administrador criado: ${email}  senha: ${senha}` + (process.env.ADMIN_SENHA ? "" : "  (temporária: será pedida a troca no primeiro acesso)")); }
  const t0 = Date.now(); await carregarExemplo({ user: { id: user.id, nome: user.nome, permissoes: ['*'] } }); console.log('Dados de exemplo carregados em ' + (Date.now() - t0) + ' ms.'); await db.close();
})().catch(e => { console.error(e); process.exit(1); });
