/**
 * 24-Hour Production Performance panel for the Fakieh Dashboard.
 *
 * Shows the four figures the plant asked for -- when the window's first batch
 * started, when its last batch ended, how fast the mill ran, and how much of
 * the 24 hours it ran at all -- over one shared 24-hour axis so the numbers and
 * the picture cannot disagree.
 *
 * All arithmetic lives in the backend (Backend/routes/production_kpi.py), which
 * is where the awkward parts of this data are handled: batches overlap because
 * their start is a release stamp, tonnage is the sum of dosed material rather
 * than the [Quantity] column, OutLoading is not production, and "Not Selected"
 * rows are placeholders. This component formats and draws; it does not decide
 * what anything means.
 *
 * Note on styling: `light:` here is not a Tailwind variant. It is a hand-written
 * allowlist of rules under `:root.light` in index.css, so only classes that
 * already exist there will do anything. Sticking to cyan/gray/green keeps the
 * panel inside that allowlist.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Clock, Flag, Gauge, Zap } from 'lucide-react'
import { BUSINESS_TZ, parseUtcDate } from '@/utils/timezone'

/** The payload the endpoint returns when it succeeds. */
export interface ProductionKpi {
  mode: 'rolling' | 'production_day' | 'custom'
  window: { start: string | null; end: string | null; hours: number; elapsed_hours: number }
  batches: number
  batches_running: number
  tons: number
  first_batch_start: string | null
  last_batch_end: string | null
  running_hours: number
  idle_hours: number
  availability_pct: number
  throughput_tph: number
  throughput_window_tph: number
  on_target_pct: number | null
  on_target_rows: number
  scored_rows: number
  dosing_tolerance_pct: number
  dosing_accuracy_pct: number | null
  concurrency: number | null
  timeline: Array<{ start: string | null; end: string | null }>
  /** Whether `buckets` are clock hours or production days -- see HOURLY_BUCKET_LIMIT. */
  granularity: 'hour' | 'day'
  buckets: Array<{
    start: string | null
    end: string | null
    tons: number
    batches: number
    /** When the batches in this bucket actually started, which is not the bucket label. */
    first_start: string | null
    last_start: string | null
  }>
  non_production: { categories: string[]; batches: number; tons: number }
}

/**
 * A failure response carries none of the fields above -- the route returns just
 * {success, error, message} on 400/500. Modelling that as a union keeps the
 * next person from reading `kpi.tons` off an error body.
 */
export type ProductionKpiResponse =
  | ({ success: true } & ProductionKpi)
  | { success: false; error?: string; message?: string }

const REFRESH_MS = 60000

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  month: 'short',
  day: 'numeric',
})

const axisFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatClock(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : parseUtcDate(value)
  return d ? timeFmt.format(d) : '--:--'
}

function formatDay(iso: string | null | undefined): string {
  const d = parseUtcDate(iso)
  return d ? dayFmt.format(d) : ''
}

/** What one bar covers: an hour of the clock, or a production day. */
function bucketLabel(
  granularity: 'hour' | 'day',
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const start = parseUtcDate(from)
  if (!start) return 'No data'
  if (granularity === 'day') {
    // The plant's day, not the calendar's: 07:00 to 07:00, which is how the
    // Batch Calendar books a batch too.
    return `Production day ${dayFmt.format(start)} · 07:00 to 07:00`
  }
  const end = parseUtcDate(to) ?? new Date(start.getTime() + 3600000)
  return `Hour ${timeFmt.format(start)} - ${timeFmt.format(end)}`
}

function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '--'
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (minutes === 60) return `${whole + 1}h 00m`
  return `${whole}h ${String(minutes).padStart(2, '0')}m`
}

