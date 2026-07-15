import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { ChartComponent } from '../../components/water-system/ChartComponent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sparkles,
  Bot,
  BrainCircuit,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Target,
  TrendingUp,
  Activity,
  Radio,
  RefreshCw,
  Play,
  Pause,
  ShieldCheck,
  Gauge,
  FlaskConical,
  X,
} from 'lucide-react'

const AI = '/api/ai'

// ---- Types -----------------------------------------------------------------
interface ProviderStatus {
  provider: string
  model: string
  configured: boolean
}
interface Health {
  any_provider_configured: boolean
  ml_model_ready: boolean
  providers: ProviderStatus[]
}
interface Overall {
  count: number
  accuracy_score: number
  on_target: number
  over: number
  under: number
  on_target_pct: number
  over_pct: number
  under_pct: number
  flagged: number
}
interface ProductRow {
  product_name: string
  accuracy_score: number
  count: number
}
interface Insights {
  summary: string
  provider: string | null
  cached: boolean
  insights: {
    meta: { row_count: number; batch_count: number; product_count: number }
    overall: Overall
    worst_materials: any[]
    product_summary: ProductRow[]
  }
}
interface ChartSpec {
  type: 'bar' | 'line'
  title?: string
  labels: string[]
  values: number[]
  unit?: string
}
interface ChatMsg {
  role: 'user' | 'ai'
  text: string
  chart?: ChartSpec | null
  provider?: string | null
  cached?: boolean
}
interface MLInfo {
  metrics: { accuracy: number; roc_auc: number | null }
  n_total: number
  n_train: number
  n_test: number
  positive_rate: number
  options: {
    materials: { material_code: string; material_name: string }[]
    products: string[]
  }
}
interface Prediction {
  risk_pct: number
  band: string
  prediction: string
  inputs: { material_name: string; product_name: string; setpoint: number }
}
interface SeverityPrediction {
  severity: string
  severity_label: string
  confidence_pct: number
  probabilities: Record<string, number>
  inputs: { material_name: string; product_name: string; setpoint: number }
}

// ---- Live-monitor types ----------------------------------------------------
interface LiveFeedItem {
  id: string
  seq: number
  batch_name: string
  order_id?: string
  material_name: string
  material_code: string
  product_name: string
  setpoint: number
  quantity?: number | null
  risk_pct: number
  band: 'High' | 'Medium' | 'Low'
  flagged: boolean
  prediction: string
  actual_status: string
  actual_pct: number | null
  correct: boolean
  severity?: string | null
  severity_label?: string | null
  recommendation: string
  model_version: number
  at: string
}
interface LiveDrift {
  status: 'warming' | 'healthy' | 'watch' | 'drift'
  novel_rate: number | null
  setpoint_psi: number | null
  new_recipes: string[]
  checked_at: string | null
}
interface LiveModel {
  version: number
  trained_at: string
  trained_on: number
  accuracy: number | null
}
interface LiveStats {
  processed: number
  flagged: number
  on_target: number
  over: number
  under: number
  correct: number
  rolling_accuracy: number | null
}
interface LiveNotif {
  id: string
  kind: 'drift' | 'retrain'
  title: string
  message: string
  at: string
}
interface LiveState {
  source: string
  running: boolean
  speed: number
  retraining: boolean
  cursor: number
  total: number
  model: LiveModel
  stats: LiveStats
  drift: LiveDrift
  feed: LiveFeedItem[]
  notifications: LiveNotif[]
}

// ---- Helpers ---------------------------------------------------------------
// Charts use the app's cyan accent so they read as native Hercules charts.
const ACCENT = '#22d3ee'
// Native input/select styling copied from the existing pages so form controls match.
const FIELD =
  'bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700'

function specToChartData(spec: ChartSpec) {
  return {
    labels: spec.labels,
    datasets: [
      {
        label: spec.unit || 'Value',
        data: spec.values,
        backgroundColor: 'rgba(34, 211, 238, 0.45)',
        borderColor: ACCENT,
        borderWidth: 2,
        tension: 0.3,
      },
    ],
  }
}

