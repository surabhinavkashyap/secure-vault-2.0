import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, CreditCard, Edit3, ExternalLink, Eye, EyeOff, FileKey2, Fingerprint, KeyRound, Laptop2, ShieldQuestion, Star, Trash2, UserRound, Wifi } from 'lucide-react'
import toast from 'react-hot-toast'
import { getPasswordAssessment } from '../utils/security'

const categoryMeta = {
  login: { icon: KeyRound, color: 'from-indigo-500/20 to-indigo-500/5 text-indigo-300 border-indigo-400/15' },
  payment: { icon: CreditCard, color: 'from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-400/15' },
  identity: { icon: UserRound, color: 'from-sky-500/20 to-sky-500/5 text-sky-300 border-sky-400/15' },
  software: { icon: Laptop2, color: 'from-cyan-500/20 to-cyan-500/5 text-cyan-300 border-cyan-400/15' },
  wifi: { icon: Wifi, color: 'from-blue-500/20 to-blue-500/5 text-blue-300 border-blue-400/15' },
  recovery: { icon: ShieldQuestion, color: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-400/15' },
  note: { icon: FileKey2, color: 'from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300 border-fuchsia-400/15' },
}

function normalizeUrl(value) {
  if (!value) return ''
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).href }
  catch { return '' }
}

