'use strict'
module.exports = function notFound(req, res) {
  res.status(404).json({ error: `not found: ${req.method} ${req.originalUrl}` })
}
