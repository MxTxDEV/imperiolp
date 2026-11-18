// Dados de exemplo (fictícios) para demonstração do sistema.
const off = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const monthOff = n => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };

const PASSO_TPL = [
  ['Serviços preliminares e canteiro', .03, [['m11', 60], ['m12', 200]]],
  ['Fundação', .10, [['m1', 900], ['m2', 350], ['m3', 80], ['m4', 60]]],
  ['Estrutura (pilares, vigas e lajes)', .24, [['m1', 2500], ['m2', 900], ['m3', 160], ['m4', 140]]],
  ['Alvenaria e vedação', .14, [['m5', 60], ['m6', 9000], ['m1', 500], ['m3', 90]]],
  ['Instalações hidráulicas e elétricas', .14, [['m7', 320], ['m8', 70]]],
  ['Cobertura e impermeabilização', .07, [['m1', 300]]],
  ['Revestimentos e pisos', .12, [['m10', 1400], ['m1', 400]]],
  ['Pintura e acabamento final', .10, [['m9', 160]]],
  ['Vistoria, limpeza e entrega', .06, []]
];
// Gera os passos padrão de uma obra, distribuindo as datas entre início e previsão.
function mkPassos(o, done, inProg) {
  const t0 = new Date(o.inicio + 'T12:00:00').getTime(), t1 = new Date(o.previsao + 'T12:00:00').getTime(), n = PASSO_TPL.length;
  const step = Math.max((t1 - t0) / n, 864e5 * 3), iso = t => new Date(t).toISOString().slice(0, 10);
  return PASSO_TPL.map((p, i) => ({
    id: 's' + Math.random().toString(36).slice(2, 9), nome: p[0], ini: iso(t0 + i * step), fim: iso(t0 + (i + 1) * step - 864e5), peso: 1,
    status: i < done ? 'Concluído' : (i === done && inProg ? 'Em andamento' : 'Pendente'), dataConc: i < done ? iso(t0 + (i + 1) * step - 864e5) : '',
    extra: Math.round((o.orcamento || 0) * p[1] * 0.9), mats: p[2].map(m => ({ matId: m[0], qtd: m[1] })), baixado: i < done, obs: ''
  }));
}

