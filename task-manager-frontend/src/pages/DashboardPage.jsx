import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ChevronDown, Clock3, Download, Grid2X2, LayoutList, LockKeyhole, LogOut, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Star, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiRequest } from '../api'
import { createVaultBackup, decryptVaultEntry, encryptVaultEntry, parseVaultBackup } from '../crypto'
import EntryModal from '../components/EntryModal'
import Logo from '../components/Logo'
import PasswordGenerator from '../components/PasswordGenerator'
import SecurityCenter from '../components/SecurityCenter'
import SecuritySettings from '../components/SecuritySettings'
import VaultCard from '../components/VaultCard'
import { analyzeVaultSecurity, DEFAULT_SECURITY_SETTINGS, getPasswordAssessment, normalizeSecuritySettings } from '../utils/security'

const categories = ['all', 'login', 'payment', 'identity', 'software', 'wifi', 'recovery', 'note']
const recordId = (record) => String(record?._id || record?.id || '')

function initialSettings() {
  try { return normalizeSecuritySettings(JSON.parse(localStorage.getItem('securevault:security-settings') || '{}')) }
  catch { return { ...DEFAULT_SECURITY_SETTINGS } }
}

function SkeletonCard() {
  return <div className="animate-pulse rounded-2xl border border-white/[.055] bg-white/[.025] p-4"><div className="mb-6 size-10 rounded-xl bg-white/[.055]" /><div className="mb-2 h-3 w-28 rounded bg-white/[.06]" /><div className="mb-5 h-2 w-40 rounded bg-white/[.035]" /><div className="h-11 rounded-xl bg-black/25" /></div>
}

function EmptyVault({ filtered, onAdd, onReset }) {
  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-full grid min-h-[340px] place-items-center rounded-[24px] border border-dashed border-white/[.08] bg-gradient-to-b from-white/[.025] to-transparent p-8 text-center"><div><div className="relative mx-auto mb-6 grid size-20 place-items-center rounded-[24px] border border-indigo-400/15 bg-gradient-to-br from-indigo-500/15 to-violet-500/[.03] shadow-[0_0_50px_rgba(99,102,241,.1)]"><ShieldCheck className="size-8 text-indigo-300" /><Sparkles className="absolute -right-1 -top-1 size-4 text-violet-300" /></div><h3 className="mb-2 text-[18px] font-semibold tracking-[-.025em] text-zinc-200">{filtered ? 'No secrets match those filters' : 'Your private vault is ready'}</h3><p className="mx-auto mb-5 max-w-sm text-[12px] leading-5 text-zinc-600">{filtered ? 'Clear the search or switch categories to see the rest of your vault.' : 'Add a password, recovery code, identity, Wi-Fi key, or private note. It is encrypted before it leaves this device.'}</p><button type="button" onClick={filtered ? onReset : onAdd} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-[11px] font-semibold text-white shadow-[0_0_25px_rgba(99,102,241,.25)] transition hover:-translate-y-0.5 hover:bg-indigo-400">{filtered ? <RefreshCw className="size-3.5" /> : <Plus className="size-3.5" />}{filtered ? 'Reset filters' : 'Add first entry'}</button></div></motion.div>
}

function ConfirmDelete({ entry, onCancel, onConfirm, busy }) {
  return <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 px-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section role="alertdialog" aria-modal="true" initial={{ scale: .96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .97, opacity: 0 }} className="glass w-full max-w-sm rounded-[22px] p-5"><div className="mb-4 grid size-11 place-items-center rounded-xl border border-red-400/15 bg-red-400/[.08] text-red-300"><Trash2 className="size-4.5" /></div><h2 className="mb-2 text-[18px] font-semibold text-white">Delete this entry?</h2><p className="mb-5 text-[12px] leading-5 text-zinc-500">“{entry.title}” will be permanently removed from your encrypted vault.</p><div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="h-9 rounded-xl px-4 text-[11px] text-zinc-500 hover:bg-white/[.05] hover:text-white">Cancel</button><button type="button" onClick={onConfirm} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-xl bg-red-500/90 px-4 text-[11px] font-semibold text-white hover:bg-red-400 disabled:opacity-50"><Trash2 className="size-3" />{busy ? 'Deleting…' : 'Delete entry'}</button></div></motion.section></motion.div>
}

