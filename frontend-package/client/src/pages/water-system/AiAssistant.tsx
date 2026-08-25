import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { usePolling } from '../../hooks/usePolling'
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
  Bot,
  Send,
  Loader2,
  AlertTriangle,
  Activity,
  Radio,
  RefreshCw,
  Play,
  Pause,
  ShieldCheck,
  FlaskConical,
  X,
} from 'lucide-react'
import './AiAssistant.css'

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
interface MaterialInsight {
  material_name: string
  material_code?: string
  count: number
  mean_abs_dev_pct: number
  mean_dev_pct: number
  over: number
  under: number
  on_target: number
}
interface BatchInsight {
  batch_name: string
  product_name: string
  accuracy_score: number
  count: number
  date?: string
}
interface Insights {
  summary: string
  provider: string | null
  cached: boolean
  insights: {
    meta: { row_count: number; batch_count: number; product_count: number }
    overall: Overall
    worst_materials: MaterialInsight[]
    top_overdosed?: MaterialInsight[]
    top_underdosed?: MaterialInsight[]
    worst_batches?: BatchInsight[]
    product_summary: ProductRow[]
  }
}
interface ChartSpec {
  type: 'bar' | 'line' | 'doughnut'
  title?: string
  labels: string[]
  values: number[]
  unit?: string
  center_label?: string
  center_sub?: string
}
interface TokenUsage {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
}
interface ChatMsg {
  role: 'user' | 'ai'
  text: string
  chart?: ChartSpec | null
  provider?: string | null
  cached?: boolean
  usage?: TokenUsage | null
  mlPrediction?: {
    risk: { risk_pct: number; band: string; prediction: string }
    severity: {
      severity: string
      severity_label: string
      confidence_pct: number
      probabilities?: Record<string, number>
    }
  } | null
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
const FIELD = 'herc-field'

function specToChartData(spec: ChartSpec) {
  const isDoughnut = spec.type === 'doughnut'
  if (isDoughnut) {
    const palette = ['rgba(16,185,129,0.75)', 'rgba(245,158,11,0.75)', 'rgba(244,63,94,0.75)', 'rgba(34,211,238,0.65)']
    const rims = ['#34d399', '#fbbf24', '#fb7185', '#67e8f9']
    return {
      labels: spec.labels,
      datasets: [
        {
          data: spec.values,
          backgroundColor: spec.labels.map((_, i) => palette[i % palette.length]),
          borderColor: spec.labels.map((_, i) => rims[i % rims.length]),
          borderWidth: 2,
        },
      ],
    }
  }
  // Color bars by magnitude for ranking charts
  const max = Math.max(...spec.values, 1)
  return {
    labels: spec.labels,
    datasets: [
      {
        label: spec.unit || 'Value',
        data: spec.values,
        backgroundColor: spec.values.map((v) => {
          const t = v / max
          if (t >= 0.66) return 'rgba(244,63,94,0.7)'
          if (t >= 0.33) return 'rgba(245,158,11,0.7)'
          return 'rgba(34,211,238,0.55)'
        }),
        borderColor: spec.values.map((v) => {
          const t = v / max
          if (t >= 0.66) return '#fb7185'
          if (t >= 0.33) return '#fbbf24'
          return '#67e8f9'
        }),
        borderWidth: 1.5,
        tension: 0.3,
      },
    ],
  }
}

/** Short caption under chart — first sentence, capped. */
function chartCaption(text: string) {
  const t = (text || '').trim()
  if (!t) return ''
  const first = t.split(/(?<=[.!?])\s+/)[0] || t
  return first.length > 120 ? `${first.slice(0, 117)}…` : first
}

function bandPill(band: string) {
  if (band === 'High') return 'pill rose'
  if (band === 'Medium') return 'pill amber'
  return 'pill green'
}

const SEVERITY_META: Record<string, { label: string; text: string; bar: string; pill: string }> = {
  on_target: { label: 'On target', text: 'tone-green', bar: 'bar-green', pill: 'pill green' },
  watch: { label: 'Watch', text: 'tone-amber', bar: 'bar-amber', pill: 'pill amber' },
  severe: { label: 'Severe', text: 'tone-rose', bar: 'bar-rose', pill: 'pill rose' },
}
function severityMeta(cls: string) {
  return SEVERITY_META[cls] || { label: cls, text: 'herc-faint', bar: 'bar-slate', pill: 'pill slate' }
}

const SUGGESTED = [
  'Which ingredients are most over-dosed, and by how much?',
  'What are the 3 worst batches for dosing accuracy?',
  'Compare dosing accuracy across products.',
  'Why are micro-ingredients less accurate?',
]

// ---- Native building blocks (Hercules AI dark theme) -----------------------

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
    <div className={`erp-glow-card ${className}`}>
      {title && (
        <div className="card-head">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="tone-cyan shrink-0">{icon}</span>}
            <h3 className="herc-title truncate">{title}</h3>
          </div>
          {right}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  )
}

