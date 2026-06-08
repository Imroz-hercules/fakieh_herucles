import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pencil, Trash2, Clock, Mail, HardDrive, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../Hooks/useLanguage';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DELIVERY_ICONS = { email: Mail, disk: HardDrive, both: Mail };

function formatSchedule(rule) {
  const time = rule.schedule_time || '08:00';
  if (rule.schedule_type === 'daily') return `Daily at ${time}`;
  if (rule.schedule_type === 'weekly') return `${DAY_NAMES[rule.schedule_day_of_week ?? 0]}s at ${time}`;
  if (rule.schedule_type === 'monthly') {
    const d = rule.schedule_day_of_month ?? 1;
    return `${d} of month at ${time}`;
  }
  return rule.schedule_type;
}

export default function DistributionRuleCard({ rule, theme: t, onToggle, onEdit, onDelete, onRunNow, running }) {
  const [hovered, setHovered] = useState(false);
  const { t: tr } = useLanguage();
  const accentBar = rule.enabled ? (t.dark ? '#34d399' : '#059669') : (t.dark ? '#475569' : '#9ca3af');
  const DeliveryIcon = DELIVERY_ICONS[rule.delivery_method] || Mail;

  // Multi-report details
  const reportDetails = rule.report_details || [];
  const reportCount = rule.report_ids?.length || (rule.report_id ? 1 : 0);
  const missingCount = reportCount - reportDetails.length;

  const statusBadge = () => {
    if (!rule.last_run_status) return null;
    const ok = rule.last_run_status === 'success';
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{
          background: ok ? (t.dark ? 'rgba(16,185,129,0.12)' : '#ecfdf5') : (t.dark ? 'rgba(239,68,68,0.12)' : '#fef2f2'),
          color: ok ? (t.dark ? '#34d399' : '#047857') : (t.dark ? '#f87171' : '#b91c1c'),
        }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
        {ok ? 'OK' : 'Failed'}
      </span>
    );
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="relative group rounded-lg overflow-hidden cursor-pointer transition-all duration-150"
      style={{
        background: t.surface,
        border: `1px solid ${hovered ? t.cardHoverBorder : t.border}`,
        opacity: rule.enabled ? 1 : 0.55,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onEdit(rule)}
    >
      {/* Left accent bar */}
      <div className="absolute start-0 top-0 bottom-0 w-[3px]" style={{ background: accentBar }} />

      <div className="flex items-center gap-4 ps-5 pe-4 py-3.5">
        {/* Toggle */}
        <label className="relative inline-flex items-center cursor-pointer shrink-0" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule)} className="sr-only peer" />
          <div className="w-8 h-[18px] rounded-full transition-colors peer peer-checked:after:translate-x-[14px] rtl:peer-checked:after:-translate-x-[14px] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all after:shadow-sm"
            style={{ background: rule.enabled ? t.accent : (t.dark ? '#334155' : '#d1d5db') }} />
        </label>

        {/* Name + Report pills */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold truncate" style={{ color: t.text }}>
              {rule.name || tr('distribution.untitledRule')}
            </span>
            {missingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ background: t.dark ? 'rgba(245,158,11,0.12)' : '#fffbeb', color: t.dark ? '#fbbf24' : '#92400e' }}>
                <AlertTriangle size={10} />
                {missingCount} {tr('distribution.reportDeleted')}
              </span>
            )}
            {statusBadge()}
          </div>
          {/* Report name pills */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {reportDetails.slice(0, 3).map(rd => (
              <span key={rd.id} className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ background: t.accentBg, color: t.accent }}>
                {rd.name}
              </span>
            ))}
            {reportDetails.length > 3 && (
              <span className="text-[10px] font-medium" style={{ color: t.textMuted }}>
                +{reportDetails.length - 3} {tr('distribution.more')}
              </span>
            )}
            {reportDetails.length === 0 && !missingCount && (
              <span className="text-[11px]" style={{ color: t.textMuted }}>
                {rule.report_name || `Report #${rule.report_id}`}
              </span>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <Clock size={12} style={{ color: t.textMuted }} />
          <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: t.textSecondary }}>
            {formatSchedule(rule)}
          </span>
        </div>

        {/* Delivery */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <DeliveryIcon size={12} style={{ color: t.textMuted }} />
          <span className="text-[11px] font-medium" style={{ color: t.textSecondary }}>
            {rule.delivery_method === 'both' ? 'Email + Disk' : rule.delivery_method}
          </span>
        </div>

        {/* Format badge */}
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
          style={{ background: t.accentBg, color: t.accent }}>
          {rule.format}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}>
          <button onClick={() => onRunNow(rule.id)} disabled={running}
            className="p-1.5 rounded-md transition-colors" title={tr('distribution.runNow')}
            style={{ color: t.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.color = t.dark ? '#34d399' : '#059669'; e.currentTarget.style.background = t.dark ? 'rgba(16,185,129,0.1)' : '#ecfdf5'; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = ''; }}>
            <Play size={13} />
          </button>
          <button onClick={() => onEdit(rule)}
            className="p-1.5 rounded-md transition-colors" title={tr('distribution.editRule')}
            style={{ color: t.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.color = t.accent; e.currentTarget.style.background = t.accentBg; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = ''; }}>
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(rule.id)}
            className="p-1.5 rounded-md transition-colors" title={tr('common.delete')}
            style={{ color: t.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = t.dark ? 'rgba(239,68,68,0.1)' : '#fef2f2'; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = ''; }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
