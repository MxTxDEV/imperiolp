'use strict';
// Teste de ponta a ponta no navegador (precisa do Playwright instalado). Sobe um servidor temporário com os dados de exemplo,
// entra pela tela de login, visita todas as telas e executa os fluxos principais conferindo o resultado.
//   npm run test:e2e
process.env.LOG_QUIET = '1';
const os = require('os'), path = require('path'), assert = require('node:assert/strict');
process.env.DATA_DIR = path.join(os.tmpdir(), 'imperio-e2e-' + process.pid);
const { chromium } = require('playwright');
const db = require('../../server/db');
(async () => {
  await db.open(); const auth = require('../../server/auth'); await auth.criarUsuario({ user: null }, { nome: 'Admin E2E', email: 'e2e@teste.com', senha: 'SenhaE2E12345', roleId: 'role_admin' });
  const u = await db.q.one('SELECT id FROM users'); await require('../../server/seed').carregarExemplo({ user: { id: u.id, nome: 'Admin E2E', permissoes: ['*'] } }); await db.close();
  const { iniciar } = require('../../server/index'); const srv = await iniciar({ port: 0, semBackupAutomatico: true }), URL = 'http://127.0.0.1:' + srv.port + '/';
  const b = await chromium.launch(), erros = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage(); p.on('pageerror', e => erros.push(e.message));
    await p.goto(URL); await p.waitForSelector('#fl');
    /* tela de acesso: marca carregada, mostrar/ocultar senha, aviso de credencial errada sem travar o botão */
    assert.ok(await p.evaluate(() => [...document.images].length >= 1 && [...document.images].every(i => i.complete && i.naturalWidth > 0) && !!document.querySelector('#scene svg')), 'logo e cena animada da tela de login carregadas');
    await p.fill('input[name=email]', 'e2e@teste.com'); await p.fill('input[name=senha]', 'errada12345');
    assert.equal(await p.getAttribute('input[name=senha]', 'type'), 'password'); await p.click('.pw-t'); assert.equal(await p.getAttribute('input[name=senha]', 'type'), 'text'); await p.click('.pw-t');
    await p.click('#fl button.btn'); await p.waitForFunction(() => document.querySelector('#fe') && document.querySelector('#fe').textContent.length > 0);
    assert.ok(await p.evaluate(() => !document.querySelector('#fl button.btn').disabled && document.activeElement.name === 'senha'), 'credencial errada: botão destravado e foco na senha');
    await p.fill('input[name=senha]', 'SenhaE2E12345'); await p.click('#fl button.btn'); await p.waitForSelector('#nav a');
    const ir = async h => { await p.evaluate(h => { location.hash = '#/' + h; }, h); await p.waitForTimeout(700); };
    for (const h of ['dashboard', 'obras', 'andamento', 'empreendimentos', 'vendas', 'estoque', 'compras', 'contratos', 'contas', 'financeiro', 'folha', 'funcionarios', 'fornecedores', 'tarefas', 'diario', 'documentos', 'admin']) { await ir(h); assert.ok((await p.locator('#view').innerText()).length > 40, 'tela vazia: ' + h); }
    await ir('obras'); await p.click('[data-act=new][data-k=obras]'); await p.fill('input[name=nome]', 'Obra E2E'); await p.fill('input[name=inicio]', '2026-12-01'); await p.fill('input[name=previsao]', '2026-01-01'); await p.click('#frmOk'); await p.waitForTimeout(500);
    assert.ok((await p.locator('[data-err=previsao]').innerText()).length > 5, 'erro inline de data'); await p.keyboard.press('Escape');
    await ir('estoque'); await p.click('[data-act=mov][data-v=Entrada] >> nth=0'); await p.fill('input[name=qtd]', '5'); await p.fill('input[name=precoUnit]', ''); await p.click('#frmOk'); await p.waitForTimeout(400);
    assert.ok((await p.locator('[data-err=precoUnit]').innerText()).length > 5, 'entrada exige preço'); await p.keyboard.press('Escape');
    await ir('contas'); await p.locator('[data-act=cBaixa]').first().click(); await p.click('#frmOk'); await p.waitForTimeout(700); assert.match(await p.locator('#toast').innerText(), /Baixa registrada/);
    /* sidebar: rolagem própria sem horizontal, posição preservada, dourado na página ativa, foco visível e menu do celular */
    await p.setViewportSize({ width: 1280, height: 460 }); await ir('obras');
    const sb = await p.evaluate(() => { const n = document.querySelector('#nav'), a = n.querySelector('a.on'); return { v: n.scrollHeight > n.clientHeight, h: n.scrollWidth <= n.clientWidth, ouro: /212, 168, 75/.test(getComputedStyle(a).boxShadow) }; });
    assert.ok(sb.v && sb.h && sb.ouro, 'sidebar: rolagem vertical, sem horizontal e página ativa dourada ' + JSON.stringify(sb));
    await p.evaluate(() => { document.querySelector('#nav').scrollTop = 80; window.scrollTo(0, 60); }); await p.mouse.move(60, 250); await p.mouse.wheel(0, 2000); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => scrollY), 60, 'rolar o menu não pode mover a página');
    await p.evaluate(() => { document.querySelector('#nav').scrollTop = 90; APP.render(); }); await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => document.querySelector('#nav').scrollTop), 90, 'a posição do menu sobrevive à atualização da tela');
    await p.focus('#btnPin'); await p.keyboard.press('Tab');
    assert.ok(await p.evaluate(() => { const c = getComputedStyle(document.activeElement); return document.activeElement.matches('#nav a') && c.outlineStyle === 'solid' && parseFloat(c.outlineWidth) >= 2; }), 'foco do teclado visível no menu');
    await p.evaluate(() => document.activeElement.blur()); await p.mouse.move(900, 300); await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#nav')).scrollbarWidth), 'none', 'menu recolhido não mostra barra de rolagem');
    assert.ok(await p.evaluate(() => { const i = document.querySelector('.brand img.logo'); return i.complete && i.naturalWidth > 0; }), 'logo da marca carregada');
    await p.setViewportSize({ width: 390, height: 700 }); await p.waitForTimeout(300);
    await p.click('#btnMenu'); await p.waitForTimeout(400); assert.ok(await p.evaluate(() => document.querySelector('#side').classList.contains('open')), 'menu abre no celular');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); assert.ok(await p.evaluate(() => !document.querySelector('#side').classList.contains('open')), 'Esc fecha o menu');
    await p.click('#btnMenu'); await p.waitForTimeout(400); await p.mouse.click(380, 300); await p.waitForTimeout(300); assert.ok(await p.evaluate(() => !document.querySelector('#side').classList.contains('open')), 'tocar fora fecha o menu');
    await p.click('#btnMenu'); await p.waitForTimeout(400); await p.click('#nav a[href="#/estoque"]'); await p.waitForTimeout(500); assert.ok(await p.evaluate(() => !document.querySelector('#side').classList.contains('open')), 'escolher a página fecha o menu');
    assert.equal(erros.length, 0, 'erros de JS: ' + erros.join(' | ')); console.log('E2E ok: 17 telas, validação inline, estoque, baixa de conta e sidebar.');
  } finally { await b.close(); await srv.close(); require('fs').rmSync(process.env.DATA_DIR, { recursive: true, force: true }); }
})().catch(e => { console.error('E2E falhou:', e.message); process.exit(1); });
