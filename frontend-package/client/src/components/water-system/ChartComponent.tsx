import React, { useEffect, useMemo, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
  Filler,
  ChartOptions,
  Plugin,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { useTheme } from '@/contexts/ThemeContext'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
  Filler
)

interface ChartComponentProps {
  type: 'line' | 'bar' | 'doughnut'
  data: any
  title: string
  height?: number
  /** Neon predictive-UI glow skin (Hercules AI page). */
  variant?: 'default' | 'glow'
  /** Optional center caption for glow doughnuts (e.g. "92%") */
  centerLabel?: string
  centerSubLabel?: string
}

/** Soft colored bloom behind bars / arcs / lines */
const hercGlowPlugin: Plugin = {
  id: 'hercGlow',
  beforeDatasetsDraw(chart) {
    const ctx = chart.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(34, 211, 238, 0.55)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore()
  },
}

/** Soft outer bloom matching each doughnut segment color */
const hercArcGlowPlugin: Plugin = {
  id: 'hercArcGlow',
  beforeDatasetDraw(chart, args) {
    if (chart.config.type !== 'doughnut') return
    const meta = chart.getDatasetMeta(args.index)
    const ctx = chart.ctx
    ctx.save()
    meta.data.forEach((el: any, i: number) => {
      const ds = chart.data.datasets[args.index]
      const colors = ds.borderColor || ds.backgroundColor
      const c = Array.isArray(colors) ? colors[i] : colors
      if (!el || typeof el.x !== 'number') return
      ctx.beginPath()
      ctx.arc(el.x, el.y, (el.outerRadius || 0) + 2, el.startAngle, el.endAngle)
      ctx.strokeStyle = typeof c === 'string' ? c : 'rgba(34,211,238,0.5)'
      ctx.lineWidth = 10
      ctx.globalAlpha = 0.22
      ctx.shadowColor = typeof c === 'string' ? c : '#22d3ee'
      ctx.shadowBlur = 18
      ctx.stroke()
    })
    ctx.restore()
  },
}

/** Center text for glow doughnut */
function makeCenterTextPlugin(label?: string, sub?: string, light = false): Plugin {
  return {
    id: 'hercCenterText',
    afterDraw(chart) {
      if (chart.config.type !== 'doughnut' || !label) return
      const { ctx, chartArea } = chart
      if (!chartArea) return
      const cx = (chartArea.left + chartArea.right) / 2
      const cy = (chartArea.top + chartArea.bottom) / 2
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = light ? '#0f172a' : '#ffffff'
      ctx.shadowColor = light ? 'rgba(8, 145, 178, 0.25)' : 'rgba(34, 211, 238, 0.55)'
      ctx.shadowBlur = light ? 6 : 14
      ctx.font = "500 22px 'Fraunces', Georgia, serif"
      ctx.fillText(label, cx, sub ? cy - 8 : cy)
      if (sub) {
        ctx.shadowBlur = 0
        ctx.fillStyle = light ? '#0369a1' : '#93c5fd'
        ctx.font = "600 9px 'JetBrains Mono', monospace"
        ctx.fillText(sub.toUpperCase(), cx, cy + 14)
      }
      ctx.restore()
    },
  }
}

function glowCartesianOptionsFor(light: boolean): ChartOptions<any> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: light ? 'rgba(255, 255, 255, 0.96)' : 'rgba(2, 6, 23, 0.92)',
        titleColor: light ? '#0f172a' : '#e2e8f0',
        bodyColor: light ? '#0e7490' : '#67e8f9',
        borderColor: light ? 'rgba(8, 145, 178, 0.35)' : 'rgba(34, 211, 238, 0.45)',
        borderWidth: 1,
        padding: 10,
        titleFont: { family: "'Inter', system-ui, sans-serif", size: 11 },
        bodyFont: { family: "'Fraunces', Georgia, serif", size: 14, weight: 500 },
        displayColors: true,
        caretPadding: 8,
      },
    },
    scales: {
      x: {
        grid: {
          color: light ? 'rgba(148, 163, 184, 0.25)' : 'rgba(96, 165, 250, 0.07)',
          drawBorder: false,
        },
        ticks: {
          color: light ? '#64748b' : '#64748b',
          maxRotation: 45,
          minRotation: 30,
          font: { family: "'JetBrains Mono', monospace", size: 9 },
        },
        border: { display: false },
      },
      y: {
        grid: {
          color: light ? 'rgba(14, 116, 144, 0.12)' : 'rgba(0, 188, 212, 0.12)',
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          font: { family: "'JetBrains Mono', monospace", size: 9 },
        },
        border: { display: false },
      },
    },
  }
}

