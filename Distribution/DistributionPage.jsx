import { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Send, X } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { distributionApi } from '../../API/distributionApi';
import { toast } from 'react-toastify';
import { useLanguage } from '../../Hooks/useLanguage';
import ConfirmationModal from '../../Components/Common/ConfirmationModal';
import DistributionRuleCard from './DistributionRuleCard';
import DistributionRuleEditor from './DistributionRuleEditor';
import '../ReportBuilder/reportBuilderTheme.css';

function useTheme() {
  const { mode } = useContext(DarkModeContext);
  const dark = mode === 'dark';
  return {
    dark,
    pageBg: dark ? '#0a0f1a' : '#f3f4f6',
    surface: dark ? '#111827' : '#ffffff',
    surfaceAlt: dark ? '#0a0f1a' : '#f9fafb',
    border: dark ? '#1e293b' : '#e5e7eb',
    text: dark ? '#f0f4f8' : '#111827',
    textSecondary: dark ? '#8899ab' : '#6b7280',
    textMuted: dark ? '#556677' : '#9ca3af',
    accent: dark ? '#22d3ee' : '#0369a1',
    accentHover: dark ? '#06b6d4' : '#075985',
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    hoverBg: dark ? 'rgba(10,15,26,0.4)' : 'rgba(0,0,0,0.03)',
    cardHoverBorder: dark ? 'rgba(34,211,238,0.3)' : 'rgba(3,105,161,0.25)',
    inputBg: dark ? '#111827' : '#ffffff',
    modalBg: dark ? '#111827' : '#ffffff',
    modalInputBg: dark ? '#0a0f1a' : '#f9fafb',
    btnGhostHover: dark ? '#1a2233' : '#f3f4f6',
    btnText: dark ? '#0a0f1a' : '#ffffff',
  };
}

const FILTER_TABS = ['all', 'active', 'paused'];

