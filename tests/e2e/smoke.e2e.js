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
  db.open(); const auth = require('../../server/auth'); auth.criarUsuario({ user: null }, { nome: 'Admin E2E', email: 'e2e@teste.com', senha: 'SenhaE2E12345', roleId: 'role_admin' });
  const u = db.q.one('SELECT id FROM users'); require('../../server/seed').carregarExemplo({ user: { id: u.id, nome: 'Admin E2E', permissoes: ['*'] } }); db.close();
  const { iniciar } = require('../../server/index'); const srv = await iniciar({ port: 0, semBackupAutomatico: true }), URL = 'http://127.0.0.1:' + srv.port + '/';
  const b = await chromium.launch(), erros = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage(); p.on('pageerror', e => erros.push(e.message));
    await p.goto(URL); await p.waitForSelector('#fl'); await p.fill('input[name=email]', 'e2e@teste.com'); await p.fill('input[name=senha]', 'SenhaE2E12345'); await p.click('#fl button'); await p.waitForSelector('#nav a');
    const ir = async h => { await p.evaluate(h => { location.hash = '#/' + h; }, h); await p.waitForTimeout(700); };
    for (const h of ['dashboard', 'obras', 'andamento', 'empreendimentos', 'vendas', 'estoque', 'compras', 'contratos', 'contas', 'financeiro', 'folha', 'funcionarios', 'fornecedores', 'tarefas', 'diario', 'documentos', 'admin']) { await ir(h); assert.ok((await p.locator('#view').innerText()).length > 40, 'tela vazia: ' + h); }
    await ir('obras'); await p.click('[data-act=new][data-k=obras]'); await p.fill('input[name=nome]', 'Obra E2E'); await p.fill('input[name=inicio]', '2026-12-01'); await p.fill('input[name=previsao]', '2026-01-01'); await p.click('#frmOk'); await p.waitForTimeout(500);
    assert.ok((await p.locator('[data-err=previsao]').innerText()).length > 5, 'erro inline de data'); await p.keyboard.press('Escape');
    await ir('estoque'); await p.click('[data-act=mov][data-v=Entrada] >> nth=0'); await p.fill('input[name=qtd]', '5'); await p.fill('input[name=precoUnit]', ''); await p.click('#frmOk'); await p.waitForTimeout(400);
    assert.ok((await p.locator('[data-err=precoUnit]').innerText()).length > 5, 'entrada exige preço'); await p.keyboard.press('Escape');
    await ir('contas'); await p.locator('[data-act=cBaixa]').first().click(); await p.click('#frmOk'); await p.waitForTimeout(700); assert.match(await p.locator('#toast').innerText(), /Baixa registrada/);
    assert.equal(erros.length, 0, 'erros de JS: ' + erros.join(' | ')); console.log('E2E ok: 17 telas, validação inline, estoque e baixa de conta.');
  } finally { await b.close(); await srv.close(); require('fs').rmSync(process.env.DATA_DIR, { recursive: true, force: true }); }
})().catch(e => { console.error('E2E falhou:', e.message); process.exit(1); });