export default function VaultCard({ entry, onEdit, onDelete, onToggleFavorite, clipboardClearSeconds = 30, compact = false }) {
  const [revealed, setRevealed] = useState(false)
  const [copiedField, setCopiedField] = useState('')
  const revealTimer = useRef(null)
  const meta = categoryMeta[entry.category] || categoryMeta.login
  const Icon = meta.icon
  const assessment = getPasswordAssessment(entry.password || '')
  const website = normalizeUrl(entry.url)

  useEffect(() => () => window.clearTimeout(revealTimer.current), [])

  function toggleReveal() {
    window.clearTimeout(revealTimer.current)
    setRevealed((current) => {
      if (!current) revealTimer.current = window.setTimeout(() => setRevealed(false), 15000)
      return !current
    })
  }

  async function copy(value, label) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(label)
      toast.success(`${label} copied${clipboardClearSeconds ? ` · clears in ${clipboardClearSeconds}s` : ''}`)
      window.setTimeout(() => setCopiedField(''), 1600)
      if (clipboardClearSeconds) {
        window.setTimeout(async () => {
          try {
            const current = await navigator.clipboard.readText()
            if (current === value) await navigator.clipboard.writeText('')
          } catch { /* Browsers may disallow background clipboard reads. */ }
        }, clipboardClearSeconds * 1000)
      }
    } catch { toast.error('Clipboard unavailable') }
  }

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} whileHover={{ y: compact ? -1 : -4 }} transition={{ duration: .22 }} className={`group relative overflow-hidden rounded-2xl border border-white/[.075] bg-gradient-to-br from-white/[.055] to-white/[.018] shadow-[0_16px_45px_rgba(0,0,0,.18)] backdrop-blur-xl transition-colors hover:border-indigo-400/20 ${compact ? 'grid gap-3 p-3 sm:grid-cols-[auto_1fr_1.1fr_auto] sm:items-center' : 'p-4'}`}>
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-indigo-500/[.05] blur-2xl transition group-hover:bg-indigo-500/[.11]" />
      <div className={`${compact ? '' : 'mb-5 flex items-start justify-between'}`}>
        <div className={`grid size-10 place-items-center rounded-xl border bg-gradient-to-br ${meta.color}`}><Icon className="size-4.5" /></div>
        {!compact && <div className="flex items-center"><button type="button" onClick={() => onToggleFavorite(entry)} className={`grid size-8 place-items-center rounded-lg transition hover:bg-amber-400/[.08] ${entry.favorite ? 'text-amber-300' : 'text-zinc-700 opacity-0 group-hover:opacity-100 focus:opacity-100'}`} aria-label={entry.favorite ? `Remove ${entry.title} from favorites` : `Favorite ${entry.title}`}><Star className={`size-3.5 ${entry.favorite ? 'fill-current' : ''}`} /></button><button type="button" onClick={() => onEdit(entry)} className="grid size-8 place-items-center rounded-lg text-zinc-600 opacity-0 transition hover:bg-white/[.06] hover:text-zinc-200 group-hover:opacity-100 focus:opacity-100" aria-label={`Edit ${entry.title}`}><Edit3 className="size-3.5" /></button><button type="button" onClick={() => onDelete(entry)} className="grid size-8 place-items-center rounded-lg text-zinc-600 opacity-0 transition hover:bg-red-400/[.08] hover:text-red-300 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${entry.title}`}><Trash2 className="size-3.5" /></button></div>}
      </div>
      <div className={compact ? 'min-w-0' : 'mb-4'}><div className="mb-1.5 flex items-center gap-2"><h3 className="truncate text-[14px] font-semibold tracking-[-.02em] text-zinc-100">{entry.title || 'Untitled entry'}</h3>{entry.favorite && <Star className="size-3 fill-amber-300 text-amber-300" />}<span className="rounded-md bg-white/[.055] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-zinc-600">{entry.category}</span></div><button type="button" onClick={() => copy(entry.username, 'Username')} className="flex max-w-full items-center gap-1.5 truncate text-[10px] text-zinc-600 transition hover:text-zinc-300"><span className="truncate">{entry.username || 'No username saved'}</span>{entry.username && (copiedField === 'Username' ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 opacity-0 group-hover:opacity-100" />)}</button></div>
      <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-white/[.055] bg-black/25 p-2 pl-3"><motion.code key={revealed ? 'shown' : 'hidden'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 flex-1 truncate text-[11px] tracking-[.1em] text-zinc-400">{entry.password ? (revealed ? entry.password : '••••••••••••') : 'No secret value'}</motion.code><button type="button" onClick={toggleReveal} disabled={!entry.password} className="grid size-7 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/[.06] hover:text-zinc-300 disabled:opacity-30" aria-label={revealed ? 'Hide password' : 'Show password'}>{revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button><button type="button" onClick={() => copy(entry.password, 'Password')} disabled={!entry.password} className={`grid size-7 place-items-center rounded-lg transition ${copiedField === 'Password' ? 'bg-emerald-400/10 text-emerald-300' : 'text-zinc-600 hover:bg-white/[.06] hover:text-zinc-300'} disabled:opacity-30`} aria-label="Copy password">{copiedField === 'Password' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button></div>
      <div className={`relative z-10 flex items-center ${compact ? 'justify-end gap-1' : 'mt-3 justify-between gap-2'}`}>
        {!compact && <span className={`flex items-center gap-1 text-[9px] ${assessment.score >= 4 ? 'text-emerald-400' : assessment.score >= 3 ? 'text-amber-400' : 'text-red-400'}`}><Fingerprint className="size-3" />{entry.password ? assessment.label : 'Secure note'}</span>}
        <div className="flex items-center gap-1">{website && <a href={website} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-lg text-zinc-600 transition hover:bg-indigo-400/[.08] hover:text-indigo-300" aria-label={`Open ${entry.title} website`}><ExternalLink className="size-3.5" /></a>}{compact && <><button type="button" onClick={() => onToggleFavorite(entry)} className={`grid size-7 place-items-center rounded-lg ${entry.favorite ? 'text-amber-300' : 'text-zinc-600'}`} aria-label="Toggle favorite"><Star className={`size-3.5 ${entry.favorite ? 'fill-current' : ''}`} /></button><button type="button" onClick={() => onEdit(entry)} className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[.06] hover:text-zinc-200" aria-label={`Edit ${entry.title}`}><Edit3 className="size-3.5" /></button><button type="button" onClick={() => onDelete(entry)} className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-red-400/[.08] hover:text-red-300" aria-label={`Delete ${entry.title}`}><Trash2 className="size-3.5" /></button></>}</div>
      </div>
      {!compact && entry.tags?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{entry.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md bg-white/[.04] px-1.5 py-0.5 text-[8px] text-zinc-600">#{tag}</span>)}</div>}
    </motion.li>
  )
}
