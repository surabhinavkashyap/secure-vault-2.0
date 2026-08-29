import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Clock3, Download, FileKey2, LockKeyhole, ShieldCheck, Upload } from 'lucide-react'
import { normalizeSecuritySettings } from '../utils/security'

function SelectSetting({ icon: Icon, label, description, value, onChange, children }) {
  return (
    <label className="flex flex-col gap-3 rounded-2xl border border-white/[.065] bg-black/15 p-4 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-400/15 bg-indigo-500/[.07] text-indigo-300"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-zinc-200">{label}</span><span className="mt-1 block text-[10px] leading-4 text-zinc-600">{description}</span></span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 rounded-xl border border-white/[.08] bg-[#111114] px-3 text-[11px] text-zinc-300 outline-none focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-400/15">{children}</select>
    </label>
  )
}

export default function SecuritySettings({
  settings,
  onChange,
  onLockNow,
  onExportBackup,
  onImportBackup,
  exporting = false,
  importing = false,
  className = '',
}) {
  const normalized = normalizeSecuritySettings(settings)
  const importInput = useRef(null)
  const update = (name, value) => onChange?.({ ...normalized, [name]: value })

  function importFile(event) {
    const file = event.target.files?.[0]
    if (file) onImportBackup?.(file)
    event.target.value = ''
  }

  return (
    <section className={`overflow-hidden rounded-[24px] border border-white/[.075] bg-gradient-to-br from-white/[.05] to-white/[.018] shadow-[0_18px_55px_rgba(0,0,0,.22)] ${className}`} aria-labelledby="security-settings-title">
      <header className="flex items-start justify-between border-b border-white/[.06] p-5 sm:p-6">
        <div><span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-300"><ShieldCheck className="size-3.5" />Privacy controls</span><h2 id="security-settings-title" className="text-xl font-semibold tracking-[-.035em] text-white">Security settings</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Control when secrets disappear from your screen and clipboard.</p></div>
        <button type="button" onClick={onLockNow} className="hidden h-10 items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-3 text-[10px] font-medium text-zinc-400 transition hover:bg-white/[.07] hover:text-white sm:flex"><LockKeyhole className="size-3.5" />Lock now</button>
      </header>

      <div className="grid gap-3 p-5 sm:p-6">
        <SelectSetting icon={Clock3} label="Automatic vault lock" description="Lock after this much inactivity. The encryption key should remain memory-only." value={normalized.autoLockMinutes} onChange={(value) => update('autoLockMinutes', value)}>
          <option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={0}>Never</option>
        </SelectSetting>
        <SelectSetting icon={FileKey2} label="Clear copied passwords" description="Remove copied secrets from the clipboard after a short delay." value={normalized.clipboardClearSeconds} onChange={(value) => update('clipboardClearSeconds', value)}>
          <option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={0}>Never</option>
        </SelectSetting>
      </div>

      <div className="border-t border-white/[.06] p-5 sm:p-6">
        <div className="mb-4"><h3 className="text-xs font-semibold text-zinc-200">Encrypted backup</h3><p className="mt-1 text-[10px] leading-4 text-zinc-600">Export an encrypted archive or restore one. The parent app owns encryption, validation, and conflict handling.</p></div>
        <input ref={importInput} type="file" accept=".svault,.json,application/json" className="hidden" onChange={importFile} />
        <div className="grid gap-2 sm:grid-cols-2">
          <motion.button whileTap={{ scale: .985 }} type="button" disabled={exporting} onClick={onExportBackup} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-[11px] font-semibold text-white shadow-[0_0_24px_rgba(99,102,241,.2)] disabled:opacity-50"><Download className="size-3.5" />{exporting ? 'Preparing archive…' : 'Export encrypted backup'}</motion.button>
          <button type="button" disabled={importing} onClick={() => importInput.current?.click()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] text-[11px] font-medium text-zinc-400 transition hover:bg-white/[.07] hover:text-white disabled:opacity-50"><Upload className="size-3.5" />{importing ? 'Checking backup…' : 'Import backup'}</button>
        </div>
        <button type="button" onClick={onLockNow} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[.07] text-[10px] font-medium text-zinc-500 transition hover:bg-white/[.04] hover:text-white sm:hidden"><LockKeyhole className="size-3.5" />Lock vault now</button>
      </div>
    </section>
  )
}
