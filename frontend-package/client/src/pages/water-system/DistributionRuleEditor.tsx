import { useState, useEffect, useRef } from 'react'
import { X, Plus, Save, Loader2, Mail, HardDrive, Layers, ChevronDown } from 'lucide-react'
import type { CatalogItem, DistributionRule, ReportFormat } from '@/lib/distributionApi'

interface Props {
  rule: DistributionRule | null
  catalog: CatalogItem[]
  onSave: (data: DistributionRule) => Promise<void>
  onCancel: () => void
}

const FORMATS: { value: ReportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
]

const DELIVERY: { value: DistributionRule['delivery_method']; label: string; Icon: typeof Mail }[] = [
  { value: 'email', label: 'Email', Icon: Mail },
  { value: 'disk', label: 'Disk', Icon: HardDrive },
  { value: 'both', label: 'Both', Icon: Layers },
]

const DAYS = [
  { v: 0, label: 'Mon' }, { v: 1, label: 'Tue' }, { v: 2, label: 'Wed' },
  { v: 3, label: 'Thu' }, { v: 4, label: 'Fri' }, { v: 5, label: 'Sat' }, { v: 6, label: 'Sun' },
]
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const EMPTY: DistributionRule = {
  name: '',
  report_sources: [],
  formats: ['pdf', 'xlsx'],
  delivery_method: 'email',
  recipients: [],
  save_path: '',
  schedule_type: 'daily',
  schedule_time: '07:00',
  schedule_day_of_week: 0,
  schedule_day_of_month: 1,
  window_mode: 'auto',
  window_start_time: '07:00',
  window_end_time: '07:00',
  custom_start: null,
  custom_end: null,
  enabled: true,
}

const inputClass =
  'w-full rounded-md border border-slate-600 light:border-gray-300 bg-slate-900 light:bg-white px-3 py-2 text-sm text-white light:text-gray-900 focus:border-cyan-500 focus:outline-none'
