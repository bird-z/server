'use strict'
const config = require('../config')

// Bearer-token gate for /api/admin/*. The token is whatever config resolved:
// ADMIN_TOKEN from .env, or an ephemeral random one generated at boot.
module.exports = function adminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || token !== config.adminToken) {
    return res.status(401).json({ error: 'unauthorized: invalid or missing bearer token' })
  }
  next()
}
