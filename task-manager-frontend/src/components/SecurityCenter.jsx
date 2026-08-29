import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, CopyX, ShieldCheck } from 'lucide-react'
import { analyzeVaultSecurity } from '../utils/security'

const metricMeta = {
  weak: { label: 'Weak', hint: 'Easy to guess', icon: AlertTriangle, tone: 'text-amber-300 bg-amber-400/[.08] border-amber-400/15' },
  reused: { label: 'Reused', hint: 'Shared across accounts', icon: CopyX, tone: 'text-red-300 bg-red-400/[.08] border-red-400/15' },
  old: { label: 'Aging', hint: 'Due for a refresh', icon: Clock3, tone: 'text-violet-300 bg-violet-400/[.08] border-violet-400/15' },
}

function issueSummary(finding) {
  const messages = []
  if (finding.issues.includes('weak')) messages.push(`${finding.strength.label.toLowerCase()} password`)
  if (finding.issues.includes('reused')) messages.push('used in another entry')
  if (finding.issues.includes('old')) messages.push(`${finding.ageDays} days old`)
  return messages.join(' · ')
}

export default function SecurityCenter({ entries = [], settings, onFilter, onOpenEntry, className = '' }) {
  const report = useMemo(() => analyzeVaultSecurity(entries, settings), [entries, settings])

  return (
    <section className={`overflow-hidden rounded-[24px] border border-white/[.075] bg-gradient-to-br from-white/[.05] to-white/[.018] shadow-[0_18px_55px_rgba(0,0,0,.22)] ${className}`} aria-labelledby="security-center-title">
      <header className="flex flex-col gap-5 border-b border-white/[.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-300"><ShieldCheck className="size-3.5" />Local security audit</span>
          <h2 id="security-center-title" className="text-xl font-semibold tracking-[-.035em] text-white">Security Center</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Your decrypted data is checked only in this browser session.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-3 pr-4">
          <div className="relative grid size-14 place-items-center rounded-full" style={{ background: `conic-gradient(#34d399 ${report.score * 3.6}deg, rgba(255,255,255,.07) 0deg)` }}>
            <span className="absolute inset-[4px] rounded-full bg-[#111114]" />
            <strong className="relative text-sm text-white">{report.score}</strong>
          </div>
          <div><p className="text-[9px] uppercase tracking-[.12em] text-zinc-600">Vault health</p><p className="mt-0.5 text-xs font-semibold text-emerald-300">{report.grade}</p></div>
        </div>
      </header>

      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        {Object.entries(metricMeta).map(([type, meta]) => {
          const Icon = meta.icon
          const metric = report[type]
          return (
            <motion.button key={type} type="button" whileHover={{ y: -2 }} whileTap={{ scale: .985 }} onClick={() => onFilter?.(type, metric.ids)} className="rounded-2xl border border-white/[.065] bg-black/15 p-4 text-left transition hover:border-white/[.12] focus:outline-none focus:ring-2 focus:ring-indigo-400/50">
              <span className={`mb-4 grid size-9 place-items-center rounded-xl border ${meta.tone}`}><Icon className="size-4" /></span>
              <span className="flex items-end justify-between"><span><strong className="block text-2xl font-semibold tracking-[-.04em] text-white">{metric.count}</strong><span className="text-xs font-medium text-zinc-300">{meta.label}</span></span><ArrowUpRight className="mb-1 size-3.5 text-zinc-700" /></span>
              <span className="mt-1.5 block text-[10px] text-zinc-600">{meta.hint}</span>
            </motion.button>
          )
        })}
      </div>

      <div className="border-t border-white/[.06] px-5 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-zinc-300">Priority actions</h3><span className="text-[10px] text-zinc-600">{report.findings.length} to review</span></div>
        {report.findings.length ? (
          <ul className="grid max-h-56 list-none gap-1 overflow-y-auto p-0">
            {report.findings.slice(0, 8).map((finding) => (
              <li key={finding.id}>
                <button type="button" onClick={() => onOpenEntry?.(finding.entry, finding)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/[.045] focus:outline-none focus:ring-2 focus:ring-indigo-400/40">
                  <span className={`size-2 shrink-0 rounded-full ${finding.severity === 'critical' ? 'bg-red-400 shadow-[0_0_8px_#f87171]' : finding.severity === 'warning' ? 'bg-amber-400' : 'bg-violet-400'}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-zinc-300 group-hover:text-white">{finding.title}</span><span className="block truncate text-[10px] text-zinc-600">{issueSummary(finding)}</span></span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-zinc-700 transition group-hover:text-indigo-300" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[.045] p-3 text-xs text-emerald-200"><CheckCircle2 className="size-4" />No urgent password issues detected.</div>
        )}
      </div>
    </section>
  )
}
