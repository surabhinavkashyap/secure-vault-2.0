const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const TOKEN_ISSUER = 'securevault-local'
const TOKEN_AUDIENCE = 'securevault-web'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
const MAX_SESSIONS_PER_USER = 10
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(temporaryPath, value, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, filePath)
}

class JsonStore {
  constructor(dataDirectory) {
    this.directory = dataDirectory
    this.file = path.join(dataDirectory, 'store.json')
    this.secretFile = path.join(dataDirectory, 'jwt-secret')
    this.writeQueue = Promise.resolve()
    fs.mkdirSync(dataDirectory, { recursive: true })
    this.secret = this.loadSecret()
    this.data = this.loadData()
  }

  loadSecret() {
    if (fs.existsSync(this.secretFile)) {
      const value = fs.readFileSync(this.secretFile, 'utf8').trim()
      if (value.length >= 64) return value
    }
    const value = crypto.randomBytes(48).toString('hex')
    atomicWrite(this.secretFile, `${value}\n`)
    return value
  }

  loadData() {
    if (!fs.existsSync(this.file)) {
      const initial = { version: 1, users: [], sessions: [], vaultEntries: [] }
      atomicWrite(this.file, `${JSON.stringify(initial, null, 2)}\n`)
      return initial
    }
    const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.vaultEntries)) {
      throw new Error('The local SecureVault data file is invalid.')
    }
    return parsed
  }

  update(mutator) {
    const operation = this.writeQueue.then(async () => {
      const nextData = structuredClone(this.data)
      const result = await mutator(nextData)
      atomicWrite(this.file, `${JSON.stringify(nextData, null, 2)}\n`)
      this.data = nextData
      return result
    })
    this.writeQueue = operation.catch(() => {})
    return operation
  }
}

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function publicUser(user) {
  return { _id: user.id, id: user.id, username: user.username, name: user.username, email: user.email, createdAt: user.createdAt }
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
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

function issueSession(store, userId) {
  const jti = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000).toISOString()
  const token = jwt.sign({ sub: userId }, store.secret, {
    algorithm: 'HS256', audience: TOKEN_AUDIENCE, expiresIn: TOKEN_TTL_SECONDS,
    issuer: TOKEN_ISSUER, jwtid: jti,
  })
  return { token, session: { jti, userId, createdAt: now.toISOString(), expiresAt } }
}

