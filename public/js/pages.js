/* Telas: Obras, Andamento (com holograma), Condomínios e Tarefas. Dados vêm do cache APP.S; mudanças vão para a API. */
(function () {
'use strict';
const { $, esc, brl, brlS, num, dt, pct, by, nm, daysTo, initials, can, prog, isLate, low, pill, bar, header, kpi, toast, modal, closeModal, confirmBox, pedirMotivo, falha, agir, openForm, todayISO, addDays, parseMoney, campoHTML, lerCampos, mostrarErros } = APP;
const S = new Proxy({}, { get: (_, k) => APP.S[k] });
const state = APP.state, PAGES = APP.pages, ACT = APP.ACT = {};
const fil = (k, d = 'Todos') => state.f[k] || d;
const render = () => APP.render();
const chips = (k, opts) => `<div class="chips">${opts.map(o => `<button class="chip ${fil(k) === o ? 'on' : ''}" data-act="filter" data-k="${k}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
const matCost = p => p.custoMateriais, passoCost = p => p.custoPrevisto, passoReal = p => p.realizado;
const curObraId = () => { if (state.f.andObra && by(S.obras, state.f.andObra)) return state.f.andObra; const o = S.obras.find(x => x.status !== 'Concluída') || S.obras[0]; return o ? o.id : null; };
const obraAtual = () => by(S.obras, curObraId());
const csvSeguro = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function baixarCsv(nome, linhas) { const b = new Blob(['﻿' + linhas.map(l => l.map(csvSeguro).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Arquivo gerado.'); }
APP.baixarCsv = baixarCsv;

/* ============ ANDAMENTO DAS OBRAS (passos, materiais, custos, contratos) ============ */
const ORD = ['Primeiro', 'Segundo', 'Terceiro', 'Quarto', 'Quinto', 'Sexto', 'Sétimo', 'Oitavo', 'Nono', 'Décimo'];
const ordName = i => i < 10 ? ORD[i] + ' passo' : (i + 1) + 'º passo';
const passoLate = p => p.status !== 'Concluído' && daysTo(p.fim) < 0;
const toT = s => new Date(s + 'T12:00:00').getTime();

const stat = (l, v, cls = '', sub = '') => `<div class="an-stat"><small>${l}</small><b class="${cls}">${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
const ring = (p, size = 92) => { const r = size / 2 - 7, c = 2 * Math.PI * r, len = c * p / 100; return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="an-ring"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="8" style="stroke:var(--panel2)"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="8" stroke-linecap="round" style="stroke:${p === 100 ? 'var(--green)' : 'var(--gold)'}" stroke-dasharray="${len} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" style="fill:var(--txt);font:700 ${size / 4.6}px Sora,sans-serif">${p}%</text></svg>`; };

PAGES.andamento = () => {
  const id = curObraId();
  if (!id) return header('Andamento das Obras', 'Passos, prazos, materiais, custos e contratos de cada obra.') + '<div class="card empty">Cadastre uma obra primeiro.</div>';
  const o = by(S.obras, id), ps = o.passos || [], p = prog(o);
  const tabs = (o.tipoObra === 'Placas' ? ['Holograma'] : []).concat(['Passos', 'Materiais e custos', 'Contratos', 'Cronograma']), tab = tabs.includes(state.tab.and) ? state.tab.and : tabs[0];
  const done = ps.filter(x => x.status === 'Concluído').length, late = ps.filter(passoLate).length;
  const prevT = ps.reduce((s, x) => s + passoCost(x), 0), cts = S.contratos.filter(c => c.obraId === id);
  const cVal = cts.reduce((s, c) => s + c.valor, 0), cPago = cts.reduce((s, c) => s + c.pago, 0), dias = daysTo(o.previsao);
  const strip = `<div class="an-strip" role="tablist" aria-label="Obras">${S.obras.map(x => { const px = prog(x); return `<button class="an-o ${x.id === id ? 'on' : ''}" data-act="selObra" data-id="${x.id}" role="tab" aria-selected="${x.id === id}"><span class="an-o-n">${esc(x.nome)}</span><span class="an-o-p">${px}%</span><i style="--w:${px}%" class="${px === 100 ? 'ok' : (x.passos || []).some(passoLate) && x.status === 'Em andamento' ? 'late' : ''}"></i></button>`; }).join('')}</div>`;
  const head = `<div class="card an-head">
    <div class="an-title"><div><h2>${esc(o.nome)}</h2><p>${esc(nm(S.empreendimentos, o.empId))} · ${esc(o.resp || '—')} · ${dt(o.inicio)} → ${dt(o.previsao)}</p></div>${pill(o.status)}</div>
    <div class="an-bar ${p === 100 ? 'ok' : ''}"><i style="width:${p}%"></i></div>
    <div class="an-stats">${stat('Avanço', p + '%', '', `${done} de ${ps.length} passos`)}${stat('Atrasados', late, late ? 'down' : '', late ? 'passo(s) fora do prazo' : 'nenhum')}${stat('Prazo final', dias >= 0 ? dias + ' dias' : -dias + ' dias', dias < 0 ? 'down' : '', dias >= 0 ? 'restantes' : 'de atraso')}${stat('Previsto', brlS(prevT), prevT > o.orcamento ? 'down' : '', 'de ' + brlS(o.orcamento) + ' orçados')}${stat('Contratos', brlS(cVal), '', cts.length + ' · pago ' + brlS(cPago))}</div></div>`;
  const tb = `<div class="an-tabs"><div class="seg-g" role="tablist">${tabs.map(t => `<button class="seg ${tab === t ? 'on' : ''}" role="tab" aria-selected="${tab === t}" data-act="tab" data-k="and" data-v="${t}">${t}</button>`).join('')}</div>
    <div class="acts">${tab === 'Holograma' ? '<button class="btn sm" data-act="pNew">+ Novo passo</button><button class="btn ghost sm" data-act="hgFull">⛶ Tela cheia</button>' : tab === 'Passos' ? '<button class="btn sm" data-act="pNew">+ Novo passo</button><button class="btn ghost sm" data-act="pCsv">⬇ CSV</button>' : tab === 'Contratos' ? (can('contratos:criar') ? '<button class="btn sm" data-act="new" data-k="contratos">+ Novo contrato</button>' : '') : ''}</div></div>`;
  const body = tab === 'Holograma' ? tabHolo(o) : tab === 'Passos' ? tabPassos(o) : tab === 'Materiais e custos' ? tabMat(o) : tab === 'Contratos' ? tabCont(o, cts) : tabCron(o);
  return header('Andamento das Obras', 'Passos, prazos, materiais, custos e contratos de cada obra.') + strip + head + tb + body;
};

const hgS = () => (state.hg = state.hg || { ang: 0, z: 1, x: 0, y: 0 });
// zoom e deslocamento mexem só no viewBox do desenho; o giro refaz o desenho (sem refazer a página)
function aplicarHg() {
  const sv = $('.hg-svg'); if (!sv) return;
  const g = hgS(), [bx, by, bw, bh] = sv.dataset.vb.split(' ').map(Number), w = bw / g.z, h = bh / g.z, mx = (bw - w) / 2 + bw * .08, my = (bh - h) / 2 + bh * .08;
  g.x = Math.max(-mx, Math.min(mx, g.x)); g.y = Math.max(-my, Math.min(my, g.y));
  sv.setAttribute('viewBox', `${bx + bw / 2 + g.x - w / 2} ${by + bh / 2 + g.y - h / 2} ${w} ${h}`); sv.classList.toggle('zoomed', g.z > 1);
}
function desenhar() {
  const sv = $('.hg-svg'), o = by(S.obras, curObraId()); if (!sv || !o) return;
  const [est, d] = holoDados(o); sv.outerHTML = HOLO.svg(est, HOLO.rotulo(est), d.planta, d.ang); aplicarHg();
}
let quadro = 0;
const redesenhar = () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenhar(); }); };
// zoom em volta de um ponto da tela (fx, fy em 0..1 dentro do desenho), para o ponto sob o dedo/mouse ficar parado
function zoomEm(novo, fx, fy) {
  const sv = $('.hg-svg'); if (!sv) return; const g = hgS(), [bx, by, bw, bh] = sv.dataset.vb.split(' ').map(Number);
  const z = Math.max(1, Math.min(5, novo)), w0 = bw / g.z, h0 = bh / g.z, w1 = bw / z, h1 = bh / z;
  const px = bx + bw / 2 + g.x - w0 / 2 + fx * w0, py = by + bh / 2 + g.y - h0 / 2 + fy * h0;
  g.z = z; g.x = px - fx * w1 + w1 / 2 - bx - bw / 2; g.y = py - fy * h1 + h1 / 2 - by - bh / 2;
  if (z === 1) g.x = g.y = 0; aplicarHg();
}
function girar(delta) {
  const g = hgS(), a0 = g.ang, t0 = performance.now();
  const passo = t => { const k = Math.min(1, (t - t0) / 350), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; g.ang = ((a0 + delta * e) % 360 + 360) % 360; desenhar(); if (k < 1) requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
}
const holoDados = o => [HOLO.estado(o.passos, passoLate), { titulo: o.nome, sub: nm(S.empreendimentos, o.empId) + ' · ' + dt(o.inicio) + ' → ' + dt(o.previsao), total: prog(o), passos: o.passos || [], planta: o.planta || 'Retangular', ang: hgS().ang }];
function tabHolo(o) { return HOLO.view(...holoDados(o)); }
// na tela cheia o painel é atualizado por dentro: trocar o elemento faria a tela cheia fechar
const emTelaCheia = () => !!(document.fullscreenElement && document.fullscreenElement.id === 'hgBox');
function atualizar(o) { if (emTelaCheia() && o) { $('#hgBox').innerHTML = HOLO.inner(...holoDados(o)); aplicarHg(); } else render(); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) render(); });
function tabPassos(o) {
  const all = o.passos || [], ps = all.map((p, i) => ({ p, i })).filter(x => !state.q || (x.p.nome + ' ' + (x.p.obs || '')).toLowerCase().includes(state.q.toLowerCase()));
  state.open = state.open || {};
  const list = !all.length ? `<div class="card empty">Nenhum passo nesta obra.<br><br><button class="btn sm" data-act="pTpl">✨ Usar modelo padrão de obra</button></div>`
    : !ps.length ? '<div class="card empty">Nenhum passo encontrado na busca.</div>'
    : `<div class="card st-list">${ps.map(({ p, i }) => {
      const late = passoLate(p), cs = p.status === 'Concluído' ? 'done' : late ? 'late' : p.status === 'Em andamento' ? 'doing' : '', op = state.open[p.id];
      const mats = p.mats || [], falta = !p.baixado && mats.some(m => { const x = by(S.materiais, m.matId); return x && x.qtd < m.qtd; });
      return `<div class="st-row ${cs} ${op ? 'open' : ''}">
        <button class="st-dot" data-act="pToggle" data-id="${p.id}" title="${p.status === 'Concluído' ? 'Desmarcar passo' : 'Marcar passo como concluído'}" aria-label="${p.status === 'Concluído' ? 'Desmarcar' : 'Concluir'} ${esc(p.nome)}">${p.status === 'Concluído' ? '✓' : i + 1}</button>
        <div class="st-body">
          <div class="st-line" data-act="pOpen" data-id="${p.id}" role="button" tabindex="0" aria-expanded="${!!op}">
            <div class="st-txt"><small class="ord">${ordName(i)}</small><b class="st-name">${esc(p.nome)}</b>
              <span class="st-meta">${dt(p.ini).slice(0, 5)} → ${dt(p.fim)}${mats.length ? ` · ${mats.length} materia${mats.length > 1 ? 'is' : 'l'}` : ''}${falta ? ' <span class="down">⚠ falta estoque</span>' : ''}</span></div>
            <span class="st-cost">${brlS(passoCost(p))}</span>
            <span class="st-pill">${late ? `<span class="pill c-red">${-daysTo(p.fim)}d atraso</span>` : pill(p.status)}</span>
            <span class="st-car" aria-hidden="true">${op ? '▴' : '▾'}</span>
          </div>
          ${op ? `<div class="st-det">
            ${mats.length ? `<div class="mchips">${mats.map(m => { const x = by(S.materiais, m.matId), f = !p.baixado && x && x.qtd < m.qtd; return `<span class="mchip ${f ? 'bad' : ''}">${esc(x ? x.nome : '?')} · ${num(m.qtd)} ${esc(x ? x.un : '')}${f ? ' ⚠' : ''}</span>`; }).join('')}</div>` : '<p class="sm mut">Nenhum material vinculado.</p>'}
            <p class="sm mut">Materiais ${brl(matCost(p))} + mão de obra/serviços ${brl(p.extra)} = <b style="color:var(--txt)">${brl(passoCost(p))}</b> · peso ${p.peso || 1}${p.dataConc ? ' · concluído em ' + dt(p.dataConc) : ''}${p.obs ? ' · ' + esc(p.obs) : ''}</p>
            <div class="acts">${mats.length ? (p.baixado ? `<span class="pill c-green">✓ Materiais baixados</span><button class="btn ghost sm" data-act="pEstorno" data-id="${p.id}">↩ Estornar baixa</button>` : `<button class="btn green sm" data-act="pBaixa" data-id="${p.id}">📤 Baixar materiais</button>`) : ''}
              <button class="btn ghost sm" data-act="pEdit" data-id="${p.id}">✏️ Editar</button><button class="btn ghost sm" data-act="pUp" data-id="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button><button class="btn ghost sm" data-act="pDown" data-id="${p.id}" ${i === all.length - 1 ? 'disabled' : ''} aria-label="Descer">▼</button><button class="btn red sm" data-act="pDel" data-id="${p.id}" aria-label="Excluir passo">🗑</button></div>
          </div>` : ''}
        </div></div>`;
    }).join('')}</div>`;
  return `<div class="an-grid">${list}${sidePanel(o)}</div>`;
}

function sidePanel(o) {
  const ps = o.passos || [], p = prog(o), prox = ps.filter(x => x.status !== 'Concluído').sort((a, b) => a.fim.localeCompare(b.fim)).slice(0, 3);
  const tot = ps.reduce((s, x) => s + passoCost(x), 0), real = ps.reduce((s, x) => s + passoReal(x), 0);
  const need = {}; ps.filter(x => !x.baixado).forEach(x => (x.mats || []).forEach(m => need[m.matId] = (need[m.matId] || 0) + m.qtd));
  const falt = Object.keys(need).filter(k => { const m = by(S.materiais, k); return m && m.qtd < need[k]; }).length;
  return `<aside class="an-side">
    <div class="card an-sum">${ring(p)}<div><b>${ps.filter(x => x.status === 'Concluído').length} de ${ps.length} passos</b><span class="sm mut">Clique no círculo de um passo para marcar como concluído.</span></div></div>
    <div class="card"><h3>Próximos prazos</h3>${prox.length ? prox.map(x => { const d = daysTo(x.fim); return `<div class="an-next"><span>${esc(x.nome)}</span><b class="${d < 0 ? 'down' : d <= 7 ? 'warn' : ''}">${d < 0 ? -d + 'd atraso' : d === 0 ? 'hoje' : d + 'd'}</b></div>`; }).join('') : '<p class="sm mut">Todos os passos concluídos.</p>'}</div>
    <div class="card"><h3>Custos dos passos</h3>
      <div class="an-next"><span>Previsto</span><b>${brlS(tot)}</b></div><div class="an-next"><span>Realizado</span><b>${brlS(real)}</b></div><div class="an-next"><span>Orçamento</span><b>${brlS(o.orcamento)}</b></div>
      <div style="margin-top:10px">${bar(pct(tot, o.orcamento), tot > o.orcamento ? 'r' : 'b')}</div>
      <p class="sm ${falt ? 'down' : 'mut'}" style="margin-top:10px">${falt ? `⚠ ${falt} material(is) sem estoque suficiente` : '✓ Estoque cobre os materiais pendentes'}</p>
      <button class="lnk" data-act="tab" data-k="and" data-v="Materiais e custos">Ver materiais e custos →</button></div>
  </aside>`;
}

function tabMat(o) {
  const ps = o.passos || [], need = {};
  ps.forEach(p => (p.mats || []).forEach(m => { const r = need[m.matId] = need[m.matId] || { pend: 0, baix: 0 }; if (p.baixado) r.baix += m.qtd; else r.pend += m.qtd; }));
  const rows = Object.keys(need).map(k => ({ m: by(S.materiais, k), r: need[k] })).filter(x => x.m);
  const matT = ps.reduce((s, p) => s + matCost(p), 0), exT = ps.reduce((s, p) => s + (+p.extra || 0), 0), tot = matT + exT, real = ps.reduce((s, p) => s + passoReal(p), 0), est = tot > o.orcamento;
  return `<div class="an-stats an-stats-c card">${stat('Materiais', brlS(matT))}${stat('Mão de obra e serviços', brlS(exT))}${stat('Total previsto', brlS(tot), est ? 'down' : '', pct(tot, o.orcamento) + '% do orçamento')}${stat('Realizado', brlS(real))}${stat(est ? 'Estouro previsto' : 'Folga', brlS(Math.abs(o.orcamento - tot)), est ? 'down' : 'up')}</div>
  <div class="an-grid">
    <div>${rows.length ? `<div class="tw"><table class="tbl-c"><thead><tr><th>Material</th><th>A usar</th><th>Baixado</th><th>Estoque</th><th>Situação</th><th>Custo</th><th></th></tr></thead><tbody>${rows.map(({ m, r }) => { const falta = Math.max(0, r.pend - m.qtd); return `<tr><td><b>${esc(m.nome)}</b><br><small class="mut">${esc(nm(S.fornecedores, m.forn))}</small></td><td>${num(r.pend)} ${esc(m.un)}</td><td>${num(r.baix)}</td><td>${num(m.qtd)}</td><td>${falta ? `<span class="pill c-red">Falta ${num(falta)}</span>` : '<span class="pill c-green">OK</span>'}</td><td>${brlS((r.pend + r.baix) * m.custo)}</td><td><button class="btn green sm" data-act="mov" data-v="Entrada" data-id="${m.id}" aria-label="Entrada de ${esc(m.nome)}">📥</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">Nenhum material vinculado aos passos.</div>'}</div>
    <aside class="card an-side"><h3>Custo por passo</h3>${ps.map((p, i) => `<div class="an-next"><span>${i + 1}. ${esc(p.nome)}</span><b>${brlS(passoCost(p))}</b></div>`).join('') || '<p class="sm mut">Sem passos.</p>'}</aside>
  </div>`;
}
function tabCron(o) {
  const ps = o.passos || [];
  if (!ps.length) return '<div class="card empty">Sem passos para exibir.</div>';
  const t0 = Math.min(toT(o.inicio), ...ps.map(p => toT(p.ini))), t1 = Math.max(toT(o.previsao), ...ps.map(p => toT(p.fim))), span = Math.max(1, t1 - t0);
  const pos = t => Math.min(100, Math.max(0, (t - t0) / span * 100)), hoje = pos(Date.now());
  return `<div class="card gantt"><h3>Cronograma <small>${dt(o.inicio)} → ${dt(o.previsao)} · linha vermelha = hoje</small></h3>
  ${ps.map((p, i) => { const l = pos(toT(p.ini)), w = Math.max(1.5, pos(toT(p.fim)) - l), c = p.status === 'Concluído' ? 'g' : passoLate(p) ? 'r' : p.status === 'Em andamento' ? 'b' : 'n';
    return `<div class="grow"><span class="gl" title="${esc(p.nome)}">${i + 1}. ${esc(p.nome)}</span><div class="gt"><i class="gbar ${c}" style="left:${l}%;width:${w}%" title="${dt(p.ini)} → ${dt(p.fim)}">${w > 12 ? dt(p.ini).slice(0, 5) + ' → ' + dt(p.fim).slice(0, 5) : ''}</i><u class="today" style="left:${hoje}%"></u></div></div>`; }).join('')}
  <div class="legend" style="margin-top:14px"><span><i style="background:var(--green)"></i>Concluído</span><span><i style="background:var(--blue)"></i>Em andamento</span><span><i style="background:var(--mut)"></i>Pendente</span><span><i style="background:var(--red)"></i>Atrasado</span></div></div>`;
}

/* ============ OBRAS ============ */
PAGES.obras = () => {
  if (state.tab.obrasLista) return APP.listPage({ ent: 'obras', titulo: 'Obras (lista completa)', cols: [{ k: 'nome', h: 'Obra', o: 'nome', f: r => `<b>${esc(r.nome)}</b>` }, { h: 'Situação', f: r => pill(r.status) }, 'empId', 'orcamento', { h: 'Gasto', f: r => brl(r.gasto) }, { h: 'Avanço', f: r => r.prog + '%' }, 'previsao', 'resp'], acoesTopo: '<button class="btn ghost" data-act="obrasCards">▦ Ver em cartões</button>' });
  const f = fil('obras'), qq = state.q.toLowerCase(), rows = S.obras.filter(o => (f === 'Todos' || o.status === f || (f === 'Atrasadas' && isLate(o))) && (!qq || (o.nome + ' ' + o.resp + ' ' + nm(S.empreendimentos, o.empId)).toLowerCase().includes(qq)));
  const ativas = S.obras.filter(o => o.status === 'Em andamento');
  return header('Obras', 'Acompanhe andamento, orçamento, equipe e consumo de cada obra. O gasto é calculado sozinho a partir do estoque consumido e das contas da obra.', `<button class="btn ghost" data-act="obrasLista">☰ Lista e arquivadas</button><button class="btn ghost" data-ls="csv:obras">⬇ CSV</button>${can('obras:criar') ? '<button class="btn" data-act="new" data-k="obras">+ Nova obra</button>' : ''}`) + `
  <div class="grid g-kpi">${kpi('🏗️', 'blue', ativas.length, 'Em andamento')}${kpi('⏰', 'red', S.obras.filter(isLate).length, 'Atrasadas')}${kpi('✅', 'green', S.obras.filter(o => o.status === 'Concluída').length, 'Concluídas')}${kpi('💰', 'gold', brlS(S.obras.reduce((s, o) => s + o.gasto, 0)), 'Custo apropriado')}</div>
  ${chips('obras', ['Todos', 'Em andamento', 'Planejamento', 'Pausada', 'Concluída', 'Atrasadas'])}
  <div class="grid g-3">${rows.map(o => {
    const p = prog(o), g = pct(o.gasto, o.orcamento), eq = S.funcionarios.filter(x => x.obraId === o.id && x.status !== 'Desligado').length;
    return `<div class="card ocard" data-act="obra" data-id="${o.id}" role="button" tabindex="0" aria-label="Abrir ${esc(o.nome)}"><div class="row" style="align-items:flex-start"><div><h4>${esc(o.nome)}</h4><small class="mut">${esc(nm(S.empreendimentos, o.empId))}</small></div>${isLate(o) ? pill('Atrasada').replace('c-blue', 'c-red') : pill(o.status)}</div>
    <div style="margin-top:16px"><div class="row sm"><span class="mut">Avanço físico</span><b>${p}%</b></div>${bar(p, isLate(o) ? 'r' : '')}</div>
    <div style="margin-top:12px"><div class="row sm"><span class="mut">Orçamento usado</span><b>${g}%</b></div>${bar(g, g > p + 20 ? 'r' : 'b')}</div>
    <div class="meta"><div><small>Orçamento</small><b>${brlS(o.orcamento)}</b></div><div><small>Custo</small><b>${brlS(o.gasto)}</b></div><div><small>Previsão</small><b>${dt(o.previsao)}</b></div><div><small>Equipe</small><b>${eq} pessoa(s)</b></div></div>
    <small class="mut">👷 ${esc(o.resp || '—')}</small></div>`;
  }).join('') || `<div class="card empty" style="grid-column:1/-1">${S.obras.length ? 'Nenhuma obra encontrada.' : 'Nenhuma obra cadastrada ainda.' + (can('obras:criar') ? '<br><br><button class="btn sm" data-act="new" data-k="obras">+ Cadastrar a primeira obra</button>' : '')}</div>`}</div>`;
};
function openObra(id) {
  const o = by(S.obras, id); if (!o) return;
  const eq = S.funcionarios.filter(f => f.obraId === id && f.status !== 'Desligado'), consumo = S.movs.filter(v => v.obraId === id && v.tipo === 'Saída' && !v.estornada), tf = S.tarefas.filter(t => t.obraId === id && t.status !== 'Resolvida');
  modal(esc(o.nome), `
  <div class="grid g-kpi" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${kpi('📈', 'blue', prog(o) + '%', 'Avanço físico')}${kpi('💰', 'gold', brlS(o.gasto), 'de ' + brlS(o.orcamento))}${kpi('📅', isLate(o) ? 'red' : 'green', dt(o.previsao), 'Previsão', isLate(o) ? '<span class="down">Atrasada</span>' : '')}</div>
  <p class="mut sm" style="margin-bottom:18px">${pill(o.status)} &nbsp; ${esc(nm(S.empreendimentos, o.empId))} · ${esc(o.endereco || 'Sem endereço')} · Resp.: ${esc(o.resp || '—')}<br>Custo = material consumido ${brl(o.custoMaterial)} + contas que entram no custo da obra ${brl(o.custoContas)}</p>
  <div class="card" style="margin-bottom:16px;box-shadow:none"><h3>Passos da obra <small>${prog(o)}% concluído</small></h3>${(o.passos || []).map(p => `<div class="row sm" style="padding:5px 0"><span>${p.status === 'Concluído' ? '✅' : p.status === 'Em andamento' ? '🔵' : '⬜'} ${esc(p.nome)}</span><span class="mut">até ${dt(p.fim)}</span></div>`).join('') || '<p class="mut sm">Sem passos. Abra o andamento para criar.</p>'}</div>
  <div class="grid g-2" style="grid-template-columns:1fr 1fr">
    <div><h3 style="font-size:.95rem;margin-bottom:8px">👷 Equipe alocada (${eq.length})</h3><div class="list">${eq.map(f => `<div class="li"><span class="avatar" style="margin:0">${initials(f.nome)}</span><div><b>${esc(f.nome)}</b><small>${esc(f.cargo)}</small></div></div>`).join('') || '<p class="mut sm">Ninguém alocado.</p>'}</div></div>
    <div><h3 style="font-size:.95rem;margin-bottom:8px">📤 Materiais consumidos</h3><div class="list">${consumo.slice(0, 6).map(v => { const m = by(S.materiais, v.matId); return `<div class="li"><div><b>${esc(m ? m.nome : '—')}</b><small>${dt(v.data)}</small></div><div class="end">${num(v.qtd)} ${esc(m ? m.un : '')}</div></div>`; }).join('') || '<p class="mut sm">Sem consumo registrado.</p>'}</div>
    <h3 style="font-size:.95rem;margin:14px 0 8px">✅ Tarefas abertas (${tf.length})</h3>${tf.map(t => `<div class="sm" style="padding:4px 0">• ${esc(t.titulo)} ${pill(t.prio)}</div>`).join('') || '<p class="mut sm">Nenhuma.</p>'}</div>
  </div>`,
  `${can('obras:excluir') ? '<button class="btn red" id="oDel">Excluir</button>' : ''}${can('obras:editar') ? '<button class="btn ghost" id="oArq">🗄 Arquivar</button><button class="btn ghost" id="oEdit">✏️ Editar dados</button>' : ''}<button class="btn" id="oAnd">📈 Abrir andamento</button>`, true);
  $('#oAnd').onclick = () => { state.f.andObra = id; closeModal(); location.hash = '#/andamento'; };
  const e = $('#oEdit'); if (e) e.onclick = () => openForm('obras', id); const d = $('#oDel'); if (d) d.onclick = () => { closeModal(); APP.excluirRegistro('obras', id, o.nome); };
  const a = $('#oArq'); if (a) a.onclick = () => { closeModal(); confirmBox(`Arquivar <b>${esc(o.nome)}</b>? Ela sai das listas, mas todo o histórico (estoque, contas, diário) é preservado.`, () => agir(() => API.post(`/api/obras/${id}/arquivar`), 'Obra arquivada.'), 'Arquivar', false); };
}
APP.openObra = openObra;

/* ============ CONDOMÍNIOS ============ */
PAGES.empreendimentos = () => {
  const qq = state.q.toLowerCase(), f = fil('emp'), r2 = S.empreendimentos.filter(e => (f === 'Todos' || e.status === f) && (!qq || (e.nome + e.cidade + e.bairro).toLowerCase().includes(qq)));
  const tu = S.empreendimentos.reduce((s, e) => s + e.unidades, 0), tv = S.empreendimentos.reduce((s, e) => s + e.vendidas, 0);
  return header('Condomínios e Empreendimentos', 'Carteira de lançamentos, unidades, vendas e entregas. As vendas vêm do cadastro de unidades e vendas.', `<button class="btn ghost" data-ls="csv:empreendimentos">⬇ CSV</button>${can('empreendimentos:criar') ? '<button class="btn" data-act="new" data-k="empreendimentos">+ Novo empreendimento</button>' : ''}`) + `
  <div class="grid g-kpi">${kpi('🏢', 'gold', S.empreendimentos.length, 'Empreendimentos')}${kpi('🏠', 'blue', num(tu), 'Unidades')}${kpi('🤝', 'green', num(tv), 'Unidades vendidas')}${kpi('💎', 'purple', brlS(S.empreendimentos.reduce((s, e) => s + e.vgv, 0)), 'VGV total')}${kpi('💵', 'orange', brlS(S.empreendimentos.reduce((s, e) => s + e.recebido, 0)), 'Já recebido')}</div>
  ${chips('emp', ['Todos', 'Lançamento', 'Em obras', 'Entregue'])}
  <div class="grid g-3">${r2.map(e => {
    const ob = S.obras.filter(o => o.empId === e.id).length;
    return `<div class="card"><div class="row" style="align-items:flex-start"><div><h3 style="margin:0">${esc(e.nome)}</h3><small class="mut">${esc(e.tipo)} · ${esc(e.bairro)}${e.bairro && e.cidade ? ', ' : ''}${esc(e.cidade)}</small></div>${pill(e.status)}</div>
    <div style="margin:18px 0 6px" class="row sm"><span class="mut">Vendas</span><b>${pct(e.vendidas, e.unidades)}%</b></div><div class="bar g"><i style="width:${pct(e.vendidas, e.unidades)}%"></i></div>
    <div class="legend"><span><i style="background:var(--green)"></i>${e.vendidas} vendidas</span><span><i style="background:var(--orange)"></i>${e.reservadas} reservadas</span><span><i style="background:var(--mut)"></i>${e.disponiveis} disponíveis</span></div>
    <div class="meta"><div><small>VGV</small><b>${brlS(e.vgv)}</b></div><div><small>Vendido</small><b>${brlS(e.vgvVendido)}</b></div><div><small>Entrega</small><b>${dt(e.entrega)}</b></div><div><small>Obras</small><b>${ob}</b></div></div>
    <div class="acts"><button class="btn ghost sm" data-act="verUnid" data-id="${e.id}">🏠 Unidades</button>${can('empreendimentos:editar') ? `<button class="btn ghost sm" data-act="edit" data-k="empreendimentos" data-id="${e.id}">✏️ Editar</button><button class="btn ghost sm" data-act="arq" data-k="empreendimentos" data-id="${e.id}">🗄</button>` : ''}${can('empreendimentos:excluir') ? `<button class="btn red sm" data-act="del" data-k="empreendimentos" data-id="${e.id}" aria-label="Excluir">🗑</button>` : ''}</div></div>`;
  }).join('') || '<div class="card empty" style="grid-column:1/-1">Nenhum empreendimento.</div>'}</div>`;
};

/* ============ TAREFAS ============ */
PAGES.tarefas = () => {
  const cols = ['Aberta', 'Em andamento', 'Resolvida'], qq = state.q.toLowerCase(), rows = S.tarefas.filter(t => !qq || (t.titulo + nm(S.obras, t.obraId)).toLowerCase().includes(qq)), edit = can('tarefas:editar');
  return header('Tarefas e Ocorrências', 'Quadro de pendências das obras.', `<button class="btn ghost" data-ls="csv:tarefas">⬇ CSV</button>${can('tarefas:criar') ? '<button class="btn" data-act="new" data-k="tarefas">+ Nova tarefa</button>' : ''}`) + `<div class="kan">${cols.map((c, ci) => `<div class="kcol"><h3>${c} <span class="pill gray">${rows.filter(t => t.status === c).length}</span></h3>${rows.filter(t => t.status === c).map(t => `<div class="kcard"><b>${esc(t.titulo)}</b><div class="row sm"><span class="mut">${esc(nm(S.obras, t.obraId))}</span>${pill(t.prio)}</div><div class="sm mut" style="margin-top:4px">📅 ${dt(t.prazo)} ${t.respId ? '· 👤 ' + esc(APP.refName('users', t.respId)) : ''} ${t.prazo && c !== 'Resolvida' && daysTo(t.prazo) < 0 ? '<span class="down">· vencida</span>' : ''}</div>
    ${edit ? `<div class="acts">${ci > 0 ? `<button class="btn ghost sm" data-act="move" data-id="${t.id}" data-v="${cols[ci - 1]}" aria-label="Voltar para ${cols[ci - 1]}">◀</button>` : ''}${ci < 2 ? `<button class="btn green sm" data-act="move" data-id="${t.id}" data-v="${cols[ci + 1]}">${ci === 1 ? '✔ Concluir' : 'Iniciar ▶'}</button>` : ''}<button class="btn ghost sm" data-act="edit" data-k="tarefas" data-id="${t.id}" aria-label="Editar tarefa">✏️</button><button class="btn ghost sm" data-act="arq" data-k="tarefas" data-id="${t.id}" aria-label="Arquivar tarefa">🗄</button></div>` : ''}</div>`).join('') || '<p class="empty">Vazio</p>'}</div>`).join('')}</div>`;
};

/* ============ ANDAMENTO: contratos, passos e ações ============ */
function tabCont(o, cts) {
  const v = cts.reduce((s, c) => s + c.valor, 0), pg = cts.reduce((s, c) => s + c.pago, 0), comp = cts.reduce((s, c) => s + c.comprometido, 0);
  return `<div class="an-stats an-stats-c card">${stat('Contratos', cts.length)}${stat('Contratado', brlS(v))}${stat('Lançado', brlS(comp), '', 'medições e títulos')}${stat('Pago', brlS(pg), 'up')}${stat('A pagar', brlS(comp - pg), comp - pg > 0 ? 'warn' : '')}</div>` +
  (cts.length ? `<div class="ct-list">${cts.map(c => { const pc = pct(c.pago, c.valor), d = c.fim ? daysTo(c.fim) : 999, venc = c.status === 'Vigente' && d < 0, perto = c.status === 'Vigente' && d >= 0 && d <= 30;
    return `<div class="card ct"><div class="ct-top"><div><b>${esc(c.nome)}</b><small class="mut">${esc(c.empresa)} · ${esc(c.tipo)}</small></div>${pill(c.status)}</div>
      <div class="ct-mid"><span class="sm mut">${dt(c.inicio)} → ${dt(c.fim)}${venc ? ' <b class="down">· vencido</b>' : perto ? ` <b class="warn">· vence em ${d}d</b>` : ''}</span><span class="sm"><b>${brlS(c.pago)}</b> <span class="mut">de ${brlS(c.valor)}</span></span></div>${bar(pc, 'g')}
      <div class="ct-bot"><span class="sm mut">${pc}% pago · medido ${brlS(c.medido)} · saldo do contrato ${brl(c.valor - c.comprometido)}</span><div class="acts"><button class="btn green sm" data-act="ctDet" data-id="${c.id}">📐 Medições e pagamentos</button></div></div></div>`; }).join('')}</div>` : '<div class="card empty">Nenhum contrato nesta obra.</div>');
}
APP.tabCont = tabCont;
function openPasso(oid, pid, fase0) {
  const o = by(S.obras, oid), cur = pid ? o.passos.find(x => x.id === pid) : null, lastP = o.passos[o.passos.length - 1], ini0 = lastP ? addDays(lastP.fim, 1) : o.inicio;
  const ini1 = ini0 > o.previsao ? o.previsao : ini0, p = cur || { nome: '', fase: fase0 || '', status: 'Pendente', pct: 0, ini: ini1, fim: addDays(ini1, 30) > o.previsao ? o.previsao : addDays(ini1, 30), peso: 1, extra: 0, mats: [], obs: '' };
  const travado = cur && cur.baixado;
  const mrow = m => `<div class="mrow"><select name="mat" ${travado ? 'disabled' : ''}>${S.materiais.map(x => `<option value="${x.id}" ${x.id === m.matId ? 'selected' : ''}>${esc(x.nome)} (${esc(x.un)} · ${brl(x.custo)})</option>`).join('')}</select><input name="q" type="number" min="0" step="any" value="${m.qtd}" aria-label="Quantidade" ${travado ? 'disabled' : ''}><button type="button" class="btn red sm" data-rm ${travado ? 'disabled' : ''}>✕</button></div>`;
  modal(cur ? 'Editar passo' : 'Novo passo', `<form class="form" id="frm" novalidate>
    <label class="full">Nome do passo<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Fundação"><span class="err" data-err="nome"></span></label>
    ${o.tipoObra === 'Placas' ? `<label class="full">Etapa no holograma<select name="fase"><option value="">Automática (pelo nome do passo)</option>${HOLO.FASES.map(F => `<option value="${F.k}" ${F.k === (p.fase || '') ? 'selected' : ''}>${F.nome}</option>`).join('')}</select></label>` : ''}
    <label>Situação<select name="status">${['Pendente', 'Em andamento', 'Concluído'].map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label>Avanço do passo (%) <small class="mut">só vale em andamento</small><input name="pct" type="number" min="0" max="100" step="5" value="${p.status === 'Em andamento' ? (p.pct || 0) : 0}"><span class="err" data-err="pct"></span></label>
    <label class="full">Peso na barra (importância)<input name="peso" type="number" min="1" step="1" value="${p.peso || 1}"><span class="err" data-err="peso"></span></label>
    <label>Início previsto<input name="ini" type="date" required value="${p.ini}"><span class="err" data-err="ini"></span></label><label>Prazo (término)<input name="fim" type="date" required value="${p.fim}"><span class="err" data-err="fim"></span></label>
    <label class="full">Mão de obra e serviços previstos (R$)<input name="extra" inputmode="decimal" value="${APP.fmtMoneyIn(p.extra || 0)}"><span class="err" data-err="extra"></span></label>
    <div class="full"><b class="sm">Materiais necessários neste passo</b>${travado ? '<p class="sm warn">Os materiais já foram baixados do estoque. Para alterá-los, estorne a baixa antes.</p>' : ''}<div id="pm" style="margin-top:8px">${(p.mats || []).map(mrow).join('')}</div>${travado ? '' : '<button type="button" class="btn ghost sm" id="pmAdd" style="margin-top:6px">+ Adicionar material</button>'}<span class="err" data-err="mats"></span><p class="sm mut" id="pTot" style="margin-top:8px"></p></div>
    <label class="full">Observações<input name="obs" value="${esc(p.obs || '')}"></label></form>`, `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Salvar passo</button>`);
  const fm = $('#frm'), rows = () => [...document.querySelectorAll('#pm .mrow')].map(r => ({ matId: r.querySelector('select').value, qtd: parseFloat(r.querySelector('input').value) || 0 })).filter(m => m.qtd > 0);
  const recalc = () => { const mc = rows().reduce((s, m) => s + (by(S.materiais, m.matId) || { custo: 0 }).custo * m.qtd, 0), ex = parseMoney(fm.elements.extra.value) || 0; $('#pTot').innerHTML = `Custo previsto: materiais <b>${brl(mc)}</b> + serviços <b>${brl(+ex || 0)}</b> = <b style="color:var(--gold2)">${brl(mc + (+ex || 0))}</b>`; };
  const add = $('#pmAdd'); if (add) add.onclick = () => { if (!S.materiais.length) return toast('Cadastre um material no estoque primeiro.', 'erro'); $('#pm').insertAdjacentHTML('beforeend', mrow({ matId: S.materiais[0].id, qtd: 1 })); recalc(); };
  $('#pm').addEventListener('click', e => { if (e.target.closest('[data-rm]')) { e.target.closest('.mrow').remove(); recalc(); } }); fm.addEventListener('input', recalc); fm.addEventListener('change', recalc); recalc();
  const ok = async () => {
    const d = { nome: fm.elements.nome.value.trim(), status: fm.elements.status.value, peso: Number(fm.elements.peso.value) || 1, ini: fm.elements.ini.value, fim: fm.elements.fim.value, extra: parseMoney(fm.elements.extra.value) || 0, obs: fm.elements.obs.value.trim() };
    if (fm.elements.fase) d.fase = fm.elements.fase.value; d.pct = d.status === 'Concluído' ? 100 : d.status === 'Pendente' ? 0 : Math.min(99, Math.max(0, parseInt(fm.elements.pct.value) || 0)); if (!travado) d.mats = rows(); if (cur) d.versao = cur.versao;
    const b = $('#frmOk'); b.disabled = true;
    try { if (cur) await API.put('/api/passos/' + cur.id, d); else await API.post(`/api/obras/${oid}/passos`, d); closeModal(); await APP.reload(); render(); toast('Passo salvo.'); }
    catch (e) { b.disabled = false; if (e.status === 422) { mostrarErros(fm, e.erros); toast('Corrija os campos destacados.', 'erro'); } else falha(e); }
  };
  $('#frmOk').onclick = ok; fm.onsubmit = e => { e.preventDefault(); ok(); };
}
const passoDe = id => { const o = obraAtual(); return o && o.passos.find(x => x.id === id); };
async function togglePasso(id) { const p = passoDe(id), o = obraAtual(); if (!p) return; const ia = p.status !== 'Concluído'; await agirAtualizar(() => API.put('/api/passos/' + id, { versao: p.versao, status: ia ? 'Concluído' : 'Pendente' }), ia ? `✅ Passo concluído` : 'Passo reaberto'); }
async function setPct(id, v) { await agirAtualizar(() => API.post(`/api/passos/${id}/pct`, { pct: v }), 'Avanço atualizado'); }
async function agirAtualizar(fn, msg) { try { await fn(); await APP.reload(); const o = obraAtual(); atualizar(o); toast(msg + (o ? ` · obra em ${prog(o)}%` : '')); } catch (e) { falha(e); await APP.reload().catch(() => {}); render(); } }
function baixarPasso(id) {
  const p = passoDe(id), o = obraAtual(), falta = (p.mats || []).map(m => { const x = by(S.materiais, m.matId); return !x || x.qtd < m.qtd ? `${x ? x.nome : '?'} (faltam ${num(m.qtd - (x ? x.qtd : 0))})` : null; }).filter(Boolean);
  if (falta.length) return toast('Estoque insuficiente: ' + falta.join(', ') + '. Registre a entrada ou faça um pedido de compra.', 'erro');
  confirmBox(`Dar baixa dos materiais deste passo no estoque? Será registrada uma saída para <b>${esc(o.nome)}</b> no valor de ${brl(p.custoMateriais)}, e esse valor entra no custo da obra.`, () => agir(() => API.post(`/api/passos/${id}/baixar`), 'Materiais baixados do estoque.'), 'Dar baixa', false);
}
const estornarBaixa = id => pedirMotivo('Estornar a baixa de materiais', 'Os materiais voltam ao estoque e o custo sai da obra. A baixa original continua no histórico.', m => agir(() => API.post(`/api/passos/${id}/estornar-baixa`, { motivo: m }), 'Baixa estornada.'), 'Estornar baixa');
function excluirPasso(id) { const p = passoDe(id); confirmBox(`Excluir o passo <b>${esc(p.nome)}</b>?`, async () => { try { await API.del('/api/passos/' + id); await APP.reload(); render(); toast('Passo excluído.'); } catch (e) { falha(e); } }); }
function exportPassos(o) { baixarCsv('passos-' + o.nome.replace(/\W+/g, '-').toLowerCase() + '.csv', [['Ordem', 'Passo', 'Situação', 'Início', 'Prazo', 'Peso', 'Custo previsto', 'Realizado', 'Concluído em']].concat(o.passos.map((p, i) => [ordName(i), p.nome, p.status, p.ini, p.fim, p.peso, String(p.custoPrevisto.toFixed(2)).replace('.', ','), String(p.realizado.toFixed(2)).replace('.', ','), p.dataConc]))); }
APP.agirAtualizar = agirAtualizar;

/* ============ detalhe do contrato: medições e pagamentos ============ */
async function openContrato(id) {
  let c, meds, contas; try { [c, meds, contas] = await Promise.all([API.get('/api/contratos/' + id), API.get(`/api/contratos/${id}/medicoes`), API.get('/api/contas', { contratoId: id, tamanho: 100 })]); } catch (e) { return falha(e); }
  const cod = can('contratos:editar'), cc = can('contratos:criar');
  modal(esc(c.nome), `<p class="sm mut">${esc(c.empresa)} · ${esc(c.tipo)} · ${pill(c.status)} · obra ${esc(nm(S.obras, c.obraId))} · retenção ${c.retencaoPct}%</p>
  <div class="det-grid"><div><small>Valor do contrato</small><b>${brl(c.valor)}</b></div><div><small>Medido</small><b>${brl(c.medido)}</b></div><div><small>Lançado (a pagar)</small><b>${brl(c.comprometido)}</b></div><div><small>Pago</small><b class="up">${brl(c.pago)}</b></div><div><small>Retido</small><b>${brl(c.retido)}</b></div><div><small>Saldo do contrato</small><b>${brl(c.saldoContratual)}</b></div></div>
  <h3 style="margin:16px 0 8px;font-size:1rem">Medições ${cc && c.status === 'Vigente' ? '<button class="btn sm" id="medNova" style="margin-left:10px">+ Nova medição</button>' : ''}</h3>
  ${meds.length ? `<div class="tw"><table><thead><tr><th>Nº</th><th>Data</th><th>Descrição</th><th>Bruto</th><th>Retenção</th><th>Desconto</th><th>Líquido</th><th>Situação</th><th></th></tr></thead><tbody>${meds.map(m => `<tr><td>${m.numero}</td><td>${dt(m.data)}</td><td>${esc(m.descricao)}</td><td>${brl(m.valorBruto)}</td><td>${brl(m.retencao)}</td><td>${brl(m.desconto)}</td><td><b>${brl(m.valorLiquido)}</b></td><td>${pill(m.status)}</td><td><div class="acts">${cod && m.status === 'Rascunho' ? `<button class="btn green sm" data-md="aprovar:${m.id}">Aprovar</button>` : ''}${cod && m.status !== 'Cancelada' ? `<button class="btn red sm" data-md="cancelar:${m.id}">Cancelar</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="sm mut">Nenhuma medição.</p>'}
  <h3 style="margin:16px 0 8px;font-size:1rem">Contas deste contrato ${cod && c.status === 'Vigente' && can('financeiro:criar') ? '<button class="btn sm" id="ctTit" style="margin-left:10px">+ Lançar pagamento</button>' : ''}</h3>
  ${contas.itens.length ? `<div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor</th><th>Pago</th><th>Situação</th><th></th></tr></thead><tbody>${contas.itens.map(k => `<tr><td>${dt(k.vencimento)}</td><td>${esc(k.descricao)}</td><td>${brl(k.valor)}</td><td>${brl(k.pago)}</td><td>${pill(k.situacao)}</td><td><div class="acts">${can('financeiro:liquidar') && k.saldo > 0 ? `<button class="btn green sm" data-md="baixar:${k.id}">💵 Baixar</button>` : ''}<button class="btn ghost sm" data-md="conta:${k.id}">Detalhes</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="sm mut">Nenhuma conta lançada.</p>'}`,
    `<button class="btn ghost" data-close>Fechar</button>${can('contratos:editar') ? '<button class="btn ghost" id="ctEdit">✏️ Editar contrato</button>' : ''}`, true);
  const nov = $('#medNova'); if (nov) nov.onclick = () => novaMedicao(c);
  const tit = $('#ctTit'); if (tit) tit.onclick = () => novoTituloContrato(c); const ed = $('#ctEdit'); if (ed) ed.onclick = () => openForm('contratos', id, { aoSalvar: () => openContrato(id) });
  $('#modal').querySelectorAll('[data-md]').forEach(b => b.onclick = async () => { const [a, x] = b.dataset.md.split(':');
    if (a === 'aprovar') { modal('Aprovar medição', '<p class="sm mut">Aprovar cria a conta a pagar (valor líquido).</p><form class="form" id="frm" novalidate><label class="full">Vencimento do pagamento<input name="vencimento" type="date" required value="' + addDays(todayISO(), 15) + '"><span class="err" data-err="vencimento"></span></label></form>', '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Aprovar</button>'); $('#frmOk').onclick = async () => { try { await API.post(`/api/medicoes/${x}/aprovar`, { vencimento: $('#frm').vencimento.value }); await APP.reload(); render(); toast('Medição aprovada. Conta a pagar criada.'); openContrato(id); } catch (e) { if (e.status === 422) mostrarErros($('#frm'), e.erros); else falha(e); } }; }
    else if (a === 'cancelar') pedirMotivo('Cancelar medição', 'A conta a pagar gerada também é cancelada (se ainda não houver pagamento).', async m => { try { await API.post(`/api/medicoes/${x}/cancelar`, { motivo: m }); await APP.reload(); render(); toast('Medição cancelada.'); openContrato(id); } catch (e) { falha(e); openContrato(id); } }, 'Cancelar medição');
    else if (a === 'baixar') APP.abrirBaixa(x, () => openContrato(id)); else if (a === 'conta') APP.abrirConta(x, () => openContrato(id)); });
}
function novaMedicao(c) {
  modal('Nova medição — ' + esc(c.nome), `<form class="form" id="frm" novalidate><label>Data<input name="data" type="date" value="${todayISO()}"><span class="err" data-err="data"></span></label><label>Valor medido bruto (R$)<input name="valorBruto" inputmode="decimal" required><span class="err" data-err="valorBruto"></span></label><label>Desconto (R$)<input name="desconto" inputmode="decimal" placeholder="0,00"><span class="err" data-err="desconto"></span></label><label>Vencimento do pagamento<input name="vencimento" type="date" value="${addDays(todayISO(), 15)}"><span class="err" data-err="vencimento"></span></label><label class="full">Descrição<input name="descricao" maxlength="300" placeholder="Ex.: Fundação concluída"></label></form><p class="sm mut">Retenção de ${c.retencaoPct}% é calculada sozinha. Saldo disponível no contrato: ${brl(c.valor - c.medido)}.</p>`, '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Criar medição</button>');
  $('#frmOk').onclick = async () => { const f = $('#frm'); try { await API.post(`/api/contratos/${c.id}/medicoes`, { data: f.data.value, valorBruto: parseMoney(f.valorBruto.value), desconto: parseMoney(f.desconto.value) || 0, vencimento: f.vencimento.value, descricao: f.descricao.value }); toast('Medição criada em rascunho.'); openContrato(c.id); } catch (e) { if (e.status === 422) mostrarErros(f, e.erros); else falha(e); } };
}
function novoTituloContrato(c) {
  const cats = (S.categorias || []).filter(k => k.tipo === 'Despesa');
  modal('Lançar pagamento — ' + esc(c.nome), `<form class="form" id="frm" novalidate><label class="full">Descrição<input name="descricao" required value="Pagamento — ${esc(c.nome)}"><span class="err" data-err="descricao"></span></label><label>Valor (R$)<input name="valor" inputmode="decimal" required><span class="err" data-err="valor"></span></label><label>Vencimento<input name="vencimento" type="date" value="${addDays(todayISO(), 10)}" required><span class="err" data-err="vencimento"></span></label><label>Parcelas<input name="parcelas" type="number" min="1" max="60" value="1"><span class="err" data-err="parcelas"></span></label><label>Categoria<select name="catId">${cats.map(k => `<option value="${k.id}" ${k.id === 'cat_empreit' ? 'selected' : ''}>${esc(k.nome)}</option>`).join('')}</select></label></form><p class="sm mut">Saldo disponível no contrato: ${brl(c.saldoContratual)}.</p>`, '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="frmOk">Lançar</button>');
  $('#frmOk').onclick = async () => { const f = $('#frm'); try { await API.post(`/api/contratos/${c.id}/titulos`, { descricao: f.descricao.value, valor: parseMoney(f.valor.value), vencimento: f.vencimento.value, parcelas: Number(f.parcelas.value) || 1, catId: f.catId.value }); await APP.reload(); render(); toast('Conta a pagar lançada.'); openContrato(c.id); } catch (e) { if (e.status === 422) mostrarErros(f, e.erros); else falha(e); } };
}
APP.openContrato = openContrato;

/* ============ ações por data-act ============ */
Object.assign(ACT, {
  new: (id, b) => openForm(b.dataset.k), edit: (id, b) => openForm(b.dataset.k, id), obra: id => openObra(id),
  del: (id, b) => APP.excluirRegistro(b.dataset.k, id, (by(S[b.dataset.k], id) || {}).nome || (by(S[b.dataset.k], id) || {}).titulo || 'este registro'),
  arq: (id, b) => { const r = by(S[b.dataset.k], id) || {}; confirmBox(`Arquivar <b>${esc(r.nome || r.titulo || 'este registro')}</b>? Ele sai das listas e o histórico é preservado.`, () => agir(() => API.post(`/api/${b.dataset.k}/${id}/arquivar`), 'Arquivado.'), 'Arquivar', false); },
  filter: (id, b) => { state.f[b.dataset.k] = b.dataset.v; render(); }, tab: (id, b) => { state.tab[b.dataset.k] = b.dataset.v; render(); },
  obrasLista: () => { state.tab.obrasLista = true; render(); }, obrasCards: () => { state.tab.obrasLista = false; render(); },
  verUnid: id => { state.f.vendasEmp = id; state.tab.vendas = 'Unidades'; location.hash = '#/vendas'; },
  move: (id, b) => { const t = by(S.tarefas, id); agir(() => API.put('/api/tarefas/' + id, { versao: t.versao, status: b.dataset.v }), 'Tarefa movida para "' + b.dataset.v + '".'); },
  selObra: id => { state.f.andObra = id; render(); }, pOpen: id => { state.open[id] = !state.open[id]; render(); },
  pNew: () => openPasso(curObraId()), pEdit: id => openPasso(curObraId(), id), pToggle: id => togglePasso(id), pBaixa: id => baixarPasso(id), pEstorno: id => estornarBaixa(id), pDel: id => excluirPasso(id),
  pUp: id => agir(() => API.post(`/api/passos/${id}/mover`, { dir: -1 })), pDown: id => agir(() => API.post(`/api/passos/${id}/mover`, { dir: 1 })),
  pTpl: () => agir(() => API.post(`/api/obras/${curObraId()}/passos/modelo`), 'Modelo padrão aplicado: edite os passos como quiser.'),
  pCsv: () => exportPassos(obraAtual()), ctDet: id => openContrato(id), pNewF: (id, b) => openPasso(curObraId(), null, b.dataset.k), hgDone: id => togglePasso(id),
  hgRot: (id, b) => girar(90 * +b.dataset.d), hgZoom: (id, b) => zoomEm(hgS().z * (+b.dataset.d > 0 ? 1.4 : 1 / 1.4), .5, .5), hgReset: () => { const g = hgS(); Object.assign(g, { z: 1, x: 0, y: 0 }); girar(((540 - g.ang) % 360) - 180 || 0); },
  hgFull: () => { const el = $('#hgBox'); if (el && el.requestFullscreen) el.requestFullscreen().catch(() => toast('Tela cheia indisponível neste navegador', 'erro')); else toast('Tela cheia indisponível neste navegador', 'erro'); },
});
PAGES.andamento = PAGES.andamento;
APP.curObraId = curObraId; APP.hooks.push(() => aplicarHg());
$('#view').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && ACT[b.dataset.act]) { e.stopPropagation(); ACT[b.dataset.act](b.dataset.id, b); } });
$('#view').addEventListener('keydown', e => { const b = e.target.closest('[role=button][data-act]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); b.click(); } });
$('#view').addEventListener('wheel', e => { const sv = e.target.closest('.hg-svg'); if (!sv) return; e.preventDefault(); const r = sv.getBoundingClientRect(); zoomEm(hgS().z * Math.pow(1.0018, -e.deltaY), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }, { passive: false });
$('#view').addEventListener('contextmenu', e => { if (e.target.closest('.hg-svg')) e.preventDefault(); });
const ptrs = new Map(); let pinca = null;
$('#view').addEventListener('pointerdown', e => { if (!e.target.closest('.hg-svg')) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, mover: e.button === 2 || e.shiftKey }); pinca = null; });
window.addEventListener('pointermove', e => {
  const q = ptrs.get(e.pointerId), sv = $('.hg-svg'); if (!q || !sv) return;
  const g = hgS(), r = sv.getBoundingClientRect(), k = (+sv.dataset.vb.split(' ')[2] / g.z) / r.width, dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (ptrs.size >= 2) { const [p1, p2] = [...ptrs.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y), mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2; if (pinca) { g.x -= (mx - pinca.mx) * k; g.y -= (my - pinca.my) * k; zoomEm(g.z * d / pinca.d, (mx - r.left) / r.width, (my - r.top) / r.height); } pinca = { d, mx, my }; return; }
  if (q.mover) { g.x -= dx * k; g.y -= dy * k; aplicarHg(); } else { g.ang = ((g.ang + dx * .6) % 360 + 360) % 360; redesenhar(); }
});
['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, e => { ptrs.delete(e.pointerId); pinca = null; }));
$('#view').addEventListener('input', e => { const r = e.target.closest('[data-hgpct]'); if (r && r.nextElementSibling) r.nextElementSibling.textContent = r.value + '%'; });
$('#view').addEventListener('change', e => { const r = e.target.closest('[data-hgpct]'); if (r) setPct(r.dataset.hgpct, parseInt(r.value) || 0); });
})();