function glowDoughnutOptionsFor(light: boolean): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    animation: { animateRotate: true, duration: 1100, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: light ? '#475569' : '#94a3b8',
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 14,
          font: { family: "'JetBrains Mono', monospace", size: 10 },
        },
      },
      tooltip: {
        backgroundColor: light ? 'rgba(255, 255, 255, 0.96)' : 'rgba(2, 6, 23, 0.92)',
        titleColor: light ? '#0f172a' : '#e2e8f0',
        bodyColor: light ? '#0e7490' : '#67e8f9',
        borderColor: light ? 'rgba(8, 145, 178, 0.35)' : 'rgba(34, 211, 238, 0.45)',
        borderWidth: 1,
        padding: 10,
        titleFont: { family: "'Inter', system-ui, sans-serif", size: 11 },
        bodyFont: { family: "'Fraunces', Georgia, serif", size: 14, weight: 500 },
      },
    },
  }
}

function withGlowBarFills(data: any) {
  if (!data?.datasets?.length) return data
  return {
    ...data,
    datasets: data.datasets.map((ds: any) => {
      if (Array.isArray(ds.backgroundColor)) {
        return {
          ...ds,
          borderWidth: ds.borderWidth ?? 1.5,
          borderRadius: 4,
          borderSkipped: false,
          hoverBorderWidth: 2,
        }
      }
      return {
        ...ds,
        borderRadius: 5,
        borderSkipped: false,
        borderWidth: 1.5,
        borderColor: ds.borderColor || '#67e8f9',
        hoverBorderColor: '#a5f3fc',
        hoverBorderWidth: 2,
        backgroundColor(ctx: any) {
          const { chart } = ctx
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'rgba(34, 211, 238, 0.55)'
          const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
          g.addColorStop(0, 'rgba(34, 211, 238, 0.08)')
          g.addColorStop(0.45, 'rgba(34, 211, 238, 0.55)')
          g.addColorStop(1, 'rgba(103, 232, 249, 0.95)')
          return g
        },
      }
    }),
  }
}

function withGlowDoughnutFills(data: any) {
  if (!data?.datasets?.length) return data
  const palette = [
    { fill: 'rgba(16, 185, 129, 0.75)', rim: '#34d399' },
    { fill: 'rgba(245, 158, 11, 0.75)', rim: '#fbbf24' },
    { fill: 'rgba(244, 63, 94, 0.75)', rim: '#fb7185' },
  ]
  return {
    ...data,
    datasets: data.datasets.map((ds: any) => {
      const n = (ds.data || []).length
      const fills = Array.from({ length: n }, (_, i) => palette[i % palette.length].fill)
      const rims = Array.from({ length: n }, (_, i) => palette[i % palette.length].rim)
      return {
        ...ds,
        backgroundColor: fills,
        borderColor: rims,
        borderWidth: 2.5,
        hoverBorderWidth: 3,
        hoverOffset: 8,
        spacing: 2,
      }
    }),
  }
}

const defaultCartesianOptions: ChartOptions<any> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 15,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: '#f1f5f9',
      bodyColor: '#cbd5e1',
      borderColor: '#0891b2',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
      ticks: { color: '#64748b', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
      ticks: { color: '#64748b', font: { size: 10 } },
    },
  },
}

const defaultDoughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 15,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: '#f1f5f9',
      bodyColor: '#cbd5e1',
      borderColor: '#0891b2',
      borderWidth: 1,
    },
  },
}

