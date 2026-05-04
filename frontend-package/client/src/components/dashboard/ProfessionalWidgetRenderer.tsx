import React, { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Activity, Database, Zap, AlertTriangle } from 'lucide-react'

// Widget Interface
interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'table' | 'network' | 'custom'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: {
    dataSource?: string
    values?: Array<{
      id: string
      name: string
      unit: string
      color: string
      category: string
    }>
    chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter'
    displayMode?: 'single' | 'dual' | 'multiple'
    refreshInterval?: number
    thresholds?: Array<{ value: number; color: string; label: string }>
    styling?: {
      backgroundColor?: string
      borderColor?: string
      textColor?: string
    }
  }
}

// Mock data generator
const generateMockValue = (id: string) => {
  const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const base = (seed % 100) + 10
  const variation = Math.sin(Date.now() / 10000 + seed) * 20
  return base + variation
}

// KPI Widget
function KPIWidgetRenderer({ widget }: { widget: Widget }) {
  const value = generateMockValue(widget.id)
  const prevValue = value - (Math.random() - 0.5) * 10
  const trend = value > prevValue
  const change = ((value - prevValue) / prevValue * 100).toFixed(1)

  return (
    <div className="h-full p-4 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-lg border border-cyan-500/20">
      <div className="flex items-center justify-between mb-3">
        <Database className="w-5 h-5 text-cyan-400" />
        <div className={cn(
          "flex items-center space-x-1 text-xs px-2 py-1 rounded-full",
          trend ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
        )}>
          {trend ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{change}%</span>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="text-2xl font-bold text-cyan-400">
          {value.toFixed(1)}
        </div>
        <div className="text-xs text-slate-400 uppercase tracking-wide">
          Current Reading
        </div>
        
        {/* Mini trend line */}
        <div className="h-8 w-full bg-slate-800/50 rounded relative overflow-hidden">
          <div className="absolute inset-0 flex items-end justify-center">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="w-1 bg-cyan-400/60 rounded-t mx-0.5"
                style={{ 
                  height: `${20 + Math.sin(i * 0.5 + Date.now() / 5000) * 15}px`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Gauge Widget
function GaugeWidgetRenderer({ widget }: { widget: Widget }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDual = widget.config.displayMode === 'dual'
  
  useEffect(() => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const dpr = window.devicePixelRatio || 1
    const width = isDual ? 200 : 120
    const height = 120
    
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    
    ctx.clearRect(0, 0, width, height)
    
    if (isDual) {
      drawGauge(ctx, 50, 60, 35, generateMockValue(widget.id), '#00ffff', 'PRIMARY')
      drawGauge(ctx, 150, 60, 35, generateMockValue(widget.id + '_2'), '#ff6b6b', 'SECONDARY')
    } else {
      drawGauge(ctx, 60, 60, 45, generateMockValue(widget.id), '#00ffff')
    }
  }, [widget.id, isDual])
  
  const drawGauge = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, value: number, color: string, label?: string) => {
    const percentage = Math.min(value / 100, 1)
    
    // Background circle
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
    ctx.lineWidth = isDual ? 6 : 8
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.stroke()
    
    // Progress arc
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + percentage * 2 * Math.PI
    
    ctx.strokeStyle = color
    ctx.lineWidth = isDual ? 6 : 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, endAngle)
    ctx.stroke()
    
    // Center value
    ctx.fillStyle = color
    ctx.font = isDual ? 'bold 14px Arial' : 'bold 18px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(value.toFixed(0), centerX, centerY + 4)
    
    // Label
    if (label) {
      ctx.fillStyle = '#64748b'
      ctx.font = '10px Arial'
      ctx.fillText(label, centerX, centerY - radius - 8)
    }
  }
  
  return (
    <div className="h-full p-4 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-lg border border-green-500/20 flex flex-col items-center justify-center">
      <canvas ref={canvasRef} />
      {isDual && (
        <div className="mt-3 flex space-x-4 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
            <span className="text-slate-400">Primary</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <span className="text-slate-400">Secondary</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Chart Widget
function ChartWidgetRenderer({ widget }: { widget: Widget }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const dpr = window.devicePixelRatio || 1
    canvas.width = 280 * dpr
    canvas.height = 150 * dpr
    canvas.style.width = '280px'
    canvas.style.height = '150px'
    ctx.scale(dpr, dpr)
    
    ctx.clearRect(0, 0, 280, 150)
    
    // Draw chart based on type
    if (widget.config.chartType === 'line' || !widget.config.chartType) {
      drawLineChart(ctx)
    } else if (widget.config.chartType === 'bar') {
      drawBarChart(ctx)
    } else if (widget.config.chartType === 'pie') {
      drawPieChart(ctx)
    }
  }, [widget.config.chartType])
  
  const drawLineChart = (ctx: CanvasRenderingContext2D) => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: 20 + i * 12,
      y: 75 + Math.sin(i * 0.3 + Date.now() / 2000) * 30
    }))
    
    ctx.strokeStyle = '#00ffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.stroke()
    
    // Add glow
    ctx.shadowColor = '#00ffff'
    ctx.shadowBlur = 10
    ctx.stroke()
  }
  
  const drawBarChart = (ctx: CanvasRenderingContext2D) => {
    const bars = Array.from({ length: 8 }, (_, i) => ({
      x: 30 + i * 30,
      height: 20 + Math.random() * 80
    }))
    
    bars.forEach((bar, i) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, 150)
      gradient.addColorStop(0, '#8b5cf6')
      gradient.addColorStop(1, '#a855f7')
      
      ctx.fillStyle = gradient
      ctx.fillRect(bar.x, 130 - bar.height, 20, bar.height)
    })
  }
  
  const drawPieChart = (ctx: CanvasRenderingContext2D) => {
    const centerX = 140
    const centerY = 75
    const radius = 50
    const data = [30, 25, 20, 15, 10]
    const colors = ['#00ffff', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
    
    let currentAngle = -Math.PI / 2
    
    data.forEach((value, i) => {
      const sliceAngle = (value / 100) * 2 * Math.PI
      
      ctx.fillStyle = colors[i]
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle)
      ctx.closePath()
      ctx.fill()
      
      currentAngle += sliceAngle
    })
  }
  
  return (
    <div className="h-full p-4 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-lg border border-purple-500/20">
      <div className="flex items-center justify-between mb-3">
        <Activity className="w-5 h-5 text-purple-400" />
        <div className="text-xs text-slate-400 capitalize">
          {widget.config.chartType || 'line'} chart
        </div>
      </div>
      <canvas ref={canvasRef} />
    </div>
  )
}