const TONE_HEX: Record<string, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  cyan: '#22d3ee',
  blue: '#60a5fa',
}

/** Map a 0–1 goodness score to green / amber / rose (spec thresholds). */
function gaugeTone(pct: number, highGood: boolean): 'green' | 'amber' | 'rose' {
  const v = Math.max(0, Math.min(100, pct)) / 100
  const goodness = highGood ? v : 1 - v
  if (goodness >= 0.66) return 'green'
  if (goodness >= 0.33) return 'amber'
  return 'rose'
}

/**
 * Semicircle glow gauge — big number + arc tip light (Pepsi KPI style).
 * `pct` drives the arc (0–100); `value` is the display string.
 */
function GaugeKpi({
  label,
  value,
  unit,
  pct,
  highGood = true,
  subtitle,
}: {
  label: string
  value: string
  unit?: string
  pct: number
  highGood?: boolean
  subtitle?: string
}) {
  const tone = gaugeTone(pct, highGood)
  const color = TONE_HEX[tone]
  const clamped = Math.max(0, Math.min(100, pct))
  // Upper semicircle (Pepsi-style): left → top → right.
  // In SVG (y↓), clockwise sweep=1 is the TOP arc.
  const angle = Math.PI * (1 - clamped / 100) // π @ 0% (left) → 0 @ 100% (right)
  const cx = 80
  const cy = 72
  const r = 56
  const tipX = cx + r * Math.cos(angle)
  const tipY = cy - r * Math.sin(angle)
  const arcLen = Math.PI * r
  const dash = (clamped / 100) * arcLen

  return (
    <div className="gauge-kpi">
      <p className="gauge-kpi-label">{label}</p>
      <div className="gauge-svg-wrap">
        <svg viewBox="0 0 160 100" width="100%" height="110" aria-hidden>
          {/* Track — TOP semicircle */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(148,163,184,0.22)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Glowing value arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${arcLen}`}
            style={{
              filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color}88)`,
              transition: 'stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
          {/* Tip glow dot */}
          <circle
            cx={tipX}
            cy={tipY}
            r="5.5"
            fill="#fff"
            style={{
              filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color})`,
            }}
          />
          <circle cx={tipX} cy={tipY} r="2.5" fill={color} />
        </svg>
        <div className="gauge-center">
          <div className={`hero-num lg tone-${tone}`}>{value}</div>
          {unit && <div className="gauge-unit">{unit}</div>}
        </div>
      </div>
      {subtitle && <div className="gauge-sub">{subtitle}</div>}
    </div>
  )
}

/** Risk / severity prediction pod with glowing vial fill + huge score. */
function PredictPod({
  label,
  score,
  scoreSuffix = '%',
  tone,
  detail,
  meta,
  fillPct,
}: {
  label: string
  score: string | number
  scoreSuffix?: string
  tone: 'green' | 'amber' | 'rose' | 'cyan'
  detail?: React.ReactNode
  meta?: string
  fillPct: number
}) {
  const h = Math.max(6, Math.min(100, fillPct))
  return (
    <div className="predict-pod">
      <div className="vial" aria-hidden>
        <div className={`vial-fill tone-${tone}`} style={{ height: `${h}%` }} />
      </div>
      <div className="predict-main">
        <p className="herc-eyebrow">{label}</p>
        <div className={`predict-score tone-${tone} mt-1`}>
          {score}
          {scoreSuffix}
        </div>
        {detail && <div className="mt-2">{detail}</div>}
        {meta && <div className="herc-feed-meta mt-2">{meta}</div>}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="herc-pod">
      <div className="pod-label">{label}</div>
      <div className="pod-value">{value}</div>
    </div>
  )
}

/**
 * Hero forecast bridge — one metric, Current → Predicted.
 * Big numbers, glowing vials, delta chip in the middle.
 */
function ForecastBridge({
  label,
  unit = '%',
  current,
  predicted,
  highGood,
  currentHint = 'current',
  predictedHint = 'forecast',
}: {
  label: string
  unit?: string
  current: number
  predicted: number
  /** true = higher is better (yield); false = lower is better (error) */
  highGood: boolean
  currentHint?: string
  predictedHint?: string
}) {
  const delta = predicted - current
  const improving = highGood ? delta > 0.05 : delta < -0.05
  const worsening = highGood ? delta < -0.05 : delta > 0.05
  const deltaTone = improving ? 'green' : worsening ? 'rose' : 'cyan'
  const curTone = gaugeTone(current, highGood)
  const predTone = gaugeTone(predicted, highGood)
  const deltaAbs = Math.abs(delta)
  const deltaSign = delta > 0.05 ? '+' : delta < -0.05 ? '−' : ''

  return (
    <div className="forecast-bridge">
      <div className="forecast-bridge-head">
        <p className="herc-eyebrow">{label}</p>
        <span className={`pill ${deltaTone}`}>
          {deltaAbs < 0.05 ? 'stable' : improving ? 'improving' : 'watch'}
        </span>
      </div>

      <div className="forecast-bridge-body">
        {/* Current */}
        <div className="forecast-side">
          <div className="vial forecast-vial" aria-hidden>
            <div
              className={`vial-fill tone-${curTone}`}
              style={{ height: `${Math.max(8, Math.min(100, highGood ? current : current))}%` }}
            />
          </div>
          <div className="forecast-nums">
            <span className="forecast-tag">Current</span>
            <div className={`forecast-hero tone-${curTone}`}>
              {current.toFixed(1)}
              <span className="forecast-unit">{unit}</span>
            </div>
            <span className="forecast-hint">{currentHint}</span>
          </div>
        </div>

        {/* Bridge / delta */}
        <div className="forecast-mid">
          <div className={`forecast-delta tone-${deltaTone}`}>
            {deltaSign}
            {deltaAbs.toFixed(1)}
            <span>pp</span>
          </div>
          <div className="forecast-arrow" aria-hidden>
            <span className="forecast-arrow-line" />
            <span className="forecast-arrow-head" />
          </div>
          <span className="forecast-mid-label">predicted</span>
        </div>

        {/* Predicted */}
        <div className="forecast-side forecast-side-pred">
          <div className="forecast-nums">
            <span className="forecast-tag tone-cyan">Forecast</span>
            <div className={`forecast-hero tone-${predTone}`}>
              {predicted.toFixed(1)}
              <span className="forecast-unit">{unit}</span>
            </div>
            <span className="forecast-hint">{predictedHint}</span>
          </div>
          <div className="vial forecast-vial" aria-hidden>
            <div
              className={`vial-fill tone-${predTone}`}
              style={{ height: `${Math.max(8, Math.min(100, highGood ? predicted : predicted))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Live-monitor building blocks ------------------------------------------
const DRIFT_META: Record<string, { label: string; text: string; dot: string; pill: string }> = {
  warming: { label: 'Warming up', text: 'herc-muted', dot: 'dot-slate', pill: 'pill slate' },
  healthy: { label: 'In distribution', text: 'tone-green', dot: 'dot-green', pill: 'pill green' },
  watch: { label: 'Watch', text: 'tone-amber', dot: 'dot-amber', pill: 'pill amber' },
  drift: { label: 'Drift detected', text: 'tone-rose', dot: 'dot-rose', pill: 'pill rose' },
}

function outcomeTag(f: LiveFeedItem): { t: string; c: string } {
  if (f.actual_status === 'on_target') return { t: 'on target', c: 'tone-green' }
  if (f.actual_status === 'over') return { t: `over +${f.actual_pct}%`, c: 'tone-rose' }
  if (f.actual_status === 'under') return { t: `under ${f.actual_pct}%`, c: 'tone-rose' }
  return { t: '—', c: 'herc-faint' }
}

// ---- Feed card severity (loss-prediction vial scale) -----------------------
const SEV_GREEN = [16, 185, 129]
const SEV_AMBER = [245, 158, 11]
const SEV_RED = [244, 63, 94]
const RISK_VIAL_MAX = 100

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
const sevRgb = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
const sevDarken = (c: number[], f: number) =>
  `rgb(${Math.round(c[0] * f)}, ${Math.round(c[1] * f)}, ${Math.round(c[2] * f)})`

/** Severity ramp for 0–100% dosing risk. */
function riskSevRgb(risk: number): number[] {
  const t = clamp01(risk / RISK_VIAL_MAX)
  if (t <= 0.5) {
    const u = t * 2
    return [lerp(SEV_GREEN[0], SEV_AMBER[0], u), lerp(SEV_GREEN[1], SEV_AMBER[1], u), lerp(SEV_GREEN[2], SEV_AMBER[2], u)]
  }
  const u = (t - 0.5) * 2
  return [lerp(SEV_AMBER[0], SEV_RED[0], u), lerp(SEV_AMBER[1], SEV_RED[1], u), lerp(SEV_AMBER[2], SEV_RED[2], u)]
}

function riskFillPct(risk: number) {
  return Math.round(clamp01(risk / RISK_VIAL_MAX) * 100)
}

/** Abbreviate long ingredient names for compact cards. */
function abbrevName(name: string, max = 14) {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

/** Bottle-pod dose card — fc-pod layout (186px, glass vial, hero score). */
function FeedDoseCard({ f }: { f: LiveFeedItem }) {
  const out = outcomeTag(f)
  const sc = riskSevRgb(f.risk_pct)
  const color = sevRgb(sc)
  const fill = riskFillPct(f.risk_pct)
  const flaggedCls = f.flagged ? (f.band === 'High' ? ' flagged-high' : ' flagged-med') : ''

  return (
    <div
      className={`fc-pod animate-in fade-in slide-in-from-top-2 duration-300${flaggedCls}`}
      title={`${f.material_name} · ${f.product_name} · batch ${f.batch_name}`}
    >
      <div className="fc-pod-name">{abbrevName(f.material_name.toUpperCase())}</div>

      <div className="fc-pod-stage fc-pod-stage--vial-only">
        <div className="fc-vial" aria-hidden="true">
          <div className="fc-vial-glass">
            <div
              className="fc-vial-liquid"
              style={{
                height: `${Math.max(4, fill)}%`,
                background: `linear-gradient(180deg, ${sevRgb(sc)}, ${sevDarken(sc, 0.5)})`,
                boxShadow: `0 0 16px ${color}, inset 0 2px 0 rgba(255,255,255,0.5)`,
              }}
            />
            <span className="fc-vial-ticks" />
            <span className="fc-vial-gloss" />
          </div>
          <span className="fc-vial-cap">100%</span>
        </div>
      </div>

      <div className="fc-pod-score" style={{ color }}>
        {f.risk_pct.toFixed(1)}
        <span className="fc-pod-pct">%</span>
        <span className="fc-pod-score-l">Predicted risk</span>
      </div>

      <div className="fc-pod-read">
        <div className="fc-prow">
          <span className="fc-psize">{f.setpoint}kg</span>
          <span className="fc-ppk">{f.band}</span>
          <span className="fc-pbk">{out.t}</span>
        </div>
        <div className="fc-prow">
          <span className="fc-psize">batch</span>
          <span className="fc-ppk fc-prow-span">{abbrevName(f.batch_name, 10)}</span>
        </div>
      </div>
    </div>
  )
}

/** Detail KPI card — RUNTIMES-style (hero + split bar + sub-grid + footer). */
function DriftKpiCard({
  md,
  dr,
  driftMeta,
}: {
  md?: LiveModel
  dr?: LiveDrift
  driftMeta: { label: string; text: string; dot: string; pill: string }
}) {
  const ood = dr?.novel_rate ?? 0
  const status = dr?.status || 'warming'
  const tone = status === 'drift' ? 'rose' : status === 'watch' ? 'amber' : 'green'
  const acc = md?.accuracy != null ? Math.round(md.accuracy * 100) : null
  const psi = dr?.setpoint_psi ?? null
  const safePct = Math.max(0, 100 - Math.min(ood, 100))

  return (
    <div className="kpi-glow-card kpi-detail-card">
      <p className="gauge-kpi-label kpi-detail-label">Model • drift</p>
      <div className={`hero-num lg tone-${tone}`}>{dr?.novel_rate != null ? `${ood}%` : '—'}</div>
      <div className="kpi-detail-sub">
        <span className={`h-1.5 w-1.5 rounded-full ${driftMeta.dot}`} />
        {driftMeta.label}
      </div>

      <div className="kpi-split-track" aria-hidden>
        <span
          className={`kpi-split-fill bar-${tone === 'rose' ? 'rose' : tone === 'amber' ? 'amber' : 'green'}`}
          style={{ width: `${Math.min(ood, 100)}%` }}
        />
        <span className="kpi-split-rest" style={{ width: `${safePct}%` }} />
        <span className="kpi-split-threshold" style={{ left: '25%' }} title="25% retrain threshold" />
      </div>

      <div className="kpi-detail-grid">
        <div className="kpi-detail-cell">
          <div className="kpi-detail-cell-head">
            <span className="dot-cyan h-1.5 w-1.5 rounded-full" />
            <span>Model</span>
          </div>
          <div className="kpi-detail-val tone-cyan">v{md?.version ?? 1}</div>
        </div>
        <div className="kpi-detail-cell">
          <div className="kpi-detail-cell-head">
            <span
              className={`h-1.5 w-1.5 rounded-full ${acc != null && acc >= 80 ? 'dot-green' : acc != null && acc >= 65 ? 'dot-amber' : 'dot-rose'}`}
            />
            <span>Accuracy</span>
          </div>
          <div
            className={`kpi-detail-val ${acc != null && acc >= 80 ? 'tone-green' : acc != null && acc >= 65 ? 'tone-amber' : 'tone-rose'}`}
          >
            {acc != null ? `${acc}%` : '—'}
          </div>
        </div>
      </div>

      <div className="kpi-detail-foot">
        <span>Trained {md?.trained_on ?? 0}</span>
        <span>PSI {psi != null ? psi.toFixed(2) : '—'}</span>
      </div>
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
  const [feedMaterialPick, setFeedMaterialPick] = useState<Set<string>>(new Set())
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
  // Non-overlapping: a tick is skipped while the previous request is in flight,
  // so a slow backend can no longer stack up ~50 requests/minute from this page.
  usePolling(async (signal) => {
    try {
      const { data } = await axios.get<LiveState>(`${AI}/live/state`, { signal })
      if (signal.aborted) return
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
  }, 1500)

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
          usage: data.usage ?? null,
          mlPrediction: data.ml_prediction
            ? {
                risk: data.ml_prediction.risk,
                severity: data.ml_prediction.severity,
              }
            : null,
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

  // ---- Derived metrics -----------------------------------------------------
  const overall = insights?.insights.overall
  const liveProvider = health?.providers.find((p) => p.configured)

  const st = live?.stats
  const dr = live?.drift
  const md = live?.model
  const driftMeta = DRIFT_META[dr?.status || 'warming']
  const onTargetRate = st && st.processed ? Math.round((st.on_target / st.processed) * 100) : 0

  // Two hero metrics: Error rate + Yield — Current → Forecast
  const errorCurrent =
    overall && overall.count
      ? Math.round((overall.flagged / overall.count) * 1000) / 10
      : 0
  const yieldCurrent = overall?.on_target_pct ?? 0

  // Forecast: prefer live rolling rates once enough batches scored; else ML positive rate
  const liveReady = !!(st && st.processed >= 8)
  const errorPredicted = liveReady
    ? Math.round((st!.flagged / st!.processed) * 1000) / 10
    : mlInfo?.positive_rate != null
      ? Math.round(mlInfo.positive_rate * 1000) / 10
      : errorCurrent
  const yieldPredicted = liveReady
    ? onTargetRate
    : Math.round(Math.max(0, Math.min(100, 100 - errorPredicted)) * 10) / 10

  const feedMaterials = useMemo(() => {
    if (!live?.feed.length) return [] as { code: string; name: string }[]
    const seen = new Map<string, string>()
    for (const f of live.feed) {
      if (!seen.has(f.material_code)) seen.set(f.material_code, f.material_name)
    }
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }))
  }, [live?.feed])

  const showAllFeedMaterials = feedMaterialPick.size === 0

  const filteredFeed = useMemo(() => {
    if (!live?.feed.length) return []
    if (showAllFeedMaterials) return live.feed
    return live.feed.filter((f) => feedMaterialPick.has(f.material_code))
  }, [live?.feed, feedMaterialPick, showAllFeedMaterials])

  const selectAllFeedMaterials = () => setFeedMaterialPick(new Set())

  const toggleFeedMaterial = (code: string) => {
    setFeedMaterialPick((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

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
                ? 'rgba(244,63,94,0.72)'
                : f.band === 'Medium'
                  ? 'rgba(245,158,11,0.72)'
                  : 'rgba(34,211,238,0.55)'
            ),
            borderColor: recent.map((f) =>
              f.band === 'High' ? '#fb7185' : f.band === 'Medium' ? '#fbbf24' : '#67e8f9'
            ),
            borderWidth: 1.5,
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
            backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
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
      showPageTitle={false}
    >
      <div className="hercules-ai-page space-y-5 p-4 sm:p-5">
      {/* Drift / retrain popups */}
      <div className="pointer-events-none fixed right-4 top-24 z-50 flex w-[380px] max-w-[92vw] flex-col gap-2">
        {toasts.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-300 herc-toast ${n.kind === 'drift' ? 'drift' : 'retrain'}`}
          >
            <div className="flex items-start gap-3">
              <span className={n.kind === 'drift' ? 'tone-amber' : 'tone-cyan'}>
                {n.kind === 'drift' ? <AlertTriangle className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="herc-title text-[15px]">{n.title}</div>
                <div className="mt-1 text-xs leading-relaxed herc-muted">{n.message}</div>
              </div>
              <button
                onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}
                className="herc-faint transition hover:text-[var(--herc-cyan-2)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <header className="mb-1">
        <p className="herc-eyebrow">Fakieh · dosing intelligence</p>
        <h1 className="herc-title mt-1">Hercules AI</h1>
        <p className="herc-subtitle">
          Error rate &amp; yield — current vs forecast. Ask Hercules for detail.
        </p>
      </header>

      <div className="space-y-6">
        <div className="herc-status-bar">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${liveProvider ? 'animate-pulse dot-green' : 'dot-slate'}`} />
            {liveProvider ? `AI live · ${liveProvider.provider} (${liveProvider.model})` : 'AI offline · cached answers'}
          </span>
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${health?.ml_model_ready ? 'animate-pulse dot-green' : 'dot-rose'}`} />
            ML models {health?.ml_model_ready ? 'ready' : 'not trained'}
          </span>
          {insights && (
            <span className="herc-faint">
              {insights.insights.meta.row_count.toLocaleString()} doses ·{' '}
              {insights.insights.meta.batch_count} batches · {insights.insights.meta.product_count} products
            </span>
          )}
        </div>

        <Tabs defaultValue="assistant" className="w-full">
          <TabsList data-herc-tabs className="mb-4">
            <TabsTrigger value="assistant">
              <Bot className="mr-2 h-4 w-4" /> AI Assistant
            </TabsTrigger>
            <TabsTrigger value="predict">
              <Activity className="mr-2 h-4 w-4" /> Live Monitoring
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assistant" className="space-y-6">
            {insightsLoading && !overall ? (
              <div className="flex items-center gap-2 herc-muted py-10 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading forecast…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <ForecastBridge
                  label="Error rate"
                  current={errorCurrent}
                  predicted={errorPredicted}
                  highGood={false}
                  currentHint="historical doses"
                  predictedHint={liveReady ? 'live model window' : 'ML expected rate'}
                />
                <ForecastBridge
                  label="Yield"
                  current={yieldCurrent}
                  predicted={yieldPredicted}
                  highGood
                  currentHint="on-target rate"
                  predictedHint={liveReady ? 'live model window' : 'ML forecast'}
                />
              </div>
            )}

            <Panel title="Ask Hercules" icon={<Bot className="h-4 w-4" />}>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED.map((s) => (
                    <button key={s} onClick={() => handleAsk(s)} disabled={asking} className="herc-chip">
                      {s}
                    </button>
                  ))}
                </div>

                <div className="herc-chat-pane max-h-[520px] overflow-y-auto">
                  {messages.length === 0 && (
                    <p className="text-sm herc-faint">
                      Ask about dosing accuracy, worst batches, or a live prediction.
                    </p>
                  )}
                  <div className="herc-chat-grid">
                    {(() => {
                      // Pair each user question with its following AI answer so
                      // each visual fills one grid cell (side-by-side when space).
                      const cells: { q?: string; a?: (typeof messages)[0]; key: string }[] = []
                      for (let i = 0; i < messages.length; i++) {
                        const m = messages[i]
                        if (m.role === 'user') {
                          const next = messages[i + 1]
                          if (next && next.role === 'ai') {
                            cells.push({ q: m.text, a: next, key: `qa-${i}` })
                            i++
                          } else {
                            cells.push({ q: m.text, key: `q-${i}` })
                          }
                        } else {
                          cells.push({ a: m, key: `a-${i}` })
                        }
                      }
                      return cells.map((cell) => (
                        <div key={cell.key} className="herc-answer-visual">
                          {cell.q && (
                            <div className="herc-chat-q">
                              <span className="herc-eyebrow">You asked</span>
                              <p className="herc-chat-q-text">{cell.q}</p>
                            </div>
                          )}
                          {cell.a && (
                            <>
                              {cell.a.chart && cell.a.chart.labels?.length > 0 && (
                                <div className="herc-chart">
                                  <ChartComponent
                                    type={
                                      cell.a.chart.type === 'line'
                                        ? 'line'
                                        : cell.a.chart.type === 'doughnut'
                                          ? 'doughnut'
                                          : 'bar'
                                    }
                                    data={specToChartData(cell.a.chart)}
                                    title={cell.a.chart.title || 'Insight'}
                                    height={cell.a.chart.type === 'doughnut' ? 200 : 220}
                                    variant="glow"
                                    centerLabel={cell.a.chart.center_label}
                                    centerSubLabel={cell.a.chart.center_sub}
                                  />
                                </div>
                              )}

                              {cell.a.mlPrediction && (
                                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <PredictPod
                                    label="Risk prediction"
                                    score={cell.a.mlPrediction.risk.risk_pct}
                                    tone={
                                      cell.a.mlPrediction.risk.band === 'High'
                                        ? 'rose'
                                        : cell.a.mlPrediction.risk.band === 'Medium'
                                          ? 'amber'
                                          : 'green'
                                    }
                                    fillPct={cell.a.mlPrediction.risk.risk_pct}
                                    detail={
                                      <span className={bandPill(cell.a.mlPrediction.risk.band)}>
                                        {cell.a.mlPrediction.risk.band} ·{' '}
                                        {cell.a.mlPrediction.risk.prediction}
                                      </span>
                                    }
                                  />
                                  <PredictPod
                                    label="Severity"
                                    score={cell.a.mlPrediction.severity.severity_label}
                                    scoreSuffix=""
                                    tone={
                                      cell.a.mlPrediction.severity.severity === 'severe'
                                        ? 'rose'
                                        : cell.a.mlPrediction.severity.severity === 'watch'
                                          ? 'amber'
                                          : 'green'
                                    }
                                    fillPct={cell.a.mlPrediction.severity.confidence_pct}
                                    meta={`${cell.a.mlPrediction.severity.confidence_pct}% confidence`}
                                  />
                                </div>
                              )}

                              {cell.a.text && (
                                <p className="herc-answer-caption mt-2">
                                  {cell.a.chart || cell.a.mlPrediction
                                    ? chartCaption(cell.a.text)
                                    : cell.a.text}
                                </p>
                              )}

                              {(cell.a.provider || cell.a.cached || cell.a.usage) && (
                                <div className="herc-eyebrow mt-2 opacity-70 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span>
                                    {cell.a.cached
                                      ? 'offline · cached · 0 tokens'
                                      : cell.a.provider === 'ml-model'
                                        ? 'ML forecast · 0 tokens'
                                        : cell.a.provider
                                          ? `via ${cell.a.provider}`
                                          : 'offline · cached · 0 tokens'}
                                  </span>
                                  {cell.a.usage && (cell.a.usage.total_tokens != null || cell.a.usage.prompt_tokens != null) && !cell.a.cached && cell.a.provider !== 'ml-model' && (
                                    <span className="tone-cyan">
                                      · {cell.a.usage.total_tokens ?? ((cell.a.usage.prompt_tokens || 0) + (cell.a.usage.completion_tokens || 0))} tokens
                                      {cell.a.usage.prompt_tokens != null && cell.a.usage.completion_tokens != null
                                        ? ` (${cell.a.usage.prompt_tokens} in · ${cell.a.usage.completion_tokens} out)`
                                        : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {cell.q && !cell.a && asking && (
                            <div className="flex items-center gap-2 text-sm herc-muted py-4">
                              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                            </div>
                          )}
                        </div>
                      ))
                    })()}
                    {asking && messages.length > 0 && messages[messages.length - 1]?.role === 'ai' && (
                      <div className="herc-chat-status flex items-center gap-2 text-sm herc-muted">
                        <Loader2 className="h-4 w-4 animate-spin" /> Hercules AI is thinking…
                      </div>
                    )}
                    <div ref={chatEndRef} className="herc-chat-anchor" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder="Ask about dosing accuracy…"
                    className={FIELD}
                  />
                  <Button data-herc-btn="primary" onClick={() => handleAsk()} disabled={asking || !question.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="predict" className="space-y-6">
            <div className="herc-control-bar flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="flex items-center gap-2 herc-muted font-mono text-[11px] tracking-wide">
                  <Radio className={`h-4 w-4 ${live?.running ? 'tone-green' : 'herc-faint'}`} />
                  <span className={`h-2 w-2 rounded-full ${live?.running ? 'animate-pulse dot-green' : 'dot-slate'}`} />
                  {live?.running ? 'Live · scoring every batch' : 'Paused'}
                </span>
                <span className="hidden herc-faint font-mono text-[10px] sm:inline">{live?.source}</span>
                <span className={driftMeta.pill}>
                  <span className={`h-1.5 w-1.5 rounded-full ${driftMeta.dot} ${dr?.status === 'drift' ? 'animate-pulse' : ''}`} />
                  {live?.retraining ? 'Retraining…' : driftMeta.label}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] herc-faint tracking-wide uppercase">
                  <ShieldCheck className="h-3.5 w-3.5 tone-cyan" /> Model v{md?.version ?? 1}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="mr-1 flex items-center overflow-hidden rounded-md border border-[rgba(96,165,250,0.18)]">
                  {speedPresets.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => control('speed', s.value)}
                      className={`herc-chip rounded-none border-0 px-2.5 py-1 ${
                        Math.abs((live?.speed ?? 1.1) - s.value) < 0.05 ? 'active' : ''
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <Button data-herc-btn="ghost" variant="outline" size="sm" onClick={() => control(live?.running ? 'pause' : 'start')}>
                  {live?.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button data-herc-btn="ghost" variant="outline" size="sm" onClick={() => control('reset')}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Restart
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <GaugeKpi
                label="Batches monitored"
                value={`${st?.processed ?? 0}`}
                unit="batches"
                pct={live && live.total ? Math.min(100, (live.cursor / live.total) * 100) : 0}
                highGood
                subtitle={live ? `${live.cursor} of ${live.total} streamed` : 'starting…'}
              />
              <GaugeKpi
                label="Flagged for review"
                value={`${st?.flagged ?? 0}`}
                unit="risky doses"
                pct={st?.processed ? Math.min(100, (st.flagged / st.processed) * 100) : 0}
                highGood={false}
                subtitle="caught pre-batch"
              />
              <GaugeKpi
                label="On-target rate"
                value={`${onTargetRate}`}
                unit="% quality"
                pct={onTargetRate}
                highGood
                subtitle="live production"
              />
              <GaugeKpi
                label="Model accuracy"
                value={st?.rolling_accuracy != null ? `${st.rolling_accuracy}` : '—'}
                unit="% live hit"
                pct={st?.rolling_accuracy ?? 0}
                highGood
                subtitle="predictions vs actual"
              />
              <DriftKpiCard md={md} dr={dr} driftMeta={driftMeta} />
            </div>

            <div className="herc-live-workspace">
              <div className="erp-glow-card fc-panel">
                <div className="card-head">
                  <div className="flex items-center gap-2 min-w-0">
                    <Radio className="h-4 w-4 tone-cyan shrink-0" />
                    <p className="herc-eyebrow m-0">Live operator feed</p>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full dot-green shrink-0" />
                  </div>
                  <span className="meta flex flex-wrap items-center gap-2">
                    <span className="pill green">on target</span>
                    <span className="pill amber">watch</span>
                    <span className="pill rose">flag</span>
                  </span>
                </div>

                {feedMaterials.length > 0 && (
                  <div className="fc-sel" role="group" aria-label="Choose which ingredients to show">
                    <button
                      type="button"
                      className={`fc-chip${showAllFeedMaterials ? ' active' : ''}`}
                      onClick={selectAllFeedMaterials}
                    >
                      All ingredients
                    </button>
                    {feedMaterials.map(({ code, name }) => (
                      <button
                        key={code}
                        type="button"
                        className={`fc-chip${feedMaterialPick.has(code) ? ' active' : ''}`}
                        onClick={() => toggleFeedMaterial(code)}
                      >
                        {abbrevName(name, 20)}
                      </button>
                    ))}
                  </div>
                )}

                <div className="fc-grid">
                  {(!live || live.feed.length === 0) && (
                    <div className="fc-empty">
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                      <span> Waiting for the first batch…</span>
                    </div>
                  )}
                  {live && live.feed.length > 0 && filteredFeed.length === 0 && (
                    <div className="fc-empty">No cards match the selected ingredients.</div>
                  )}
                  {filteredFeed.map((f) => (
                    <FeedDoseCard key={f.id} f={f} />
                  ))}
                </div>
              </div>

              <div className="herc-live-charts">
                {riskTrend && (
                  <div className="herc-chart">
                    <ChartComponent
                      type="bar"
                      data={riskTrend}
                      title="Predicted risk — most recent batches"
                      height={300}
                      variant="glow"
                    />
                  </div>
                )}
                {outcomeMix && (
                  <div className="herc-chart">
                    <ChartComponent
                      type="doughnut"
                      data={outcomeMix}
                      title="Live dose outcomes (this session)"
                      height={300}
                      variant="glow"
                      centerLabel={st?.rolling_accuracy != null ? `${st.rolling_accuracy}%` : `${onTargetRate}%`}
                      centerSubLabel={st?.rolling_accuracy != null ? 'model hit' : 'on target'}
                    />
                  </div>
                )}
              </div>
            </div>

            <Panel
              title="Engineer what-if"
              icon={<FlaskConical className="h-4 w-4" />}
              right={
                <Button data-herc-btn="ghost" variant="outline" size="sm" onClick={() => setWhatIfOpen((v) => !v)}>
                  {whatIfOpen ? 'Hide' : 'Open'}
                </Button>
              }
            >
              {!whatIfOpen ? (
                <div className="flex items-center gap-3 herc-muted text-sm">
                  <FlaskConical className="h-5 w-5 tone-cyan shrink-0" />
                  <span className="herc-eyebrow">Engineer sandbox — click Open</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="herc-eyebrow">Ingredient</label>
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
                      <label className="herc-eyebrow">Product recipe</label>
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
                      <label className="herc-eyebrow">Target weight (kg)</label>
                      <Input type="number" step="0.1" value={setpoint} onChange={(e) => setSetpoint(e.target.value)} className={FIELD} />
                    </div>
                    <Button data-herc-btn="primary" onClick={handlePredict} disabled={predicting} className="w-full">
                      {predicting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Predict dosing risk'}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {prediction && (
                      <PredictPod
                        label="Risk prediction"
                        score={prediction.risk_pct}
                        tone={prediction.band === 'High' ? 'rose' : prediction.band === 'Medium' ? 'amber' : 'green'}
                        fillPct={prediction.risk_pct}
                        detail={
                          <span className={bandPill(prediction.band)}>
                            {prediction.band} risk · {prediction.prediction}
                          </span>
                        }
                        meta={`${prediction.inputs.material_name} · ${prediction.inputs.setpoint} kg · ${prediction.inputs.product_name}`}
                      />
                    )}
                    {severityPrediction && (
                      <PredictPod
                        label="Severity triage"
                        score={severityPrediction.severity_label}
                        scoreSuffix=""
                        tone={
                          severityPrediction.severity === 'severe'
                            ? 'rose'
                            : severityPrediction.severity === 'watch'
                              ? 'amber'
                              : 'green'
                        }
                        fillPct={severityPrediction.confidence_pct}
                        detail={
                          <div className="mt-1 space-y-1.5">
                            {Object.entries(severityPrediction.probabilities).map(([cls, pct]) => {
                              const meta = severityMeta(cls)
                              return (
                                <div key={cls} className="flex items-center gap-2">
                                  <span className={`w-14 shrink-0 font-mono text-[10px] ${meta.text}`}>{meta.label}</span>
                                  <div className="herc-track flex-1">
                                    <div className={meta.bar} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="w-10 shrink-0 text-right font-mono text-[10px] herc-faint">{pct}%</span>
                                </div>
                              )
                            })}
                          </div>
                        }
                        meta={`${severityPrediction.confidence_pct}% confidence`}
                      />
                    )}
                    {!prediction && !severityPrediction && (
                      <p className="text-sm herc-faint">
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
      </div>
    </WaterSystemLayout>
  )
}

export default AiAssistant
