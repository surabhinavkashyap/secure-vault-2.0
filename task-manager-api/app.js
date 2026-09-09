const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env if present (root or local)
for (const envPath of [path.resolve(__dirname, '..', '.env'), path.resolve(__dirname, '.env')]) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2]?.trim().replace(/^["']|["']$/g, '') || ''
      }
    }
  }
}

const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const { connectDB } = require('./db/mongoose')
const User = require('./models/User')
const Session = require('./models/Session')
const VaultEntry = require('./models/VaultEntry')

const TOKEN_ISSUER = 'securevault-local'
const TOKEN_AUDIENCE = 'securevault-web'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
const MAX_SESSIONS_PER_USER = 10
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function publicUser(user) {
  const id = user._id.toString()
  return { _id: id, id, username: user.username, name: user.username, email: user.email, createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt }
}

function validationError(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function readAuthInput(body, registering) {
  const email = normalizedEmail(body?.email)
  const password = typeof body?.masterPassword === 'string' ? body.masterPassword : ''
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw validationError('Enter a valid email address.')
  if (password.length < 12 || password.length > 256) throw validationError('Master password must be between 12 and 256 characters.')
  if (registering && (username.length < 2 || username.length > 80)) throw validationError('Name must be between 2 and 80 characters.')
  return { email, password, username }
}

function decodeBase64(value, field, maximumBytes, exactBytes) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !BASE64_PATTERN.test(value)) {
    throw validationError(`${field} must be valid base64.`)
  }
  const bytes = Buffer.from(value, 'base64')
  if (!bytes.length || bytes.length > maximumBytes || (exactBytes && bytes.length !== exactBytes)) {
    throw validationError(`${field} has an invalid size.`)
  }
  return value
}

function readVaultInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('A vault entry is required.')
  return {
    encryptedData: decodeBase64(body.encryptedData, 'encryptedData', 96 * 1024),
    iv: decodeBase64(body.iv, 'iv', 12, 12),
    tag: decodeBase64(body.tag, 'tag', 16, 16),
    schemaVersion: body.schemaVersion === undefined ? 1 : body.schemaVersion,
  }
}

function createRateLimiter({ windowMs, maximum, message }) {
  const clients = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip || req.socket.remoteAddress || 'local'
    let state = clients.get(key)
    if (!state || state.resetAt <= now) state = { count: 0, resetAt: now + windowMs }
    state.count += 1
    clients.set(key, state)
    res.setHeader('RateLimit-Limit', maximum)
    res.setHeader('RateLimit-Remaining', Math.max(0, maximum - state.count))
    res.setHeader('RateLimit-Reset', Math.ceil(state.resetAt / 1000))
    if (clients.size > 1000) {
      for (const [client, value] of clients) if (value.resetAt <= now) clients.delete(client)
    }
    if (state.count > maximum) return res.status(429).json({ error: message })
    next()
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true
  try {
    const url = new URL(origin)
    // Allow localhost for development
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true
    // Allow Vercel deployments
    if (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')) return true
    // Allow custom production domain via env var
    const allowed = process.env.ALLOWED_ORIGINS
    if (allowed && allowed.split(',').map((s) => s.trim()).includes(origin)) return true
    return false
  } catch {
    return false
  }
}

function issueSession(secret, userId) {
  const jti = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000)
  const token = jwt.sign({ sub: userId }, secret, {
    algorithm: 'HS256', audience: TOKEN_AUDIENCE, expiresIn: TOKEN_TTL_SECONDS,
    issuer: TOKEN_ISSUER, jwtid: jti,
  })
  return { token, session: { jti, userId, createdAt: now, expiresAt } }
}