const timeInputClass =
  'w-36 shrink-0 rounded-md border border-slate-600 light:border-gray-300 bg-slate-900 light:bg-white px-3 py-2 text-sm text-white light:text-gray-900 focus:border-cyan-500 focus:outline-none'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400 light:text-gray-600'

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function DistributionRuleEditor({ rule, catalog, onSave, onCancel }: Props) {
  const [form, setForm] = useState<DistributionRule>(EMPTY)
  const [recipientInput, setRecipientInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportsOpen, setReportsOpen] = useState(false)
  const reportsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setForm(rule ? { ...EMPTY, ...rule } : EMPTY)
    setRecipientInput('')
    setError(null)
  }, [rule])

  useEffect(() => {
    if (!reportsOpen) return
    const onDoc = (e: MouseEvent) => {
      if (reportsRef.current && !reportsRef.current.contains(e.target as Node)) setReportsOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [reportsOpen])

  const update = (patch: Partial<DistributionRule>) => setForm((f) => ({ ...f, ...patch }))

  const toggleSource = (key: string) => {
    const has = form.report_sources.includes(key)
    update({ report_sources: has ? form.report_sources.filter((s) => s !== key) : [...form.report_sources, key] })
  }
  const toggleFormat = (fmt: ReportFormat) => {
    const has = form.formats.includes(fmt)
    update({ formats: has ? form.formats.filter((f) => f !== fmt) : [...form.formats, fmt] })
  }

  const addRecipient = () => {
    const v = recipientInput.trim()
    if (v && !form.recipients.includes(v)) update({ recipients: [...form.recipients, v] })
    setRecipientInput('')
  }
  const removeRecipient = (email: string) =>
    update({ recipients: form.recipients.filter((e) => e !== email) })

  const labelFor = (key: string) => catalog.find((c) => c.key === key)?.label || key

  const scheduleSummary = () => {
    const time = form.schedule_time
    if (form.schedule_type === 'daily') return `Runs every day at ${time}`
    if (form.schedule_type === 'weekly') return `Runs every ${DAY_FULL[form.schedule_day_of_week ?? 0]} at ${time}`
    return `Runs on the ${ordinal(form.schedule_day_of_month ?? 1)} of every month at ${time}`
  }

  const handleSubmit = async () => {
    setError(null)
    if (!form.name.trim()) return setError('Please enter a rule name')
    if (form.report_sources.length === 0) return setError('Select at least one report')
    if (form.formats.length === 0) return setError('Select at least one format')
    if ((form.delivery_method === 'email' || form.delivery_method === 'both') && form.recipients.length === 0)
      return setError('Add at least one recipient for email delivery')
    if ((form.delivery_method === 'disk' || form.delivery_method === 'both') && !form.save_path.trim())
      return setError('Enter a save path for disk delivery')

    setSaving(true)
    try {
      await onSave(form)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const segBtn = (active: boolean) =>
    `flex-1 rounded-md px-3 py-2 text-sm font-bold transition-colors ${
      active
        ? 'bg-cyan-600 text-white shadow'
        : 'text-slate-400 light:text-gray-500 hover:text-slate-200 light:hover:text-gray-700'
    }`

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 light:bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 light:border-gray-200 px-6 py-4">
        <h2 className="text-lg font-bold text-white light:text-gray-900">
          {rule?.id ? 'Edit distribution rule' : 'New distribution rule'}
        </h2>
        <button type="button" onClick={onCancel} className="rounded-md p-1.5 text-slate-400 hover:text-white light:hover:text-gray-900">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Rule name */}
        <div>
          <label className={labelClass}>Rule name</label>
          <input className={inputClass} value={form.name} onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Daily production summary" />
        </div>

        {/* Reports — chip multi-select dropdown */}
        <div ref={reportsRef} className="relative">
          <label className={labelClass}>Reports *</label>
          <button type="button" onClick={() => setReportsOpen((o) => !o)}
            className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-md border border-slate-600 light:border-gray-300 bg-slate-900 light:bg-white px-2.5 py-1.5 text-left focus:border-cyan-500 focus:outline-none">
            <span className="flex flex-1 flex-wrap items-center gap-1.5">
              {form.report_sources.length === 0 && (
                <span className="px-1 text-sm text-slate-500 light:text-gray-400">Select reports…</span>
              )}
              {form.report_sources.map((key) => (
                <span key={key}
                  className="inline-flex items-center gap-1 rounded bg-cyan-600/15 px-2 py-0.5 text-xs font-medium text-cyan-300 light:bg-cyan-50 light:text-cyan-700">
                  {labelFor(key)}
                  <span role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggleSource(key) }}
                    className="text-cyan-400 hover:text-red-400">
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${reportsOpen ? 'rotate-180' : ''}`} />
          </button>

          {reportsOpen && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-600 light:border-gray-300 bg-slate-900 light:bg-white py-1 shadow-xl">
              {catalog.map((item) => {
                const checked = form.report_sources.includes(item.key)
                return (
                  <button key={item.key} type="button" onClick={() => toggleSource(item.key)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-800 light:hover:bg-gray-50">
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-cyan-400 bg-cyan-500' : 'border-slate-500'
                    }`}>{checked && <span className="text-[10px] text-white">✓</span>}</span>
                    <span>
                      <span className="block text-sm font-medium text-white light:text-gray-900">{item.label}</span>
                      <span className="block text-xs text-slate-400 light:text-gray-500">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Delivery + Format on one row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Delivery</label>
            <div className="flex gap-2">
              {DELIVERY.map(({ value, label, Icon }) => (
                <button key={value} type="button" onClick={() => update({ delivery_method: value })}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                    form.delivery_method === value
                      ? 'border-cyan-500 bg-cyan-600/15 text-cyan-300'
                      : 'border-slate-600 light:border-gray-300 text-slate-400 light:text-gray-500 hover:border-cyan-500/50'
                  }`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Format</label>
            <div className="flex rounded-md border border-slate-600 light:border-gray-300 p-0.5">
              {FORMATS.map(({ value, label }) => {
                const checked = form.formats.includes(value)
                return (
                  <button key={value} type="button" onClick={() => toggleFormat(value)}
                    className={`flex-1 rounded px-2 py-1.5 text-sm font-bold transition-colors ${
                      checked
                        ? 'bg-cyan-600 text-white'
                        : 'text-slate-400 light:text-gray-500 hover:text-slate-200 light:hover:text-gray-700'
                    }`}>{label}</button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Recipients */}
        {(form.delivery_method === 'email' || form.delivery_method === 'both') && (
          <div>
            <label className={labelClass}>Recipients *</label>
            {form.recipients.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.recipients.map((email) => (
                  <span key={email}
                    className="inline-flex items-center gap-1.5 rounded bg-slate-700 light:bg-gray-100 px-2 py-1 text-xs text-slate-200 light:text-gray-700">
                    <Mail className="h-3 w-3 text-slate-400" />
                    {email}
                    <button type="button" onClick={() => removeRecipient(email)} className="text-slate-400 hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className={`${inputClass} pl-9`} value={recipientInput} type="email"
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                  placeholder="Enter email address…" />
              </div>
              <button type="button" onClick={addRecipient}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>
        )}

        {/* Save path */}
        {(form.delivery_method === 'disk' || form.delivery_method === 'both') && (
          <div>
            <label className={labelClass}>Save path (on server)</label>
            <input className={inputClass} value={form.save_path} onChange={(e) => update({ save_path: e.target.value })}
              placeholder="C:\\Reports\\Distribution" />
          </div>
        )}
 
        {/* Schedule */}
        <div>
          <label className={labelClass}>Schedule</label>
          <div className="flex items-center gap-3">
            <div className="flex flex-1 rounded-md border border-slate-600 light:border-gray-300 p-0.5">
              {(['daily', 'weekly', 'monthly'] as const).map((t) => (
                <button key={t} type="button" onClick={() => update({ schedule_type: t })}
                  className={segBtn(form.schedule_type === t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <input type="time" className={timeInputClass} value={form.schedule_time}
              onChange={(e) => update({ schedule_time: e.target.value })} />
          </div>

          {/* Weekly day picker */}
          {form.schedule_type === 'weekly' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d.v} type="button" onClick={() => update({ schedule_day_of_week: d.v })}
                  className={`h-9 w-12 rounded-md border text-sm font-medium transition-colors ${
                    (form.schedule_day_of_week ?? 0) === d.v
                      ? 'border-cyan-500 bg-cyan-600 text-white'
                      : 'border-slate-600 light:border-gray-300 text-slate-300 light:text-gray-700 hover:border-cyan-500/50'
                  }`}>{d.label}</button>
              ))}
            </div>
          )}

          {/* Monthly day grid */}
          {form.schedule_type === 'monthly' && (
            <div className="mt-3 grid grid-cols-7 gap-2">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <button key={day} type="button" onClick={() => update({ schedule_day_of_month: day })}
                  className={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
                    (form.schedule_day_of_month ?? 1) === day
                      ? 'border-cyan-500 bg-cyan-600 text-white'
                      : 'border-slate-600 light:border-gray-300 text-slate-300 light:text-gray-700 hover:border-cyan-500/50'
                  }`}>{day}</button>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs italic text-slate-400 light:text-gray-500">{scheduleSummary()}</p>
        </div>

        {/* Enabled */}
        <label className="flex cursor-pointer items-center gap-3">
          <button type="button" onClick={() => update({ enabled: !form.enabled })}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.enabled ? 'bg-green-500' : 'bg-slate-600'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form.enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
          <span className={`text-sm font-medium ${form.enabled ? 'text-green-500' : 'text-slate-400 light:text-gray-500'}`}>
            Rule is enabled
          </span>
        </label>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-700 light:border-gray-200 px-6 py-4">
        <button type="button" onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 light:text-gray-600 hover:bg-slate-800 light:hover:bg-gray-100">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-5 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Rule
        </button>
      </div>
    </div>
  )
}
