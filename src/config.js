'use strict'
const path = require('path')
const crypto = require('crypto')

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const config = {
  port: num(process.env.PORT, 3001),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'newsdb',
    connectionLimit: num(process.env.DB_POOL_SIZE, 10),
  },

  // bind host: production should be 127.0.0.1 behind nginx
  host: process.env.HOST || '0.0.0.0',

  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // empty env -> ephemeral random token per boot
  adminToken: process.env.ADMIN_TOKEN || '',
  adminTokenEphemeral: !process.env.ADMIN_TOKEN,

  spider: {
    // false in prod: scrapy stack stays dev-only, spider endpoints return 503
    enabled: process.env.SPIDER_ENABLED !== 'false',
    dir: path.resolve(__dirname, '..', process.env.SCRAPY_DIR || '../news'),
    cooldownMs: num(process.env.SPIDER_COOLDOWN_MS, 10_000),
    logDir: path.resolve(__dirname, '..', 'logs'),
    tailBufferLines: 200,
  },
}

if (config.adminTokenEphemeral) {
  config.adminToken = crypto.randomBytes(24).toString('hex')
}

module.exports = config
