import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, RefreshCw, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { generatePassword } from '../crypto'

function passwordStrength(value) {
  const score = [value.length >= 12, value.length >= 18, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length
  return { score, label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][Math.max(0, score - 1)] }
}

export function StrengthMeter({ value }) {
  const strength = passwordStrength(value)
  return (
    <div className="mt-2.5">
      <div className="mb-2 flex gap-1">{[1, 2, 3, 4, 5].map((level) => <motion.span key={level} className={`h-1 flex-1 rounded-full ${strength.score >= level ? (strength.score >= 4 ? 'bg-emerald-400' : 'bg-gradient-to-r from-indigo-500 to-violet-400') : 'bg-white/[.07]'}`} animate={{ opacity: strength.score >= level ? 1 : .38 }} />)}</div>
      <div className="flex justify-between text-[9px] text-zinc-600"><span>Strength</span><span className={strength.score >= 4 ? 'text-emerald-400' : 'text-zinc-500'}>{value ? strength.label : 'Not entered'}</span></div>
    </div>
  )
}

export default function PasswordGenerator({ onUse }) {
  const [length, setLength] = useState(20)
  const [options, setOptions] = useState({ uppercase: true, lowercase: true, numbers: true, symbols: true })
  const [password, setPassword] = useState(() => generatePassword())
  const strength = useMemo(() => passwordStrength(password), [password])

  function regenerate(nextLength = length, nextOptions = options) {
    setPassword(generatePassword({ length: Number(nextLength), ...nextOptions }))
  }

  function toggle(name) {
    const next = { ...options, [name]: !options[name] }
    if (!Object.values(next).some(Boolean)) return
    setOptions(next)
    regenerate(length, next)
  }

  async function copy() {
    try { await navigator.clipboard.writeText(password); toast.success('Password copied') } catch { toast.error('Clipboard unavailable') }
  }

  return (
    <div className="rounded-2xl border border-indigo-400/15 bg-gradient-to-br from-indigo-500/[.08] to-violet-500/[.03] p-4">
      <div className="mb-4 flex items-center justify-between"><span className="flex items-center gap-2 text-[11px] font-semibold text-indigo-200"><Sparkles className="size-3.5 text-indigo-400" />Strong password generator</span><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-wider ${strength.score >= 4 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{strength.label}</span></div>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/[.08] bg-black/30 p-2.5 pl-3"><code className="min-w-0 flex-1 break-all text-[11px] font-medium tracking-wide text-zinc-200">{password}</code><button type="button" onClick={copy} className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[.07] hover:text-white" aria-label="Copy generated password"><Copy className="size-3.5" /></button></div>
      <label className="mb-4 grid gap-2"><span className="flex justify-between text-[10px] text-zinc-500">Length <strong className="text-zinc-300">{length}</strong></span><input type="range" min="12" max="40" value={length} onChange={(event) => { setLength(event.target.value); regenerate(event.target.value, options) }} className="h-1.5 w-full cursor-pointer accent-indigo-500" /></label>
      <div className="mb-4 grid grid-cols-2 gap-2">{Object.entries({ uppercase: 'Uppercase', lowercase: 'Lowercase', numbers: 'Numbers', symbols: 'Symbols' }).map(([name, label]) => <label key={name} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[.06] bg-white/[.025] px-2.5 py-2 text-[9px] text-zinc-500 transition hover:border-white/10"><input type="checkbox" checked={options[name]} onChange={() => toggle(name)} className="size-3 accent-indigo-500" />{label}</label>)}</div>
      <div className="flex gap-2"><button type="button" onClick={() => regenerate()} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.03] text-[10px] font-medium text-zinc-400 transition hover:bg-white/[.07] hover:text-white"><RefreshCw className="size-3" />Regenerate</button>{onUse && <button type="button" onClick={() => onUse(password)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-500 text-[10px] font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,.2)] transition hover:bg-indigo-400"><Check className="size-3" />Use password</button>}</div>
    </div>
  )
}
