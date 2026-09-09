const assert = require('assert/strict')
const crypto = require('crypto')
const mongoose = require('mongoose')
const { createApp } = require('../app')

async function main() {
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.log('Skipping integration tests: MONGODB_URI not set.')
    return
  }

  const testDbName = 'securevault-test-' + crypto.randomBytes(4).toString('hex')
  const testUri = mongoUri.replace(/\/[^/?]+(\?|$)/, `/${testDbName}$1`)
  const jwtSecret = 'test-secret-for-integration-' + crypto.randomBytes(8).toString('hex')

  const { app } = await createApp({ mongoUri: testUri, jwtSecret, frontendDirectory: '/nonexistent' })
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  const origin = `http://127.0.0.1:${server.address().port}`

  async function request(route, options = {}) {
    const response = await fetch(`${origin}${route}`, {
      method: options.method || 'GET',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const body = await response.json()
    return { response, body }
  }

  try {
    const health = await request('/api/health')
    assert.equal(health.response.status, 200)

    const first = await request('/api/auth/register', { method: 'POST', body: { username: 'Alice', email: 'alice@example.com', masterPassword: 'A-very-strong-master-password!' } })
    assert.equal(first.response.status, 201)
    assert.ok(first.body.token)

    const encryptedPayload = {
      title: 'Must never be stored',
      category: 'login',
      encryptedData: Buffer.from('opaque cipher text').toString('base64'),
      iv: Buffer.alloc(12, 7).toString('base64'),
      tag: Buffer.alloc(16, 9).toString('base64'),
    }
    const created = await request('/api/vault', { method: 'POST', token: first.body.token, body: encryptedPayload })
    assert.equal(created.response.status, 201)
    assert.ok(created.body.entry._id)
    assert.equal(created.body.entry.title, undefined)

    const listed = await request('/api/vault', { token: first.body.token })
    assert.equal(listed.response.status, 200)
    assert.equal(listed.body.entries.length, 1)

    const second = await request('/api/auth/register', { method: 'POST', body: { username: 'Bob', email: 'bob@example.com', masterPassword: 'Another-strong-master-password!' } })
    assert.equal(second.response.status, 201)
    const forbiddenDelete = await request(`/api/vault/${created.body.entry._id}`, { method: 'DELETE', token: second.body.token })
    assert.equal(forbiddenDelete.response.status, 404)

    const updated = await request(`/api/vault/${created.body.entry._id}`, { method: 'PUT', token: first.body.token, body: { ...encryptedPayload, encryptedData: Buffer.from('updated opaque cipher').toString('base64') } })
    assert.equal(updated.response.status, 200)

    const logout = await request('/api/auth/logout', { method: 'POST', token: first.body.token })
    assert.equal(logout.response.status, 200)
    const invalidated = await request('/api/auth/me', { token: first.body.token })
    assert.equal(invalidated.response.status, 401)

    console.log('SecureVault API integration test passed.')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
