'use strict'
const { pool } = require('../db')

const SORTABLE = new Set(['id', 'name', 'flow', 'created_at'])
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

// ---- legacy contract (unchanged shapes) ----

async function listAll() {
  const [rows] = await pool.query('SELECT * FROM news')
  return rows
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM news WHERE id = ?', [id])
  return rows[0] || null
}

// ---- v1: paged / filtered / sorted ----

async function listPaged({ page = 1, pageSize = 20, q = '', sortBy = 'id', order = 'asc' } = {}) {
  page = clamp(Number(page) || 1, 1, 1e6)
  pageSize = clamp(Number(pageSize) || 20, 1, 100)
  if (!SORTABLE.has(sortBy)) sortBy = 'id'
  const dir = order === 'desc' ? 'DESC' : 'ASC'

  const where = q ? 'WHERE name LIKE :q OR url LIKE :q' : ''
  const params = { q: q ? `%${q}%` : undefined, offset: (page - 1) * pageSize, limit: pageSize }

  const [rows] = await pool.query(
    `SELECT id, name, url, flow, created_at FROM news ${where}
     ORDER BY ${sortBy} ${dir} LIMIT :limit OFFSET :offset`,
    params,
  )
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM news ${where}`, params)

  return {
    data: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

async function topByFlow(limit = 10) {
  limit = clamp(Number(limit) || 10, 1, 100)
  const [rows] = await pool.query(
    'SELECT id, name, url, flow FROM news ORDER BY flow DESC LIMIT ?',
    [limit],
  )
  return rows
}

async function stats() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(flow), 0) AS sumFlow,
            COALESCE(AVG(flow), 0) AS avgFlow,
            COALESCE(MAX(flow), 0) AS maxFlow
     FROM news`,
  )
  return {
    total: row.total,
    sumFlow: Number(row.sumFlow),
    avgFlow: Math.round(Number(row.avgFlow)),
    maxFlow: row.maxFlow,
  }
}

// ---- admin mutations ----

async function update(id, { name, url, flow }) {
  const fields = []
  const params = { id }
  if (name !== undefined) { fields.push('name = :name'); params.name = name }
  if (url !== undefined) { fields.push('url = :url'); params.url = url }
  if (flow !== undefined) { fields.push('flow = :flow'); params.flow = Number(flow) || 0 }
  if (!fields.length) return getById(id)

  const [result] = await pool.query(`UPDATE news SET ${fields.join(', ')} WHERE id = :id`, params)
  return result.affectedRows ? getById(id) : null
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM news WHERE id = ?', [id])
  return result.affectedRows > 0
}

module.exports = { listAll, getById, listPaged, topByFlow, stats, update, remove }
