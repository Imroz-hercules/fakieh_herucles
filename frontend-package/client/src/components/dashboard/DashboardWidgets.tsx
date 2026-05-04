import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { mockDatabaseValues, getCurrentValue, generateTimeSeriesData } from '@shared/mock-data'

interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'network' | 'table' | 'custom'
  title: string
  config: {
    dataSource?: string
    valueField?: string
    xAxisField?: string
    yAxisField?: string
    chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter'
    displayMode?: 'single' | 'multiple' | 'xy-chart' | 'trend'
    thresholds?: Array<{
      value: number
      color: string
      label: string
    }>
  }
}

interface DashboardWidgetProps {
  widget: Widget
  className?: string
}

// KPI Widget with Cyberpunk Styling
function KPIWidget({ widget, className }: DashboardWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    if (!canvasRef.current || !widget.config.valueField) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set high DPI
    const dpr = window.devicePixelRatio || 1
    canvas.width = 80 * dpr
    canvas.height = 40 * dpr
    canvas.style.width = '80px'
    canvas.style.height = '40px'
    ctx.scale(dpr, dpr)
    
    // Generate sparkline data
    const timeData = generateTimeSeriesData(widget.config.valueField, 12)
    const values = timeData.map(d => d.value)
    
    // Draw sparkline
    ctx.clearRect(0, 0, 80, 40)
    ctx.strokeStyle = '#00ffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    
    values.forEach((value, i) => {
      const x = (i / (values.length - 1)) * 70 + 5
      const y = 35 - ((value - min) / range) * 30
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
    
    // Add glow effect
    ctx.shadowColor = '#00ffff'
    ctx.shadowBlur = 3
    ctx.stroke()
    
  }, [widget.config.valueField])
  
  const currentValue = widget.config.valueField ? getCurrentValue(widget.config.valueField) : 0
  const dbValue = mockDatabaseValues.find(v => v.id === widget.config.valueField)
  
  return (
    <div className={cn(
      "holographic rounded-lg p-4 relative overflow-hidden border border-cyan-500/20",
      "bg-gradient-to-br from-slate-900/90 via-slate-800/70 to-slate-900/90",
      "shadow-lg shadow-cyan-500/10",
      className
    )}>
      {/* Animated Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-data-flow" />
        <div className="data-particle" style={{ top: '20%', animationDelay: '0s' }} />
        <div className="data-particle" style={{ top: '60%', animationDelay: '1s' }} />
      </div>
      
      <div className="relative z-10 flex items-center justify-between h-full">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-300 mb-1 truncate">
            {widget.title}
          </h3>
          <div className="text-2xl font-bold text-cyan-400">
            {typeof currentValue === 'number' ? currentValue.toFixed(1) : currentValue}
          </div>
          {dbValue && (
            <div className="text-xs text-slate-500 mt-1">
              {dbValue.unit}
            </div>
          )}
        </div>
        
        <div className="ml-3">
          <canvas ref={canvasRef} className="opacity-70" />
        </div>
      </div>
    </div>
  )
}

// Chart Widget with Multiple Chart Types
function ChartWidget({ widget, className }: DashboardWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    if (!canvasRef.current || !widget.config.valueField) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set high DPI
    const dpr = window.devicePixelRatio || 1
    canvas.width = 200 * dpr
    canvas.height = 120 * dpr
    canvas.style.width = '200px'
    canvas.style.height = '120px'
    ctx.scale(dpr, dpr)
    
    // Generate chart data
    const timeData = generateTimeSeriesData(widget.config.valueField, 24)
    
    // Draw chart based on type
    ctx.clearRect(0, 0, 200, 120)
    
    if (widget.config.chartType === 'line' || !widget.config.chartType) {
      drawLineChart(ctx, timeData)
    } else if (widget.config.chartType === 'bar') {
      drawBarChart(ctx, timeData)
    } else if (widget.config.chartType === 'area') {
      drawAreaChart(ctx, timeData)
    }
    
  }, [widget.config.valueField, widget.config.chartType])
  
  const drawLineChart = (ctx: CanvasRenderingContext2D, data: any[]) => {
    const values = data.map(d => d.value)
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    
    // Draw grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * 100 + 10
      ctx.beginPath()
      ctx.moveTo(10, y)
      ctx.lineTo(190, y)
      ctx.stroke()
    }
    
    // Draw line
    ctx.strokeStyle = '#00ffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    values.forEach((value, i) => {
      const x = (i / (values.length - 1)) * 180 + 10
      const y = 110 - ((value - min) / range) * 100
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
    
    // Add glow
    ctx.shadowColor = '#00ffff'
    ctx.shadowBlur = 5
    ctx.stroke()
  }
  
  const drawBarChart = (ctx: CanvasRenderingContext2D, data: any[]) => {
    const values = data.slice(-8).map(d => d.value) // Show last 8 values
    const max = Math.max(...values)
    const barWidth = 180 / values.length - 2
    
    values.forEach((value, i) => {
      const x = (i * (barWidth + 2)) + 10
      const height = (value / max) * 100
      const y = 110 - height
      
      // Bar background
      ctx.fillStyle = 'rgba(0, 255, 255, 0.1)'
      ctx.fillRect(x, 10, barWidth, 100)
      
      // Bar fill
      const gradient = ctx.createLinearGradient(x, y, x, 110)
      gradient.addColorStop(0, '#00ffff')
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0.3)')
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth, height)
      
      // Bar border
      ctx.strokeStyle = '#00ffff'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, barWidth, height)
    })
  }
  
  const drawAreaChart = (ctx: CanvasRenderingContext2D, data: any[]) => {
    const values = data.map(d => d.value)
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 10, 0, 110)
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.3)')
    gradient.addColorStop(1, 'rgba(0, 255, 255, 0.05)')
    
    // Draw area
    ctx.beginPath()
    ctx.moveTo(10, 110)
    
    values.forEach((value, i) => {
      const x = (i / (values.length - 1)) * 180 + 10
      const y = 110 - ((value - min) / range) * 100
      ctx.lineTo(x, y)
    })
    
    ctx.lineTo(190, 110)
    ctx.closePath()
    
    ctx.fillStyle = gradient
    ctx.fill()
    
    // Draw line on top
    ctx.strokeStyle = '#00ffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    values.forEach((value, i) => {
      const x = (i / (values.length - 1)) * 180 + 10
      const y = 110 - ((value - min) / range) * 100
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
  }
  
  return (
    <div className={cn(
      "holographic rounded-lg p-4 relative overflow-hidden border border-cyan-500/20",
      "bg-gradient-to-br from-slate-900/90 via-slate-800/70 to-slate-900/90",
      "shadow-lg shadow-cyan-500/10",
      className
    )}>
      {/* Animated Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-data-flow" />
        <div className="data-particle" style={{ top: '30%', animationDelay: '0s' }} />
        <div className="data-particle" style={{ top: '70%', animationDelay: '1.5s' }} />
      </div>
      
      <div className="relative z-10">
        <h3 className="text-sm font-medium text-slate-300 mb-3 truncate">
          {widget.title}
        </h3>
        <div className="flex justify-center">
          <canvas ref={canvasRef} className="opacity-90" />
        </div>
      </div>
    </div>
  )
}

// Enhanced Gauge Widget with Dual Value Support
function GaugeWidget({ widget, className }: DashboardWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDualMode = widget.config.displayMode === 'dual'
  
  useEffect(() => {
    if (!canvasRef.current || !widget.config.valueField) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set high DPI
    const dpr = window.devicePixelRatio || 1
    const width = isDualMode ? 240 : 120
    const height = 120
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    
    ctx.clearRect(0, 0, width, height)
    
    if (isDualMode && widget.config.yAxisField) {
      // Draw dual gauges side by side
      drawSingleGauge(ctx, widget.config.valueField, 60, 60, 40, '#00ffff', 'PRIMARY')
      drawSingleGauge(ctx, widget.config.yAxisField, 180, 60, 40, '#ff6b6b', 'SECONDARY')
    } else {
      // Draw single gauge
      drawSingleGauge(ctx, widget.config.valueField, 60, 60, 45, '#00ffff')
    }
    
  }, [widget.config.valueField, widget.config.yAxisField, widget.config.displayMode])
  
  const drawSingleGauge = (ctx: CanvasRenderingContext2D, fieldId: string, centerX: number, centerY: number, radius: number, color: string, label?: string) => {
    const currentValue = getCurrentValue(fieldId) as number
    const dbValue = mockDatabaseValues.find(v => v.id === fieldId)
    const maxValue = Math.max(...(dbValue?.sampleData || [100])) * 1.2
    const percentage = Math.min((currentValue / maxValue) * 100, 100)
    
    // Background circle
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
    ctx.lineWidth = isDualMode ? 6 : 8
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.stroke()
    
    // Progress arc
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + (percentage / 100) * 2 * Math.PI
    
    const gradient = ctx.createConicGradient(0, centerX, centerY)
    gradient.addColorStop(0, color)
    gradient.addColorStop(0.5, color === '#00ffff' ? '#00ff88' : '#ff8c42')
    gradient.addColorStop(1, color === '#00ffff' ? '#ffff00' : '#ffff42')
    
    ctx.strokeStyle = gradient
    ctx.lineWidth = isDualMode ? 6 : 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, endAngle)
    ctx.stroke()
    
    // Add glow
    ctx.shadowColor = color
    ctx.shadowBlur = isDualMode ? 8 : 10
    ctx.stroke()
    
    // Center text
    ctx.shadowBlur = 0
    ctx.fillStyle = color
    ctx.font = isDualMode ? 'bold 12px Arial' : 'bold 16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${currentValue.toFixed(0)}`, centerX, centerY + 2)
    
    if (dbValue) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = isDualMode ? '8px Arial' : '10px Arial'
      ctx.fillText(dbValue.unit, centerX, centerY + (isDualMode ? 15 : 20))
    }
    
    // Add label for dual mode
    if (label) {
      ctx.fillStyle = '#64748b'
      ctx.font = '8px Arial'
      ctx.fillText(label, centerX, centerY - radius - 8)
    }
  }
  
  return (
    <div className={cn(
      "holographic rounded-lg p-4 relative overflow-hidden border border-cyan-500/20",
      "bg-gradient-to-br from-slate-900/90 via-slate-800/70 to-slate-900/90",
      "shadow-lg shadow-cyan-500/10 flex flex-col items-center",
      className
    )}>
      {/* Animated Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-data-flow" />
        <div className="data-particle" style={{ top: '25%', animationDelay: '0s' }} />
        <div className="data-particle" style={{ top: '75%', animationDelay: '2s' }} />
        {isDualMode && <div className="data-particle" style={{ top: '50%', right: '25%', animationDelay: '1s' }} />}
      </div>
      
      <div className="relative z-10 text-center">
        <h3 className="text-sm font-medium text-slate-300 mb-3 truncate">
          {widget.title}
        </h3>
        <canvas ref={canvasRef} className="opacity-90" />
        {isDualMode && (
          <div className="mt-2 text-xs text-slate-400 flex justify-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
              <span>Primary</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
              <span>Secondary</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Main Dashboard Widget Component
export function DashboardWidget({ widget, className }: DashboardWidgetProps) {
  switch (widget.type) {
    case 'kpi':
      return <KPIWidget widget={widget} className={className} />
    case 'chart':
      return <ChartWidget widget={widget} className={className} />
    case 'gauge':
      return <GaugeWidget widget={widget} className={className} />
    case 'table':
    case 'network':
    case 'custom':
      return (
        <div className={cn(
          "holographic rounded-lg p-4 relative overflow-hidden border border-cyan-500/20",
          "bg-gradient-to-br from-slate-900/90 via-slate-800/70 to-slate-900/90",
          "shadow-lg shadow-cyan-500/10",
          className
        )}>
          <div className="text-center text-slate-400">
            <h3 className="text-sm font-medium text-slate-300 mb-2">
              {widget.title}
            </h3>
            <p className="text-xs">
              {widget.type.charAt(0).toUpperCase() + widget.type.slice(1)} widget coming soon
            </p>
          </div>
        </div>
      )
    default:
      return null
  }
}