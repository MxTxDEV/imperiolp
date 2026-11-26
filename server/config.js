'use strict';
const path = require('path');
// Configuração por variáveis de ambiente. Por padrão só escuta em 127.0.0.1 (não é acessível de fora da máquina).
module.exports = {
  port: +process.env.PORT || 3000,
  host: process.env.HOST || '127.0.0.1',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  tz: process.env.TZ_EMPRESA || 'America/Sao_Paulo',
  cookieSecure: process.env.COOKIE_SECURE === '1',   // ligar quando houver HTTPS
  sessionHours: +process.env.SESSION_HOURS || 12,
  maxJson: 1_000_000,
  maxUpload: 15 * 1024 * 1024,
  publicDir: path.join(__dirname, '..', 'public'),
};
