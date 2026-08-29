export const DEFAULT_SECURITY_SETTINGS = Object.freeze({
  autoLockMinutes: 15,
  clipboardClearSeconds: 30,
  oldPasswordDays: 180,
  weakPasswordThreshold: 60,
})

const COMMON_PASSWORD_PARTS = [
  'password',
  'qwerty',
  'letmein',
  'welcome',
  'admin',
  '123456',
]

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function entryId(entry, index) {
  return String(entry?._id || entry?.id || `vault-entry-${index}`)
}

function passwordDate(entry) {
  const value = entry?.passwordUpdatedAt || entry?.updatedAt || entry?.createdAt
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeSecuritySettings(settings = {}) {
  const merged = { ...DEFAULT_SECURITY_SETTINGS, ...settings }
  return {
    autoLockMinutes: merged.autoLockMinutes === 0 ? 0 : clamp(Number(merged.autoLockMinutes) || 15, 1, 240),
    clipboardClearSeconds: merged.clipboardClearSeconds === 0 ? 0 : clamp(Number(merged.clipboardClearSeconds) || 30, 5, 300),
    oldPasswordDays: clamp(Number(merged.oldPasswordDays) || 180, 30, 730),
    weakPasswordThreshold: clamp(Number(merged.weakPasswordThreshold) || 60, 20, 90),
  }
}

export function getPasswordAssessment(value = '') {
  const password = String(value)
  if (!password) return { score: 0, label: 'Missing', tone: 'critical', suggestions: ['Add a password'] }

  let score = 0
  const suggestions = []
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const uniqueCharacters = new Set(password).size
  const normalized = password.toLowerCase()

  score += Math.min(35, password.length * 2)
  if (hasLower && hasUpper) score += 18
  else suggestions.push('Mix uppercase and lowercase letters')
  if (hasNumber) score += 14
  else suggestions.push('Add at least one number')
  if (hasSymbol) score += 18
  else suggestions.push('Add at least one symbol')
  if (uniqueCharacters >= 10) score += 10
  if (!COMMON_PASSWORD_PARTS.some((part) => normalized.includes(part))) score += 5
  else {
    score -= 20
    suggestions.push('Avoid common words and number patterns')
  }
  if (/(.)\1{2,}/.test(password)) score -= 12
  if (/0123|1234|2345|3456|4567|5678|6789|abcd|qwer/i.test(password)) score -= 12
  if (password.length < 12) suggestions.unshift('Use at least 12 characters')

  score = clamp(Math.round(score), 0, 100)
  if (score >= 80) return { score, label: 'Strong', tone: 'strong', suggestions }
  if (score >= 60) return { score, label: 'Good', tone: 'good', suggestions }
  if (score >= 40) return { score, label: 'Weak', tone: 'weak', suggestions }
  return { score, label: 'Critical', tone: 'critical', suggestions }
}

export function analyzeVaultSecurity(entries = [], settings = {}, now = new Date()) {
  const options = normalizeSecuritySettings(settings)
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const passwords = []

  entries.forEach((entry, index) => {
    if (!entry || entry.decryptError || !entry.password) return
    const id = entryId(entry, index)
    const assessment = getPasswordAssessment(entry.password)
    const changedAt = passwordDate(entry)
    const ageDays = changedAt ? Math.max(0, Math.floor((currentTime - changedAt.getTime()) / 86400000)) : null
    passwords.push({ entry, id, assessment, ageDays, password: String(entry.password) })
  })

  const reuseGroups = new Map()
  passwords.forEach((item) => {
    const group = reuseGroups.get(item.password) || []
    group.push(item)
    reuseGroups.set(item.password, group)
  })
  const reusedIds = new Set(
    [...reuseGroups.values()].filter((group) => group.length > 1).flatMap((group) => group.map((item) => item.id)),
  )

  const weak = passwords.filter((item) => item.assessment.score < options.weakPasswordThreshold)
  const reused = passwords.filter((item) => reusedIds.has(item.id))
  const old = passwords.filter((item) => item.ageDays !== null && item.ageDays >= options.oldPasswordDays)
  const issueIds = new Set([...weak, ...reused, ...old].map((item) => item.id))

  const findings = passwords
    .map((item) => {
      const issues = []
      if (item.assessment.score < options.weakPasswordThreshold) issues.push('weak')
      if (reusedIds.has(item.id)) issues.push('reused')
      if (item.ageDays !== null && item.ageDays >= options.oldPasswordDays) issues.push('old')
      if (!issues.length) return null
      const severity = issues.includes('reused') || item.assessment.tone === 'critical' ? 'critical' : issues.includes('weak') ? 'warning' : 'notice'
      return {
        id: item.id,
        entry: item.entry,
        title: item.entry.title || 'Untitled entry',
        issues,
        severity,
        strength: item.assessment,
        ageDays: item.ageDays,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, notice: 2 }
      return rank[a.severity] - rank[b.severity] || a.strength.score - b.strength.score
    })

  const total = passwords.length
  const weightedRisk = weak.length * 45 + reused.length * 35 + old.length * 20
  const score = total ? clamp(Math.round(100 - weightedRisk / total), 0, 100) : 100

  return {
    score,
    grade: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs attention' : 'At risk',
    total,
    healthy: Math.max(0, total - issueIds.size),
    weak: { count: weak.length, ids: weak.map((item) => item.id) },
    reused: {
      count: reused.length,
      ids: reused.map((item) => item.id),
      groups: [...reuseGroups.values()]
        .filter((group) => group.length > 1)
        .map((group) => group.map((item) => item.id)),
    },
    old: { count: old.length, ids: old.map((item) => item.id) },
    findings,
    settings: options,
  }
}
