'use strict'
const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const news = require('../services/newsService')
const spider = require('../services/spiderService')

const router = express.Router()
const config = require('../config')

// Spider stack may be disabled entirely (prod has no scrapy/python deps).
const spiderDisabled = (req, res, next) =>
  config.spider.enabled
    ? next()
    : res.status(503).json({ error: 'spider control is disabled on this instance' })

router.get('/overview', asyncHandler(async (req, res) => {
  const [stats, recentJobs, top] = await Promise.all([
    news.stats(),
    spider.history(5),
    news.topByFlow(5),
  ])
  res.json({
    stats,
    spider: { running: spider.list().filter((j) => j.status === 'running'), recent: recentJobs },
    top,
  })
}))

// ---- spider ----

router.post('/spider/run', spiderDisabled, asyncHandler(async (req, res) => {
  const job = await spider.start(req.body?.spider || 'new')
  res.status(201).json({ id: job.id, status: job.status, pid: job.pid, startedAt: job.startedAt })
}))

router.get('/spider/jobs', spiderDisabled, asyncHandler(async (req, res) => {
  res.json({ live: spider.list(), history: await spider.history(20) })
}))

router.get('/spider/jobs/:id', spiderDisabled, (req, res) => {
  const detail = spider.detail(req.params.id, Number(req.query.tail) || 100)
  if (!detail) return res.status(404).json({ error: 'job not found (in-memory only; check history)' })
  res.json(detail)
})

router.post('/spider/jobs/:id/stop', spiderDisabled, (req, res) => {
  const job = spider.stop(req.params.id)
  if (!job) return res.status(409).json({ error: 'job not running or not found' })
  res.json({ id: job.id, status: job.status })
})

// ---- news CRUD ----

router.put('/news/:id', asyncHandler(async (req, res) => {
  const { name, url, flow } = req.body || {}
  if (name === undefined && url === undefined && flow === undefined) {
    return res.status(400).json({ error: 'nothing to update: provide name, url or flow' })
  }
  const row = await news.update(Number(req.params.id), { name, url, flow })
  if (!row) return res.status(404).json({ error: 'news not found' })
  res.json(row)
}))

router.delete('/news/:id', asyncHandler(async (req, res) => {
  const ok = await news.remove(Number(req.params.id))
  if (!ok) return res.status(404).json({ error: 'news not found' })
  res.json({ deleted: Number(req.params.id) })
}))

module.exports = router