function bandColor(band: string) {
  if (band === 'High') return 'text-red-400 bg-red-500/15 border-red-500/40'
  if (band === 'Medium') return 'text-amber-400 bg-amber-500/15 border-amber-500/40'
  return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40'
}

const SEVERITY_META: Record<string, { label: string; text: string; bar: string; border: string }> = {
  on_target: { label: 'On target', text: 'text-emerald-400', bar: 'bg-emerald-500', border: 'border-emerald-500/40' },
  watch: { label: 'Watch', text: 'text-amber-400', bar: 'bg-amber-500', border: 'border-amber-500/40' },
  severe: { label: 'Severe', text: 'text-red-400', bar: 'bg-red-500', border: 'border-red-500/40' },
}
function severityMeta(cls: string) {
  return SEVERITY_META[cls] || { label: cls, text: 'text-slate-400', bar: 'bg-slate-500', border: 'border-slate-500/40' }
}

const SUGGESTED = [
  'Which ingredients are most over-dosed, and by how much?',
  'What are the 3 worst batches for dosing accuracy?',
  'Compare dosing accuracy across products.',
  'Why are micro-ingredients less accurate?',
]

// ---- Native building blocks (match the existing Hercules pages) -------------

/** Card panel — identical styling to the Fakieh Dashboard's cards. */
function Panel({
  title,
  icon,
  right,
  className = '',
  children,
}: {
  title?: string
  icon?: React.ReactNode
  right?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 ' +
        'rounded-lg p-6 shadow-lg light:shadow-xl ' +
        className
      }
    >
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon && <span className="text-cyan-400 light:text-cyan-600">{icon}</span>}
            <h3 className="text-lg font-semibold text-white light:text-gray-900">{title}</h3>
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

const STAT_COLORS: Record<string, { text: string; dot: string; chip: string; glow: string }> = {
  green: { text: 'text-green-400', dot: 'bg-green-400', chip: 'from-green-500 to-green-600', glow: 'from-green-500/20 via-transparent to-green-500/20' },
  blue: { text: 'text-blue-400', dot: 'bg-blue-400', chip: 'from-blue-500 to-blue-600', glow: 'from-blue-500/20 via-transparent to-blue-500/20' },
  cyan: { text: 'text-cyan-400', dot: 'bg-cyan-400', chip: 'from-cyan-500 to-cyan-600', glow: 'from-cyan-500/20 via-transparent to-cyan-500/20' },
  orange: { text: 'text-orange-400', dot: 'bg-orange-400', chip: 'from-orange-500 to-orange-600', glow: 'from-orange-500/20 via-transparent to-orange-500/20' },
  red: { text: 'text-red-400', dot: 'bg-red-400', chip: 'from-red-500 to-red-600', glow: 'from-red-500/20 via-transparent to-red-500/20' },
}