export function ChartComponent({
  type,
  data,
  title,
  height = 200,
  variant = 'default',
  centerLabel,
  centerSubLabel,
}: ChartComponentProps) {
  const chartRef = useRef<any>(null)
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const isGlow = variant === 'glow'

  const plugins = useMemo(() => {
    if (!isGlow) return []
    const list: Plugin[] = [hercGlowPlugin]
    if (type === 'doughnut') {
      list.push(hercArcGlowPlugin, makeCenterTextPlugin(centerLabel, centerSubLabel, isLight))
    }
    return list
  }, [isGlow, type, centerLabel, centerSubLabel, isLight])

  const chartData = useMemo(() => {
    if (!isGlow) return data
    if (type === 'doughnut') return withGlowDoughnutFills(data)
    if (type === 'bar') return withGlowBarFills(data)
    return {
      ...data,
      datasets: (data?.datasets || []).map((ds: any) => ({
        ...ds,
        borderColor: ds.borderColor || '#22d3ee',
        backgroundColor: ds.backgroundColor || 'rgba(34, 211, 238, 0.18)',
        borderWidth: 2.5,
        pointBackgroundColor: '#67e8f9',
        pointBorderColor: isLight ? '#ffffff' : '#0b1220',
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.35,
      })),
    }
  }, [data, isGlow, type, isLight])

  const resolvedOptions: ChartOptions<any> = useMemo(() => {
    if (isGlow) {
      return type === 'doughnut' ? glowDoughnutOptionsFor(isLight) : glowCartesianOptionsFor(isLight)
    }
    return type === 'doughnut' ? defaultDoughnutOptions : defaultCartesianOptions
  }, [isGlow, type, isLight])

  useEffect(() => {
    if (chartRef.current?.canvas) {
      if (isGlow) {
        chartRef.current.canvas.style.filter = isLight
          ? 'drop-shadow(0 2px 8px rgba(15, 23, 42, 0.08))'
          : 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.25)) drop-shadow(0 0 28px rgba(34, 211, 238, 0.12))'
      } else {
        chartRef.current.canvas.style.filter = 'drop-shadow(0 0 15px rgba(8, 145, 178, 0.4))'
      }
      chartRef.current.canvas.style.transition = 'filter 0.3s ease'
    }
  }, [isGlow, isLight])

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update('active')
    }
  }, [chartData, resolvedOptions])

  const shellClass = isGlow
    ? 'herc-glow-chart-inner relative'
    : 'bg-slate-950/50 border border-slate-700/30 rounded-lg p-4 backdrop-blur-sm hover:shadow-lg hover:shadow-cyan-500/20 transition-all duration-300 group light:bg-white light:border-gray-200'

  return (
    <div className={shellClass}>
      <div className="mb-4 flex items-center justify-between">
        <h3
          className={
            isGlow
              ? 'herc-chart-title'
              : 'text-sm font-medium text-slate-300 light:text-gray-800'
          }
        >
          {title}
        </h3>
        <div
          className={
            isGlow
              ? isLight
                ? 'h-2 w-2 rounded-full bg-cyan-600 animate-pulse'
                : 'h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee] animate-pulse'
              : 'h-2 w-2 animate-pulse rounded-full bg-cyan-400'
          }
        />
      </div>

      <div style={{ height: `${height}px` }} className="relative">
        {type === 'line' && (
          <Line ref={chartRef} data={chartData} options={resolvedOptions} plugins={plugins} />
        )}
        {type === 'bar' && (
          <Bar ref={chartRef} data={chartData} options={resolvedOptions} plugins={plugins} />
        )}
        {type === 'doughnut' && (
          <Doughnut ref={chartRef} data={chartData} options={resolvedOptions} plugins={plugins} />
        )}

        {!isGlow && (
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <div className="absolute left-0 top-0 h-px w-full animate-pulse bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
          </div>
        )}

        {isGlow && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md opacity-40">
            <div className="herc-chart-scan" />
          </div>
        )}
      </div>
    </div>
  )
}
