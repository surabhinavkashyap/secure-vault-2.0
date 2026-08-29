import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Globe2, KeyRound, LockKeyhole, Sparkles, Star, Tags, X } from 'lucide-react'
import PasswordGenerator, { StrengthMeter } from './PasswordGenerator'

const categories = ['login', 'payment', 'identity', 'software', 'wifi', 'recovery', 'note']

function Field({ label, hint, children }) {
  return (
    <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[.08em] text-zinc-500">
      <span className="flex items-center justify-between gap-3"><span>{label}</span>{hint && <span className="normal-case tracking-normal text-zinc-700">{hint}</span>}</span>
      {children}
    </label>
  )
}

const inputClass = 'h-11 w-full rounded-xl border border-white/[.075] bg-black/25 px-3.5 text-[13px] font-normal normal-case tracking-normal text-zinc-100 outline-none transition placeholder:text-zinc-700 hover:border-white/[.12] focus:border-indigo-500/55 focus:ring-4 focus:ring-indigo-500/10'

export default function EntryModal({ entry, onClose, onSave, saving }) {
  const [password, setPassword] = useState(entry?.password || '')
  const [category, setCategory] = useState(entry?.category || 'login')
  const [favorite, setFavorite] = useState(Boolean(entry?.favorite))
  const [showPassword, setShowPassword] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)

  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const tags = String(form.get('tags') || '').split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 8)
    onSave({
      title: String(form.get('title')).trim(), username: String(form.get('username')).trim(), password,
      url: String(form.get('url')).trim(), category, tags, favorite,
      notes: String(form.get('notes')).trim(),
    })
  }

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby="entry-modal-title" initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} className="glass relative w-full max-w-2xl overflow-hidden rounded-[26px]">
        <div className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full bg-indigo-600/15 blur-3xl" />
        <header className="relative flex items-start justify-between border-b border-white/[.065] p-5 sm:p-6">
          <div><span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-indigo-400"><LockKeyhole className="size-3" />Encrypted locally</span><h2 id="entry-modal-title" className="text-[24px] font-semibold tracking-[-.035em] text-white">{entry ? 'Edit vault entry' : 'Add something private'}</h2><p className="mt-1 text-[11px] text-zinc-600">Every field below is encrypted before the secure service receives it.</p></div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl border border-white/[.07] bg-white/[.03] text-zinc-600 transition hover:bg-white/[.07] hover:text-white" aria-label="Close entry editor"><X className="size-4" /></button>
        </header>
        <form onSubmit={submit} className="relative grid max-h-[72vh] gap-4 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[1.4fr_.8fr]">
            <Field label="Entry title"><input className={inputClass} name="title" defaultValue={entry?.title || ''} required maxLength="80" placeholder="GitHub, Home Wi-Fi, Passport…" autoFocus /></Field>
            <Field label="Category"><select className={`${inputClass} capitalize`} name="category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}</select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username or email"><input className={inputClass} name="username" defaultValue={entry?.username || ''} maxLength="160" placeholder="you@example.com" autoComplete="off" /></Field>
            <Field label="Website" hint="optional"><span className="relative flex items-center"><Globe2 className="pointer-events-none absolute left-3.5 size-3.5 text-zinc-700" /><input className={`${inputClass} pl-10`} name="url" type="text" inputMode="url" defaultValue={entry?.url || ''} maxLength="500" placeholder="github.com" autoComplete="off" /></span></Field>
          </div>
          <Field label={category === 'note' ? 'Secret value' : 'Password'} hint={category === 'note' ? 'optional for secure notes' : undefined}>
            <span className="relative flex items-center"><KeyRound className="pointer-events-none absolute left-3.5 size-3.5 text-zinc-700" /><input className={`${inputClass} pl-10 pr-11 font-mono`} value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} required={category !== 'note'} maxLength="500" placeholder={category === 'note' ? 'Optional PIN, code, or secret' : 'Enter or generate a password'} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2.5 grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[.05] hover:text-zinc-300" aria-label={showPassword ? 'Hide secret' : 'Show secret'}>{showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button></span>
            <StrengthMeter value={password} />
          </Field>
          <button type="button" onClick={() => setShowGenerator((value) => !value)} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-400/20 bg-indigo-500/[.035] py-2.5 text-[11px] font-medium text-indigo-300 transition hover:border-indigo-400/35 hover:bg-indigo-500/[.07]"><Sparkles className="size-3.5" />{showGenerator ? 'Hide password generator' : 'Generate a strong password'}</button>
          <AnimatePresence>{showGenerator && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><PasswordGenerator onUse={(value) => { setPassword(value); setShowGenerator(false) }} /></motion.div>}</AnimatePresence>
          <Field label="Tags" hint="comma separated"><span className="relative flex items-center"><Tags className="pointer-events-none absolute left-3.5 size-3.5 text-zinc-700" /><input className={`${inputClass} pl-10`} name="tags" defaultValue={entry?.tags?.join(', ') || ''} maxLength="240" placeholder="work, finance, personal" autoComplete="off" /></span></Field>
          <Field label="Secure notes" hint="up to 3,000 characters"><textarea name="notes" defaultValue={entry?.notes || ''} maxLength="3000" rows="4" placeholder="Recovery details, security questions, or anything private…" className={`${inputClass} h-auto min-h-24 resize-y py-3`} /></Field>
          <button type="button" onClick={() => setFavorite((value) => !value)} className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${favorite ? 'border-amber-400/20 bg-amber-400/[.07] text-amber-200' : 'border-white/[.07] bg-white/[.025] text-zinc-500 hover:bg-white/[.045]'}`}><span><span className="block text-[11px] font-semibold">Pin to favorites</span><span className="mt-0.5 block text-[9px] text-zinc-600">Keep this entry at the top of your vault.</span></span><Star className={`size-4 ${favorite ? 'fill-current' : ''}`} /></button>
          <div className="sticky bottom-0 -mx-1 mt-1 flex items-center justify-end gap-2 border-t border-white/[.055] bg-[#111116]/95 px-1 pt-4 backdrop-blur-xl"><button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-[11px] font-medium text-zinc-500 transition hover:bg-white/[.05] hover:text-white">Cancel</button><motion.button whileHover={{ y: -1 }} whileTap={{ scale: .98 }} type="submit" disabled={saving} className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-[11px] font-semibold text-white shadow-[0_0_25px_rgba(99,102,241,.22)] disabled:opacity-55"><LockKeyhole className="size-3.5" />{saving ? 'Encrypting…' : entry ? 'Save encrypted changes' : 'Encrypt & save'}</motion.button></div>
        </form>
      </motion.section>
    </motion.div>
  )
}
