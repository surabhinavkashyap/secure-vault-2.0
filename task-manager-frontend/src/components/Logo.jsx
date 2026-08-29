import { ShieldCheck } from 'lucide-react'

export default function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="SecureVault">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_30px_rgba(99,102,241,.35)]">
        <ShieldCheck className="size-5 text-white" strokeWidth={2.25} />
        <span className="absolute inset-px rounded-[11px] ring-1 ring-white/20" />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-[-.02em] text-white">SecureVault</span>}
    </div>
  )
}
