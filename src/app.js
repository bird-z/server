'use strict'
const path = require('path')
const express = require('express')
const cors = require('cors')
const config = require('./config')
const requestLogger = require('./middleware/requestLogger')
const adminAuth = require('./middleware/adminAuth')
const notFound = require('./middleware/notFound')
const errorHandler = require('./middleware/errorHandler')
const publicRoutes = require('./routes/public')
const adminRoutes = require('./routes/admin')

function buildApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(requestLogger)

  const corsOpts = config.corsOrigins.includes('*')
    ? {}
    : { origin: config.corsOrigins }
  app.use(cors(corsOpts))
  app.use(express.json())

  app.use('/', publicRoutes)
  app.use('/api/admin', adminAuth, adminRoutes)

  // static admin console, no build step
  app.use('/console', express.static(path.join(__dirname, '..', 'console')))

  app.use(notFound)
  app.use(errorHandler)
  return app
}

module.exports = { buildApp }
