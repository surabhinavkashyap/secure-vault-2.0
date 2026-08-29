const assert = require('assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createApp } = require('../app')

async function main() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'securevault-api-'))
  const { app } = await createApp({ dataDirectory, frontendDirectory: path.join(dataDirectory, 'missing-dist') })
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

    const persisted = fs.readFileSync(path.join(dataDirectory, 'store.json'), 'utf8')
    assert.equal(persisted.includes('Must never be stored'), false)
    assert.equal(persisted.includes('master-password'), false)

    const logout = await request('/api/auth/logout', { method: 'POST', token: first.body.token })
    assert.equal(logout.response.status, 200)
    const invalidated = await request('/api/auth/me', { token: first.body.token })
    assert.equal(invalidated.response.status, 401)

    console.log('SecureVault API integration test passed.')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dataDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
