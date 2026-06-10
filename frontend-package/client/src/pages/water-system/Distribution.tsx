import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, Send } from 'lucide-react'
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'
import { useTheme } from '@/contexts/ThemeContext'
import { useToast } from '@/hooks/use-toast'
import {
  distributionApi,
  type CatalogItem,
  type DistributionRule,
} from '@/lib/distributionApi'
import DistributionRuleCard from './DistributionRuleCard'
import DistributionRuleEditor from './DistributionRuleEditor'

type StatusFilter = 'all' | 'active' | 'paused'
const FILTER_TABS: StatusFilter[] = ['all', 'active', 'paused']

function usePageTheme() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
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
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    inputBg: dark ? '#111827' : '#ffffff',
    btnText: dark ? '#0a0f1a' : '#ffffff',
  }
}

export function Distribution() {
  const pageTheme = usePageTheme()
  const { toast } = useToast()
  const [rules, setRules] = useState<DistributionRule[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<DistributionRule | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [runningId, setRunningId] = useState<number | null>(null)

  const catalogLabels = useMemo(() => {
    const map: Record<string, string> = {}
    catalog.forEach((c) => { map[c.key] = c.label })
    return map
  }, [catalog])

  const loadRules = useCallback(async () => {
    try {
      const res = await distributionApi.listRules()
      setRules(res.data?.data || [])
    } catch {
      toast({ title: 'Error', description: 'Failed to load distribution rules', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    distributionApi.getCatalog().then((res) => setCatalog(res.data?.data || [])).catch(() => {})
    loadRules()
  }, [loadRules])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drawerOpen) closeEditor() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drawerOpen])

  const stats = useMemo(() => {
    const total = rules.length
    const active = rules.filter((r) => r.enabled).length
    return { total, active, paused: total - active }
  }, [rules])

  const filtered = useMemo(() => {
    let list = rules
    if (statusFilter === 'active') list = list.filter((r) => r.enabled)
    else if (statusFilter === 'paused') list = list.filter((r) => !r.enabled)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.recipients?.some((e) => e.toLowerCase().includes(q)) ||
          (r.report_sources || []).some((s) => (catalogLabels[s] || s).toLowerCase().includes(q)),
      )
    }
    return list
  }, [rules, statusFilter, search, catalogLabels])

  const openEditor = (rule: DistributionRule | null) => {
    setEditingRule(rule)
    setDrawerOpen(true)
  }
  const closeEditor = () => {
    setDrawerOpen(false)
    setTimeout(() => setEditingRule(null), 300)
  }

  const handleSave = async (data: DistributionRule) => {
    if (data.id) {
      await distributionApi.updateRule(data.id, data)
      toast({ title: 'Saved', description: 'Distribution rule updated' })
    } else {
      await distributionApi.createRule(data)
      toast({ title: 'Created', description: 'Distribution rule created' })
    }
    closeEditor()
    loadRules()
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this distribution rule?')) return
    try {
      await distributionApi.deleteRule(id)
      toast({ title: 'Deleted', description: 'Distribution rule removed' })
      loadRules()
    } catch {
      toast({ title: 'Error', description: 'Failed to delete rule', variant: 'destructive' })
    }
  }

  const handleToggle = async (rule: DistributionRule) => {
    try {
      await distributionApi.updateRule(rule.id!, { ...rule, enabled: !rule.enabled })
      loadRules()
    } catch {
      toast({ title: 'Error', description: 'Failed to update rule', variant: 'destructive' })
    }
  }

  const handleRunNow = async (id: number) => {
    setRunningId(id)
    try {
      const res = await distributionApi.runRule(id)
      if (res.data?.status === 'success')
        toast({ title: 'Delivered', description: res.data.message || 'Report sent' })
      else
        toast({ title: 'Failed', description: res.data?.message || 'Delivery failed', variant: 'destructive' })
      loadRules()
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.response?.data?.message || 'Execution failed', variant: 'destructive' })
    } finally {
      setRunningId(null)
    }
  }

  return (
    <>
      <WaterSystemLayout
        title="Distribution"
        subtitle="Scheduled report delivery rules"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="-m-6 min-h-full px-6 py-6 md:px-8 md:py-8 lg:px-10"
          style={{ background: pageTheme.pageBg }}
        >
          <div className="mb-6 flex justify-end">
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold shadow-md transition-all hover:brightness-110 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                background: pageTheme.accent,
                color: pageTheme.btnText,
                // @ts-expect-error CSS custom property
                '--tw-ring-color': pageTheme.accent,
                '--tw-ring-offset-color': pageTheme.pageBg,
              }}
            >
              <Plus size={14} strokeWidth={2} /> New Rule
            </button>
          </div>

          {/* Stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6 flex items-center gap-6 rounded-lg px-5 py-3.5"
            style={{ background: pageTheme.surface, border: `1px solid ${pageTheme.border}` }}
          >
            {[
              { label: 'Total', value: stats.total, color: pageTheme.accent },
              { label: 'Active', value: stats.active, color: pageTheme.dark ? '#34d399' : '#059669' },
              { label: 'Paused', value: stats.paused, color: pageTheme.dark ? '#94a3b8' : '#64748b' },
            ].map((s, i, arr) => (
              <div
                key={s.label}
                className="flex items-center gap-1.5"
                style={i < arr.length - 1 ? { paddingInlineEnd: '1.5rem', borderInlineEnd: `1px solid ${pageTheme.border}` } : undefined}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-medium" style={{ color: pageTheme.textMuted }}>{s.label}</span>
                <span className="text-base font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </motion.div>

          {/* Search + filter */}
          <div className="mb-6 flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search
                size={18}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2"
                style={{ color: pageTheme.textMuted }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules..."
                className="w-full rounded-lg py-3 ps-10 pe-4 text-base shadow-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                style={{
                  background: pageTheme.inputBg,
                  border: `1px solid ${pageTheme.border}`,
                  color: pageTheme.text,
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': pageTheme.accentBg,
                }}
              />
            </div>
            <div
              className="flex items-center rounded-lg p-1 shadow-sm"
              style={{ background: pageTheme.inputBg, border: `1px solid ${pageTheme.border}` }}
            >
              {FILTER_TABS.map((s) => {
                const isActive = statusFilter === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className="rounded-md px-4 py-2 text-sm font-semibold capitalize transition-all"
                    style={{
                      background: isActive ? pageTheme.accentBg : 'transparent',
                      color: isActive ? pageTheme.accent : pageTheme.textSecondary,
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div
              className="overflow-hidden rounded-lg"
              style={{ background: pageTheme.surface, border: `1px solid ${pageTheme.border}` }}
            >
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4"
                  style={{ borderBottom: `1px solid ${pageTheme.border}` }}
                >
                  <div className="h-4 w-8 animate-pulse rounded" style={{ background: pageTheme.border }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-44 animate-pulse rounded" style={{ background: pageTheme.border }} />
                    <div className="h-2.5 w-28 animate-pulse rounded" style={{ background: pageTheme.surfaceAlt }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-lg py-24 text-center"
              style={{ background: pageTheme.surface, border: `1px solid ${pageTheme.border}` }}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: pageTheme.accentBg }}
              >
                <Send size={22} style={{ color: pageTheme.accent }} />
              </div>
              <h3 className="mb-1 text-base font-semibold" style={{ color: pageTheme.text }}>
                {search || statusFilter !== 'all' ? 'No matching rules' : 'No distribution rules yet'}
              </h3>
              <p className="mb-5 max-w-xs text-sm" style={{ color: pageTheme.textSecondary }}>
                {search
                  ? 'Try adjusting your search or filters.'
                  : 'Create a rule to automatically email or save your reports on a schedule.'}
              </p>
              {!search && statusFilter === 'all' && (
                <button
                  type="button"
                  onClick={() => openEditor(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{ background: pageTheme.accent, color: pageTheme.btnText }}
                >
                  <Plus size={14} /> Create first rule
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
                {filtered.map((rule) => (
                  <DistributionRuleCard
                    key={rule.id}
                    rule={rule}
                    catalogLabels={catalogLabels}
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
        </motion.div>
      </WaterSystemLayout>

      {createPortal(
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]"
                onClick={closeEditor}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-y-0 right-0 z-[101] flex h-screen min-h-0 w-full flex-col bg-white shadow-2xl dark:bg-gray-900 sm:w-[560px]"
              >
                <DistributionRuleEditor
                  rule={editingRule}
                  catalog={catalog}
                  onSave={handleSave}
                  onCancel={closeEditor}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

export default Distribution
