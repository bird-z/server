'use strict'
const config = require('./src/config')
const { buildApp } = require('./src/app')
const { pool, ping } = require('./src/db')
const spider = require('./src/services/spiderService')

async function main() {
  const app = buildApp()

  try {
    await ping()
    console.log(`[db] connected ${config.db.host}:${config.db.port}/${config.db.database}`)
  } catch (err) {
    console.error(`[db] ping failed: ${err.message} (server still starts; /api/health reports degraded)`)
  }

  const server = app.listen(config.port, () => {
    console.log(`[server] news-server listening on http://localhost:${config.port}`)
    console.log(`[server] console: http://localhost:${config.port}/console/`)
    if (config.adminTokenEphemeral) {
      console.log('[auth] ADMIN_TOKEN not set; ephemeral token for this boot:')
      console.log(`[auth]   ${config.adminToken}`)
    }
  })

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`)
    spider.killAll()
    server.close(async () => {
      try { await pool.end() } catch { /* noop */ }
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 5000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[server] fatal:', err)
  process.exit(1)
})
