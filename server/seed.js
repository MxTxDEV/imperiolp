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

function dvCpf(arr) { let s = 0; arr.forEach((x, i) => { s += x * (arr.length + 1 - i); }); const r = (s * 10) % 11; return r === 10 ? 0 : r; }
const cpf = n => { const d = String(n).padStart(9, '0').split('').map(Number); d.push(dvCpf(d)); d.push(dvCpf(d)); return d.join(''); };
function cnpj(n) {
  const d = String(n).padStart(8, '0').split('').map(Number).concat([0, 0, 0, 1]);
  const dv = (a, w) => { const s = a.reduce((t, x, i) => t + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  d.push(dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); return d.join('');
}
const NOMES = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Elisa Prado', 'Fábio Nunes', 'Gabriela Dias', 'Henrique Alves', 'Isabela Torres', 'João Batista', 'Karina Melo', 'Leonardo Costa', 'Marina Ribeiro', 'Nelson Pires', 'Olívia Fontes', 'Paulo Duarte', 'Quésia Barros', 'Rafael Moura', 'Sabrina Lopes', 'Tiago Araújo', 'Úrsula Reis', 'Vitor Gomes', 'Wanda Cruz', 'Xavier Pinto', 'Yara Teixeira', 'Zeca Martins', 'Aline Barbosa', 'Caio Freitas', 'Débora Cunha', 'Eduardo Veiga'];

function vazio() { return ['obras', 'fornecedores', 'materiais', 'empreendimentos', 'clientes', 'funcionarios'].every(t => q.val(`SELECT COUNT(*) FROM ${t}`) === 0); }

function carregarExemplo(ctx) {
  if (!vazio()) throw U.conflict('O sistema já tem dados. Os dados de exemplo só podem ser carregados em um sistema vazio.');
  return db.tx(() => {
    const H = U.hoje(), d = n => U.addDays(H, n), mk = (ent, corpo) => crud.criar(ENTIDADES[ent], corpo, ctx);

    /* fornecedores e clientes */
    const F = {}; [['Cimentos Brasil S.A.', 'Aglomerantes', 3], ['Aços Paulista', 'Aço', 5], ['Pedreira Santa Luzia', 'Agregados', 2], ['Cerâmica Vale Verde', 'Alvenaria', 7], ['Hidroelétrica Casa Forte', 'Hidráulica / Elétrica', 4], ['Acabamentos Prime', 'Acabamento', 10], ['Segura Obra EPI', 'EPI', 3]]
      .forEach(([nome, cat, prazo], i) => { F[i + 1] = mk('fornecedores', { nome, categoria: cat, prazo, documento: cnpj(10000000 + i * 777), telefone: '1130001' + String(100 + i), email: 'vendas@' + nome.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) + '.example.com' }); });
    const CL = NOMES.map((nome, i) => mk('clientes', { nome, documento: cpf(100000000 + i * 3137), telefone: '119' + String(80000000 + i * 1111), email: nome.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.') + '@example.com', cidade: 'São Paulo', uf: 'SP' }));

    /* empreendimentos e unidades */
    const EMP = {};
    [['e1', 'Residencial Império Park', 'Condomínio de apartamentos', 'Em obras', 'São Paulo', 'Vila Mariana', 40, 54000000, 420, 28, 4], ['e2', 'Villa Imperial Alphaville', 'Condomínio de casas', 'Em obras', 'Barueri', 'Alphaville', 24, 38400000, 300, 16, 2],
      ['e3', 'Torre Business Center', 'Comercial / salas', 'Lançamento', 'Campinas', 'Cambuí', 30, 29600000, 610, 8, 3], ['e4', 'Jardins do Império', 'Loteamento', 'Entregue', 'Sorocaba', 'Campolim', 40, 24000000, -40, 39, 0]]
      .forEach(([k, nome, tipo, status, cidade, bairro, prev, vgv, ent, vend, res]) => { EMP[k] = { id: mk('empreendimentos', { nome, tipo, status, cidade, bairro, unidadesPrevistas: prev, vgv, entrega: d(ent) }), prev, vgv, vend, res, un: [] }; });
    for (const e of Object.values(EMP)) for (let i = 1; i <= e.prev; i++) e.un.push(mk('unidades', { empId: e.id, codigo: String(100 + i), tipo: e.vgv > 40e6 ? '3 dormitórios' : 'Padrão', area: 60 + (i % 5) * 8, valorTabela: Math.round(e.vgv / e.prev / 1000) * 1000 }));

    /* materiais (estoque inicial já considera o que as obras consomem abaixo) */
    const MATS = [['Cimento CP-II 50kg', 'Aglomerantes', 'saco', 800, 36.9, 1850, 1], ['Aço CA-50 10mm', 'Aço', 'barra', 600, 58, 420, 2], ['Areia média', 'Agregados', 'm³', 60, 118, 140, 3], ['Brita 1', 'Agregados', 'm³', 60, 132, 95, 3], ['Tijolo cerâmico 9x19x19', 'Alvenaria', 'milheiro', 40, 1190, 38, 4],
      ['Bloco de concreto 14cm', 'Alvenaria', 'un', 5000, 4.9, 12500, 4], ['Tubo PVC 100mm', 'Hidráulica', 'barra', 120, 72, 210, 5], ['Fio flexível 2,5mm (100m)', 'Elétrica', 'rolo', 40, 289, 26, 5], ['Tinta acrílica 18L', 'Acabamento', 'lata', 30, 342, 85, 6], ['Porcelanato 80x80', 'Acabamento', 'm²', 400, 94, 920, 6], ['Capacete de segurança', 'EPI', 'un', 50, 24, 34, 7], ['Luva de proteção', 'EPI', 'par', 150, 9.5, 260, 7]];
    const consumo = { 0: 900 + 80, 1: 350, 2: 80 + 50, 3: 60 }; // sacos/barras/m³ que os passos baixados abaixo vão consumir (índice do material)
    const MT = MATS.map(([nome, categoria, unidade, minimo, custo, alvo, forn], i) => mk('materiais', { nome, categoria, unidade, minimo, fornId: F[forn], local: 'Depósito ' + 'ABCD'[i % 4], estoqueInicial: alvo + (consumo[i] || 0), custoInicial: custo }));

    /* obras e passos */
    const OB = [['Império Park - Torre A', 'e1', 18500000, -310, 160, 'Eng. Carlos Mendes', 5, 1, 'Padrão'], ['Império Park - Torre B', 'e1', 17200000, -150, 300, 'Eng. Carlos Mendes', 3, 1, 'Padrão'], ['Villa Imperial - Fase 1', 'e2', 12800000, -280, -12, 'Eng. Juliana Prado', 6, 1, 'Padrão'],
      ['Torre Business - Fundação', 'e3', 21000000, 25, 560, 'Eng. Rafael Torres', 0, 0, 'Padrão'], ['Jardins - Infraestrutura', 'e4', 7800000, -700, -60, 'Eng. Juliana Prado', 9, 0, 'Padrão'], ['Villa Imperial - Clube', 'e2', 3200000, -90, 200, 'Eng. Juliana Prado', 2, 0, 'Padrão'],
      ['Villa Imperial - Casas de placas', 'e2', 1800000, -45, 135, 'Eng. Juliana Prado', 1, 1, 'Placas']];
    const OBRAS = OB.map(([nome, e, orc, ini, fim, resp, feitos, andamento, tipo]) => ({ id: mk('obras', { nome, empId: EMP[e].id, orcamento: orc, inicio: d(ini), previsao: d(fim), resp, endereco: 'Endereço de exemplo', tipoObra: tipo, planta: tipo === 'Placas' ? 'Em L' : 'Retangular', usarModelo: true, pausada: nome.includes('Clube') }), feitos, andamento, nome }));
    const matId = i => MT[i];
    // materiais previstos em passos (fundação e estrutura da Torre A / Fase 1)
    const usa = { 0: { 1: [[0, 900], [2, 80], [3, 60]], 2: [[1, 350], [0, 80]] }, 2: { 1: [[2, 50]] } };
    for (const [oi, passosMat] of Object.entries(usa)) { const ps = q.all('SELECT id FROM passos WHERE obraId = ? ORDER BY ordem', OBRAS[oi].id); for (const [pi, lista] of Object.entries(passosMat)) obras.atualizarPasso(ctx, ps[pi].id, { mats: lista.map(([m, qt]) => ({ matId: matId(m), qtd: qt })) }); }
    for (const o of OBRAS) {
      const ps = q.all('SELECT * FROM passos WHERE obraId = ? ORDER BY ordem', o.id);
      ps.slice(0, o.feitos).forEach(p => { if (q.val('SELECT COUNT(*) FROM passoMateriais WHERE passoId = ?', p.id)) obras.baixarPasso(ctx, p.id); obras.atualizarPasso(ctx, p.id, { status: 'Concluído' }); q.run('UPDATE passos SET dataConc = ? WHERE id = ?', p.fim, p.id); });
      if (o.andamento && ps[o.feitos]) obras.atualizarPasso(ctx, ps[o.feitos].id, { pct: o.nome.includes('placas') ? 40 : 50 });
    }

    /* funcionários */
    [['Carlos Mendes', 'Engenheiro Civil', 0, 14500], ['Juliana Prado', 'Engenheira Civil', 2, 14000], ['Rafael Torres', 'Engenheiro Civil', 3, 13800], ['Marcos Oliveira', 'Mestre de obras', 0, 7200], ['José Almeida', 'Pedreiro', 0, 3400], ['Paulo Santos', 'Pedreiro', 1, 3400], ['Antônio Lima', 'Armador', 1, 3600],
      ['Ricardo Souza', 'Eletricista', 2, 4100, 'Férias'], ['Fernanda Costa', 'Técnica de Segurança', 0, 5600], ['Luciana Rocha', 'Almoxarife', 2, 3300], ['Diego Ferreira', 'Encanador', 2, 3800, 'Afastado'], ['Patrícia Nunes', 'Arquiteta', -1, 9800]]
      .forEach(([nome, cargo, oi, sal, status], i) => mk('funcionarios', { nome, cpf: cpf(200000000 + i * 4231), cargo, vinculo: 'CLT', status: status || 'Ativo', obraId: oi >= 0 ? OBRAS[oi].id : '', salario: sal, encargosPct: 68, admissao: d(-400 - i * 40), telefone: '119' + String(70000000 + i * 999) }));

    /* contratos, medições e pagamentos */
    const CT = [[0, 'Empreitada de estrutura - Torre A', 'Construtora Alicerce Ltda', 'Empreitada', 4200000, 5, [1200000, 1100000, 900000], 'Vigente', 40], [0, 'Fornecimento de concreto usinado', 'Concreto Forte S.A.', 'Fornecimento', 2800000, 0, [1000000, 900000, 700000], 'Vigente', 25], [0, 'Projeto de instalações', 'Projeta Engenharia', 'Projeto', 380000, 0, [380000], 'Encerrado', -200],
      [1, 'Empreitada de estrutura - Torre B', 'Construtora Alicerce Ltda', 'Empreitada', 3900000, 5, [700000, 500000], 'Vigente', 300], [2, 'Empreitada de acabamento', 'Acabamentos Prime', 'Empreitada', 2200000, 3, [600000, 500000], 'Vigente', -5], [3, 'Sondagem e projeto de fundação', 'GeoSolo Engenharia', 'Projeto', 290000, 0, [145000], 'Vigente', 60], [5, 'Empreitada do clube', 'Lazer & Obras Ltda', 'Empreitada', 1500000, 0, [], 'Rascunho', 190]];
    CT.forEach(([oi, nome, empresa, tipo, valor, ret, meds, status, fim]) => {
      const id = mk('contratos', { nome, obraId: OBRAS[oi].id, empresa, tipo, valor, retencaoPct: ret, status: status === 'Encerrado' ? 'Vigente' : status, inicio: d(-250), fim: d(fim) });
      meds.forEach((v, i) => { const data = d(-(meds.length - i) * 35), m = contratos.criarMedicao(ctx, id, { valorBruto: v, data, vencimento: U.addDays(data, 10), descricao: 'Medição ' + (i + 1) }); const conta = contratos.aprovarMedicao(ctx, m, {}); const c = fin.obterConta(conta); if (U.addDays(data, 10) <= H && !(i === meds.length - 1 && status !== 'Encerrado' && oi === 0)) fin.liquidar(ctx, conta, { valor: c.valor, data: U.addDays(data, 10), forma: 'Transferência' }); });
      if (status === 'Encerrado') { const cur = q.one('SELECT versao FROM contratos WHERE id = ?', id); crud.atualizar(ENTIDADES.contratos, id, { versao: cur.versao, status: 'Encerrado' }, ctx); }
    });

    /* vendas */
    let ci = 0;
    for (const e of Object.values(EMP)) {
      e.un.slice(0, e.vend).forEach((u, i) => {
        const un = q.one('SELECT valorTabelaC FROM unidades WHERE id = ?', u), data = d(-(15 + (i * 13) % 340)), total = U.fromC(un.valorTabelaC), entrada = Math.round(total * 0.1);
        const v = vendas.criarVenda(ctx, { unidadeId: u, clienteId: CL[ci++ % CL.length], data, valorTotal: total, entradaValor: entrada, entradaVencimento: data, parcelas: 12, primeiroVencimento: U.addMonths(data, 1) });
        for (const c of fin.listarContas({ vendaId: v, tamanho: 50 }).itens) if (c.vencimento <= H) fin.liquidar(ctx, c.id, { valor: c.valor, data: c.vencimento, forma: 'Boleto' });
      });
      e.un.slice(e.vend, e.vend + e.res).forEach(u => vendas.reservar(ctx, u, { clienteId: CL[ci++ % CL.length], reservaAte: d(10) }));
    }

    /* despesas dos últimos 12 meses (administrativas e de obra) */
    for (let m = 11; m >= 0; m--) {
      const base = U.addMonths(H, -m), dia = U.addDays(base, 0 - 0);
      [['Aluguel do escritório', 'cat_adm', 8500, null], ['Contabilidade', 'cat_adm', 3200, null], ['Software e internet', 'cat_adm', 1450, null]].forEach(([desc, cat, val]) => { const venc = base; if (venc <= H) fin.criarContas(ctx, { tipo: 'Pagar', descricao: desc, valor: val, vencimento: venc, competencia: venc, catId: cat, jaPago: { data: venc, forma: 'Débito' } }); });
      OBRAS.slice(0, 3).forEach((o, i) => { const venc = U.addDays(base, 5 + i); if (venc <= H && m < 10 - i) fin.criarContas(ctx, { tipo: 'Pagar', descricao: 'Mão de obra e serviços', valor: 60000 + i * 15000 + m * 1500, vencimento: venc, competencia: venc, catId: 'cat_empreit', obraId: o.id, jaPago: { data: venc, forma: 'PIX' } }); });
    }
    /* folha: 3 meses fechados e pagos + o mês atual aberto */
    for (let m = 3; m >= 0; m--) {
      const comp = U.addMonths(H, -m).slice(0, 7), id = folha.gerar(ctx, comp);
      if (m > 0) { folha.fechar(ctx, id); for (const c of fin.listarContas({ folhaId: id }).itens) if (c.vencimento <= H) fin.liquidar(ctx, c.id, { valor: c.valor, data: c.vencimento, forma: 'Transferência' }); }
    }
    /* compras */
    const p1 = compras.criarPedido(ctx, { fornId: F[2], obraId: OBRAS[1].id, parcelas: 2, primeiroVenc: d(20), itens: [{ matId: matId(1), qtd: 400, precoUnit: 58 }] }); compras.enviar(ctx, p1);
    const p2 = compras.criarPedido(ctx, { fornId: F[7], parcelas: 1, primeiroVenc: d(-2), itens: [{ matId: matId(10), qtd: 30, precoUnit: 24 }, { matId: matId(11), qtd: 100, precoUnit: 9.5 }] }); compras.enviar(ctx, p2); compras.receber(ctx, p2, { data: d(-5), doc: 'NF 8841' });
    /* tarefas e diário */
    [['Repor estoque de aço CA-50', 1, 'Alta', 'Aberta', 3], ['Vistoria do corpo de bombeiros - Torre A', 0, 'Alta', 'Em andamento', 10], ['Replanejar cronograma da Fase 1 (atrasada)', 2, 'Alta', 'Aberta', 5], ['Liberar alvará da Torre Business', 3, 'Média', 'Em andamento', 20], ['Comprar EPIs (capacetes)', 0, 'Média', 'Aberta', 7], ['Entrega das chaves - Jardins', 4, 'Baixa', 'Resolvida', -30]]
      .forEach(([titulo, oi, prio, status, prazo]) => mk('tarefas', { titulo, obraId: OBRAS[oi].id, prio, status, prazo: d(prazo) }));
    for (let i = 1; i <= 5; i++) mk('diario', { obraId: OBRAS[0].id, data: d(-i), clima: i === 2 ? 'Chuva leve' : 'Bom', equipe: 18 + i, servicos: 'Concretagem e armação do pavimento ' + (14 - i), ocorrencias: i === 2 ? 'Paralisação de 2h por chuva' : '' });
    return { ok: true };
  });
}
module.exports = { carregarExemplo, cpf, cnpj };

if (require.main === module) {
  process.env.LOG_QUIET = process.env.LOG_QUIET || '1'; db.open();
  const auth = require('./auth'); let user = q.one("SELECT * FROM users WHERE roleId = 'role_admin' AND ativo = 1 ORDER BY criadoEm LIMIT 1");
  if (!user) { const senha = process.env.ADMIN_SENHA || crypto.randomBytes(9).toString('base64url') + 'a1'; const email = process.env.ADMIN_EMAIL || 'admin@imperio.local'; auth.criarUsuario({ user: null }, { nome: 'Administrador', email, senha, roleId: 'role_admin', senhaTemp: !process.env.ADMIN_SENHA }); user = q.one('SELECT * FROM users WHERE email = ?', email); console.log(`Usuário administrador criado: ${email}  senha temporária: ${senha}  (será pedida a troca no primeiro acesso)`); }
  const t0 = Date.now(); carregarExemplo({ user: { id: user.id, nome: user.nome, permissoes: ['*'] } }); console.log('Dados de exemplo carregados em ' + (Date.now() - t0) + ' ms.'); db.close();
}
