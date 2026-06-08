import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Mail, HardDrive, Layers, Save, Play, FolderOpen, ChevronRight, ArrowUp, Search, Check, ChevronDown } from 'lucide-react';
import { reportBuilderApi } from '../../API/reportBuilderApi';
import { herculesAIApi } from '../../API/herculesAIApi';
import RecipientInput from '../Settings/ReportDistribution/RecipientInput';
import { toast } from 'react-toastify';
import { useLanguage } from '../../Hooks/useLanguage';
import axios from '../../API/axios';

const DAY_PILLS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EMPTY_RULE = {
  name: '',
  report_ids: [],
  delivery_method: 'email',
  recipients: [],
  save_path: '',
  format: 'pdf',
  schedule_type: 'daily',
  schedule_time: '08:00',
  schedule_day_of_week: 0,
  schedule_day_of_month: 1,
  enabled: true,
  include_ai_summary: false,
};

function schedulePreview(form, t) {
  const time = form.schedule_time || '08:00';
  if (form.schedule_type === 'daily') return `${t('distribution.runsEveryDay')} ${time}`;
  if (form.schedule_type === 'weekly') return `${t('distribution.runsEvery')} ${DAY_PILLS[form.schedule_day_of_week ?? 0]} ${t('distribution.at')} ${time}`;
  if (form.schedule_type === 'monthly') {
    const d = form.schedule_day_of_month ?? 1;
    return `${t('distribution.runsOnThe')} ${d} ${t('distribution.ofEveryMonth')} ${time}`;
  }
  return '';
}

