const encoder = new TextEncoder()
const decoder = new TextDecoder()
const TAG_BYTES = 16

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function deriveVaultKey(masterPassword, email) {
  if (!window.crypto?.subtle) {
    throw new Error('This browser does not support the encryption required by SecureVault.')
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const salt = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`SecureVault:v1:${email.trim().toLowerCase()}`),
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptVaultEntry(entry, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sensitiveData = encoder.encode(JSON.stringify({
    schemaVersion: 2,
    title: entry.title,
    username: entry.username,
    password: entry.password,
    url: entry.url || '',
    notes: entry.notes,
    category: entry.category,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    favorite: Boolean(entry.favorite),
    passwordUpdatedAt: entry.passwordUpdatedAt || new Date().toISOString(),
  }))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    sensitiveData,
  ))
  const cipherText = encrypted.slice(0, -TAG_BYTES)
  const tag = encrypted.slice(-TAG_BYTES)

  return {
    schemaVersion: 2,
    encryptedData: bytesToBase64(cipherText),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
  }
}

export async function decryptVaultEntry(record, key) {
  if (!record.encryptedData || !record.iv || !record.tag) {
    return {
      ...record,
      username: record.username || record.email || '',
      password: record.password || '',
      notes: record.notes || '',
      category: record.category || 'login',
    }
  }

  const cipherText = base64ToBytes(record.encryptedData)
  const tag = base64ToBytes(record.tag)
  const combined = new Uint8Array(cipherText.length + tag.length)
  combined.set(cipherText)
  combined.set(tag, cipherText.length)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(record.iv), tagLength: 128 },
    key,
    combined,
  )

  return { ...record, ...JSON.parse(decoder.decode(decrypted)) }
}

export function generatePassword(options = {}) {
  const {
    length = 20,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options
  const groups = [
    uppercase ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : '',
    lowercase ? 'abcdefghijkmnopqrstuvwxyz' : '',
    numbers ? '23456789' : '',
    symbols ? '!@#$%^&*()-_=+[]{};:,.?' : '',
  ].filter(Boolean)
  if (!groups.length) return ''

  const alphabet = groups.join('')
  const randomIndex = (limit) => {
    const threshold = Math.floor(256 / limit) * limit
    const byte = new Uint8Array(1)
    do crypto.getRandomValues(byte)
    while (byte[0] >= threshold)
    return byte[0] % limit
  }
  const required = groups.map((group) => group[randomIndex(group.length)])
  const password = [...required]
  while (password.length < Math.max(length, groups.length)) {
    password.push(alphabet[randomIndex(alphabet.length)])
  }
  for (let index = password.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1)
    ;[password[index], password[target]] = [password[target], password[index]]
  }
  return password.join('')
}

export function createVaultBackup(entries) {
  return JSON.stringify({
    format: 'securevault-encrypted-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entries.map(({ encryptedData, iv, tag, schemaVersion = 2, createdAt, updatedAt }) => ({
      encryptedData,
      iv,
      tag,
      schemaVersion,
      createdAt,
      updatedAt,
    })),
  }, null, 2)
}

export function parseVaultBackup(value) {
  let backup
  try {
    backup = JSON.parse(value)
  } catch {
    throw new Error('That file is not a valid SecureVault backup.')
  }
  if (backup?.format !== 'securevault-encrypted-backup' || backup.version !== 1 || !Array.isArray(backup.entries)) {
    throw new Error('That file is not a supported SecureVault backup.')
  }
  if (backup.entries.length > 5000) throw new Error('This backup contains too many entries.')
  for (const entry of backup.entries) {
    if (![entry?.encryptedData, entry?.iv, entry?.tag].every((item) => typeof item === 'string' && item.length > 0)) {
      throw new Error('The backup contains a damaged encrypted entry.')
    }
  }
  return backup
}
