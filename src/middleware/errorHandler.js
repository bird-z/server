'use strict'
// eslint-disable-next-line no-unused-vars -- express needs the 4-arg signature
module.exports = function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message)
  const status = err.statusCode || 500
  res.status(status).json({ error: err.message || 'internal server error' })
}
