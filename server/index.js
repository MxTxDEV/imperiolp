'use strict';
const cfg = require('./config');
const db = require('./db');
const log = require('./log');
const { criarServidor } = require('./http');

function iniciar(opts = {}) {
  db.open(opts.dbFile);
  require('./routes');
  const server = criarServidor();
  return new Promise(resolve => server.listen(opts.port ?? cfg.port, opts.host || cfg.host, () => {
    const addr = server.address(); log.info('Império ERP no ar', { url: `http://${addr.address}:${addr.port}`, dados: cfg.dataDir });
    let timer = null;
    if (!opts.semBackupAutomatico) {
      const admin = require('./services/admin');
      const fazer = () => { try { admin.snapshot('auto'); admin.limparBackupsAutomaticos(14); } catch (e) { log.error('backup automático falhou', { erro: e.message }); } };
      setTimeout(fazer, 5000).unref(); timer = setInterval(fazer, 6 * 3600e3); timer.unref();
    }
    resolve({ server, port: addr.port, close: () => new Promise(r => { if (timer) clearInterval(timer); server.close(() => { db.close(); r(); }); }) });
  }));
}
if (require.main === module) {
  process.on('uncaughtException', e => { log.error('uncaughtException', { stack: String(e.stack || e) }); });
  process.on('unhandledRejection', e => { log.error('unhandledRejection', { erro: String(e && e.stack || e) }); });
  iniciar().then(({ server }) => { const sair = () => { server.close(() => { db.close(); process.exit(0); }); }; process.on('SIGINT', sair); process.on('SIGTERM', sair); }).catch(e => { log.error('falha ao iniciar', { erro: e.message }); process.exit(1); });
}
module.exports = { iniciar };
