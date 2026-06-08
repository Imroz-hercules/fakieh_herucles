import { useState, useEffect } from 'react'
import { X, Plus, Send, Loader2 } from 'lucide-react'
import type { CatalogItem, DistributionRule, ReportFormat } from '@/lib/distributionApi'

interface Props {
  rule: DistributionRule | null
  catalog: CatalogItem[]
  onSave: (data: DistributionRule) => Promise<void>
  onCancel: () => void
}

const FORMATS: ReportFormat[] = ['pdf', 'xlsx', 'csv']
const DAYS = [
  { v: 0, label: 'Monday' }, { v: 1, label: 'Tuesday' }, { v: 2, label: 'Wednesday' },
  { v: 3, label: 'Thursday' }, { v: 4, label: 'Friday' }, { v: 5, label: 'Saturday' }, { v: 6, label: 'Sunday' },
]

const EMPTY: DistributionRule = {
  name: '',
  report_sources: [],
  formats: ['pdf'],
  delivery_method: 'email',
  recipients: [],
  save_path: '',
  schedule_type: 'daily',
  schedule_time: '08:00',
  schedule_day_of_week: 0,
  schedule_day_of_month: 1,
  enabled: true,
}

const inputClass =
  'w-full rounded-md border border-slate-600 light:border-gray-300 bg-slate-900 light:bg-white px-3 py-2 text-sm text-white light:text-gray-900 focus:border-cyan-500 focus:outline-none'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400 light:text-gray-600'

export default function DistributionRuleEditor({ rule, catalog, onSave, onCancel }: Props) {
  const [form, setForm] = useState<DistributionRule>(EMPTY)
  const [recipientInput, setRecipientInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(rule ? { ...EMPTY, ...rule } : EMPTY)
    setRecipientInput('')
    setError(null)
  }, [rule])

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

  const handleSubmit = async () => {
    setError(null)
    if (!form.name.trim()) return setError('Please enter a rule name')
    if (form.report_sources.length === 0) return setError('Select at least one report source')
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

  return (
    <div className="flex h-full flex-col bg-slate-900 light:bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 light:border-gray-200 px-6 py-4">
        <h2 className="text-lg font-bold text-white light:text-gray-900">
          {rule?.id ? 'Edit distribution rule' : 'New distribution rule'}
        </h2>
        <button type="button" onClick={onCancel} className="rounded-md p-1.5 text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className={labelClass}>Rule name</label>
          <input className={inputClass} value={form.name} onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Daily production summary" />
        </div>

        {/* Report sources */}
        <div>
          <label className={labelClass}>Report sources (pick the tables to send)</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {catalog.map((item) => {
              const checked = form.report_sources.includes(item.key)
              return (
                <button key={item.key} type="button" onClick={() => toggleSource(item.key)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    checked
                      ? 'border-cyan-500 bg-cyan-600/15 text-white light:text-gray-900'
                      : 'border-slate-600 light:border-gray-300 text-slate-300 light:text-gray-700 hover:border-cyan-500/50'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      checked ? 'border-cyan-400 bg-cyan-500' : 'border-slate-500'
                    }`}>{checked && <span className="text-[10px] text-white">✓</span>}</span>
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <p className="ml-6 mt-0.5 text-xs text-slate-400 light:text-gray-500">{item.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Formats */}
        <div>
          <label className={labelClass}>Format(s)</label>
          <div className="flex gap-2">
            {FORMATS.map((fmt) => {
              const checked = form.formats.includes(fmt)
              return (
                <button key={fmt} type="button" onClick={() => toggleFormat(fmt)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-bold uppercase transition-colors ${
                    checked
                      ? 'border-cyan-500 bg-cyan-600/15 text-cyan-300'
                      : 'border-slate-600 light:border-gray-300 text-slate-400 light:text-gray-500 hover:border-cyan-500/50'
                  }`}>{fmt}</button>
              )
            })}
          </div>
        </div>

        {/* Delivery */}
        <div>
          <label className={labelClass}>Delivery method</label>
          <div className="flex gap-2">
            {(['email', 'disk', 'both'] as const).map((m) => (
              <button key={m} type="button" onClick={() => update({ delivery_method: m })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  form.delivery_method === m
                    ? 'border-cyan-500 bg-cyan-600/15 text-cyan-300'
                    : 'border-slate-600 light:border-gray-300 text-slate-400 light:text-gray-500 hover:border-cyan-500/50'
                }`}>{m}</button>
            ))}
          </div>
        </div>

        {/* Recipients */}
        {(form.delivery_method === 'email' || form.delivery_method === 'both') && (
          <div>
            <label className={labelClass}>Recipients</label>
            <div className="flex gap-2">
              <input className={inputClass} value={recipientInput} type="email"
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                placeholder="name@example.com" />
              <button type="button" onClick={addRecipient}
                className="shrink-0 rounded-md bg-cyan-600 px-3 text-white hover:bg-cyan-700">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.recipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.recipients.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 rounded bg-slate-700 light:bg-gray-100 px-2 py-1 text-xs text-slate-200 light:text-gray-700">
                    {email}
                    <button type="button" onClick={() => removeRecipient(email)} className="text-slate-400 hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Frequency</label>
            <select className={inputClass} value={form.schedule_type}
              onChange={(e) => update({ schedule_type: e.target.value as DistributionRule['schedule_type'] })}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Time</label>
            <input type="time" className={inputClass} value={form.schedule_time}
              onChange={(e) => update({ schedule_time: e.target.value })} />
          </div>
          {form.schedule_type === 'weekly' && (
            <div className="col-span-2">
              <label className={labelClass}>Day of week</label>
              <select className={inputClass} value={form.schedule_day_of_week ?? 0}
                onChange={(e) => update({ schedule_day_of_week: parseInt(e.target.value, 10) })}>
                {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </div>
          )}
          {form.schedule_type === 'monthly' && (
            <div className="col-span-2">
              <label className={labelClass}>Day of month (1–28)</label>
              <input type="number" min={1} max={28} className={inputClass} value={form.schedule_day_of_month ?? 1}
                onChange={(e) => update({ schedule_day_of_month: parseInt(e.target.value, 10) })} />
            </div>
          )}
        </div>

        {/* Enabled */}
        <label className="flex cursor-pointer items-center gap-3">
          <button type="button" onClick={() => update({ enabled: !form.enabled })}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.enabled ? 'bg-cyan-600' : 'bg-slate-600'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form.enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
          <span className="text-sm text-slate-200 light:text-gray-700">
            {form.enabled ? 'Active — runs on schedule' : 'Paused — will not run automatically'}
          </span>
        </label>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-700 light:border-gray-200 px-6 py-4">
        <button type="button" onClick={onCancel}
          className="rounded-md border border-slate-600 light:border-gray-300 px-4 py-2 text-sm font-medium text-slate-300 light:text-gray-700 hover:bg-slate-800">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-5 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {rule?.id ? 'Save changes' : 'Create rule'}
        </button>
      </div>
    </div>
  )
}
