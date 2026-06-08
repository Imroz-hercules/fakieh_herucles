import { useState, useEffect, useMemo, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, Send } from 'lucide-react'
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'
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

export function Distribution() {
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
          r.recipients?.some((e) => e.toLowerCase().includes(q)),
      )
    }
    return list
  }, [rules, statusFilter, search])

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
    <WaterSystemLayout title="Report Distribution" subtitle="Schedule automatic report emails and disk exports">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-slate-400 light:text-gray-600">Total <b className="text-cyan-400">{stats.total}</b></span>
            <span className="text-slate-400 light:text-gray-600">Active <b className="text-emerald-400">{stats.active}</b></span>
            <span className="text-slate-400 light:text-gray-600">Paused <b className="text-slate-300">{stats.paused}</b></span>
          </div>
          <button type="button" onClick={() => openEditor(null)}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-cyan-700">
            <Plus className="h-4 w-4" /> New rule
          </button>
        </div>

        {/* Search + filter */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules or recipients..."
              className="w-full rounded-lg border border-slate-700 light:border-gray-300 bg-slate-800/50 light:bg-white py-2.5 pl-10 pr-4 text-sm text-white light:text-gray-900 focus:border-cyan-500 focus:outline-none" />
          </div>
          <div className="flex items-center rounded-lg border border-slate-700 light:border-gray-300 bg-slate-800/50 light:bg-white p-1">
            {FILTER_TABS.map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`rounded-md px-4 py-1.5 text-xs font-bold capitalize transition-colors ${
                  statusFilter === s ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-400 light:text-gray-500'
                }`}>{s}</button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-slate-700 light:border-gray-200 bg-slate-800/30 light:bg-gray-50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 light:border-gray-200 bg-slate-800/30 light:bg-white py-24 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-600/15">
              <Send className="h-6 w-6 text-cyan-400" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-white light:text-gray-900">
              {search || statusFilter !== 'all' ? 'No matching rules' : 'No distribution rules yet'}
            </h3>
            <p className="mb-5 max-w-xs text-xs text-slate-400 light:text-gray-600">
              Create a rule to automatically email or save your reports on a schedule.
            </p>
            {!search && statusFilter === 'all' && (
              <button type="button" onClick={() => openEditor(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-700">
                <Plus className="h-4 w-4" /> Create first rule
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((rule) => (
              <DistributionRuleCard key={rule.id} rule={rule} catalogLabels={catalogLabels}
                onToggle={handleToggle} onEdit={openEditor} onDelete={handleDelete}
                onRunNow={handleRunNow} running={runningId === rule.id} />
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={closeEditor} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col shadow-2xl sm:w-[560px]">
              <DistributionRuleEditor rule={editingRule} catalog={catalog} onSave={handleSave} onCancel={closeEditor} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </WaterSystemLayout>
  )
}

export default Distribution
