'use strict'
const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const news = require('../services/newsService')
const { ping } = require('../db')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({
    name: 'news-server',
    version: '1.1.0',
    endpoints: {
      public: ['/api/health', '/api/news', '/api/news/:id', '/api/v1/news', '/api/v1/news/top', '/api/v1/stats'],
      admin: '/api/admin/* (Bearer token)',
      console: '/console',
    },
  })
})

router.get('/api/health', asyncHandler(async (req, res) => {
  let db = 'down'
  try { await ping(); db = 'up' } catch { /* down */ }
  res.status(db === 'up' ? 200 : 503).json({
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  })
}))

// ---- legacy contract (frozen shape) ----

router.get('/api/news', asyncHandler(async (req, res) => {
  res.json(await news.listAll())
}))

router.get('/api/news/:id', asyncHandler(async (req, res) => {
  const row = await news.getById(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'news not found' })
  res.json(row)
}))

// ---- v1 ----

router.get('/api/v1/news', asyncHandler(async (req, res) => {
  res.json(await news.listPaged(req.query))
}))

router.get('/api/v1/news/top', asyncHandler(async (req, res) => {
  res.json(await news.topByFlow(req.query.limit))
}))

router.get('/api/v1/stats', asyncHandler(async (req, res) => {
  res.json(await news.stats())
}))

module.exports = router