/* ── Multi-report selector ─────────────────────────────────────────────────── */
function MultiReportSelect({ selectedIds, onChange, reports, theme: t }) {
  const { t: tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = reports.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  const selected = reports.filter(r => selectedIds.includes(r.id));

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  return (
    <div ref={ref} className="relative">
      {/* Selected tags */}
      <div
        className="min-h-[42px] px-3 py-2 rounded-lg cursor-pointer flex flex-wrap items-center gap-1.5"
        style={{ background: t.inputBg, border: `1px solid ${t.border}` }}
        onClick={() => setOpen(!open)}
      >
        {selected.length === 0 && (
          <span className="text-sm" style={{ color: t.textMuted }}>{tr('distribution.selectReports')}</span>
        )}
        {selected.map(r => (
          <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ background: t.accentBg, color: t.accent }}>
            {r.name}
            <button onClick={(e) => { e.stopPropagation(); toggle(r.id); }}
              className="hover:opacity-70 ms-0.5">
              <X size={10} />
            </button>
          </span>
        ))}
        <ChevronDown size={14} className="ms-auto flex-shrink-0" style={{ color: t.textMuted }} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg shadow-xl overflow-hidden"
          style={{ background: t.surface, border: `1px solid ${t.border}` }}>
          <div className="p-2 border-b" style={{ borderColor: t.border }}>
            <div className="relative">
              <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: t.textMuted }} />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={tr('distribution.searchReports')}
                autoFocus
                className="w-full ps-8 pe-3 py-1.5 rounded-md text-xs focus:outline-none"
                style={{ background: t.modalInputBg, border: `1px solid ${t.border}`, color: t.text }}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs" style={{ color: t.textMuted }}>{tr('distribution.noReportsFound')}</div>
            ) : (
              filtered.map(r => {
                const checked = selectedIds.includes(r.id);
                return (
                  <button key={r.id} onClick={() => toggle(r.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-start text-xs transition-colors"
                    style={{ color: checked ? t.accent : t.text }}
                    onMouseEnter={e => e.currentTarget.style.background = t.hoverBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                      style={{ border: `1.5px solid ${checked ? t.accent : t.border}`, background: checked ? t.accentBg : 'transparent' }}>
                      {checked && <Check size={10} />}
                    </div>
                    <span className="font-medium truncate">{r.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Server folder browser modal ──────────────────────────────────────────── */
function FolderBrowserModal({ open, onClose, onSelect, theme: t }) {
  const { t: tr } = useLanguage();
  const [path, setPath] = useState('');
  const [parent, setParent] = useState('');
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);

  const browse = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/distribution/browse-folders', { params: { path: p || undefined } });
      if (res.data?.status === 'success') {
        setPath(res.data.current);
        setParent(res.data.parent ?? '');
        setFolders(res.data.folders || []);
      }
    } catch { toast.error('Failed to browse folders'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) browse(''); }, [open, browse]);

  if (!open) return null;

  // Build breadcrumb segments from path
  const pathSegments = path ? path.replace(/\\/g, '/').split('/').filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden mx-4"
        style={{ background: t.surface, border: `1px solid ${t.border}` }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: t.border }}>
          <div className="flex items-center gap-2">
            <FolderOpen size={16} style={{ color: t.accent }} />
            <span className="text-sm font-bold" style={{ color: t.text }}>{tr('distribution.selectFolder')}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70"><X size={16} style={{ color: t.textMuted }} /></button>
        </div>

        {/* Breadcrumb path */}
        {path && (
          <div className="px-4 py-2 flex items-center gap-0.5 flex-wrap" style={{ background: t.surfaceAlt, borderBottom: `1px solid ${t.border}` }}>
            {parent !== '' && (
              <button onClick={() => browse('')} className="text-[10px] font-semibold px-1.5 py-0.5 rounded hover:opacity-80 transition-colors"
                style={{ color: t.accent }}>
                {path.includes('\\') ? 'Drives' : '/'}
              </button>
            )}
            {pathSegments.map((seg, i) => {
              const segPath = path.includes('\\')
                ? pathSegments.slice(0, i + 1).join('\\')
                : '/' + pathSegments.slice(0, i + 1).join('/');
              const isLast = i === pathSegments.length - 1;
              return (
                <span key={i} className="flex items-center gap-0.5">
                  <ChevronRight size={10} style={{ color: t.textMuted }} />
                  <button
                    onClick={() => !isLast && browse(segPath)}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: isLast ? t.text : t.accent, cursor: isLast ? 'default' : 'pointer' }}>
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Folder list */}
        <div className="max-h-72 overflow-y-auto">
          {parent !== '' && (
            <button onClick={() => browse(parent)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium transition-colors border-b"
              style={{ color: t.accent, borderColor: t.border }}
              onMouseEnter={e => e.currentTarget.style.background = t.hoverBg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ArrowUp size={14} />
              <span>{tr('distribution.parentFolder')}</span>
            </button>
          )}
          {loading ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: t.textMuted }}>{tr('common.loading')}</div>
          ) : folders.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: t.textMuted }}>{tr('distribution.noSubfolders')}</div>
          ) : folders.map(f => (
            <button key={f.path} onClick={() => browse(f.path)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors"
              style={{ color: t.text }}
              onMouseEnter={e => e.currentTarget.style.background = t.hoverBg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span className="flex items-center gap-2.5"><FolderOpen size={14} style={{ color: t.accent }} /> {f.name}</span>
              <ChevronRight size={12} style={{ color: t.textMuted }} />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: t.border, background: t.surfaceAlt }}>
          <span className="text-[10px] font-mono truncate max-w-[60%]" style={{ color: t.textMuted }}>{path || '—'}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md" style={{ color: t.textSecondary }}>{tr('common.cancel')}</button>
            <button onClick={() => { onSelect(path); onClose(); }}
              disabled={!path}
              className="px-4 py-1.5 text-xs font-bold rounded-md transition-colors disabled:opacity-40"
              style={{ background: t.accent, color: t.btnText }}>
              {tr('distribution.selectThisFolder')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main editor (inside drawer) ──────────────────────────────────────────── */
export default function DistributionRuleEditor({ rule, theme: t, onSave, onCancel, onRunNow }) {
  const { t: tr } = useLanguage();
  const [form, setForm] = useState({ ...EMPTY_RULE });
  const [reports, setReports] = useState([]);
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [aiSetupComplete, setAiSetupComplete] = useState(false);

  useEffect(() => {
    reportBuilderApi.list().then(res => {
      const list = res.data?.data || res.data || [];
      setReports(list.map(r => ({ id: r.id, name: r.name })));
    }).catch(() => {});
    herculesAIApi.getStatus().then(res => {
      setAiSetupComplete(!!res.data?.setup_completed);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (rule) {
      setForm({
        ...EMPTY_RULE,
        ...rule,
        report_ids: rule.report_ids || (rule.report_id ? [rule.report_id] : []),
        recipients: rule.recipients || [],
      });
    } else {
      setForm({ ...EMPTY_RULE });
    }
  }, [rule]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.report_ids?.length) { toast.error(tr('distribution.selectAtLeastOneReport')); return; }
    if (form.delivery_method !== 'disk' && (!form.recipients || form.recipients.length === 0)) {
      toast.error(tr('distribution.addRecipients')); return;
    }
    if (form.delivery_method !== 'email' && !form.save_path) {
      toast.error(tr('distribution.enterSavePath')); return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, id: rule?.id, report_id: form.report_ids?.[0] || 0 });
    } finally {
      setSaving(false);
    }
  };

  const sectionClass = "px-5 py-4 border-b";
  const labelClass = "text-[10px] font-bold uppercase tracking-wider mb-2";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
        style={{ borderColor: t.border }}>
        <div>
          <h2 className="text-sm font-bold" style={{ color: t.text }}>
            {rule ? tr('distribution.editRule') : tr('distribution.newRule')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {rule && (
            <button onClick={() => onRunNow(rule.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ background: t.dark ? 'rgba(34,197,94,0.15)' : 'rgba(22,163,74,0.1)', color: t.dark ? '#34d399' : '#16a34a' }}>
              <Play size={11} /> {tr('distribution.runNow')}
            </button>
          )}
          <button onClick={onCancel} className="p-1.5 rounded-md transition-colors"
            style={{ color: t.textMuted }}
            onMouseEnter={e => e.currentTarget.style.background = t.btnGhostHover}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Rule name */}
        <div className={sectionClass} style={{ borderColor: t.border }}>
          <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.ruleName')}</div>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
            placeholder={tr('distribution.ruleNamePlaceholder')}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, '--tw-ring-color': t.accentBg }} />
        </div>

        {/* Reports (multi-select) */}
        <div className={sectionClass} style={{ borderColor: t.border }}>
          <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.reports')} *</div>
          <MultiReportSelect
            selectedIds={form.report_ids}
            onChange={ids => set('report_ids', ids)}
            reports={reports}
            theme={t}
          />
        </div>

        {/* Delivery + Format (compact row) */}
        <div className={sectionClass} style={{ borderColor: t.border }}>
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.delivery')}</div>
              <div className="flex gap-2">
                {[
                  { value: 'email', label: tr('distribution.email'), icon: Mail },
                  { value: 'disk', label: tr('distribution.disk'), icon: HardDrive },
                  { value: 'both', label: tr('distribution.both'), icon: Layers },
                ].map(opt => {
                  const active = form.delivery_method === opt.value;
                  return (
                    <button key={opt.value} onClick={() => set('delivery_method', opt.value)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex-1 justify-center"
                      style={{
                        background: active ? t.accentBg : 'transparent',
                        border: `1.5px solid ${active ? t.accent : t.border}`,
                        color: active ? t.accent : t.textSecondary,
                      }}>
                      <opt.icon size={13} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="w-40">
              <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.format')}</div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${t.border}` }}>
                {[
                  { value: 'pdf', label: 'PDF' },
                  { value: 'xlsx', label: tr('distribution.excel') },
                  { value: 'html', label: 'HTML' },
                ].map(f => (
                  <button key={f.value} onClick={() => set('format', f.value)}
                    className="flex-1 py-2 text-xs font-bold transition-all"
                    style={{
                      background: form.format === f.value ? t.accent : 'transparent',
                      color: form.format === f.value ? t.btnText : t.textSecondary,
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Summary toggle */}
            <div className="w-48">
              <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.includeAISummary')}</div>
              <button
                onClick={() => aiSetupComplete && set('include_ai_summary', !form.include_ai_summary)}
                disabled={!aiSetupComplete}
                className="flex items-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all w-full"
                style={{
                  background: form.include_ai_summary ? t.accent : t.inputBg,
                  color: form.include_ai_summary ? t.btnText : t.textSecondary,
                  border: `1.5px solid ${form.include_ai_summary ? t.accent : t.border}`,
                  opacity: aiSetupComplete ? 1 : 0.5,
                  cursor: aiSetupComplete ? 'pointer' : 'not-allowed',
                }}
                title={!aiSetupComplete ? tr('distribution.aiSummaryDisabledHint') : ''}
              >
                {form.include_ai_summary ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Conditional: Recipients */}
          {form.delivery_method !== 'disk' && (
            <div className="mt-3">
              <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.recipients')} *</div>
              <RecipientInput
                value={form.recipients}
                onChange={v => set('recipients', v)}
              />
            </div>
          )}

          {/* Conditional: Save path */}
          {form.delivery_method !== 'email' && (
            <div className="mt-3">
              <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.savePath')} *</div>
              <div className="flex gap-2">
                <input type="text" value={form.save_path} onChange={e => set('save_path', e.target.value)}
                  placeholder="C:\Reports"
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-2"
                  style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, '--tw-ring-color': t.accentBg }} />
                <button onClick={() => setBrowsing(true)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.textSecondary }}>
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Schedule (compact) */}
        <div className={sectionClass} style={{ borderColor: t.border }}>
          <div className={labelClass} style={{ color: t.textMuted }}>{tr('distribution.schedule')}</div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: `1.5px solid ${t.border}` }}>
              {['daily', 'weekly', 'monthly'].map(s => (
                <button key={s} onClick={() => set('schedule_type', s)}
                  className="px-3 py-1.5 text-xs font-semibold capitalize transition-all"
                  style={{
                    background: form.schedule_type === s ? t.accent : 'transparent',
                    color: form.schedule_type === s ? t.btnText : t.textSecondary,
                  }}>
                  {tr(`distribution.${s}`)}
                </button>
              ))}
            </div>
            <input type="time" value={form.schedule_time} onChange={e => set('schedule_time', e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:ring-2"
              style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, '--tw-ring-color': t.accentBg }} />
          </div>

          {/* Day selectors */}
          {form.schedule_type === 'weekly' && (
            <div className="flex gap-1 mt-2">
              {DAY_PILLS.map((d, i) => (
                <button key={d} onClick={() => set('schedule_day_of_week', i)}
                  className="w-9 h-8 rounded-md text-[10px] font-bold transition-all"
                  style={{
                    background: form.schedule_day_of_week === i ? t.accent : 'transparent',
                    border: `1.5px solid ${form.schedule_day_of_week === i ? t.accent : t.border}`,
                    color: form.schedule_day_of_week === i ? t.btnText : t.textSecondary,
                  }}>
                  {d}
                </button>
              ))}
            </div>
          )}
          {form.schedule_type === 'monthly' && (
            <div className="mt-2">
              <div className="grid grid-cols-7 gap-1" style={{ maxWidth: 280 }}>
                {Array.from({ length: 28 }, (_, i) => {
                  const day = i + 1;
                  const active = form.schedule_day_of_month === day;
                  return (
                    <button key={day} onClick={() => set('schedule_day_of_month', day)}
                      className="h-8 rounded-md text-[10px] font-bold transition-all"
                      style={{
                        background: active ? t.accent : 'transparent',
                        border: `1.5px solid ${active ? t.accent : t.border}`,
                        color: active ? t.btnText : t.textSecondary,
                      }}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview */}
          <p className="text-[10px] mt-2 italic" style={{ color: t.textMuted }}>
            {schedulePreview(form, tr)}
          </p>
        </div>

        {/* Enable toggle */}
        <div className="px-5 py-4" style={{ borderColor: t.border }}>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)}
                className="sr-only peer" />
              <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-emerald-500"
                style={{ background: form.enabled ? undefined : (t.dark ? '#374151' : '#d1d5db') }} />
              <div className="absolute top-0.5 start-0.5 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4 shadow-sm" />
            </div>
            <span className="text-xs font-medium" style={{ color: form.enabled ? (t.dark ? '#34d399' : '#059669') : t.textMuted }}>
              {form.enabled ? tr('distribution.ruleEnabled') : tr('distribution.rulePaused')}
            </span>
          </label>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t flex-shrink-0"
        style={{ borderColor: t.border, background: t.surfaceAlt }}>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{ color: t.textSecondary }}
          onMouseEnter={e => e.currentTarget.style.background = t.btnGhostHover}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {tr('common.cancel')}
        </button>
        <button onClick={handleSubmit} disabled={saving}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
          style={{ background: t.accent, color: t.btnText }}>
          <Save size={12} />
          {saving ? tr('common.saving') : tr('distribution.saveRule')}
        </button>
      </div>

      <FolderBrowserModal
        open={browsing}
        onClose={() => setBrowsing(false)}
        onSelect={p => set('save_path', p)}
        theme={t}
      />
    </div>
  );
}
