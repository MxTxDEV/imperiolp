'use strict';
const cfg = require('./config');
const db = require('./db');
const log = require('./log');
const { criarServidor } = require('./http');

async function iniciar(opts = {}) {
  await db.open(opts.dbFile ? { memoria: opts.dbFile === ':memory:', schema: opts.schema, url: opts.dbUrl, descartar: !!opts.schema } : {});
  require('./routes');
  // Primeiro acesso sem janela aberta: se não há usuário e ADMIN_EMAIL/ADMIN_SENHA estão definidos, cria o administrador (senha temporária).
  const auth = require('./auth');
  if (!opts.dbFile && await auth.precisaSetup() && process.env.ADMIN_EMAIL && process.env.ADMIN_SENHA) {
    try { await auth.criarUsuario({ user: null }, { nome: process.env.ADMIN_NOME || 'Administrador', email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_SENHA, roleId: 'role_admin', senhaTemp: true }); log.info('administrador inicial criado', { email: process.env.ADMIN_EMAIL }); }
    catch (e) { log.error('não consegui criar o administrador inicial (confira ADMIN_EMAIL e a senha: mínimo 10, letras e números)', { erro: e.message, campos: e.extra && e.extra.erros }); }
  }
  const server = criarServidor();
  return new Promise(resolve => server.listen(opts.port ?? cfg.port, opts.host || cfg.host, () => {
    const addr = server.address(); log.info('Império ERP no ar', { url: `http://${addr.address}:${addr.port}`, dados: cfg.dataDir });
    let timer = null;
    if (!opts.semBackupAutomatico) {
      const admin = require('./services/admin');
      const fazer = async () => { try { await admin.snapshot('auto'); await admin.limparBackupsAutomaticos(14); } catch (e) { log.error('backup automático falhou', { erro: e.message }); } };
      setTimeout(fazer, 5000).unref(); timer = setInterval(fazer, 6 * 3600e3); timer.unref();
    }
    resolve({ server, port: addr.port, close: () => new Promise(r => { if (timer) clearInterval(timer); server.close(() => { db.close().then(r, r); }); }) });
  }));
}
if (require.main === module) {
  process.on('uncaughtException', e => { log.error('uncaughtException', { stack: String(e.stack || e) }); });
  process.on('unhandledRejection', e => { log.error('unhandledRejection', { erro: String(e && e.stack || e) }); });
  iniciar().then(({ server }) => { const sair = () => { server.close(() => { db.close().finally(() => process.exit(0)); }); }; process.on('SIGINT', sair); process.on('SIGTERM', sair); }).catch(e => { log.error('falha ao iniciar', { erro: e.message }); process.exit(1); });
}
module.exports = { iniciar };
