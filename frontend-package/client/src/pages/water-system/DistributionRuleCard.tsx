import { useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Pencil, Trash2, Clock, Mail, HardDrive, Loader2 } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
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

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DELIVERY_ICONS = { email: Mail, disk: HardDrive, both: Mail } as const

function formatSchedule(rule: DistributionRule): string {
  const time = rule.schedule_time || '08:00'
  if (rule.schedule_type === 'daily') return `Daily at ${time}`
  if (rule.schedule_type === 'weekly') return `${DAY_NAMES[rule.schedule_day_of_week ?? 0]}s at ${time}`
  if (rule.schedule_type === 'monthly') return `${rule.schedule_day_of_month ?? 1} of month at ${time}`
  return rule.schedule_type
}

export default function DistributionRuleCard({
  rule,
  catalogLabels,
  onToggle,
  onEdit,
  onDelete,
  onRunNow,
  running,
}: Props) {
  const [hovered, setHovered] = useState(false)
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const accentBar = rule.enabled
    ? dark ? '#34d399' : '#059669'
    : dark ? '#475569' : '#9ca3af'

  const DeliveryIcon = DELIVERY_ICONS[rule.delivery_method] || Mail
  const sources = (rule.report_sources || []).map((s) => catalogLabels[s] || s)
  const formatLabel = (rule.formats || []).join(', ') || 'pdf'

  const statusBadge = () => {
    if (!rule.last_run_status) return null
    const ok = rule.last_run_status === 'success'
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={{
          background: ok ? (dark ? 'rgba(16,185,129,0.12)' : '#ecfdf5') : (dark ? 'rgba(239,68,68,0.12)' : '#fef2f2'),
          color: ok ? (dark ? '#34d399' : '#047857') : (dark ? '#f87171' : '#b91c1c'),
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
        {ok ? 'OK' : 'Failed'}
      </span>
    )
  }

  const accent = dark ? '#22d3ee' : '#0369a1'
  const accentBg = dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)'
  const surface = dark ? '#111827' : '#ffffff'
  const border = dark ? '#1e293b' : '#e5e7eb'
  const cardHoverBorder = dark ? 'rgba(34,211,238,0.3)' : 'rgba(3,105,161,0.25)'
  const text = dark ? '#f0f4f8' : '#111827'
  const textSecondary = dark ? '#8899ab' : '#6b7280'
  const textMuted = dark ? '#556677' : '#9ca3af'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150"
      style={{
        background: surface,
        border: `1px solid ${hovered ? cardHoverBorder : border}`,
        opacity: rule.enabled ? 1 : 0.55,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onEdit(rule)}
    >
      <div className="absolute start-0 top-0 bottom-0 w-[3px]" style={{ background: accentBar }} />

      <div className="flex items-center gap-4 py-4 ps-5 pe-4">
        <label
          className="relative inline-flex shrink-0 cursor-pointer items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={() => onToggle(rule)}
            className="peer sr-only"
          />
          <div
            className="h-[18px] w-8 rounded-full transition-colors after:absolute after:start-[2px] after:top-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:after:translate-x-[14px]"
            style={{ background: rule.enabled ? accent : (dark ? '#334155' : '#d1d5db') }}
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold" style={{ color: text }}>
              {rule.name || 'Untitled rule'}
            </span>
            {statusBadge()}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {sources.slice(0, 3).map((label) => (
              <span
                key={label}
                className="inline-flex rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: accentBg, color: accent }}
              >
                {label}
              </span>
            ))}
            {sources.length > 3 && (
              <span className="text-xs font-medium" style={{ color: textMuted }}>
                +{sources.length - 3} more
              </span>
            )}
            {sources.length === 0 && (
              <span className="text-sm" style={{ color: textMuted }}>
                No reports selected
              </span>
            )}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <Clock size={14} style={{ color: textMuted }} />
          <span className="whitespace-nowrap text-sm font-medium" style={{ color: textSecondary }}>
            {formatSchedule(rule)}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <DeliveryIcon size={14} style={{ color: textMuted }} />
          <span className="text-sm font-medium" style={{ color: textSecondary }}>
            {rule.delivery_method === 'both' ? 'Email + Disk' : rule.delivery_method}
          </span>
        </div>

        <span
          className="hidden shrink-0 items-center rounded px-2.5 py-1 text-xs font-bold uppercase sm:inline-flex"
          style={{ background: accentBg, color: accent }}
        >
          {formatLabel}
        </span>

        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => rule.id && onRunNow(rule.id)}
            disabled={running}
            title="Run now"
            className="rounded-md p-1.5 transition-colors disabled:opacity-60"
            style={{ color: textMuted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = dark ? '#34d399' : '#059669'
              e.currentTarget.style.background = dark ? 'rgba(16,185,129,0.1)' : '#ecfdf5'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = textMuted
              e.currentTarget.style.background = ''
            }}
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          </button>
          <button
            type="button"
            onClick={() => onEdit(rule)}
            title="Edit rule"
            className="rounded-md p-1.5 transition-colors"
            style={{ color: textMuted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = accent
              e.currentTarget.style.background = accentBg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = textMuted
              e.currentTarget.style.background = ''
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => rule.id && onDelete(rule.id)}
            title="Delete"
            className="rounded-md p-1.5 transition-colors"
            style={{ color: textMuted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.background = dark ? 'rgba(239,68,68,0.1)' : '#fef2f2'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = textMuted
              e.currentTarget.style.background = ''
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