// Table Widget
function TableWidgetRenderer({ widget }: { widget: Widget }) {
  const mockData = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    parameter: ['Flow Rate', 'pH Level', 'Turbidity', 'Chlorine', 'Temperature'][i],
    value: generateMockValue(`${widget.id}_${i}`).toFixed(2),
    unit: ['L/min', 'pH', 'NTU', 'mg/L', '°C'][i],
    status: Math.random() > 0.3 ? 'Normal' : 'Alert'
  }))
  
  return (
    <div className="h-full p-4 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-lg border border-orange-500/20 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <Database className="w-5 h-5 text-orange-400" />
        <div className="text-xs text-slate-400">
          {mockData.length} parameters
        </div>
      </div>
      
      <div className="overflow-y-auto h-[calc(100%-2rem)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left text-slate-400 pb-2">Parameter</th>
              <th className="text-right text-slate-400 pb-2">Value</th>
              <th className="text-center text-slate-400 pb-2">Status</th>
            </tr>
          </thead>
          <tbody className="space-y-1">
            {mockData.map((row) => (
              <tr key={row.id} className="border-b border-slate-800/50">
                <td className="py-2 text-slate-300">{row.parameter}</td>
                <td className="py-2 text-right text-cyan-400 font-mono">
                  {row.value} {row.unit}
                </td>
                <td className="py-2 text-center">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs",
                    row.status === 'Normal' 
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  )}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Network Widget
function NetworkWidgetRenderer({ widget }: { widget: Widget }) {
  return (
    <div className="h-full p-4 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-lg border border-teal-500/20 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <Zap className="w-5 h-5 text-teal-400" />
        <div className="text-xs text-slate-400">
          Network Map
        </div>
      </div>
      
      {/* Network visualization */}
      <div className="relative h-32 bg-slate-800/30 rounded border border-slate-700/50">
        {/* Central hub */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-teal-400 rounded-full animate-pulse">
          <div className="absolute inset-0 bg-teal-400 rounded-full animate-ping opacity-75"></div>
        </div>
        
        {/* Nodes */}
        {[
          { top: '20%', left: '20%' },
          { top: '20%', right: '20%' },
          { bottom: '20%', left: '20%' },
          { bottom: '20%', right: '20%' },
          { top: '50%', left: '10%' },
          { top: '50%', right: '10%' }
        ].map((pos, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 bg-cyan-400/80 rounded-full"
            style={pos}
          >
            <div className="absolute inset-0 bg-cyan-400 rounded-full animate-pulse"></div>
          </div>
        ))}
        
        {/* Connection lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <line x1="50%" y1="50%" x2="20%" y2="20%" stroke="url(#connectionGradient)" strokeWidth="1" />
          <line x1="50%" y1="50%" x2="80%" y2="20%" stroke="url(#connectionGradient)" strokeWidth="1" />
          <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="url(#connectionGradient)" strokeWidth="1" />
          <line x1="50%" y1="50%" x2="80%" y2="80%" stroke="url(#connectionGradient)" strokeWidth="1" />
          <line x1="50%" y1="50%" x2="10%" y2="50%" stroke="url(#connectionGradient)" strokeWidth="1" />
          <line x1="50%" y1="50%" x2="90%" y2="50%" stroke="url(#connectionGradient)" strokeWidth="1" />
        </svg>
      </div>
      
      <div className="mt-3 text-xs text-slate-400 text-center">
        6 nodes • 3 active connections
      </div>
    </div>
  )
}

// Custom Widget
function CustomWidgetRenderer({ widget }: { widget: Widget }) {
  return (
    <div className="h-full p-4 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 rounded-lg border border-slate-500/20 flex flex-col items-center justify-center">
      <AlertTriangle className="w-12 h-12 text-slate-500 mb-3" />
      <div className="text-center">
        <div className="text-sm font-medium text-slate-400 mb-1">Custom Widget</div>
        <div className="text-xs text-slate-500">Configure to add content</div>
      </div>
    </div>
  )
}

// Main Widget Renderer
export function ProfessionalWidgetRenderer({ widget }: { widget: Widget }) {
  const style = {
    backgroundColor: widget.config.styling?.backgroundColor || 'transparent',
    borderColor: widget.config.styling?.borderColor || undefined,
    color: widget.config.styling?.textColor || undefined,
  }
  
  const renderWidget = () => {
    switch (widget.type) {  
      case 'kpi':
        return <KPIWidgetRenderer widget={widget} />
      case 'gauge':
        return <GaugeWidgetRenderer widget={widget} />
      case 'chart':
        return <ChartWidgetRenderer widget={widget} />
      case 'table':
        return <TableWidgetRenderer widget={widget} />
      case 'network':
        return <NetworkWidgetRenderer widget={widget} />
      case 'custom':
        return <CustomWidgetRenderer widget={widget} />
      default:
        return <CustomWidgetRenderer widget={widget} />
    }
  }
  
  return (
    <div className="h-full w-full" style={style}>
      {renderWidget()}
    </div>
  )
}