export default function DistributionPage() {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [runningId, setRunningId] = useState(null);

  const loadRules = useCallback(async () => {
    try {
      const res = await distributionApi.listRules();
      setRules(res.data?.data || []);
    } catch {
      toast.error(t('distribution.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  // Close drawer on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && drawerOpen) closeEditor(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawerOpen]);

  const stats = useMemo(() => {
    const total = rules.length;
    const active = rules.filter(r => r.enabled).length;
    const paused = total - active;
    return { total, active, paused };
  }, [rules]);

  const filtered = useMemo(() => {
    let list = rules;
    if (statusFilter === 'active') list = list.filter(r => r.enabled);
    else if (statusFilter === 'paused') list = list.filter(r => !r.enabled);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.report_details?.some(rd => rd.name?.toLowerCase().includes(q)) ||
        r.recipients?.some(e => e.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rules, statusFilter, search]);

  const handleSave = async (data) => {
    try {
      if (data.id) {
        await distributionApi.updateRule(data.id, data);
        toast.success(t('distribution.ruleUpdated'));
      } else {
        await distributionApi.createRule(data);
        toast.success(t('distribution.ruleCreated'));
      }
      closeEditor();
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || t('distribution.failedSave'));
    }
  };

  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', description: '', onConfirm: null, confirmText: '', confirmColor: 'brand' });
  const handleDelete = (id) => {
    setConfirmModal({ open: true, title: t('distribution.deleteRule'), description: t('distribution.deleteRuleConfirm'), confirmText: t('common.delete'), confirmColor: 'red', onConfirm: async () => {
      setConfirmModal(m => ({ ...m, open: false }));
      try { await distributionApi.deleteRule(id); toast.success(t('distribution.ruleDeleted')); loadRules(); }
      catch { toast.error(t('distribution.failedDelete')); }
    }});
  };

  const handleToggle = async (rule) => {
    try {
      const { name, report_ids, report_id, delivery_method, recipients, save_path, format,
              schedule_type, schedule_time, schedule_day_of_week, schedule_day_of_month } = rule;
      await distributionApi.updateRule(rule.id, {
        name, report_ids: report_ids || (report_id ? [report_id] : []),
        delivery_method, recipients, save_path, format,
        schedule_type, schedule_time, schedule_day_of_week, schedule_day_of_month,
        enabled: !rule.enabled,
      });
      loadRules();
    } catch {
      toast.error(t('distribution.failedToggle'));
    }
  };

  const handleRunNow = async (id) => {
    setRunningId(id);
    try {
      const res = await distributionApi.runRule(id);
      if (res.data?.status === 'success') toast.success(res.data.message || t('distribution.delivered'));
      else toast.error(res.data?.message || t('distribution.deliveryFailed'));
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || t('distribution.executionFailed'));
    } finally {
      setRunningId(null);
    }
  };

  const openEditor = (rule) => {
    setEditingRule(rule || null);
    setDrawerOpen(true);
  };

  const closeEditor = () => {
    setDrawerOpen(false);
    setTimeout(() => setEditingRule(null), 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="report-builder min-h-[calc(100vh-72px)]"
      style={{ background: theme.pageBg }}
    >
      <div className="px-6 md:px-8 lg:px-12 py-6 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>{t('distribution.title')}</h1>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>{t('distribution.subtitle')}</p>
          </div>
          <button onClick={() => openEditor(null)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: theme.accent, color: theme.btnText, '--tw-ring-color': theme.accent, '--tw-ring-offset-color': theme.pageBg }}>
            <Plus size={14} strokeWidth={2} /> {t('distribution.newRule')}
          </button>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-6 mb-6 px-4 py-2.5 rounded-lg"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          {[
            { label: t('distribution.total'), value: stats.total, color: theme.accent },
            { label: t('distribution.active'), value: stats.active, color: theme.dark ? '#34d399' : '#059669' },
            { label: t('distribution.paused'), value: stats.paused, color: theme.dark ? '#94a3b8' : '#64748b' },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-1.5"
              style={i < arr.length - 1 ? { paddingInlineEnd: '1.5rem', borderInlineEnd: `1px solid ${theme.border}` } : undefined}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-xs font-medium" style={{ color: theme.textMuted }}>{s.label}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </motion.div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: theme.textMuted }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('distribution.searchPlaceholder')}
              className="w-full ps-10 pe-4 py-2.5 rounded-lg text-sm focus:outline-none transition-all shadow-sm focus:ring-2 focus:border-transparent"
              style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, '--tw-ring-color': theme.accentBg }} />
          </div>
          <div className="flex items-center rounded-lg p-1 shadow-sm" style={{ background: theme.inputBg, border: `1px solid ${theme.border}` }}>
            {FILTER_TABS.map(s => {
              const isActive = statusFilter === s;
              const label = s === 'all' ? t('distribution.all') : s === 'active' ? t('distribution.active') : t('distribution.paused');
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-md transition-all"
                  style={{
                    background: isActive ? theme.accentBg : 'transparent',
                    color: isActive ? theme.accent : theme.textSecondary,
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="rounded-lg overflow-hidden" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div className="w-8 h-4 rounded animate-pulse" style={{ background: theme.border }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded w-44 animate-pulse" style={{ background: theme.border }} />
                  <div className="h-2.5 rounded w-28 animate-pulse" style={{ background: theme.surfaceAlt }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-lg"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ background: theme.accentBg }}>
              <Send size={22} style={{ color: theme.accent }} />
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: theme.text }}>
              {search || statusFilter !== 'all' ? t('distribution.noMatching') : t('distribution.noRulesYet')}
            </h3>
            <p className="text-xs mb-5 max-w-xs" style={{ color: theme.textSecondary }}>
              {search ? t('distribution.tryAdjusting') : t('distribution.createFirstHint')}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={() => openEditor(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs transition-colors"
                style={{ background: theme.accent, color: theme.btnText }}>
                <Plus size={14} /> {t('distribution.createFirstRule')}
              </button>
            )}
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
            className="space-y-2"
          >
            <AnimatePresence>
              {filtered.map(rule => (
                <DistributionRuleCard
                  key={rule.id}
                  rule={rule}
                  theme={theme}
                  onToggle={handleToggle}
                  onEdit={openEditor}
                  onDelete={handleDelete}
                  onRunNow={handleRunNow}
                  running={runningId === rule.id}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* ── Slide-out Drawer ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={closeEditor}
            />
            {/* Drawer panel */}
            <motion.div
              initial={{ x: isRTL ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className={`fixed top-0 ${isRTL ? 'start-0' : 'end-0'} bottom-0 z-50 w-full sm:w-[560px] shadow-2xl flex flex-col`}
              style={{ background: theme.surface }}
            >
              <DistributionRuleEditor
                rule={editingRule}
                theme={theme}
                onSave={handleSave}
                onCancel={closeEditor}
                onRunNow={handleRunNow}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmationModal isOpen={confirmModal.open} title={confirmModal.title} description={confirmModal.description} onConfirm={confirmModal.onConfirm || (() => {})} onCancel={() => setConfirmModal(m => ({ ...m, open: false }))} confirmText={confirmModal.confirmText} confirmColor={confirmModal.confirmColor} />
    </motion.div>
  );
}