function seedData() {
  const etapas = (a, b, c, d, e) => [
    { nome: 'Fundação', pct: a }, { nome: 'Estrutura', pct: b }, { nome: 'Alvenaria', pct: c },
    { nome: 'Instalações', pct: d }, { nome: 'Acabamento', pct: e }
  ];
  const d = {
    empreendimentos: [
      { id: 'e1', nome: 'Residencial Império Park', tipo: 'Condomínio de apartamentos', cidade: 'São Paulo', bairro: 'Vila Mariana', unidades: 120, vendidas: 84, reservadas: 12, vgv: 54000000, entrega: off(420), status: 'Em obras' },
      { id: 'e2', nome: 'Villa Imperial Alphaville', tipo: 'Condomínio de casas', cidade: 'Barueri', bairro: 'Alphaville', unidades: 48, vendidas: 31, reservadas: 5, vgv: 38400000, entrega: off(300), status: 'Em obras' },
      { id: 'e3', nome: 'Torre Business Center', tipo: 'Comercial / salas', cidade: 'Campinas', bairro: 'Cambuí', unidades: 80, vendidas: 22, reservadas: 8, vgv: 29600000, entrega: off(610), status: 'Lançamento' },
      { id: 'e4', nome: 'Jardins do Império', tipo: 'Loteamento', cidade: 'Sorocaba', bairro: 'Campolim', unidades: 200, vendidas: 196, reservadas: 0, vgv: 24000000, entrega: off(-40), status: 'Entregue' }
    ],
    obras: [
      { id: 'o1', nome: 'Império Park - Torre A', empId: 'e1', status: 'Em andamento', orcamento: 18500000, gasto: 11200000, inicio: off(-310), previsao: off(160), resp: 'Eng. Carlos Mendes', endereco: 'R. Domingos de Morais, 1200', etapas: etapas(100, 90, 62, 35, 8) },
      { id: 'o2', nome: 'Império Park - Torre B', empId: 'e1', status: 'Em andamento', orcamento: 17200000, gasto: 5400000, inicio: off(-150), previsao: off(300), resp: 'Eng. Carlos Mendes', endereco: 'R. Domingos de Morais, 1200', etapas: etapas(100, 55, 20, 5, 0) },
      { id: 'o3', nome: 'Villa Imperial - Fase 1', empId: 'e2', status: 'Em andamento', orcamento: 12800000, gasto: 9100000, inicio: off(-280), previsao: off(-12), resp: 'Eng. Juliana Prado', endereco: 'Al. Rio Negro, 800', etapas: etapas(100, 100, 85, 60, 35) },
      { id: 'o4', nome: 'Torre Business - Fundação', empId: 'e3', status: 'Planejamento', orcamento: 21000000, gasto: 380000, inicio: off(25), previsao: off(560), resp: 'Eng. Rafael Torres', endereco: 'Av. Júlio de Mesquita, 500', etapas: etapas(5, 0, 0, 0, 0) },
      { id: 'o5', nome: 'Jardins - Infraestrutura', empId: 'e4', status: 'Concluída', orcamento: 7800000, gasto: 7450000, inicio: off(-700), previsao: off(-60), resp: 'Eng. Juliana Prado', endereco: 'Av. Itavuvu, 3000', etapas: etapas(100, 100, 100, 100, 100) },
      { id: 'o6', nome: 'Villa Imperial - Clube', empId: 'e2', status: 'Pausada', orcamento: 3200000, gasto: 640000, inicio: off(-90), previsao: off(200), resp: 'Eng. Juliana Prado', endereco: 'Al. Rio Negro, 800', etapas: etapas(100, 30, 0, 0, 0) }
    ],
    materiais: [
      { id: 'm1', nome: 'Cimento CP-II 50kg', cat: 'Aglomerantes', un: 'saco', qtd: 1850, min: 800, custo: 36.9, forn: 'f1', local: 'Depósito A' },
      { id: 'm2', nome: 'Aço CA-50 10mm', cat: 'Aço', un: 'barra', qtd: 420, min: 600, custo: 58, forn: 'f2', local: 'Pátio de aço' },
      { id: 'm3', nome: 'Areia média', cat: 'Agregados', un: 'm³', qtd: 140, min: 60, custo: 118, forn: 'f3', local: 'Baia 1' },
      { id: 'm4', nome: 'Brita 1', cat: 'Agregados', un: 'm³', qtd: 95, min: 60, custo: 132, forn: 'f3', local: 'Baia 2' },
      { id: 'm5', nome: 'Tijolo cerâmico 9x19x19', cat: 'Alvenaria', un: 'milheiro', qtd: 38, min: 40, custo: 1190, forn: 'f4', local: 'Depósito B' },
      { id: 'm6', nome: 'Bloco de concreto 14cm', cat: 'Alvenaria', un: 'un', qtd: 12500, min: 5000, custo: 4.9, forn: 'f4', local: 'Depósito B' },
      { id: 'm7', nome: 'Tubo PVC 100mm', cat: 'Hidráulica', un: 'barra', qtd: 210, min: 120, custo: 72, forn: 'f5', local: 'Depósito C' },
      { id: 'm8', nome: 'Fio flexível 2,5mm (100m)', cat: 'Elétrica', un: 'rolo', qtd: 26, min: 40, custo: 289, forn: 'f5', local: 'Depósito C' },
      { id: 'm9', nome: 'Tinta acrílica 18L', cat: 'Acabamento', un: 'lata', qtd: 85, min: 30, custo: 342, forn: 'f6', local: 'Depósito D' },
      { id: 'm10', nome: 'Porcelanato 80x80', cat: 'Acabamento', un: 'm²', qtd: 920, min: 400, custo: 94, forn: 'f6', local: 'Depósito D' },
      { id: 'm11', nome: 'Capacete de segurança', cat: 'EPI', un: 'un', qtd: 34, min: 50, custo: 24, forn: 'f7', local: 'Almoxarifado' },
      { id: 'm12', nome: 'Luva de proteção', cat: 'EPI', un: 'par', qtd: 260, min: 150, custo: 9.5, forn: 'f7', local: 'Almoxarifado' }
    ],
    movs: [
      { id: 'v1', data: off(-1), matId: 'm1', tipo: 'Saída', qtd: 120, obraId: 'o1', obs: 'Laje 14º pavimento' },
      { id: 'v2', data: off(-2), matId: 'm2', tipo: 'Saída', qtd: 180, obraId: 'o2', obs: 'Armação pilares' },
      { id: 'v3', data: off(-4), matId: 'm1', tipo: 'Entrada', qtd: 600, obraId: '', obs: 'NF 48213' },
      { id: 'v4', data: off(-5), matId: 'm9', tipo: 'Saída', qtd: 20, obraId: 'o3', obs: 'Pintura fase 1' },
      { id: 'v5', data: off(-7), matId: 'm10', tipo: 'Entrada', qtd: 300, obraId: '', obs: 'NF 9921' }
    ],
    funcionarios: [
      { id: 'p1', nome: 'Carlos Mendes', cargo: 'Engenheiro Civil', obraId: 'o1', status: 'Ativo', salario: 14500, adm: off(-1500), tel: '(11) 98800-1100' },
      { id: 'p2', nome: 'Juliana Prado', cargo: 'Engenheira Civil', obraId: 'o3', status: 'Ativo', salario: 14000, adm: off(-1200), tel: '(11) 98800-2200' },
      { id: 'p3', nome: 'Rafael Torres', cargo: 'Engenheiro Civil', obraId: 'o4', status: 'Ativo', salario: 13800, adm: off(-800), tel: '(19) 98800-3300' },
      { id: 'p4', nome: 'Marcos Oliveira', cargo: 'Mestre de obras', obraId: 'o1', status: 'Ativo', salario: 7200, adm: off(-2400), tel: '(11) 97700-4400' },
      { id: 'p5', nome: 'José Almeida', cargo: 'Pedreiro', obraId: 'o1', status: 'Ativo', salario: 3400, adm: off(-900), tel: '(11) 97700-5500' },
      { id: 'p6', nome: 'Paulo Santos', cargo: 'Pedreiro', obraId: 'o2', status: 'Ativo', salario: 3400, adm: off(-600), tel: '(11) 97700-6600' },
      { id: 'p7', nome: 'Antônio Lima', cargo: 'Armador', obraId: 'o2', status: 'Ativo', salario: 3600, adm: off(-700), tel: '(11) 97700-7700' },
      { id: 'p8', nome: 'Ricardo Souza', cargo: 'Eletricista', obraId: 'o3', status: 'Férias', salario: 4100, adm: off(-1100), tel: '(11) 97700-8800' },
      { id: 'p9', nome: 'Fernanda Costa', cargo: 'Técnica de Segurança', obraId: 'o1', status: 'Ativo', salario: 5600, adm: off(-500), tel: '(11) 97700-9900' },
      { id: 'p10', nome: 'Luciana Rocha', cargo: 'Almoxarife', obraId: 'o3', status: 'Ativo', salario: 3300, adm: off(-400), tel: '(11) 96600-1010' },
      { id: 'p11', nome: 'Diego Ferreira', cargo: 'Encanador', obraId: 'o3', status: 'Afastado', salario: 3800, adm: off(-1300), tel: '(11) 96600-2020' },
      { id: 'p12', nome: 'Patrícia Nunes', cargo: 'Arquiteta', obraId: '', status: 'Ativo', salario: 9800, adm: off(-950), tel: '(11) 96600-3030' }
    ],
    fornecedores: [
      { id: 'f1', nome: 'Cimentos Brasil S.A.', cat: 'Aglomerantes', tel: '(11) 3000-1001', email: 'vendas@cimentosbrasil.example', prazo: 3 },
      { id: 'f2', nome: 'Aços Paulista', cat: 'Aço', tel: '(11) 3000-1002', email: 'comercial@acospaulista.example', prazo: 5 },
      { id: 'f3', nome: 'Pedreira Santa Luzia', cat: 'Agregados', tel: '(11) 3000-1003', email: 'contato@santaluzia.example', prazo: 2 },
      { id: 'f4', nome: 'Cerâmica Vale Verde', cat: 'Alvenaria', tel: '(11) 3000-1004', email: 'pedidos@valeverde.example', prazo: 7 },
      { id: 'f5', nome: 'Hidroelétrica Casa Forte', cat: 'Hidráulica / Elétrica', tel: '(11) 3000-1005', email: 'vendas@casaforte.example', prazo: 4 },
      { id: 'f6', nome: 'Acabamentos Prime', cat: 'Acabamento', tel: '(11) 3000-1006', email: 'prime@acabamentos.example', prazo: 10 },
      { id: 'f7', nome: 'Segura Obra EPI', cat: 'EPI', tel: '(11) 3000-1007', email: 'epi@seguraobra.example', prazo: 3 }
    ],
    tarefas: [
      { id: 't1', titulo: 'Repor estoque de aço CA-50', obraId: 'o2', prio: 'Alta', status: 'Aberta', prazo: off(3) },
      { id: 't2', titulo: 'Vistoria do corpo de bombeiros - Torre A', obraId: 'o1', prio: 'Alta', status: 'Em andamento', prazo: off(10) },
      { id: 't3', titulo: 'Replanejar cronograma da Fase 1 (atrasada)', obraId: 'o3', prio: 'Alta', status: 'Aberta', prazo: off(5) },
      { id: 't4', titulo: 'Liberar alvará da Torre Business', obraId: 'o4', prio: 'Média', status: 'Em andamento', prazo: off(20) },
      { id: 't5', titulo: 'Comprar EPIs (capacetes)', obraId: 'o1', prio: 'Média', status: 'Aberta', prazo: off(7) },
      { id: 't6', titulo: 'Entrega das chaves - Jardins', obraId: 'o5', prio: 'Baixa', status: 'Resolvida', prazo: off(-30) }
    ],
    lancamentos: [
      ...[-5, -4, -3, -2, -1, 0].flatMap((m, i) => [
        { id: 'r' + i, data: monthOff(m), desc: 'Vendas de unidades', tipo: 'Receita', valor: [3.1, 3.8, 3.4, 4.6, 4.2, 5.1][i] * 1e6, obraId: '' },
        { id: 'd' + i, data: monthOff(m), desc: 'Materiais e mão de obra', tipo: 'Despesa', valor: [2.6, 2.9, 3.3, 3.5, 3.4, 3.9][i] * 1e6, obraId: '' }
      ])
    ]
  };
  const feitos = { o1: [5, 1], o2: [3, 1], o3: [6, 1], o4: [0, 0], o5: [9, 0], o6: [2, 0] };
  d.obras.forEach(o => { const f = feitos[o.id] || [0, 0]; o.passos = mkPassos(o, f[0], !!f[1]); delete o.etapas; });
  d.contratos = [
    { id: 'c1', obraId: 'o1', nome: 'Empreitada de estrutura - Torre A', empresa: 'Construtora Alicerce Ltda', tipo: 'Empreitada', status: 'Vigente', valor: 4200000, pago: 3100000, inicio: off(-250), fim: off(40), obs: 'Medição mensal' },
    { id: 'c2', obraId: 'o1', nome: 'Fornecimento de concreto usinado', empresa: 'Concreto Forte S.A.', tipo: 'Fornecimento', status: 'Vigente', valor: 2800000, pago: 2400000, inicio: off(-240), fim: off(25), obs: '' },
    { id: 'c3', obraId: 'o1', nome: 'Projeto de instalações', empresa: 'Projeta Engenharia', tipo: 'Serviço', status: 'Concluído', valor: 380000, pago: 380000, inicio: off(-330), fim: off(-200), obs: '' },
    { id: 'c4', obraId: 'o2', nome: 'Empreitada de estrutura - Torre B', empresa: 'Construtora Alicerce Ltda', tipo: 'Empreitada', status: 'Vigente', valor: 3900000, pago: 1200000, inicio: off(-120), fim: off(220), obs: '' },
    { id: 'c5', obraId: 'o3', nome: 'Empreitada de acabamento', empresa: 'Acabamentos Prime', tipo: 'Empreitada', status: 'Vigente', valor: 2200000, pago: 1100000, inicio: off(-100), fim: off(-5), obs: 'Prazo vencido, renegociar' },
    { id: 'c6', obraId: 'o4', nome: 'Sondagem e projeto de fundação', empresa: 'GeoSolo Engenharia', tipo: 'Projeto', status: 'Vigente', valor: 290000, pago: 145000, inicio: off(-20), fim: off(60), obs: '' },
    { id: 'c7', obraId: 'o6', nome: 'Empreitada do clube', empresa: 'Lazer & Obras Ltda', tipo: 'Empreitada', status: 'Rascunho', valor: 1500000, pago: 0, inicio: off(10), fim: off(190), obs: 'Aguardando retomada da obra' }
  ];
  return d;
}