async function createApp(options = {}) {
  const mongoUri = options.mongoUri || process.env.MONGODB_URI || 'mongodb+srv://vaultadmin:VaultPass12345@cluster0.1apoj45.mongodb.net/securevault?retryWrites=true&w=majority'
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'ab597b3c598e3ef80101b23908c9df99c3901eab4a888426868c9061f67b37990cb7bf10872550fb81c62da9301efdde'

  const frontendDirectory = options.frontendDirectory || path.resolve(__dirname, '..', 'task-manager-frontend', 'dist')
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', process.env.VERCEL === '1' ? true : false)

  // Ensure DB connects lazily on demand
  app.use(async (req, res, next) => {
    if (req.path === '/api/health') return next()
    if (!mongoUri) {
      return res.status(500).json({ error: 'MONGODB_URI environment variable is not set on Vercel.' })
    }
    try {
      await connectDB(mongoUri)
      next()
    } catch (dbErr) {
      console.error('Database connection failed:', dbErr.message)
      return res.status(500).json({ error: 'Database connection failed: ' + dbErr.message })
    }
  })

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    if (req.path.startsWith('/api')) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    } else {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.vercel.app; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    }
    const origin = req.get('Origin')
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origin is not allowed.' })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  app.use(express.json({ limit: '128kb', strict: true }))

  const apiLimiter = createRateLimiter({ windowMs: 60_000, maximum: 300, message: 'Too many requests. Please wait a moment.' })
  const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, maximum: 30, message: 'Too many sign-in attempts. Please try again later.' })
  app.use('/api', apiLimiter)

  async function authenticate(req, res, next) {
    try {
      const header = req.get('Authorization') || ''
      if (!header.startsWith('Bearer ')) throw new Error('Missing token')
      const token = header.slice(7).trim()
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], audience: TOKEN_AUDIENCE, issuer: TOKEN_ISSUER })
      const session = await Session.findOne({ jti: decoded.jti, userId: decoded.sub, expiresAt: { $gt: new Date() } })
      const user = await User.findById(decoded.sub)
      if (!session || !user) throw new Error('Invalid token')
      req.auth = { token, jti: decoded.jti, user }
      next()
    } catch {
      res.status(401).json({ error: 'Your session has expired. Please unlock your vault again.' })
    }
  }

  app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'SecureVault API', storage: 'mongodb-atlas' }))

  app.post('/api/auth/register', authLimiter, async (req, res, next) => {
    try {
      const { email, password, username } = readAuthInput(req.body, true)
      if (await User.findOne({ email })) throw validationError('An account with this email already exists.')
      const user = await new User({ username, email, passwordHash: await bcrypt.hash(password, 12) }).save()
      const issued = issueSession(jwtSecret, user._id.toString())
      await new Session(issued.session).save()
      res.status(201).json({ ...publicUser(user), user: publicUser(user), token: issued.token })
    } catch (error) {
      if (error.code === 11000) return next(validationError('An account with this email already exists.'))
      next(error)
    }
  })

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const { email, password } = readAuthInput(req.body, false)
      const user = await User.findOne({ email })
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(400).json({ error: 'Unable to sign in with those details.' })
      const issued = issueSession(jwtSecret, user._id.toString())
      // Clean up expired sessions
      await Session.deleteMany({ expiresAt: { $lte: new Date() } })
      // Enforce max sessions per user
      const existing = await Session.find({ userId: user._id }).sort({ createdAt: 1 })
      if (existing.length >= MAX_SESSIONS_PER_USER) {
        const toRemove = existing.slice(0, existing.length - MAX_SESSIONS_PER_USER + 1).map((s) => s._id)
        await Session.deleteMany({ _id: { $in: toRemove } })
      }
      await new Session(issued.session).save()
      res.json({ ...publicUser(user), user: publicUser(user), token: issued.token })
    } catch (error) { next(error) }
  })

  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.auth.user) }))
  app.post('/api/auth/logout', authenticate, async (req, res, next) => {
    try {
      await Session.deleteOne({ jti: req.auth.jti })
      res.json({ success: true })
    } catch (error) { next(error) }
  })
  app.post('/api/auth/logout-all', authenticate, async (req, res, next) => {
    try {
      await Session.deleteMany({ userId: req.auth.user._id })
      res.json({ success: true })
    } catch (error) { next(error) }
  })
  app.delete('/api/auth/me', authenticate, async (req, res, next) => {
    try {
      await User.deleteOne({ _id: req.auth.user._id })
      await Session.deleteMany({ userId: req.auth.user._id })
      await VaultEntry.deleteMany({ ownerId: req.auth.user._id })
      res.json({ success: true })
    } catch (error) { next(error) }
  })

  app.get('/api/vault', authenticate, async (req, res) => {
    const entries = await VaultEntry.find({ ownerId: req.auth.user._id }).sort({ updatedAt: -1 }).lean()
    res.json({ entries: entries.map(({ ownerId, __v, ...entry }) => ({ ...entry, _id: entry._id.toString() })) })
  })
  app.post('/api/vault', authenticate, async (req, res, next) => {
    try {
      const encrypted = readVaultInput(req.body)
      if (!Number.isInteger(encrypted.schemaVersion) || encrypted.schemaVersion < 1 || encrypted.schemaVersion > 100) throw validationError('schemaVersion is invalid.')
      const doc = await new VaultEntry({ ownerId: req.auth.user._id, ...encrypted }).save()
      const { ownerId, __v, ...entry } = doc.toObject()
      res.status(201).json({ entry: { ...entry, _id: entry._id.toString() } })
    } catch (error) { next(error) }
  })
  app.put('/api/vault/:id', authenticate, async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Vault entry not found.' })
      const encrypted = readVaultInput(req.body)
      if (!Number.isInteger(encrypted.schemaVersion) || encrypted.schemaVersion < 1 || encrypted.schemaVersion > 100) throw validationError('schemaVersion is invalid.')
      const doc = await VaultEntry.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.user._id },
        encrypted,
        { new: true }
      ).lean()
      if (!doc) return res.status(404).json({ error: 'Vault entry not found.' })
      const { ownerId, __v, ...entry } = doc
      res.json({ entry: { ...entry, _id: entry._id.toString() } })
    } catch (error) { next(error) }
  })
  app.delete('/api/vault/:id', authenticate, async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Vault entry not found.' })
      const result = await VaultEntry.deleteOne({ _id: req.params.id, ownerId: req.auth.user._id })
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Vault entry not found.' })
      res.json({ success: true, id: req.params.id })
    } catch (error) { next(error) }
  })

  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }))
  if (fs.existsSync(path.join(frontendDirectory, 'index.html'))) {
    app.use(express.static(frontendDirectory, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(frontendDirectory, 'index.html'))
      next()
    })
  }
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }))
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' })
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must be valid JSON.' })
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error(error)
    res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message })
  })
  return { app }
}

async function start() {
  const { app } = await createApp()
  const port = Number(process.env.PORT) || 5001
  const host = process.env.HOST || '127.0.0.1'
  app.listen(port, host, () => console.log(`SecureVault API ready at http://${host}:${port}`))
}

if (require.main === module) start().catch((error) => {
  console.error('Unable to start SecureVault:', error.message)
  process.exit(1)
})

module.exports = { createApp }
