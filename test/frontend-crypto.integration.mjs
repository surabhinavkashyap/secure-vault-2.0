import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

globalThis.window = globalThis

const require = createRequire(import.meta.url)
const { createApp } = require('../task-manager-api/app.js')
const { decryptVaultEntry, deriveVaultKey, encryptVaultEntry } = await import('../task-manager-frontend/src/crypto.js')
const dataDirectory = mkdtempSync(join(tmpdir(), 'securevault-browser-crypto-'))
let server

try {
  const { app } = await createApp({ dataDirectory, frontendDirectory: join(dataDirectory, 'no-frontend') })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const email = 'crypto-check@securevault.test'
  const masterPassword = 'Local-Only!Crypto-Check-2026'
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Crypto Check', email, masterPassword }),
  })
  assert.equal(registration.status, 201)
  const { token } = await registration.json()
  const key = await deriveVaultKey(masterPassword, email)
  const original = {
    title: 'Example account', username: 'private@example.test', password: 'Unique!Vault-Secret-42',
    url: 'example.test', category: 'login', tags: ['qa', 'private'], favorite: true,
    notes: 'This entire value must remain encrypted.', passwordUpdatedAt: new Date().toISOString(),
  }
  const encrypted = await encryptVaultEntry(original, key)
  assert.equal(JSON.stringify(encrypted).includes(original.password), false)
  assert.equal(JSON.stringify(encrypted).includes(original.title), false)

  const createdResponse = await fetch(`${baseUrl}/api/vault`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(encrypted),
  })
  assert.equal(createdResponse.status, 201)
  const created = (await createdResponse.json()).entry
  const decrypted = await decryptVaultEntry(created, key)
  for (const field of ['title', 'username', 'password', 'url', 'category', 'notes']) assert.equal(decrypted[field], original[field])
  assert.deepEqual(decrypted.tags, original.tags)
  assert.equal(decrypted.favorite, true)
  console.log('Frontend encryption → API storage → browser decryption test passed.')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  rmSync(dataDirectory, { recursive: true, force: true })
}
