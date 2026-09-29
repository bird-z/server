'use strict'
const mysql = require('mysql2/promise')
const config = require('./config')

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  namedPlaceholders: true,
})

async function ping() {
  await pool.query('SELECT 1')
  return true
}

module.exports = { pool, ping }
