'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
let stream = null;
function line(level, msg, obj) {
  const rec = JSON.stringify(Object.assign({ ts: new Date().toISOString(), nivel: level, msg }, obj || {}));
  if (process.env.LOG_QUIET !== '1') (level === 'erro' ? process.stderr : process.stdout).write(rec + '\n');
  try {
    if (!stream) { fs.mkdirSync(path.join(cfg.dataDir, 'logs'), { recursive: true }); stream = fs.createWriteStream(path.join(cfg.dataDir, 'logs', 'app.log'), { flags: 'a' }); }
    stream.write(rec + '\n');
  } catch (_) { /* log nunca derruba o servidor */ }
}
module.exports = { info: (m, o) => line('info', m, o), warn: (m, o) => line('aviso', m, o), error: (m, o) => line('erro', m, o) };
