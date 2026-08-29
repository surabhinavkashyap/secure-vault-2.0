import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, AtSign, Check, Eye, EyeOff, KeyRound, LockKeyhole, Sparkles, UserRound, Wifi, WifiOff } from 'lucide-react'
import { apiRequest, checkApiHealth } from '../api'
import { deriveVaultKey } from '../crypto'
import Logo from '../components/Logo'

function passwordScore(value) {
  return [value.length >= 12, /[A-Z]/.test(value), /[a-z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length
}

function Field({ icon: Icon, label, action, ...inputProps }) {
  return (
    <label className="grid gap-2 text-[12px] font-medium text-zinc-300">
      <span className="flex items-center justify-between"><span>{label}</span>{action}</span>
      <span className="group relative flex items-center">
        <Icon className="pointer-events-none absolute left-3.5 size-4 text-zinc-600 transition-colors group-focus-within:text-indigo-400" />
        <input {...inputProps} className="h-12 w-full rounded-xl border border-white/[.08] bg-black/30 px-11 text-[13px] text-white outline-none transition-all placeholder:text-zinc-700 hover:border-white/[.13] focus:border-indigo-500/60 focus:bg-black/45 focus:ring-4 focus:ring-indigo-500/10" />
      </span>
    </label>
  )
}

export default function AuthPage({ onAuthenticated }) {
  const { mode = 'login' } = useParams()
  const isRegister = mode === 'register'
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [apiOnline, setApiOnline] = useState(null)
  const score = useMemo(() => passwordScore(password), [password])
  const strength = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][Math.max(0, score - 1)]

  useEffect(() => {
    // Do not retain account identifiers on a shared computer.
    localStorage.removeItem('securevault:email')
    let active = true
    checkApiHealth().then((online) => active && setApiOnline(online))
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim().toLowerCase()
    const username = String(form.get('username') || '').trim()
    if (isRegister && password !== form.get('confirmPassword')) return setError('Your master passwords do not match.')
    setSubmitting(true)
    try {
      const payload = isRegister ? { username, email, masterPassword: password } : { email, masterPassword: password }
      const response = await apiRequest(`/api/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body: payload })
      const token = response.token || response.data?.token
      if (!token) throw new Error('The server did not return a session token.')
      const vaultKey = await deriveVaultKey(password, email)
      const account = response.user || response.data?.user || response
      onAuthenticated({ token, vaultKey, user: { _id: account._id || account.id, email: account.email || email, name: account.username || account.name || username || email.split('@')[0] } })
      navigate('/vault', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#09090b] px-4 py-12">
      <div className="ambient-grid pointer-events-none absolute inset-0" />
      <div className="aurora pointer-events-none absolute -left-24 top-[-12%] h-[420px] w-[420px] rounded-full bg-indigo-600" />
      <div className="aurora aurora-delay pointer-events-none absolute -right-16 bottom-[-16%] h-[460px] w-[460px] rounded-full bg-fuchsia-700" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-400/[.06] shadow-[0_0_120px_rgba(99,102,241,.08)]" />

      <motion.section initial={{ opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }} className="glass relative z-10 w-full max-w-[440px] rounded-[28px] p-6 sm:p-8">
        <div className="mb-8 flex items-center justify-between"><Logo /><span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.14em] ${apiOnline === false ? 'border-amber-400/15 bg-amber-400/[.07] text-amber-300' : 'border-emerald-400/15 bg-emerald-400/[.07] text-emerald-300'}`}>{apiOnline === false ? <WifiOff className="size-3" /> : <Wifi className="size-3" />}{apiOnline === null ? 'Connecting' : apiOnline ? 'Secure service ready' : 'Service offline'}</span></div>
        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, x: isRegister ? 14 : -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: isRegister ? -14 : 14 }} transition={{ duration: .22 }}>
            <div className="mb-7"><span className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-indigo-400"><Sparkles className="size-3" /> Private by design</span><h1 className="mb-2 text-[29px] font-semibold tracking-[-.04em] text-white">{isRegister ? 'Create your private vault' : 'Welcome back'}</h1><p className="text-[13px] leading-6 text-zinc-500">{isRegister ? 'One master password. Everything important, protected.' : 'Unlock your vault to access your encrypted data.'}</p></div>
            <form className="grid gap-4" onSubmit={submit}>
              {isRegister && <Field icon={UserRound} label="Your name" name="username" required autoComplete="name" placeholder="Alex Morgan" />}
              <Field icon={AtSign} label="Email address" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              <Field icon={KeyRound} label="Master password" name="password" type={showPassword ? 'text' : 'password'} required minLength="12" autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="At least 12 characters" value={password} onChange={(event) => setPassword(event.target.value)} action={<button type="button" className="flex items-center gap-1 text-[10px] text-zinc-500 transition-colors hover:text-white" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}{showPassword ? 'Hide' : 'Show'}</button>} />
              {isRegister && <><div className="-mt-1"><div className="mb-2 flex gap-1">{[1,2,3,4,5].map((level) => <motion.span key={level} className={`h-1 flex-1 rounded-full ${score >= level ? 'bg-gradient-to-r from-indigo-500 to-violet-400' : 'bg-white/[.07]'}`} initial={false} animate={{ opacity: score >= level ? 1 : .45 }} />)}</div><div className="flex justify-between text-[9px] text-zinc-600"><span>Use 12+ characters with a symbol</span><span className={score >= 4 ? 'text-emerald-400' : 'text-zinc-500'}>{password ? strength : 'Not entered'}</span></div></div><Field icon={LockKeyhole} label="Confirm password" name="confirmPassword" type="password" required minLength="12" autoComplete="new-password" placeholder="Repeat your master password" /></>}
              {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl border border-red-400/15 bg-red-400/[.07] px-3.5 py-3 text-[11px] text-red-300">{error}</motion.p>}
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: .985 }} type="submit" disabled={submitting} className="group mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 text-[12px] font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,.28)] transition-shadow hover:shadow-[0_0_42px_rgba(99,102,241,.4)] disabled:opacity-60"><LockKeyhole className="size-4" />{submitting ? 'Securing your session…' : isRegister ? 'Create secure vault' : 'Unlock my vault'}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></motion.button>
            </form>
            <p className="mt-6 text-center text-[11px] text-zinc-600">{isRegister ? 'Already have a vault?' : 'New to SecureVault?'} <Link to={`/auth/${isRegister ? 'login' : 'register'}`} onClick={() => { setError(''); setPassword('') }} className="font-medium text-zinc-300 transition-colors hover:text-indigo-300">{isRegister ? 'Sign in' : 'Create one'}</Link></p>
          </motion.div>
        </AnimatePresence>
        <div className="mt-7 flex items-center justify-center gap-2 border-t border-white/[.06] pt-5 text-[9px] text-zinc-700"><Check className="size-3 text-emerald-500" />AES-256 encrypted on this device</div>
      </motion.section>
    </main>
  )
}
