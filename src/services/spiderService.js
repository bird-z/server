'use strict'
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const config = require('../config')
const { pool } = require('../db')

const jobs = new Map() // jobId -> job (in-memory runtime state)
let seq = 0
let lastStartedAt = 0

const RUNNING = 'running'

function ensureLogDir() {
  fs.mkdirSync(config.spider.logDir, { recursive: true })
}

function appendRunRow(job) {
  return pool.query(
    `INSERT INTO spider_runs (id, spider, status, pid, started_at, finished_at, exit_code, items, error)
     VALUES (:id, :spider, :status, :pid, :started_at, :finished_at, :exit_code, :items, :error)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status), finished_at = VALUES(finished_at),
       exit_code = VALUES(exit_code), items = VALUES(items), error = VALUES(error)`,
    {
      id: job.id,
      spider: job.spider,
      status: job.status,
      pid: job.pid || null,
      started_at: job.startedAt,
      finished_at: job.finishedAt || null,
      exit_code: job.exitCode,
      items: job.items,
      error: job.error || null,
    },
  )
}

function tailFile(file, n) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    return lines.slice(-n).join('\n')
  } catch {
    return ''
  }
}

async function start(spider = 'new') {
  if (!fs.existsSync(config.spider.dir)) {
    throw Object.assign(new Error(`spider dir not found: ${config.spider.dir}`), { statusCode: 500 })
  }
  const running = [...jobs.values()].find((j) => j.status === RUNNING)
  if (running) {
    throw Object.assign(new Error(`spider already running: job ${running.id}`), { statusCode: 409 })
  }
  const waitMs = config.spider.cooldownMs - (Date.now() - lastStartedAt)
  if (waitMs > 0) {
    throw Object.assign(
      new Error(`cooldown: wait ${Math.ceil(waitMs / 1000)}s before next run`),
      { statusCode: 429 },
    )
  }

  ensureLogDir()
  const id = `job-${Date.now()}-${++seq}`
  const logFile = path.join(config.spider.logDir, `${id}.log`)
  const out = fs.createWriteStream(logFile, { flags: 'a' })

  const job = {
    id,
    spider,
    status: RUNNING,
    pid: null,
    startedAt: new Date(),
    finishedAt: null,
    exitCode: null,
    items: 0,
    error: null,
    logFile,
    tailLines: [],
  }
  jobs.set(id, job)
  lastStartedAt = Date.now()

  const child = spawn('scrapy', ['crawl', spider], {
    cwd: config.spider.dir,
    env: process.env,
  })
  job.pid = child.pid

  const pushLine = (line) => {
    job.tailLines.push(line)
    if (job.tailLines.length > config.spider.tailBufferLines) job.tailLines.shift()
    const m = line.match(/item_scraped_count\D+(\d+)/)
    if (m) job.items = Number(m[1])
  }

  child.stdout.on('data', (d) => { out.write(d); String(d).split('\n').forEach(pushLine) })
  child.stderr.on('data', (d) => { out.write(d); String(d).split('\n').forEach(pushLine) })

  child.on('error', (err) => {
    job.error = err.message
    finish(job, 1)
  })
  child.on('close', (code) => {
    finish(job, code)
  })

  job._child = child
  job._out = out

  appendRunRow(job).catch((e) => console.error('[spider] run row insert failed:', e.message))
  return job
}

function finish(job, code) {
  if (job.status !== RUNNING && job.finishedAt) return
  job.finishedAt = new Date()
  job.exitCode = code
  if (job.status === RUNNING) {
    job.status = code === 0 ? 'success' : 'failed'
  }
  if (job._out) job._out.end()
  appendRunRow(job).catch((e) => console.error('[spider] run row update failed:', e.message))
}

function stop(id) {
  const job = jobs.get(id)
  if (!job || job.status !== RUNNING) return null
  job.status = 'stopped'
  try { job._child.kill('SIGTERM') } catch { /* already dead */ }
  setTimeout(() => {
    try { job._child && job._child.kill('SIGKILL') } catch { /* noop */ }
  }, 5000).unref()
  return job
}

function list() {
  return [...jobs.values()].map(pub).sort((a, b) => b.id.localeCompare(a.id))
}

async function history(limit = 20) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM spider_runs ORDER BY started_at DESC LIMIT ?', [limit])
    return rows
  } catch {
    return [] // table may not exist before migration
  }
}

function detail(id, tail = 100) {
  const job = jobs.get(id)
  if (!job) return null
  const p = pub(job)
  p.log = tailFile(job.logFile, tail)
  return p
}

function pub(job) {
  const { _child, _out, tailLines, ...rest } = job
  return { ...rest, tailPreview: tailLines.slice(-10) }
}

function killAll() {
  for (const job of jobs.values()) {
    if (job.status === RUNNING) {
      job.status = 'stopped'
      try { job._child.kill('SIGKILL') } catch { /* noop */ }
      finish(job, 137)
    }
  }
}

module.exports = { start, stop, list, detail, history, killAll }
