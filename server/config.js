'use strict';
const fs = require('fs');
const path = require('path');
// Os padrões já servem para hospedar atrás de um proxy HTTPS (Coolify, Caddy, Nginx).
// Só PUBLIC_URL (e ADMIN_EMAIL/ADMIN_SENHA no primeiro acesso) costumam precisar de variável.
const publicUrl = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');   // ex.: https://imperio.seudominio.com
const hospedado = !!publicUrl;
module.exports = {
  port: +process.env.PORT || 3000,
  // com PUBLIC_URL escuta em todas as interfaces (o proxy fica na frente); sem ela, só a própria máquina
  host: process.env.HOST || (hospedado ? '0.0.0.0' : '127.0.0.1'),
  // /data é onde o Coolify monta o volume persistente; fora dele usa ./data
  dataDir: process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data')),
  publicUrl,
  tz: process.env.TZ_EMPRESA || 'America/Sao_Paulo',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === '1' : publicUrl.startsWith('https://'),
  trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === '1' : hospedado,   // lê o IP real do cliente do X-Forwarded-For
  sessionHours: +process.env.SESSION_HOURS || 12,
  maxJson: 1_000_000,
  maxUpload: 15 * 1024 * 1024,
  publicDir: path.join(__dirname, '..', 'public'),
};