export default function DashboardPage({ session, onLock }) {
  const { token, vaultKey, user } = session
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [apiOnline, setApiOnline] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('securevault:sort') || 'favorites')
  const [view, setView] = useState(() => localStorage.getItem('securevault:view') || 'grid')
  const [securityFilter, setSecurityFilter] = useState(null)
  const [activePanel, setActivePanel] = useState(null)
  const [securitySettings, setSecuritySettings] = useState(initialSettings)
  const [editor, setEditor] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [importing, setImporting] = useState(false)
  const searchInput = useRef(null)
  const displayName = user.name || user.email?.split('@')[0] || 'Vault owner'

  const lockVault = useCallback(async (notifyServer = false, message = '') => {
    if (notifyServer) {
      try { await apiRequest('/api/auth/logout', { method: 'POST', token }) } catch { /* Local lock still wins. */ }
    }
    if (message) toast(message, { icon: '🔒' })
    onLock()
  }, [onLock, token])

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await apiRequest('/api/vault', { token })
      const records = Array.isArray(response) ? response : response?.entries || []
      const decrypted = await Promise.all(records.map(async (record) => {
        try { return await decryptVaultEntry(record, vaultKey) }
        catch { return { ...record, title: 'Unreadable encrypted entry', username: '', password: '', notes: '', category: 'note', decryptError: true } }
      }))
      setEntries(decrypted)
      setApiOnline(true)
    } catch (error) {
      if (error.status === 401) return lockVault(false)
      setApiOnline(false)
      setLoadError(error.message)
    } finally { setLoading(false) }
  }, [lockVault, token, vaultKey])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadEntries, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadEntries])

  useEffect(() => {
    if (!securitySettings.autoLockMinutes) return undefined
    let timer
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => lockVault(false, 'Vault locked after inactivity'), securitySettings.autoLockMinutes * 60000)
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }))
    reset()
    return () => { window.clearTimeout(timer); events.forEach((name) => window.removeEventListener(name, reset)) }
  }, [lockVault, securitySettings.autoLockMinutes])

  useEffect(() => {
    function shortcuts(event) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus() }
      else if (!typing && event.key === '/') { event.preventDefault(); searchInput.current?.focus() }
      else if (!typing && event.key.toLowerCase() === 'n') { event.preventDefault(); setEditor(null); setEditorOpen(true) }
      else if (!typing && event.key.toLowerCase() === 's') { event.preventDefault(); setActivePanel((current) => current === 'security' ? null : 'security') }
      else if (event.key === 'Escape') { setGeneratorOpen(false); setEditorOpen(false); setDeleteTarget(null); setUserMenu(false) }
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  }, [])

  const securityReport = useMemo(() => analyzeVaultSecurity(entries, securitySettings), [entries, securitySettings])
  const counts = useMemo(() => ({ all: entries.length, ...Object.fromEntries(categories.slice(1).map((item) => [item, entries.filter((entry) => entry.category === item).length])) }), [entries])
  const visibleEntries = useMemo(() => {
    const search = query.trim().toLowerCase()
    const allowedIds = securityFilter ? new Set(securityFilter.ids) : null
    const filtered = entries.filter((entry) => {
      if (category === 'favorites' && !entry.favorite) return false
      if (category !== 'all' && category !== 'favorites' && entry.category !== category) return false
      if (allowedIds && !allowedIds.has(recordId(entry))) return false
      if (!search) return true
      return [entry.title, entry.username, entry.url, entry.notes, entry.category, ...(entry.tags || [])].some((value) => String(value || '').toLowerCase().includes(search))
    })
    return filtered.sort((left, right) => {
      if (sortBy === 'title') return String(left.title).localeCompare(String(right.title))
      if (sortBy === 'strength') return getPasswordAssessment(left.password).score - getPasswordAssessment(right.password).score
      if (sortBy === 'updated') return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)
      return Number(Boolean(right.favorite)) - Number(Boolean(left.favorite)) || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)
    })
  }, [category, entries, query, securityFilter, sortBy])

  function addEntry() { setEditor(null); setEditorOpen(true) }
  function editEntry(entry) { setEditor(entry); setEditorOpen(true) }

  async function persistEntry(values, currentEntry = editor, closeEditor = true) {
    const encryptedPayload = await encryptVaultEntry(values, vaultKey)
    const id = recordId(currentEntry)
    const response = await apiRequest(id ? `/api/vault/${id}` : '/api/vault', { method: id ? 'PUT' : 'POST', token, body: encryptedPayload })
    const saved = response.entry || response
    const localEntry = { ...currentEntry, ...saved, ...values, ...encryptedPayload, _id: recordId(saved) || id, updatedAt: saved.updatedAt || new Date().toISOString() }
    setEntries((current) => id ? current.map((entry) => recordId(entry) === id ? localEntry : entry) : [localEntry, ...current])
    if (closeEditor) { setEditorOpen(false); setEditor(null) }
    return localEntry
  }

  async function saveEntry(values) {
    setSaving(true)
    try {
      await persistEntry({ ...values, passwordUpdatedAt: !editor || editor.password !== values.password ? new Date().toISOString() : editor.passwordUpdatedAt })
      toast.success(editor ? 'Entry updated securely' : 'Entry encrypted and saved')
    } catch (error) { toast.error(error.message) } finally { setSaving(false) }
  }

  async function toggleFavorite(entry) {
    try { await persistEntry({ ...entry, favorite: !entry.favorite }, entry, false) }
    catch (error) { toast.error(error.message) }
  }

  async function deleteEntry() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const id = recordId(deleteTarget)
      await apiRequest(`/api/vault/${id}`, { method: 'DELETE', token })
      setEntries((current) => current.filter((entry) => recordId(entry) !== id))
      setDeleteTarget(null)
      toast.success('Entry deleted')
    } catch (error) { toast.error(error.message) } finally { setDeleting(false) }
  }

  function updateSettings(next) {
    const normalized = normalizeSecuritySettings(next)
    setSecuritySettings(normalized)
    localStorage.setItem('securevault:security-settings', JSON.stringify(normalized))
    toast.success('Security preferences saved')
  }

  function exportBackup() {
    const usableEntries = entries.filter((entry) => entry.encryptedData && entry.iv && entry.tag)
    const blob = new Blob([createVaultBackup(usableEntries)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `securevault-backup-${new Date().toISOString().slice(0, 10)}.svault`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`${usableEntries.length} encrypted entries exported`)
  }

  async function importBackup(file) {
    setImporting(true)
    try {
      const backup = parseVaultBackup(await file.text())
      const decrypted = await Promise.all(backup.entries.map((entry) => decryptVaultEntry(entry, vaultKey)))
      const existing = new Set(entries.map((entry) => `${entry.title}\u0000${entry.username}\u0000${entry.category}`.toLowerCase()))
      const fresh = decrypted.filter((entry) => !existing.has(`${entry.title}\u0000${entry.username}\u0000${entry.category}`.toLowerCase()))
      const imported = []
      for (const values of fresh) {
        const encryptedPayload = await encryptVaultEntry(values, vaultKey)
        const response = await apiRequest('/api/vault', { method: 'POST', token, body: encryptedPayload })
        imported.push({ ...(response.entry || response), ...values, ...encryptedPayload })
      }
      setEntries((current) => [...imported, ...current])
      toast.success(`${imported.length} entries imported${fresh.length !== decrypted.length ? ' · duplicates skipped' : ''}`)
    } catch (error) { toast.error(error.message) } finally { setImporting(false) }
  }

  function resetFilters() { setQuery(''); setCategory('all'); setSecurityFilter(null) }
  function selectSecurityFilter(type, ids) { setSecurityFilter(ids.length ? { type, ids } : null); setActivePanel(null); setCategory('all'); window.scrollTo({ top: 250, behavior: 'smooth' }) }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090b] text-white">
      <div className="ambient-grid pointer-events-none fixed inset-0 opacity-50" /><div className="pointer-events-none fixed -left-40 top-0 size-[420px] rounded-full bg-indigo-700/[.08] blur-[120px]" /><div className="pointer-events-none fixed -right-40 bottom-0 size-[420px] rounded-full bg-violet-700/[.07] blur-[120px]" />
      <header className="sticky top-0 z-30 border-b border-white/[.065] bg-[#09090b]/78 backdrop-blur-2xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Logo /><nav className="hidden items-center gap-1 md:flex"><button type="button" onClick={() => setActivePanel(null)} className={`rounded-lg px-3 py-2 text-[11px] font-medium ${!activePanel ? 'bg-white/[.06] text-white' : 'text-zinc-600 hover:text-zinc-300'}`}>Vault</button><button type="button" onClick={() => setActivePanel(activePanel === 'security' ? null : 'security')} className={`rounded-lg px-3 py-2 text-[11px] font-medium ${activePanel === 'security' ? 'bg-emerald-400/[.08] text-emerald-300' : 'text-zinc-600 hover:text-zinc-300'}`}>Security</button><button type="button" onClick={() => setActivePanel(activePanel === 'settings' ? null : 'settings')} className={`rounded-lg px-3 py-2 text-[11px] font-medium ${activePanel === 'settings' ? 'bg-indigo-400/[.08] text-indigo-300' : 'text-zinc-600 hover:text-zinc-300'}`}>Settings</button></nav><div className="flex items-center gap-2"><span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.12em] sm:flex ${apiOnline ? 'border-emerald-400/10 bg-emerald-400/[.055] text-emerald-300' : 'border-amber-400/10 bg-amber-400/[.055] text-amber-300'}`}>{apiOnline ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}{apiOnline ? 'Vault unlocked' : 'Service offline'}</span><div className="relative"><button type="button" onClick={() => setUserMenu((value) => !value)} className="flex items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] p-1.5 pr-2 text-left transition hover:bg-white/[.055]"><span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-[10px] font-semibold">{displayName.charAt(0).toUpperCase()}</span><span className="hidden text-[11px] font-medium text-zinc-400 sm:block">{displayName}</span><ChevronDown className="size-3 text-zinc-600" /></button><AnimatePresence>{userMenu && <motion.div initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} className="glass absolute right-0 mt-2 w-56 rounded-xl p-2"><div className="border-b border-white/[.06] px-2 py-2.5"><p className="truncate text-[11px] font-medium text-zinc-300">{displayName}</p><p className="truncate text-[10px] text-zinc-600">{user.email}</p></div><button type="button" onClick={() => { setActivePanel('settings'); setUserMenu(false) }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] text-zinc-500 transition hover:bg-white/[.055] hover:text-white"><Settings2 className="size-3.5" />Security settings</button><button type="button" onClick={() => lockVault(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] text-zinc-500 transition hover:bg-white/[.055] hover:text-white"><LogOut className="size-3.5" />Lock and sign out</button></motion.div>}</AnimatePresence></div></div></div></header>

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-11">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><span className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.2em] text-indigo-400"><ShieldCheck className="size-3.5" />Private by design</span><h1 className="mb-2 text-3xl font-semibold tracking-[-.045em] text-white sm:text-[40px]">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {displayName.split(' ')[0]}.</h1><p className="max-w-xl text-[13px] leading-5 text-zinc-600">Everything important, encrypted locally and within reach.</p></div><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setActivePanel('security')} className="rounded-xl border border-white/[.06] bg-white/[.025] px-3.5 py-2.5 text-left transition hover:border-emerald-400/20 hover:bg-emerald-400/[.04]"><span className="mb-1 block text-[8px] uppercase tracking-wider text-zinc-700">Vault health</span><strong className={`text-[17px] font-semibold ${securityReport.score >= 75 ? 'text-emerald-300' : 'text-amber-300'}`}>{securityReport.score}%</strong></button><div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3.5 py-2.5"><span className="mb-1 block text-[8px] uppercase tracking-wider text-zinc-700">Protected</span><strong className="text-[17px] font-semibold text-zinc-200">{entries.length}</strong></div><div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3.5 py-2.5"><span className="mb-1 block text-[8px] uppercase tracking-wider text-zinc-700">Auto-lock</span><strong className="flex items-center gap-1 text-[12px] font-semibold text-indigo-300"><Clock3 className="size-3.5" />{securitySettings.autoLockMinutes ? `${securitySettings.autoLockMinutes}m` : 'Off'}</strong></div></div></motion.section>

        <AnimatePresence mode="wait">{activePanel === 'security' && <motion.div key="security" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-7"><SecurityCenter entries={entries} settings={securitySettings} onFilter={selectSecurityFilter} onOpenEntry={editEntry} /></motion.div>}{activePanel === 'settings' && <motion.div key="settings" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-7"><SecuritySettings settings={securitySettings} onChange={updateSettings} onLockNow={() => lockVault(false)} onExportBackup={exportBackup} onImportBackup={importBackup} importing={importing} /></motion.div>}</AnimatePresence>

        <section className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><label className="group relative block w-full lg:max-w-md"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-700 transition group-focus-within:text-indigo-400" /><input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, usernames, websites, tags…" className="h-11 w-full rounded-xl border border-white/[.07] bg-white/[.025] pl-10 pr-16 text-[12px] text-zinc-200 outline-none transition placeholder:text-zinc-700 hover:border-white/[.11] focus:border-indigo-500/45 focus:bg-white/[.035] focus:ring-4 focus:ring-indigo-500/[.08]" />{query ? <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-white"><X className="size-3" /></button> : <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/[.07] px-1.5 py-0.5 text-[8px] text-zinc-700">⌘ K</kbd>}</label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setGeneratorOpen(true)} className="flex h-11 items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 text-[11px] font-medium text-zinc-500 transition hover:border-indigo-400/20 hover:bg-indigo-500/[.045] hover:text-indigo-300"><Sparkles className="size-3.5" />Generator</button><label className="relative"><SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><select value={sortBy} onChange={(event) => { setSortBy(event.target.value); localStorage.setItem('securevault:sort', event.target.value) }} className="h-11 appearance-none rounded-xl border border-white/[.07] bg-[#111114] pl-9 pr-7 text-[11px] text-zinc-400 outline-none"><option value="favorites">Favorites first</option><option value="updated">Recently updated</option><option value="title">A–Z</option><option value="strength">Weakest first</option></select></label><div className="flex rounded-xl border border-white/[.07] bg-white/[.025] p-1"><button type="button" onClick={() => { setView('grid'); localStorage.setItem('securevault:view', 'grid') }} className={`grid size-9 place-items-center rounded-lg ${view === 'grid' ? 'bg-white/[.08] text-white' : 'text-zinc-700'}`} aria-label="Grid view"><Grid2X2 className="size-3.5" /></button><button type="button" onClick={() => { setView('list'); localStorage.setItem('securevault:view', 'list') }} className={`grid size-9 place-items-center rounded-lg ${view === 'list' ? 'bg-white/[.08] text-white' : 'text-zinc-700'}`} aria-label="List view"><LayoutList className="size-3.5" /></button></div><motion.button whileHover={{ y: -1 }} whileTap={{ scale: .98 }} type="button" onClick={addEntry} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-[11px] font-semibold text-white shadow-[0_0_28px_rgba(99,102,241,.23)]"><Plus className="size-3.5" />Add new</motion.button></div></section>

        <nav className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-white/[.055] pb-3" aria-label="Vault categories"><button type="button" onClick={() => { setSecurityFilter(null); setCategory('all') }} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-medium transition ${category === 'all' && !securityFilter ? 'bg-indigo-500/10 text-indigo-300' : 'text-zinc-700 hover:bg-white/[.035] hover:text-zinc-400'}`}>All <span className="ml-1 text-[8px] opacity-55">{counts.all}</span></button><button type="button" onClick={() => { setSecurityFilter(null); setCategory('favorites'); setQuery('') }} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-medium ${category === 'favorites' ? 'bg-amber-400/[.08] text-amber-300' : 'text-zinc-700 hover:bg-white/[.035] hover:text-amber-300'}`}><Star className="mr-1 inline size-3" />Favorites <span className="ml-1 text-[8px] opacity-55">{entries.filter((entry) => entry.favorite).length}</span></button>{categories.slice(1).map((item) => <button type="button" key={item} onClick={() => { setSecurityFilter(null); setCategory(item) }} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-medium capitalize transition ${category === item && !securityFilter ? 'bg-indigo-500/10 text-indigo-300' : 'text-zinc-700 hover:bg-white/[.035] hover:text-zinc-400'}`}>{item}<span className="ml-1.5 text-[8px] opacity-55">{counts[item]}</span></button>)}</nav>
        {securityFilter && <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-400/15 bg-amber-400/[.05] px-3.5 py-2.5 text-[11px] text-amber-200"><span className="flex items-center gap-2"><AlertCircle className="size-3.5" />Showing {securityFilter.type} password findings</span><button type="button" onClick={() => setSecurityFilter(null)} className="text-amber-300/70 hover:text-white">Clear filter</button></div>}
        {loadError && <div className="mb-5 flex flex-col items-center justify-between gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] p-4 sm:flex-row"><span className="flex items-center gap-2 text-[12px] text-amber-200"><WifiOff className="size-4" />{loadError}</span><button type="button" onClick={loadEntries} className="flex h-9 items-center gap-2 rounded-xl bg-amber-300 px-3 text-[10px] font-semibold text-zinc-950"><RefreshCw className="size-3" />Retry service</button></div>}

        <AnimatePresence mode="popLayout"><motion.ul layout className={`grid list-none gap-3 p-0 ${view === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>{loading ? Array.from({ length: view === 'grid' ? 8 : 4 }, (_, index) => <SkeletonCard key={index} />) : visibleEntries.length ? visibleEntries.map((entry) => <VaultCard key={recordId(entry) || `${entry.title}-${entry.createdAt}`} entry={entry} onEdit={editEntry} onDelete={setDeleteTarget} onToggleFavorite={toggleFavorite} clipboardClearSeconds={securitySettings.clipboardClearSeconds} compact={view === 'list'} />) : <EmptyVault filtered={Boolean(query || category !== 'all' || securityFilter)} onAdd={addEntry} onReset={resetFilters} />}</motion.ul></AnimatePresence>
      </div>

      <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: .95 }} type="button" onClick={addEntry} className="fixed bottom-5 right-5 z-20 grid size-13 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_10px_38px_rgba(99,102,241,.38)] sm:hidden" aria-label="Add vault entry"><Plus className="size-5" /></motion.button>
      <AnimatePresence>{editorOpen && <EntryModal key={editor ? recordId(editor) : 'new'} entry={editor} saving={saving} onSave={saveEntry} onClose={() => { setEditorOpen(false); setEditor(null) }} />}{generatorOpen && <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setGeneratorOpen(false)}><motion.section role="dialog" aria-modal="true" initial={{ opacity: 0, y: 20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: .98 }} className="glass w-full max-w-md rounded-[24px] p-5"><div className="mb-4 flex items-center justify-between"><div><span className="text-[9px] font-semibold uppercase tracking-[.18em] text-indigo-400">Built-in tool</span><h2 className="mt-1 text-[20px] font-semibold tracking-[-.03em] text-white">Password generator</h2></div><button type="button" onClick={() => setGeneratorOpen(false)} className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-white/[.05] hover:text-white"><X className="size-4" /></button></div><PasswordGenerator /></motion.section></motion.div>}{deleteTarget && <ConfirmDelete entry={deleteTarget} busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={deleteEntry} />}</AnimatePresence>
      <footer className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 border-t border-white/[.05] px-4 py-6 text-[9px] uppercase tracking-[.13em] text-zinc-800 sm:flex-row sm:px-6"><span className="flex items-center gap-1.5"><LockKeyhole className="size-3" />AES-256-GCM · zero plaintext secrets</span><span className="flex items-center gap-3"><span className="flex items-center gap-1"><Download className="size-3" />Encrypted backups</span><span className="hidden sm:inline">/ Search</span><span className="hidden sm:inline">N New</span><span className="hidden sm:inline">S Security</span></span></footer>
    </main>
  )
}
