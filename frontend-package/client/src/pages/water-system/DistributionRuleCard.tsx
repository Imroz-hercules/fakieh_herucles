import { Send, Edit, Trash2, Clock, Mail, HardDrive, Loader2 } from 'lucide-react'
import type { DistributionRule } from '@/lib/distributionApi'

interface Props {
  rule: DistributionRule
  catalogLabels: Record<string, string>
  onToggle: (rule: DistributionRule) => void
  onEdit: (rule: DistributionRule) => void
  onDelete: (id: number) => void
  onRunNow: (id: number) => void
  running: boolean
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function scheduleLabel(rule: DistributionRule): string {
  if (rule.schedule_type === 'daily') return `Daily at ${rule.schedule_time}`
  if (rule.schedule_type === 'weekly')
    return `Weekly on ${DAYS[rule.schedule_day_of_week ?? 0]} at ${rule.schedule_time}`
  return `Monthly on day ${rule.schedule_day_of_month ?? 1} at ${rule.schedule_time}`
}

export default function DistributionRuleCard({
  rule, catalogLabels, onToggle, onEdit, onDelete, onRunNow, running,
}: Props) {
  const sources = (rule.report_sources || []).map((s) => catalogLabels[s] || s)

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-700 light:border-gray-200 bg-slate-800/40 light:bg-white px-5 py-4 transition-colors hover:border-cyan-500/40">
      {/* Enabled toggle */}
      <button
        type="button"
        onClick={() => onToggle(rule)}
        title={rule.enabled ? 'Active — click to pause' : 'Paused — click to activate'}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          rule.enabled ? 'bg-cyan-600' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            rule.enabled ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-bold text-white light:text-gray-900">
            {rule.name || 'Untitled rule'}
          </h3>
          {rule.last_run_status === 'error' && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
              last run failed
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 light:text-gray-600">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {scheduleLabel(rule)}
          </span>
          <span className="inline-flex items-center gap-1">
            {rule.delivery_method === 'disk' ? <HardDrive className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
            {rule.delivery_method}
          </span>
          <span className="uppercase">{(rule.formats || []).join(', ')}</span>
        </div>
        {sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {sources.map((label) => (
              <span key={label} className="rounded bg-slate-700/60 light:bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 light:text-gray-700">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => rule.id && onRunNow(rule.id)}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-700 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Run now
        </button>
        <button
          type="button"
          onClick={() => onEdit(rule)}
          className="rounded-md border border-slate-600 light:border-gray-300 p-1.5 text-slate-300 light:text-gray-600 transition-colors hover:text-cyan-400"
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => rule.id && onDelete(rule.id)}
          className="rounded-md border border-slate-600 light:border-gray-300 p-1.5 text-slate-300 light:text-gray-600 transition-colors hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