async function createApp(options = {}) {
  const dataDirectory = options.dataDirectory || process.env.SECUREVAULT_DATA_DIR || path.join(__dirname, '.data')
  const frontendDirectory = options.frontendDirectory || path.resolve(__dirname, '..', 'task-manager-frontend', 'dist')
  const store = new JsonStore(dataDirectory)
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    if (req.path.startsWith('/api')) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    } else {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
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

  function authenticate(req, res, next) {
    try {
      const header = req.get('Authorization') || ''
      if (!header.startsWith('Bearer ')) throw new Error('Missing token')
      const token = header.slice(7).trim()
      const decoded = jwt.verify(token, store.secret, { algorithms: ['HS256'], audience: TOKEN_AUDIENCE, issuer: TOKEN_ISSUER })
      const session = store.data.sessions.find((item) => item.jti === decoded.jti && item.userId === decoded.sub && Date.parse(item.expiresAt) > Date.now())
      const user = store.data.users.find((item) => item.id === decoded.sub)
      if (!session || !user) throw new Error('Invalid token')
      req.auth = { token, jti: decoded.jti, user }
      next()
    } catch {
      res.status(401).json({ error: 'Your session has expired. Please unlock your vault again.' })
    }
  }

  app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'SecureVault API', storage: 'local-encrypted-payloads' }))

  app.post('/api/auth/register', authLimiter, async (req, res, next) => {
    try {
      const { email, password, username } = readAuthInput(req.body, true)
      if (store.data.users.some((user) => user.email === email)) throw validationError('An account with this email already exists.')
      const now = new Date().toISOString()
      const user = { id: crypto.randomUUID(), username, email, passwordHash: await bcrypt.hash(password, 12), createdAt: now, updatedAt: now }
      const issued = issueSession(store, user.id)
      await store.update((data) => {
        if (data.users.some((candidate) => candidate.email === email)) throw validationError('An account with this email already exists.')
        data.users.push(user)
        data.sessions.push(issued.session)
      })
      res.status(201).json({ ...publicUser(user), user: publicUser(user), token: issued.token })
    } catch (error) { next(error) }
  })

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const { email, password } = readAuthInput(req.body, false)
      const user = store.data.users.find((candidate) => candidate.email === email)
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(400).json({ error: 'Unable to sign in with those details.' })
      const issued = issueSession(store, user.id)
      await store.update((data) => {
        const now = Date.now()
        data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > now)
        const existing = data.sessions.filter((session) => session.userId === user.id)
        if (existing.length >= MAX_SESSIONS_PER_USER) {
          const remove = new Set(existing.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(0, existing.length - MAX_SESSIONS_PER_USER + 1).map((session) => session.jti))
          data.sessions = data.sessions.filter((session) => !remove.has(session.jti))
        }
        data.sessions.push(issued.session)
      })
      res.json({ ...publicUser(user), user: publicUser(user), token: issued.token })
    } catch (error) { next(error) }
  })

  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.auth.user) }))
  app.post('/api/auth/logout', authenticate, async (req, res, next) => {
    try {
      await store.update((data) => { data.sessions = data.sessions.filter((session) => session.jti !== req.auth.jti) })
      res.json({ success: true })
    } catch (error) { next(error) }
  })
  app.post('/api/auth/logout-all', authenticate, async (req, res, next) => {
    try {
      await store.update((data) => { data.sessions = data.sessions.filter((session) => session.userId !== req.auth.user.id) })
      res.json({ success: true })
    } catch (error) { next(error) }
  })
  app.delete('/api/auth/me', authenticate, async (req, res, next) => {
    try {
      await store.update((data) => {
        data.users = data.users.filter((user) => user.id !== req.auth.user.id)
        data.sessions = data.sessions.filter((session) => session.userId !== req.auth.user.id)
        data.vaultEntries = data.vaultEntries.filter((entry) => entry.ownerId !== req.auth.user.id)
      })
      res.json({ success: true })
    } catch (error) { next(error) }
  })

  app.get('/api/vault', authenticate, (req, res) => {
    const entries = store.data.vaultEntries.filter((entry) => entry.ownerId === req.auth.user.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(({ ownerId, ...entry }) => entry)
    res.json({ entries })
  })
  app.post('/api/vault', authenticate, async (req, res, next) => {
    try {
      const encrypted = readVaultInput(req.body)
      if (!Number.isInteger(encrypted.schemaVersion) || encrypted.schemaVersion < 1 || encrypted.schemaVersion > 100) throw validationError('schemaVersion is invalid.')
      const now = new Date().toISOString()
      const stored = { _id: crypto.randomUUID(), ownerId: req.auth.user.id, ...encrypted, createdAt: now, updatedAt: now }
      await store.update((data) => { data.vaultEntries.push(stored) })
      const { ownerId, ...entry } = stored
      res.status(201).json({ entry })
    } catch (error) { next(error) }
  })
  app.put('/api/vault/:id', authenticate, async (req, res, next) => {
    try {
      const encrypted = readVaultInput(req.body)
      if (!Number.isInteger(encrypted.schemaVersion) || encrypted.schemaVersion < 1 || encrypted.schemaVersion > 100) throw validationError('schemaVersion is invalid.')
      const entry = await store.update((data) => {
        const stored = data.vaultEntries.find((candidate) => candidate._id === req.params.id && candidate.ownerId === req.auth.user.id)
        if (!stored) return null
        Object.assign(stored, encrypted, { updatedAt: new Date().toISOString() })
        const { ownerId, ...safeEntry } = stored
        return safeEntry
      })
      if (!entry) return res.status(404).json({ error: 'Vault entry not found.' })
      res.json({ entry })
    } catch (error) { next(error) }
  })
  app.delete('/api/vault/:id', authenticate, async (req, res, next) => {
    try {
      const deleted = await store.update((data) => {
        const index = data.vaultEntries.findIndex((entry) => entry._id === req.params.id && entry.ownerId === req.auth.user.id)
        if (index < 0) return false
        data.vaultEntries.splice(index, 1)
        return true
      })
      if (!deleted) return res.status(404).json({ error: 'Vault entry not found.' })
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
  return { app, store }
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
