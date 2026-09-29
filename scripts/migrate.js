'use strict'
// Idempotent migration: run any number of times safely.
//   node --env-file=.env scripts/migrate.js
const { pool } = require('../src/db')

const steps = [
  {
    name: 'news.created_at column',
    check: `SELECT COUNT(*) c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news' AND COLUMN_NAME = 'created_at'`,
    run: `ALTER TABLE news ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
  },
  {
    name: 'news dedupe by url',
    // delete duplicated urls keeping the lowest id, before adding the unique key
    run: `DELETE n1 FROM news n1
          INNER JOIN news n2 ON n1.url = n2.url AND n1.id > n2.id
          WHERE n1.url IS NOT NULL`,
  },
  {
    name: 'news.url unique index',
    check: `SELECT COUNT(*) c FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news' AND INDEX_NAME = 'uniq_news_url'`,
    run: `ALTER TABLE news ADD UNIQUE INDEX uniq_news_url (url)`,
  },
  {
    name: 'news.name index',
    check: `SELECT COUNT(*) c FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news' AND INDEX_NAME = 'idx_news_name'`,
    run: `ALTER TABLE news ADD INDEX idx_news_name (name(100))`,
  },
  {
    name: 'spider_runs table',
    check: `SELECT COUNT(*) c FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'spider_runs'`,
    run: `CREATE TABLE spider_runs (
            id           VARCHAR(64) PRIMARY KEY,
            spider       VARCHAR(64) NOT NULL,
            status       VARCHAR(16) NOT NULL,
            pid          INT NULL,
            started_at   DATETIME(3) NOT NULL,
            finished_at  DATETIME(3) NULL,
            exit_code    INT NULL,
            items        INT DEFAULT 0,
            error        TEXT NULL,
            INDEX idx_runs_started (started_at)
          )`,
  },
]

async function migrate() {
  for (const step of steps) {
    try {
      if (step.check) {
        const [[{ c }]] = await pool.query(step.check)
        if (c > 0) {
          console.log(`skip  ${step.name} (already exists)`)
          continue
        }
      }
      await pool.query(step.run)
      console.log(`done  ${step.name}`)
    } catch (err) {
      console.error(`fail  ${step.name}: ${err.message}`)
      process.exitCode = 1
    }
  }
  await pool.end()
}

migrate()