/** One of the four headline figures. Typography matches the KPI tiles above. */
function Stat({
  label,
  value,
  sub,
  icon,
  muted,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-cyan-400 light:text-cyan-600 shrink-0">{icon}</span>
        <p className="text-sm font-medium text-slate-400 light:text-gray-600 truncate">{label}</p>
      </div>
      <p
        className={`text-2xl font-bold tabular-nums truncate ${
          muted ? 'text-slate-500 light:text-gray-500' : 'text-white light:text-gray-900'
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-xs text-slate-400 light:text-gray-600 truncate mt-0.5">{sub}</p>
      ) : (
        <p className="text-xs text-transparent select-none mt-0.5">&nbsp;</p>
      )}
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-md bg-slate-900/50 light:bg-gray-100 border border-slate-700/50 light:border-gray-200 px-2.5 py-1">
      <span className="text-xs text-slate-400 light:text-gray-600">{label}</span>
      <span className="text-xs font-semibold text-white light:text-gray-900 tabular-nums">{value}</span>
    </span>
  )
}

export interface ProductionPerformanceCardProps {
  /**
   * The range the page's filter is set to, once the operator has applied one.
   *
   * Null until then, and the card shows a live rolling 24 hours -- the figure
   * the plant asked for, and the one worth seeing on a screen left open. Once
   * a filter is applied the card follows it like every other card on the page,
   * rather than being the one panel that ignores the controls above it.
   */
  range?: { start: Date; end: Date } | null
}

export default function ProductionPerformanceCard({ range }: ProductionPerformanceCardProps = {}) {
  const [kpi, setKpi] = useState<ProductionKpi | null>(null)
  // Operators read this card, so the visible message stays plain; whatever the
  // browser or the server actually said is kept for the tooltip.
  const [error, setError] = useState<{ text: string; detail?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [hover, setHover] = useState<{
    key: string
    pct: number
    title: string
    lines: string[]
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)

  /*
   * `parse_calendar_range` on the server reads these the way the Batch
   * Calendar does, so the same filter lands on the same window in both.
   */
  const query = range
    ? `startDate=${encodeURIComponent(range.start.toISOString())}` +
      `&endDate=${encodeURIComponent(range.end.toISOString())}`
    : 'hours=24'

  const fetchKpi = useCallback(async () => {
    // Skip the tick rather than restarting the request. Aborting the previous
    // call every 60 s means a query that takes 61 s never finishes once, and
    // the card sits on its skeleton forever.
    if (inFlightRef.current) return
    inFlightRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/sqlserver/production-kpi?${query}`, {
        signal: controller.signal,
      })
      let body: ProductionKpiResponse | null = null
      try {
        body = (await res.json()) as ProductionKpiResponse
      } catch {
        // A gateway error page, or nothing at all. res.status says more than
        // "Unexpected end of JSON input" ever would.
        body = null
      }
      if (!res.ok || body === null || body.success !== true) {
        const failure = body && body.success === false ? body : null
        setError({
          text: 'The reporting service could not return production data.',
          detail:
            failure?.message || failure?.error || `HTTP ${res.status} ${res.statusText}`.trim(),
        })
        return
      }
      const { success: _ok, ...data } = body
      setKpi(data)
      setUpdatedAt(new Date())
      setError(null)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError({
        text: 'Cannot reach the reporting service.',
        detail: (err as Error).message,
      })
    } finally {
      inFlightRef.current = false
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [query])

  useEffect(() => {
    fetchKpi()
    const interval = setInterval(fetchKpi, REFRESH_MS)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
      /*
       * abort() rejects the in-flight promise, but its `finally` -- where
       * inFlightRef is cleared -- does not run until a microtask later. The
       * replacement effect body runs BEFORE that, so without this line the new
       * window's first fetch hits the in-flight guard and is skipped, and the
       * card sits on the old range until the next 60 s tick. Pressing Apply
       * Filters would look like it had done nothing.
       */
      inFlightRef.current = false
    }
  }, [fetchKpi])

  const windowStart = parseUtcDate(kpi?.window?.start)
  const windowEnd = parseUtcDate(kpi?.window?.end)
  const windowMs =
    windowStart && windowEnd ? Math.max(windowEnd.getTime() - windowStart.getTime(), 1) : 1

  const pct = (d: Date) =>
    windowStart ? ((d.getTime() - windowStart.getTime()) / windowMs) * 100 : 0

  const runBlocks = (kpi?.timeline ?? [])
    .map((span) => {
      const s = parseUtcDate(span.start)
      const e = parseUtcDate(span.end)
      if (!s || !e) return null
      const left = Math.max(0, Math.min(100, pct(s)))
      const right = Math.max(0, Math.min(100, pct(e)))
      const width = Math.max(right - left, 0.35) // keep a short run visible
      return { left, width, s, e }
    })
    .filter(Boolean) as Array<{ left: number; width: number; s: Date; e: Date }>

  const byHour = kpi?.buckets ?? []
  const peakHour = byHour.reduce((max, h) => Math.max(max, h.tons), 0)
  const busiest = peakHour > 0 ? byHour.find((h) => h.tons === peakHour) ?? null : null

  /*
   * Each bucket is a whole clock hour, so it is placed by TIME rather than by
   * index: the first and last overhang a rolling window and are clipped to it,
   * which is what keeps these bars in step with the running ribbon below them.
   */
  const bars = byHour
    .map((h, i) => {
      const from = parseUtcDate(h.start)
      const to = parseUtcDate(h.end)
      if (!from || !to || !windowStart) return null
      const left = Math.max(0, Math.min(100, pct(from)))
      const right = Math.max(0, Math.min(100, pct(to)))
      if (right <= left) return null
      return { h, i, left, width: right - left }
    })
    .filter(Boolean) as Array<{
    h: (typeof byHour)[number]
    i: number
    left: number
    width: number
  }>

  // Ticks on the hour, thinned so they never crowd: every third bucket edge.
  const ticks = bars
    .filter((b) => b.i % 3 === 0)
    .map((b) => ({
      pct: b.left,
      label:
        kpi?.granularity === 'day'
          ? dayFmt.format(parseUtcDate(b.h.start) as Date)
          : axisFmt.format(parseUtcDate(b.h.start) as Date),
    }))

  // A batch that ran across the opening edge and finished before any new one
  // started is real running time with no batch booked to this window.
  const hasData =
    !!kpi && (kpi.batches > 0 || kpi.batches_running > 0 || kpi.running_hours > 0)
  const availability = kpi?.availability_pct ?? 0
  /* The window is 24 h only when no filter is applied; every sentence that
     names it reads from here rather than assuming. */
  const windowHours = kpi?.window?.hours ?? 24
  // "240h 00m" is arithmetic; "10 days" is what a person would say.
  const windowLabel =
    windowHours === 24
      ? '24h'
      : windowHours >= 48
        ? `${Math.round(windowHours / 24)} days`
        : formatHours(windowHours)
  const windowWords =
    windowHours === 24 ? 'the last 24 hours' : `the ${windowLabel} shown`

  return (
    <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden">
      {/* Header — matches the chart cards' title + pulsing status badge idiom */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white light:text-gray-900">
            {range ? 'Production Performance' : '24-Hour Production Performance'}
          </h3>
          <p className="text-xs text-slate-400 light:text-gray-600 mt-1">
            {windowStart && windowEnd
              ? `${formatDay(kpi?.window?.start)} ${formatClock(kpi?.window?.start)} → ${formatDay(
                  kpi?.window?.end,
                )} ${formatClock(kpi?.window?.end)} · plant time`
              : range
                ? 'Filtered range · plant time'
                : 'Rolling 24-hour window · plant time'}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <div
            className={`w-3 h-3 rounded-full ${
              error ? 'bg-orange-400' : 'bg-cyan-500 animate-pulse'
            }`}
          />
          <span
            className={`text-xs font-medium ${
              error
                ? 'text-orange-400 light:text-orange-600'
                : 'text-cyan-400 light:text-cyan-600'
            }`}
          >
            {error ? 'Unavailable' : range ? 'Filtered range' : 'Last 24 hours'}
          </span>
        </div>
      </div>

      {loading && !kpi ? (
        <div className="space-y-5" aria-busy="true">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded bg-slate-700/50 light:bg-gray-200 animate-pulse" />
                <div className="h-7 w-20 rounded bg-slate-700/50 light:bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="h-24 rounded-md bg-slate-700/30 light:bg-gray-100 animate-pulse" />
        </div>
      ) : (
        <>
          {/* The four figures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-cyan-400 light:text-cyan-600 shrink-0">
                  <Gauge className="h-4 w-4" />
                </span>
                <p className="text-sm font-medium text-slate-400 light:text-gray-600 truncate">
                  Efficiency
                </p>
              </div>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  hasData ? 'text-white light:text-gray-900' : 'text-slate-500 light:text-gray-500'
                }`}
              >
                {hasData ? `${availability.toFixed(1)}%` : '--'}
              </p>
              <div className="h-1.5 rounded-full bg-slate-700/60 light:bg-gray-200 overflow-hidden mt-2 mb-1">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, availability))}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 light:text-gray-600 truncate">
                {hasData
                  ? `Running ${formatHours(kpi?.running_hours)} of ${windowLabel}`
                  : `Running time ÷ ${windowLabel}`}
              </p>
            </div>

            <Stat
              icon={<Zap className="h-4 w-4" />}
              label="Throughput"
              value={hasData ? `${(kpi?.throughput_tph ?? 0).toFixed(1)} t/h` : '--'}
              sub={
                hasData
                  ? `${(kpi?.throughput_window_tph ?? 0).toFixed(1)} t/h across the full ${windowLabel}`
                  : 'Tonnage ÷ running time'
              }
              muted={!hasData}
            />

            <Stat
              icon={<Clock className="h-4 w-4" />}
              label="First batch start"
              value={hasData ? formatClock(kpi?.first_batch_start) : '--:--'}
              sub={hasData ? formatDay(kpi?.first_batch_start) : 'No batches yet'}
              muted={!hasData}
            />

            <Stat
              icon={<Flag className="h-4 w-4" />}
              label="Last batch end"
              value={
                kpi?.last_batch_end
                  ? formatClock(kpi.last_batch_end)
                  : kpi?.batches_running
                    ? 'Running'
                    : '--:--'
              }
              sub={
                kpi?.last_batch_end
                  ? formatDay(kpi.last_batch_end)
                  : kpi?.batches_running
                    ? `${kpi.batches_running} batch${kpi.batches_running === 1 ? '' : 'es'} in progress`
                    : 'No batches yet'
              }
              muted={!kpi?.last_batch_end}
            />
          </div>

          {/* One shared 24-hour axis: tonnage per hour above, running time below */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 light:text-gray-600">
                {kpi?.granularity === 'day' ? 'Tonnage per production day' : 'Tonnage per hour'}
              </span>
              <span className="text-xs text-slate-500 light:text-gray-500 tabular-nums">
                {peakHour > 0 ? `peak ${peakHour.toFixed(1)} t` : ''}
              </span>
            </div>

            <div className="relative" onMouseLeave={() => setHover(null)}>
              {/* One tooltip for both rows, anchored to whatever is hovered.
                  Clamped away from the edges so it cannot leave the card. */}
              {hover ? (
                <div
                  className="pointer-events-none absolute bottom-full mb-2 z-20 rounded-md border border-slate-700 light:border-gray-200 bg-slate-900 light:bg-white px-2.5 py-1.5 shadow-lg light:shadow-xl whitespace-nowrap"
                  // Shifting by its own width in proportion to how far along
                  // the axis the anchor sits: left-aligned at 0%, centred at
                  // 50%, right-aligned at 100%. The tooltip therefore tracks
                  // the bar without a fixed clamp that could still overflow
                  // once the text grows.
                  style={{
                    left: `${hover.pct}%`,
                    transform: `translateX(-${hover.pct}%)`,
                  }}
                >
                  <p className="text-xs font-semibold text-white light:text-gray-900">{hover.title}</p>
                  {hover.lines.map((line, i) => (
                    <p
                      key={i}
                      className="text-[11px] text-slate-400 light:text-gray-600 tabular-nums"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}

              <div
                className="relative h-16"
                role="group"
                aria-label={
                  hasData
                    ? `Tonnage produced per ${kpi?.granularity ?? 'hour'} over ${windowWords}. ` +
                      `${(kpi?.tons ?? 0).toFixed(1)} tonnes in ${kpi?.batches ?? 0} batches.`
                    : `Tonnage per ${kpi?.granularity ?? 'hour'}. No batches recorded in ${windowWords}.`
                }
              >
                {bars.map(({ h, i, left, width }) => {
                  const tons = h.tons
                  const batches = h.batches
                  const height =
                    peakHour > 0 ? Math.max((tons / peakHour) * 100, tons > 0 ? 6 : 0) : 0
                  const label = bucketLabel(kpi?.granularity ?? 'hour', h.start, h.end)
                  // The bar covers an hour; the batches inside it started at
                  // particular moments. Saying both stops the hour label from
                  // looking like it contradicts "first batch start" above.
                  const startedAt =
                    h.first_start && h.last_start
                      ? h.first_start === h.last_start
                        ? `started ${formatClock(h.first_start)}`
                        : `started ${formatClock(h.first_start)} - ${formatClock(h.last_start)}`
                      : null
                  const active = hover?.key === `bar-${i}`
                  // Only hours that produced something are worth a tab stop.
                  const focusable = batches > 0 || tons > 0
                  const show = () =>
                    setHover({
                      key: `bar-${i}`,
                      pct: left + width / 2,
                      title: label,
                      lines: [
                        `${tons.toFixed(2)} t produced`,
                        `${batches} batch${batches === 1 ? '' : 'es'}${
                          startedAt ? `, ${startedAt}` : ''
                        }`,
                      ],
                    })
                  return (
                    <div
                      key={i}
                      className={`absolute inset-y-0 flex items-end rounded-sm overflow-hidden cursor-default transition-colors ${
                        active
                          ? 'bg-slate-800 light:bg-gray-200'
                          : 'bg-slate-900/40 light:bg-gray-100'
                      }`}
                      style={{
                        left: `${left}%`,
                        width: `calc(${width}% - 2px)`,
                      }}
                      onMouseEnter={show}
                      onTouchStart={show}
                      onFocus={focusable ? show : undefined}
                      onBlur={() => setHover(null)}
                      tabIndex={focusable ? 0 : undefined}
                      role={focusable ? 'img' : undefined}
                      aria-label={
                        focusable
                          ? `${label}: ${tons.toFixed(2)} tonnes, ${batches} batch${
                              batches === 1 ? '' : 'es'
                            }`
                          : undefined
                      }
                    >
                      <div
                        className={`w-full rounded-sm transition-all duration-300 ${
                          active ? 'bg-cyan-400' : 'bg-cyan-500/70'
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* Running/idle ribbon on the same axis */}
              <div className="relative h-2.5 mt-2 rounded-full bg-slate-900/60 light:bg-gray-200 overflow-hidden">
                {runBlocks.map((b, i) => {
                  const active = hover?.key === `run-${i}`
                  const show = () =>
                    setHover({
                      key: `run-${i}`,
                      pct: b.left + b.width / 2,
                      title: `Running ${formatClock(b.s)} - ${formatClock(b.e)}`,
                      lines: [
                        `${formatHours((b.e.getTime() - b.s.getTime()) / 3600000)} without a stop`,
                      ],
                    })
                  return (
                    <div
                      key={i}
                      className={`absolute inset-y-0 rounded-full cursor-default transition-colors ${
                        active ? 'bg-cyan-300' : 'bg-cyan-500'
                      }`}
                      style={{ left: `${b.left}%`, width: `${b.width}%` }}
                      onMouseEnter={show}
                      onTouchStart={show}
                    />
                  )
                })}
              </div>
            </div>

            <div className="relative h-4 mt-1">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  // Nine labels need ~260px; a phone leaves ~270px inside the
                  // card's padding, so every other one steps aside below sm
                  // rather than colliding.
                  className={`absolute text-[10px] text-slate-500 light:text-gray-500 tabular-nums -translate-x-1/2 ${
                    i % 2 === 1 ? 'hidden sm:inline' : ''
                  }`}
                  style={{ left: `${t.pct}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Supporting figures */}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <Chip label="Batches" value={hasData ? String(kpi?.batches ?? 0) : '--'} />
            <Chip label="Produced" value={hasData ? `${(kpi?.tons ?? 0).toFixed(1)} t` : '--'} />
            <Chip label="Idle" value={hasData ? formatHours(kpi?.idle_hours) : '--'} />
            {kpi?.non_production?.tons ? (
              <Chip label="Outloaded (not counted)" value={`${kpi.non_production.tons.toFixed(1)} t`} />
            ) : null}
          </div>

          {error ? (
            <p
              className="flex items-center gap-2 text-xs text-slate-400 light:text-gray-600 mt-4"
              title={error.detail}
            >
              <Activity className="h-3.5 w-3.5" />
              {kpi
                ? `${error.text} Showing the last figures${
                    updatedAt ? `, from ${formatClock(updatedAt)}` : ''
                  }.`
                : `${error.text} Retrying every minute.`}
            </p>
          ) : !hasData ? (
            <p className="flex items-center gap-2 text-xs text-slate-400 light:text-gray-600 mt-4">
              <Activity className="h-3.5 w-3.5" />
              No batches recorded in {windowWords}.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