/** KPI stat card — identical to the Fakieh Dashboard's KPI cards. */
function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  pulse = true,
}: {
  label: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  color: keyof typeof STAT_COLORS
  pulse?: boolean
}) {
  const c = STAT_COLORS[color]
  return (
    <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
      <div className={`absolute inset-0 bg-gradient-to-r ${c.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400 light:text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-white light:text-gray-900">{value}</p>
            {subtitle && (
              <p className={`text-xs ${c.text} flex items-center`}>
                <span className={`w-2 h-2 ${c.dot} rounded-full mr-2 ${pulse ? 'animate-pulse' : ''}`}></span>
                {subtitle}
              </p>
            )}
          </div>
          <div className={`w-12 h-12 bg-gradient-to-br ${c.chip} rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Compact secondary metric tile (for dense model rows). */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 light:border-gray-200 bg-slate-900/40 light:bg-gray-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400 light:text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white light:text-gray-900">{value}</div>
    </div>
  )
}

// ---- Live-monitor building blocks ------------------------------------------
const DRIFT_META: Record<string, { label: string; text: string; dot: string; ring: string }> = {
  warming: { label: 'Warming up', text: 'text-slate-300 light:text-gray-600', dot: 'bg-slate-400', ring: 'border-slate-600/50 light:border-gray-300' },
  healthy: { label: 'In distribution', text: 'text-emerald-400', dot: 'bg-emerald-400', ring: 'border-emerald-500/40' },
  watch: { label: 'Watch', text: 'text-amber-400', dot: 'bg-amber-400', ring: 'border-amber-500/40' },
  drift: { label: 'Drift detected', text: 'text-red-400', dot: 'bg-red-400', ring: 'border-red-500/40' },
}

function outcomeTag(f: LiveFeedItem): { t: string; c: string } {
  if (f.actual_status === 'on_target') return { t: 'on target', c: 'text-emerald-400' }
  if (f.actual_status === 'over') return { t: `over +${f.actual_pct}%`, c: 'text-red-400' }
  if (f.actual_status === 'under') return { t: `under ${f.actual_pct}%`, c: 'text-red-400' }
  return { t: '—', c: 'text-slate-500' }
}

/** One scored batch in the live operator feed. Flagged doses show the full
 *  operator guidance inline (before the batch runs). */
function FeedRow({ f }: { f: LiveFeedItem }) {
  const dot = f.band === 'High' ? 'bg-red-500' : f.band === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'
  const wrap = f.flagged
    ? f.band === 'High'
      ? 'border-red-500/40 bg-red-500/5 light:bg-red-50'
      : 'border-amber-500/40 bg-amber-500/5 light:bg-amber-50'
    : 'border-slate-700/50 light:border-gray-200 bg-slate-900/40 light:bg-gray-50'
  const out = outcomeTag(f)
  return (
    <div className={`animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg border px-3 py-2 ${wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`}></span>
          <div className="min-w-0">
            <div className="truncate text-sm text-slate-200 light:text-gray-800">
              {f.material_name} <span className="text-slate-500 light:text-gray-400">· {f.setpoint} kg</span>
            </div>
            <div className="truncate text-xs text-slate-500 light:text-gray-500">
              {f.product_name} · batch {f.batch_name}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${bandColor(f.band)}`}>{f.risk_pct}%</span>
          <div className={`mt-0.5 text-[10px] uppercase tracking-wide ${out.c}`}>{out.t}</div>
        </div>
      </div>
      {f.flagged && (
        <div className="mt-2 flex items-start gap-2 border-t border-slate-700/40 light:border-gray-200 pt-2 text-xs text-slate-300 light:text-gray-600">
          <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${f.band === 'High' ? 'text-red-400' : 'text-amber-400'}`} />
          <span>
            {f.recommendation}
            {f.severity_label && (
              <>
                {' '}· <span className={severityMeta(f.severity || '').text}>Severity: {f.severity_label}</span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

// ---- Component -------------------------------------------------------------
export function AiAssistant() {
  const [health, setHealth] = useState<Health | null>(null)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [mlInfo, setMlInfo] = useState<MLInfo | null>(null)
  const [material, setMaterial] = useState('')
  const [product, setProduct] = useState('')
  const [setpoint, setSetpoint] = useState('0.9')
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [predicting, setPredicting] = useState(false)
  const [severityPrediction, setSeverityPrediction] = useState<SeverityPrediction | null>(null)
  const [whatIfOpen, setWhatIfOpen] = useState(false)

  // Live monitor
  const [live, setLive] = useState<LiveState | null>(null)
  const [toasts, setToasts] = useState<LiveNotif[]>([])
  const seenNotif = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)

  // Initial loads
  useEffect(() => {
    axios.get<Health>(`${AI}/health`).then((r) => setHealth(r.data)).catch(() => {})

    setInsightsLoading(true)
    axios
      .get<Insights>(`${AI}/insights`)
      .then((r) => setInsights(r.data))
      .catch(() => {})
      .finally(() => setInsightsLoading(false))

    axios
      .get<MLInfo>(`${AI}/ml/info`)
      .then((r) => {
        setMlInfo(r.data)
        const cu = r.data.options.materials.find((m) =>
          m.material_name.toLowerCase().includes('copper proteinate')
        )
        setMaterial(cu ? cu.material_code : r.data.options.materials[0]?.material_code || '')
        setProduct(r.data.options.products[0] || '')
      })
      .catch(() => {})
  }, [])

  // Poll the live monitor (drives the feed, KPIs, charts, and drift/retrain popups).
  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const { data } = await axios.get<LiveState>(`${AI}/live/state`)
        if (!alive) return
        setLive(data)
        if (firstLoad.current) {
          // Don't replay pre-existing notifications as popups on first open.
          data.notifications.forEach((n) => seenNotif.current.add(n.id))
          firstLoad.current = false
        } else {
          const fresh = data.notifications.filter((n) => !seenNotif.current.has(n.id))
          if (fresh.length) {
            fresh.forEach((n) => seenNotif.current.add(n.id))
            setToasts((t) => [...fresh, ...t].slice(0, 4))
            fresh.forEach((n) =>
              setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 9000)
            )
          }
        }
      } catch {
        /* backend momentarily unreachable — keep last state */
      }
    }
    poll()
    const id = setInterval(poll, 1200)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  async function handleAsk(q?: string) {
    const text = (q ?? question).trim()
    if (!text || asking) return
    setMessages((m) => [...m, { role: 'user', text }])
    setQuestion('')
    setAsking(true)
    try {
      const { data } = await axios.post(`${AI}/ask`, { question: text })
      setMessages((m) => [
        ...m,
        {
          role: 'ai',
          text: data.answer,
          chart: data.chart,
          provider: data.provider,
          cached: data.cached,
        },
      ])
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'ai', text: 'Sorry — the AI service is unreachable. Is the backend running?' },
      ])
    } finally {
      setAsking(false)
    }
  }

  async function handlePredict() {
    if (!material || !product || predicting) return
    setPredicting(true)
    const payload = {
      material_code: material,
      product_name: product,
      setpoint: parseFloat(setpoint) || 0,
    }
    const [riskResult, severityResult] = await Promise.allSettled([
      axios.post(`${AI}/ml/predict`, payload),
      axios.post(`${AI}/ml/severity/predict`, payload),
    ])
    setPrediction(riskResult.status === 'fulfilled' ? riskResult.value.data : null)
    setSeverityPrediction(severityResult.status === 'fulfilled' ? severityResult.value.data : null)
    setPredicting(false)
  }

  async function control(action: string, value?: number) {
    try {
      const { data } = await axios.post<LiveState>(`${AI}/live/control`, { action, value })
      setLive(data)
      if (action === 'reset') {
        setToasts([])
      }
    } catch {
      /* ignore */
    }
  }

  // ---- Derived chart data (Tab 1) ------------------------------------------
  const overall = insights?.insights.overall
  const distData = overall
    ? {
        labels: ['On target', 'Over-dosed', 'Under-dosed'],
        datasets: [
          {
            data: [overall.on_target, overall.over, overall.under],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderColor: '#0f172a',
            borderWidth: 2,
          },
        ],
      }
    : null

  const worstProducts = (insights?.insights.product_summary || []).slice(0, 8)
  const productData = worstProducts.length
    ? {
        labels: worstProducts.map((p) => p.product_name),
        datasets: [
          {
            label: 'Accuracy %',
            data: worstProducts.map((p) => p.accuracy_score),
            backgroundColor: 'rgba(34, 211, 238, 0.45)',
            borderColor: ACCENT,
            borderWidth: 2,
          },
        ],
      }
    : null

  const liveProvider = health?.providers.find((p) => p.configured)

  // ---- Derived data (Tab 2 — live monitor) ---------------------------------
  const st = live?.stats
  const dr = live?.drift
  const md = live?.model
  const driftMeta = DRIFT_META[dr?.status || 'warming']
  const onTargetRate = st && st.processed ? Math.round((st.on_target / st.processed) * 100) : 0

  // Rolling risk trend across the most recent batches (oldest -> newest).
  const recent = live ? [...live.feed].slice(0, 18).reverse() : []
  const riskTrend = recent.length
    ? {
        labels: recent.map((f) => `#${f.seq}`),
        datasets: [
          {
            label: 'Risk %',
            data: recent.map((f) => f.risk_pct),
            backgroundColor: recent.map((f) =>
              f.band === 'High'
                ? 'rgba(239,68,68,0.7)'
                : f.band === 'Medium'
                  ? 'rgba(245,158,11,0.7)'
                  : 'rgba(34,211,238,0.5)'
            ),
            borderColor: ACCENT,
            borderWidth: 1,
          },
        ],
      }
    : null

  const outcomeMix = st
    ? {
        labels: ['On target', 'Over-dosed', 'Under-dosed'],
        datasets: [
          {
            data: [st.on_target, st.over, st.under],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderColor: '#0f172a',
            borderWidth: 2,
          },
        ],
      }
    : null

  const speedPresets: { label: string; value: number }[] = [
    { label: 'Slow', value: 2.0 },
    { label: 'Normal', value: 1.1 },
    { label: 'Fast', value: 0.4 },
  ]

  return (
    <WaterSystemLayout
      title="Hercules AI"
      subtitle="Generative insights and an automatic live dosing-quality monitor over the Fakieh plant data"
    >
      {/* Drift / retrain popups (native card styling, auto-dismiss) */}
      <div className="pointer-events-none fixed right-4 top-24 z-50 flex w-[380px] max-w-[92vw] flex-col gap-2">
        {toasts.map((n) => (
          <div
            key={n.id}
            className={
              'pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-300 rounded-lg border p-4 shadow-2xl backdrop-blur ' +
              (n.kind === 'drift'
                ? 'border-amber-500/50 bg-amber-950/85 light:bg-amber-50 light:border-amber-300'
                : 'border-cyan-500/50 bg-cyan-950/85 light:bg-cyan-50 light:border-cyan-300')
            }
          >
            <div className="flex items-start gap-3">
              <span className={n.kind === 'drift' ? 'text-amber-400' : 'text-cyan-400 light:text-cyan-600'}>
                {n.kind === 'drift' ? <AlertTriangle className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white light:text-gray-900">{n.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-300 light:text-gray-600">{n.message}</div>
              </div>
              <button
                onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}
                className="text-slate-500 transition hover:text-slate-300 light:hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {/* Status row — matches the Orders page live-status indicators */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center text-slate-300 light:text-gray-700">
            <span
              className={`mr-2 h-2 w-2 rounded-full ${
                liveProvider ? 'animate-pulse bg-green-400' : 'bg-slate-500'
              }`}
            ></span>
            {liveProvider ? `AI live · ${liveProvider.provider} (${liveProvider.model})` : 'AI offline · cached answers'}
          </span>
          <span className="flex items-center text-slate-300 light:text-gray-700">
            <span
              className={`mr-2 h-2 w-2 rounded-full ${
                health?.ml_model_ready ? 'animate-pulse bg-green-400' : 'bg-red-400'
              }`}
            ></span>
            ML models {health?.ml_model_ready ? 'ready' : 'not trained'}
          </span>
          {insights && (
            <span className="text-slate-400 light:text-gray-500">
              {insights.insights.meta.row_count.toLocaleString()} doses ·{' '}
              {insights.insights.meta.batch_count} batches · {insights.insights.meta.product_count} products
            </span>
          )}
        </div>

        <Tabs defaultValue="assistant" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="assistant">
              <Bot className="mr-2 h-4 w-4" /> AI Assistant
            </TabsTrigger>
            <TabsTrigger value="predict">
              <Activity className="mr-2 h-4 w-4" /> Live Monitoring
            </TabsTrigger>
          </TabsList>

          {/* ================= USE CASE 1 — Generative ================= */}
          <TabsContent value="assistant" className="space-y-6">
            {overall && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Accuracy score" value={`${overall.accuracy_score}%`} subtitle="overall dosing accuracy" icon={<Target className="h-6 w-6 text-white" />} color="blue" />
                <StatCard label="On target" value={`${overall.on_target_pct}%`} subtitle={`${overall.on_target} doses`} icon={<CheckCircle2 className="h-6 w-6 text-white" />} color="green" />
                <StatCard label="Over-dosed" value={`${overall.over}`} subtitle="doses above tolerance" icon={<TrendingUp className="h-6 w-6 text-white" />} color="orange" />
                <StatCard label="Flagged doses" value={`${overall.flagged}`} subtitle="need review" icon={<AlertTriangle className="h-6 w-6 text-white" />} color="red" />
              </div>
            )}

            <Panel title="AI Dosing-Accuracy Briefing" icon={<Sparkles className="h-5 w-5" />}>
              {insightsLoading ? (
                <div className="flex items-center gap-2 text-slate-400 light:text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating briefing…
                </div>
              ) : (
                <>
                  <p className="leading-relaxed text-slate-200 light:text-gray-700">{insights?.summary}</p>
                  {insights?.provider && (
                    <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-500 light:text-gray-400">
                      {insights.cached ? 'offline · cached' : `written by ${insights.provider}`}
                    </p>
                  )}
                </>
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {distData && <ChartComponent type="doughnut" data={distData} title="Dose outcomes" height={240} />}
              {productData && <ChartComponent type="bar" data={productData} title="Accuracy by product (lowest 8)" height={240} />}
            </div>

            <Panel title="Ask Hercules" icon={<Bot className="h-5 w-5" />}>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleAsk(s)}
                      disabled={asking}
                      className="rounded-full border border-slate-600/50 light:border-gray-300 bg-slate-900/40 light:bg-white px-3 py-1 text-xs text-slate-300 light:text-gray-700 transition hover:border-cyan-500/50 hover:text-cyan-300 light:hover:text-cyan-600 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-700/50 light:border-gray-200 bg-slate-900/40 light:bg-gray-50 p-4">
                  {messages.length === 0 && (
                    <p className="text-sm text-slate-500 light:text-gray-400">
                      Ask anything about the plant's dosing accuracy — over/under-dosing, worst batches,
                      product comparisons, or a live prediction (e.g. "will 0.9kg of Copper proteinate overdose?").
                    </p>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                      <div
                        className={
                          'inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm ' +
                          (m.role === 'user'
                            ? 'bg-cyan-600/20 text-cyan-100 light:bg-cyan-100 light:text-cyan-900'
                            : 'border border-slate-700/50 light:border-gray-200 bg-slate-800 light:bg-white text-slate-100 light:text-gray-900')
                        }
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                        {m.chart && m.chart.labels?.length > 0 && (
                          <div className="mt-3 w-[min(520px,70vw)]">
                            <ChartComponent
                              type={m.chart.type === 'line' ? 'line' : 'bar'}
                              data={specToChartData(m.chart)}
                              title={m.chart.title || 'Chart'}
                              height={200}
                            />
                          </div>
                        )}
                        {m.role === 'ai' && m.provider && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 light:text-gray-400">
                            {m.cached
                              ? 'offline · cached'
                              : m.provider === 'ml-model'
                                ? 'via trained ML model (live prediction)'
                                : `via ${m.provider}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {asking && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 light:text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Hercules AI is thinking…
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder="Ask about dosing accuracy…"
                    className={FIELD}
                  />
                  <Button onClick={() => handleAsk()} disabled={asking || !question.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Panel>
          </TabsContent>

          {/* ================= USE CASE 2 — Automatic live monitoring ================= */}
          <TabsContent value="predict" className="space-y-6">
            {/* Live control / status bar */}
            <div className="flex flex-col gap-3 rounded-lg border border-slate-700/50 light:border-gray-200 bg-slate-800/50 light:bg-white p-4 shadow-lg light:shadow-xl md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="flex items-center gap-2 text-slate-300 light:text-gray-700">
                  <Radio className={`h-4 w-4 ${live?.running ? 'text-green-400' : 'text-slate-500'}`} />
                  <span className={`h-2 w-2 rounded-full ${live?.running ? 'animate-pulse bg-green-400' : 'bg-slate-500'}`}></span>
                  {live?.running ? 'Live · scoring every batch' : 'Paused'}
                </span>
                <span className="hidden text-slate-500 light:text-gray-400 sm:inline">{live?.source}</span>
                <span className={`flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs ${driftMeta.ring} ${driftMeta.text}`}>
                  <span className={`h-2 w-2 rounded-full ${driftMeta.dot} ${dr?.status === 'drift' ? 'animate-pulse' : ''}`}></span>
                  {live?.retraining ? 'Retraining…' : driftMeta.label}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400 light:text-gray-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-400 light:text-cyan-600" /> Model v{md?.version ?? 1}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="mr-1 flex items-center overflow-hidden rounded-md border border-slate-700 light:border-gray-300">
                  {speedPresets.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => control('speed', s.value)}
                      className={`px-2.5 py-1 text-xs transition ${
                        Math.abs((live?.speed ?? 1.1) - s.value) < 0.05
                          ? 'bg-cyan-600 text-white'
                          : 'text-slate-400 light:text-gray-500 hover:text-slate-200 light:hover:text-gray-800'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => control(live?.running ? 'pause' : 'start')}>
                  {live?.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => control('reset')}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Restart
                </Button>
              </div>
            </div>

            {/* Live KPI row */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Batches monitored"
                value={`${st?.processed ?? 0}`}
                subtitle={live ? `${live.cursor} of ${live.total} streamed` : 'starting…'}
                icon={<Activity className="h-6 w-6 text-white" />}
                color="blue"
              />
              <StatCard
                label="Flagged for review"
                value={`${st?.flagged ?? 0}`}
                subtitle="risky doses caught pre-batch"
                icon={<AlertTriangle className="h-6 w-6 text-white" />}
                color="red"
              />
              <StatCard
                label="On-target rate"
                value={`${onTargetRate}%`}
                subtitle="live production quality"
                icon={<CheckCircle2 className="h-6 w-6 text-white" />}
                color="green"
              />
              <StatCard
                label="Model accuracy (live)"
                value={st?.rolling_accuracy != null ? `${st.rolling_accuracy}%` : '—'}
                subtitle="predictions vs actual outcome"
                icon={<Gauge className="h-6 w-6 text-white" />}
                color="cyan"
              />
            </div>

            {/* Feed + model/drift health */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Panel
                title="Live operator feed"
                icon={<Radio className="h-5 w-5" />}
                className="lg:col-span-2"
                right={
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 light:text-gray-500">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-green-400"></span> streaming
                  </span>
                }
              >
                <p className="mb-3 text-xs leading-relaxed text-slate-400 light:text-gray-500">
                  Every batch is scored the moment it arrives from the plant — <b>before it runs</b>. Risky
                  doses are flagged with the recommended action so the operator can act in time. No manual entry.
                </p>
                <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                  {(!live || live.feed.length === 0) && (
                    <div className="flex items-center gap-2 py-6 text-sm text-slate-500 light:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the first batch…
                    </div>
                  )}
                  {live?.feed.map((f) => (
                    <FeedRow key={f.id} f={f} />
                  ))}
                </div>
              </Panel>

              <Panel title="Model &amp; drift health" icon={<ShieldCheck className="h-5 w-5" />}>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="uppercase tracking-wide text-slate-400 light:text-gray-500">
                        Out-of-distribution rate
                      </span>
                      <span className={driftMeta.text}>{dr?.novel_rate != null ? `${dr.novel_rate}%` : '—'}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800 light:bg-gray-200">
                      <div
                        className={`h-full transition-all duration-500 ${
                          dr?.status === 'drift' ? 'bg-red-500' : dr?.status === 'watch' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(dr?.novel_rate ?? 0, 100)}%` }}
                      ></div>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 light:text-gray-500">
                      Share of recent batches whose product recipe the model was barely trained on. Above 25%
                      triggers an automatic retrain.
                    </p>
                  </div>

                  {dr?.new_recipes && dr.new_recipes.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 light:bg-amber-50 p-2.5">
                      <div className="text-[11px] uppercase tracking-wide text-amber-400">New recipes in feed</div>
                      <div className="mt-1 text-xs text-slate-300 light:text-gray-700">
                        {dr.new_recipes.slice(0, 4).join(', ')}
                        {dr.new_recipes.length > 4 ? '…' : ''}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Model version" value={`v${md?.version ?? 1}`} />
                    <MiniStat label="Trained on" value={`${md?.trained_on ?? 0}`} />
                    <MiniStat
                      label="Model accuracy"
                      value={md?.accuracy != null ? `${(md.accuracy * 100).toFixed(0)}%` : '—'}
                    />
                    <MiniStat label="Setpoint PSI" value={dr?.setpoint_psi != null ? `${dr.setpoint_psi}` : '—'} />
                  </div>

                  <div className="rounded-lg border border-slate-700/50 light:border-gray-200 bg-slate-900/40 light:bg-gray-50 p-3 text-[11px] leading-relaxed text-slate-400 light:text-gray-600">
                    The monitor watches the incoming batch mix against the model's training data. When the plant
                    switches to recipes the model hasn't seen, it retrains itself on the latest data and hot-swaps
                    the new model in — <b>with zero downtime</b>. The operator only sees a confirmation popup.
                  </div>
                </div>
              </Panel>
            </div>

            {/* Live charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {riskTrend && (
                <ChartComponent type="bar" data={riskTrend} title="Predicted risk — most recent batches" height={240} />
              )}
              {outcomeMix && (
                <ChartComponent type="doughnut" data={outcomeMix} title="Live dose outcomes (this session)" height={240} />
              )}
            </div>

            {/* Engineer what-if (hidden by default) */}
            <Panel
              title="Engineer what-if"
              icon={<FlaskConical className="h-5 w-5" />}
              right={
                <Button variant="outline" size="sm" onClick={() => setWhatIfOpen((v) => !v)}>
                  {whatIfOpen ? 'Hide' : 'Open'}
                </Button>
              }
            >
              {!whatIfOpen ? (
                <p className="text-sm text-slate-400 light:text-gray-500">
                  Operators don't use this — the plant feed is scored automatically above. This is a manual
                  sandbox for engineers/commissioning to test a hypothetical dose against both trained models.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400 light:text-gray-500">Ingredient</label>
                      <Select value={material} onValueChange={setMaterial}>
                        <SelectTrigger className={FIELD}>
                          <SelectValue placeholder="Select ingredient" />
                        </SelectTrigger>
                        <SelectContent className={`max-h-72 ${FIELD}`}>
                          {mlInfo?.options.materials.map((m) => (
                            <SelectItem key={m.material_code} value={m.material_code}>
                              {m.material_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400 light:text-gray-500">Product recipe</label>
                      <Select value={product} onValueChange={setProduct}>
                        <SelectTrigger className={FIELD}>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent className={`max-h-72 ${FIELD}`}>
                          {mlInfo?.options.products.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400 light:text-gray-500">Target weight (kg)</label>
                      <Input type="number" step="0.1" value={setpoint} onChange={(e) => setSetpoint(e.target.value)} className={FIELD} />
                    </div>
                    <Button onClick={handlePredict} disabled={predicting} className="w-full">
                      {predicting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Predict dosing risk'}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {prediction && (
                      <div className={`rounded-lg border p-4 text-center ${bandColor(prediction.band)}`}>
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 light:text-gray-500">Risk model</div>
                        <div className="text-4xl font-bold">{prediction.risk_pct}%</div>
                        <div className="mt-1 text-sm font-medium">
                          {prediction.band} risk · {prediction.prediction}
                        </div>
                        <div className="mt-2 text-xs text-slate-400 light:text-gray-500">
                          {prediction.inputs.material_name} · {prediction.inputs.setpoint} kg · {prediction.inputs.product_name}
                        </div>
                      </div>
                    )}
                    {severityPrediction && (
                      <div className={`rounded-lg border p-4 ${severityMeta(severityPrediction.severity).border} bg-slate-900/40 light:bg-gray-50`}>
                        <div className="text-center">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400 light:text-gray-500">Severity triage model</div>
                          <div className={`text-2xl font-bold ${severityMeta(severityPrediction.severity).text}`}>
                            {severityPrediction.severity_label}
                          </div>
                          <div className="mt-1 text-xs text-slate-400 light:text-gray-500">
                            {severityPrediction.confidence_pct}% confidence
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          {Object.entries(severityPrediction.probabilities).map(([cls, pct]) => {
                            const meta = severityMeta(cls)
                            return (
                              <div key={cls} className="flex items-center gap-2">
                                <span className={`w-14 shrink-0 text-[11px] ${meta.text}`}>{meta.label}</span>
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800 light:bg-gray-200">
                                  <div className={`h-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-10 shrink-0 text-right text-[11px] text-slate-400 light:text-gray-500">{pct}%</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {!prediction && !severityPrediction && (
                      <p className="text-sm text-slate-500 light:text-gray-400">
                        Pick an ingredient, recipe and target weight, then run both models.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </WaterSystemLayout>
  )
}

export default AiAssistant
