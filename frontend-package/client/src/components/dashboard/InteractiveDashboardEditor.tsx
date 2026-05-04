import React, { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Responsive, WidthProvider } from 'react-grid-layout'
import { Plus, Save, Settings, Download, Upload, Palette, Database, Wifi, TrendingUp, BarChart3, Activity, X } from 'lucide-react'
import { SketchPicker } from 'react-color'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

// Data Sources Configuration
const DATA_SOURCES = {
  Database: {
    label: 'Database',
    icon: Database,
    variables: [
      'flow_rate_sensor', 'pressure_transmitter', 'level_indicator', 
      'temperature_probe', 'ph_meter', 'conductivity_sensor',
      'turbidity_meter', 'chlorine_analyzer', 'dissolved_oxygen'
    ]
  },
  OT: {
    label: 'OT Systems',
    icon: Wifi,
    variables: [
      'plc_01_data', 'scada_main', 'fieldbus_01', 'modbus_rtu',
      'profinet_device', 'ethernet_ip', 'bacnet_object', 'opcua_tag'
    ]
  }
}

// Chart Types
const CHART_TYPES = [
  { value: 'line', label: 'Line Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'scatter', label: 'Scatter Plot' }
]

// Widget Configuration Interface
interface WidgetConfig {
  id: string
  title: string
  chartType: string
  dataSource: string
  variable: string
  color: string
  layout: { i: string, x: number, y: number, w: number, h: number }
}

// Chart Widget Component with 3D Effects and Glowing Design
function ChartWidget({ 
  config, 
  onEdit, 
  onDelete,
  onDataPointClick
}: { 
  config: WidgetConfig
  onEdit: () => void
  onDelete: () => void
  onDataPointClick: (dataPoint: any, chartType: string) => void
}) {
  // Generate realistic mock data with proper x/y axis values
  const generateMockData = () => {
    const points = 12
    const baseValue = 40 + Math.random() * 20 // Base value between 40-60
    
    return Array.from({ length: points }, (_, i) => {
      const timeValue = i + 1 // X-axis: 1, 2, 3, etc.
      const variance = (Math.random() - 0.5) * 20 // Random variance ±10
      const trend = i * 2 // Slight upward trend
      const value = Math.max(10, Math.min(100, baseValue + variance + trend)) // Y-axis: bounded 10-100
      
      return {
        x: timeValue,
        y: Math.round(value * 10) / 10, // Round to 1 decimal
        name: `${timeValue}`,
        value: Math.round(value * 10) / 10,
        time: `${String(i + 1).padStart(2, '0')}:00`
      }
    })
  }

  const mockData = generateMockData()

  return (
    <div className="h-full relative group">
      {/* 3D Container with Perspective and Glow Effects */}
      <div className="h-full bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 
                      border border-cyan-500/30 backdrop-blur-sm rounded-lg 
                      shadow-2xl shadow-cyan-500/20 transform-gpu perspective-1000
                      hover:shadow-cyan-400/40 hover:border-cyan-400/50 
                      transition-all duration-500 ease-out group-hover:scale-[1.01]
                      before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent 
                      before:via-cyan-500/10 before:to-transparent before:rounded-lg before:opacity-0 
                      before:hover:opacity-100 before:transition-opacity before:duration-500">
        
        {/* Scanning Line Animation */}
        <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent
                          animate-[scanning_3s_ease-in-out_infinite] opacity-60"></div>
        </div>

        {/* Header with 3D Glass Effect */}
        <div className="p-4 pb-2 relative">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-cyan-100 tracking-wide mb-1 text-shadow-sm">
                {config.title}
              </h3>
              <div className="text-xs text-cyan-300/70 font-medium">
                {DATA_SOURCES[config.dataSource as keyof typeof DATA_SOURCES]?.label} • {config.variable}
              </div>
            </div>
            
            {/* Control Buttons with Enhanced Responsiveness */}
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50">
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onEdit()
                }}
                className="h-7 w-7 p-0 rounded-full bg-slate-800/90 border border-cyan-400/30 
                           text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/20 hover:border-cyan-300/70
                           hover:shadow-lg hover:shadow-cyan-400/40 hover:scale-110
                           transition-all duration-300 backdrop-blur-sm cursor-pointer"
                title="Edit Chart Settings"
              >
                <Settings className="h-3 w-3 mx-auto" />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete()
                }}
                className="h-7 w-7 p-0 rounded-full bg-slate-800/90 border border-red-400/30 
                           text-red-400 hover:text-red-300 hover:bg-red-400/20 hover:border-red-300/70
                           hover:shadow-lg hover:shadow-red-400/40 hover:scale-110
                           transition-all duration-300 backdrop-blur-sm cursor-pointer"
                title="Delete Chart"
              >
                <X className="h-3 w-3 mx-auto" />
              </button>
            </div>
          </div>
        </div>

        {/* Chart Area with Enhanced 3D Visualization and Hover Effects */}
        <div className="px-4 pb-4">
          <div className="h-48 relative rounded-lg bg-slate-950/50 border border-slate-700/30 
                          backdrop-blur-sm group/chart cursor-pointer
                          transition-all duration-500 hover:bg-slate-900/60 hover:border-cyan-400/60
                          hover:shadow-2xl hover:shadow-cyan-500/30 hover:scale-[1.02]
                          hover:rotate-x-1 hover:rotate-y-1 transform-gpu perspective-1000
                          before:absolute before:inset-0 before:rounded-lg before:overflow-hidden before:pointer-events-none">
            
            {/* Enhanced Floating Particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-cyan-400/60 rounded-full animate-pulse"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${i * 0.5}s`,
                    animationDuration: `${2 + Math.random() * 2}s`
                  }}
                />
              ))}
            </div>
            
            {/* Grid Background with Enhanced Animation */}
            <div className="absolute inset-0 opacity-20 group-hover/chart:opacity-40 transition-all duration-700">
              <svg className="w-full h-full" viewBox="0 0 200 200">
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#00bcd4" strokeWidth="0.5" opacity="0.3"/>
                  </pattern>
                  <filter id="gridGlow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" filter="url(#gridGlow)" 
                      className="group-hover/chart:opacity-60 transition-opacity duration-700" />
              </svg>
            </div>

            {/* Enhanced Chart Visualizations with Interactive Effects */}
            <div className="absolute inset-0 flex items-center justify-center 
                            transition-all duration-500 group-hover/chart:scale-110
                            group-hover/chart:drop-shadow-lg">
              {config.chartType === 'line' && (
                <svg className="w-full h-full" viewBox="0 0 200 160">
                  <defs>
                    <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={config.color} stopOpacity="0.8"/>
                      <stop offset="50%" stopColor={config.color} stopOpacity="1"/>
                      <stop offset="100%" stopColor={config.color} stopOpacity="0.8"/>
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  {/* X-axis */}
                  <line x1="10" y1="130" x2="190" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  {/* Y-axis */}
                  <line x1="10" y1="20" x2="10" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  
                  {/* X-axis labels */}
                  {mockData.slice(0, 6).map((d, i) => (
                    <text key={`x-${i}`} x={(i / 5) * 180 + 10} y="145" 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="middle">
                      {d.x}
                    </text>
                  ))}
                  
                  {/* Y-axis labels */}
                  {[0, 25, 50, 75, 100].map((val, i) => (
                    <text key={`y-${i}`} x="5" y={130 - (val / 100) * 110} 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="end">
                      {val}
                    </text>
                  ))}
                  
                  {/* Glow effect line with hover enhancement */}
                  <polyline
                    fill="none"
                    stroke={config.color}
                    strokeWidth="4"
                    opacity="0.3"
                    filter="url(#glow)"
                    points={mockData.map((d, i) => `${(i / (mockData.length - 1)) * 180 + 10},${130 - (d.y / 100) * 110}`).join(' ')}
                    className="group-hover/chart:opacity-60 transition-opacity duration-300"
                  />
                  {/* Main line with hover effects */}
                  <polyline
                    fill="none"
                    stroke="url(#lineGlow)"
                    strokeWidth="2"
                    points={mockData.map((d, i) => `${(i / (mockData.length - 1)) * 180 + 10},${130 - (d.y / 100) * 110}`).join(' ')}
                    className="group-hover/chart:stroke-[3] transition-all duration-300"
                  />
                  {/* Data points with enhanced hover glow and click functionality */}
                  {mockData.slice(0, 8).map((d, i) => (
                    <circle
                      key={i}
                      cx={(i / (mockData.length - 1)) * 180 + 10}
                      cy={130 - (d.y / 100) * 110}
                      r="3"
                      fill={config.color}
                      filter="url(#glow)"
                      className="animate-pulse group-hover/chart:r-5 group-hover/chart:animate-none 
                                 hover:r-6 hover:fill-cyan-300 hover:drop-shadow-lg
                                 transition-all duration-300 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDataPointClick({
                          ...d,
                          pointIndex: i,
                          chartTitle: config.title,
                          dataSource: config.dataSource,
                          variable: config.variable
                        }, 'line')
                      }}
                    />
                  ))}
                </svg>
              )}
              
              {config.chartType === 'bar' && (
                <svg className="w-full h-full" viewBox="0 0 200 160">
                  <defs>
                    <linearGradient id="barGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor={config.color} stopOpacity="0.8"/>
                      <stop offset="100%" stopColor={config.color} stopOpacity="0.4"/>
                    </linearGradient>
                    <filter id="barGlow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  {/* X-axis */}
                  <line x1="10" y1="130" x2="190" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  {/* Y-axis */}
                  <line x1="10" y1="20" x2="10" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  
                  {mockData.slice(0, 8).map((d, i) => (
                    <g key={i}>
                      {/* X-axis label */}
                      <text x={i * 22 + 15} y="145" fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="middle">
                        {d.x}
                      </text>
                      {/* Glow effect with hover enhancement */}
                      <rect
                        x={i * 22 + 8}
                        y={130 - (d.y / 100) * 110}
                        width="14"
                        height={(d.y / 100) * 110}
                        fill={config.color}
                        opacity="0.3"
                        filter="url(#barGlow)"
                        className="group-hover/chart:opacity-50 transition-opacity duration-300"
                      />
                      {/* Main bar with enhanced hover effects and click functionality */}
                      <rect
                        x={i * 22 + 8}
                        y={130 - (d.y / 100) * 110}
                        width="14"
                        height={(d.y / 100) * 110}
                        fill="url(#barGradient)"
                        stroke={config.color}
                        strokeWidth="1"
                        className="hover:opacity-95 hover:stroke-cyan-300 hover:stroke-3 
                                   hover:scale-105 hover:drop-shadow-xl
                                   group-hover/chart:transform group-hover/chart:scale-y-110
                                   transition-all duration-300 origin-bottom cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDataPointClick({
                            ...d,
                            pointIndex: i,
                            chartTitle: config.title,
                            dataSource: config.dataSource,
                            variable: config.variable
                          }, 'bar')
                        }}
                      />
                      {/* Value label */}
                      <text x={i * 22 + 15} y={125 - (d.y / 100) * 110} 
                            fill="rgba(255,255,255,0.8)" fontSize="7" textAnchor="middle">
                        {d.y}
                      </text>
                    </g>
                  ))}
                  
                  {/* Y-axis labels */}
                  {[0, 25, 50, 75, 100].map((val, i) => (
                    <text key={`y-${i}`} x="5" y={130 - (val / 100) * 110} 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="end">
                      {val}
                    </text>
                  ))}
                </svg>
              )}
              
              {config.chartType === 'pie' && (
                <svg className="w-full h-full" viewBox="0 0 160 160">
                  <defs>
                    <radialGradient id="pieGradient" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={config.color} stopOpacity="0.9"/>
                      <stop offset="70%" stopColor={config.color} stopOpacity="0.7"/>
                      <stop offset="100%" stopColor={config.color} stopOpacity="0.4"/>
                    </radialGradient>
                    <filter id="pieGlow">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  {/* Outer glow ring with hover enhancement */}
                  <circle cx="80" cy="80" r="45" fill="none" stroke={config.color} strokeWidth="2" 
                          opacity="0.3" filter="url(#pieGlow)" 
                          className="animate-pulse group-hover/chart:opacity-60 group-hover/chart:r-48 
                                     transition-all duration-500"/>
                  {/* Main pie circle with hover scaling and click functionality */}
                  <circle cx="80" cy="80" r="40" fill="url(#pieGradient)" stroke={config.color} strokeWidth="2"
                          className="group-hover/chart:r-44 group-hover/chart:stroke-cyan-300 
                                     hover:drop-shadow-2xl transition-all duration-300 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDataPointClick({
                              value: mockData[0].y,
                              percentage: '100%',
                              total: mockData.reduce((sum, d) => sum + d.y, 0),
                              chartTitle: config.title,
                              dataSource: config.dataSource,
                              variable: config.variable
                            }, 'pie')
                          }}/>
                  {/* Inner highlight with hover effect */}
                  <circle cx="80" cy="80" r="20" fill="rgba(255,255,255,0.1)"
                          className="group-hover/chart:r-22 group-hover/chart:fill-cyan-100/20 
                                     transition-all duration-300"/>
                  {/* Center dot with enhanced animation */}
                  <circle cx="80" cy="80" r="4" fill={config.color} 
                          className="animate-pulse group-hover/chart:r-6 group-hover/chart:fill-cyan-300 
                                     group-hover/chart:animate-none transition-all duration-300"/>
                </svg>
              )}
              
              {config.chartType === 'area' && (
                <svg className="w-full h-full" viewBox="0 0 200 160">
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={config.color} stopOpacity="0.6"/>
                      <stop offset="100%" stopColor={config.color} stopOpacity="0.1"/>
                    </linearGradient>
                    <filter id="areaGlow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  {/* X-axis */}
                  <line x1="10" y1="130" x2="190" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  {/* Y-axis */}
                  <line x1="10" y1="20" x2="10" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  
                  {/* Glow effect with hover enhancement */}
                  <polygon
                    fill={config.color}
                    fillOpacity="0.2"
                    filter="url(#areaGlow)"
                    points={`10,130 ${mockData.map((d, i) => `${(i / (mockData.length - 1)) * 180 + 10},${130 - (d.y / 100) * 110}`).join(' ')} 190,130`}
                    className="group-hover/chart:fill-opacity-40 transition-all duration-300"
                  />
                  {/* Main area with hover effects */}
                  <polygon
                    fill="url(#areaGradient)"
                    stroke={config.color}
                    strokeWidth="2"
                    points={`10,130 ${mockData.map((d, i) => `${(i / (mockData.length - 1)) * 180 + 10},${130 - (d.y / 100) * 110}`).join(' ')} 190,130`}
                    className="group-hover/chart:stroke-3 group-hover/chart:stroke-cyan-300 
                               transition-all duration-300 cursor-pointer"
                  />
                  
                  {/* Axis labels */}
                  {mockData.slice(0, 6).map((d, i) => (
                    <text key={`x-${i}`} x={(i / 5) * 180 + 10} y="145" 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="middle">
                      {d.x}
                    </text>
                  ))}
                  
                  {[0, 25, 50, 75, 100].map((val, i) => (
                    <text key={`y-${i}`} x="5" y={130 - (val / 100) * 110} 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="end">
                      {val}
                    </text>
                  ))}
                </svg>
              )}
              
              {config.chartType === 'scatter' && (
                <svg className="w-full h-full" viewBox="0 0 200 160">
                  <defs>
                    <radialGradient id="scatterGradient" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={config.color} stopOpacity="1"/>
                      <stop offset="100%" stopColor={config.color} stopOpacity="0.3"/>
                    </radialGradient>
                    <filter id="scatterGlow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  {/* X-axis */}
                  <line x1="10" y1="130" x2="190" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  {/* Y-axis */}
                  <line x1="10" y1="20" x2="10" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  
                  {mockData.slice(0, 15).map((d, i) => {
                    const x = 10 + (d.x / mockData.length) * 180
                    const y = 130 - (d.y / 100) * 110
                    return (
                      <g key={i}>
                        {/* Glow effect with hover enhancement */}
                        <circle cx={x} cy={y} r="6" fill={config.color} opacity="0.3" filter="url(#scatterGlow)"
                                className="group-hover/chart:opacity-60 group-hover/chart:r-8 transition-all duration-300"/>
                        {/* Main point with enhanced hover effects and click functionality */}
                        <circle cx={x} cy={y} r="4" fill="url(#scatterGradient)" stroke={config.color} strokeWidth="1" 
                                className="animate-pulse group-hover/chart:r-6 group-hover/chart:stroke-cyan-300 
                                           group-hover/chart:stroke-3 group-hover/chart:animate-none 
                                           hover:r-7 hover:fill-cyan-200 hover:drop-shadow-lg
                                           transition-all duration-300 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDataPointClick({
                                    ...d,
                                    pointIndex: i,
                                    chartTitle: config.title,
                                    dataSource: config.dataSource,
                                    variable: config.variable
                                  }, 'scatter')
                                }}/>
                        {/* Value label with hover effect */}
                        <text x={x} y={y - 8} fill="rgba(255,255,255,0.7)" fontSize="6" textAnchor="middle"
                              className="group-hover/chart:fill-cyan-200 group-hover/chart:text-7 transition-all duration-300">
                          {d.y}
                        </text>
                      </g>
                    )
                  })}
                  
                  {/* Axis labels */}
                  {[1, 3, 6, 9, 12].map((val, i) => (
                    <text key={`x-${i}`} x={10 + (val / 12) * 180} y="145" 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="middle">
                      {val}
                    </text>
                  ))}
                  
                  {[0, 25, 50, 75, 100].map((val, i) => (
                    <text key={`y-${i}`} x="5" y={130 - (val / 100) * 110} 
                          fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="end">
                      {val}
                    </text>
                  ))}
                </svg>
              )}
            </div>
          </div>
          
          {/* Status Indicator with Enhanced Hover Glow */}
          <div className="flex items-center justify-between mt-3 text-xs">
            <div className="flex items-center space-x-2 text-cyan-300/80 
                            group-hover/chart:text-cyan-200 transition-colors duration-300">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50
                              group-hover/chart:w-2.5 group-hover/chart:h-2.5 group-hover/chart:shadow-green-300/70
                              transition-all duration-300"></div>
              <span className="font-medium group-hover/chart:font-semibold transition-all duration-300">
                Live Data • Real-time Updates
              </span>
            </div>
            <div className="text-slate-400 font-mono text-xs group-hover/chart:text-cyan-400 
                            transition-colors duration-300">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Widget Configuration Dialog
function WidgetConfigDialog({
  widget,
  isOpen,
  onClose,
  onSave
}: {
  widget: WidgetConfig | null
  isOpen: boolean
  onClose: () => void
  onSave: (config: WidgetConfig) => void
}) {
  const [config, setConfig] = useState<WidgetConfig | null>(widget)
  const [showColorPicker, setShowColorPicker] = useState(false)

  useEffect(() => {
    setConfig(widget)
  }, [widget])

  if (!config) return null

  const handleSave = () => {
    onSave(config)
    onClose()
  }

  const selectedDataSource = DATA_SOURCES[config.dataSource as keyof typeof DATA_SOURCES]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 
                                 border border-cyan-500/30 backdrop-blur-sm shadow-2xl shadow-cyan-500/20">
        <DialogHeader>
          <DialogTitle className="text-cyan-100 font-bold tracking-wide text-lg">
            Configure Chart Widget
          </DialogTitle>
          <div className="text-sm text-cyan-300/70">
            Customize your chart visualization and data source
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Title */}
          <div>
            <Label className="text-slate-300">Widget Title</Label>
            <Input
              value={config.title}
              onChange={(e) => setConfig(prev => prev ? { ...prev, title: e.target.value } : null)}
              className="bg-slate-800 border-slate-600 text-slate-200"
            />
          </div>

          {/* Chart Type */}
          <div>
            <Label className="text-slate-300">Chart Type</Label>
            <Select 
              value={config.chartType} 
              onValueChange={(value) => setConfig(prev => prev ? { ...prev, chartType: value } : null)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {CHART_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data Source */}
          <div>
            <Label className="text-slate-300">Data Source</Label>
            <Select 
              value={config.dataSource} 
              onValueChange={(value) => setConfig(prev => prev ? { ...prev, dataSource: value, variable: '' } : null)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {Object.entries(DATA_SOURCES).map(([key, source]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center space-x-2">
                      <source.icon className="h-4 w-4" />
                      <span>{source.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Variable Selection */}
          {selectedDataSource && (
            <div>
              <Label className="text-slate-300">Variable/Tag</Label>
              <Select 
                value={config.variable} 
                onValueChange={(value) => setConfig(prev => prev ? { ...prev, variable: value } : null)}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select variable..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {selectedDataSource.variables.map(variable => (
                    <SelectItem key={variable} value={variable}>
                      {variable}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Color Picker */}
          <div>
            <Label className="text-slate-300">Chart Color</Label>
            <div className="flex items-center space-x-2">
              <div
                className="w-8 h-8 rounded border border-slate-600 cursor-pointer"
                style={{ backgroundColor: config.color }}
                onClick={() => setShowColorPicker(!showColorPicker)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="bg-slate-800 border-slate-600 text-slate-300"
              >
                <Palette className="h-4 w-4 mr-1" />
                Choose Color
              </Button>
            </div>
            
            {showColorPicker && (
              <div className="mt-2">
                <SketchPicker
                  color={config.color}
                  onChange={(color) => setConfig(prev => prev ? { ...prev, color: color.hex } : null)}
                  disableAlpha
                />
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose} className="bg-slate-800 border-slate-600 text-slate-300">
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-700">
              Save Widget
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Main Interactive Dashboard Editor
export function InteractiveDashboardEditor() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null)
  const [layouts, setLayouts] = useState<any>({})
  const [selectedDataPoint, setSelectedDataPoint] = useState<any>(null)
  const [statsPopupOpen, setStatsPopupOpen] = useState(false)

  // Load saved configuration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hercules-dashboard-widgets')
    if (saved) {
      try {
        const config = JSON.parse(saved)
        setWidgets(config.widgets || [])
        setLayouts(config.layouts || {})
      } catch (error) {
        
      }
    }
  }, [])

  // Save to localStorage
  const saveToLocalStorage = useCallback(() => {
    const config = { widgets, layouts, lastSaved: new Date().toISOString() }
    localStorage.setItem('hercules-dashboard-widgets', JSON.stringify(config))
    toast({
      title: "Dashboard Saved",
      description: "Configuration saved successfully"
    })
  }, [widgets, layouts, toast])

  // Enhanced positioning algorithm for sequential placement
  const findNextAvailablePosition = useCallback((widgets: WidgetConfig[], newWidth = 4, newHeight = 3) => {
    const gridCols = 12
    
    if (widgets.length === 0) {
      return { x: 0, y: 0 }
    }
    
    // Strategy 1: Try to place next to the most recent widget (same row)
    const lastWidget = widgets[widgets.length - 1]
    if (lastWidget) {
      const { x: lastX, y: lastY, w: lastW, h: lastH } = lastWidget.layout
      const nextX = lastX + lastW
      
      // Check if we can fit in the same row
      if (nextX + newWidth <= gridCols) {
        // Verify no collision with existing widgets
        let canPlace = true
        for (const widget of widgets) {
          const { x, y, w, h } = widget.layout
          // Check for overlap
          if (!(nextX >= x + w || nextX + newWidth <= x || lastY >= y + h || lastY + newHeight <= y)) {
            canPlace = false
            break
          }
        }
        
        if (canPlace) {
          return { x: nextX, y: lastY }
        }
      }
    }
    
    // Strategy 2: Create a grid map and find the next available position
    const maxY = Math.max(...widgets.map(w => w.layout.y + w.layout.h)) + 2
    const grid = Array(maxY + newHeight).fill(null).map(() => Array(gridCols).fill(false))
    
    // Mark occupied spaces
    widgets.forEach(widget => {
      const { x, y, w, h } = widget.layout
      for (let row = y; row < y + h; row++) {
        for (let col = x; col < x + w; col++) {
          if (row < grid.length && col < gridCols) {
            grid[row][col] = true
          }
        }
      }
    })
    
    // Find the first available position scanning left-to-right, top-to-bottom
    for (let y = 0; y <= maxY; y++) {
      for (let x = 0; x <= gridCols - newWidth; x++) {
        let canPlace = true
        
        // Check if the area is clear
        for (let row = y; row < y + newHeight && canPlace; row++) {
          for (let col = x; col < x + newWidth && canPlace; col++) {
            if (row >= grid.length || grid[row][col]) {
              canPlace = false
            }
          }
        }
        
        if (canPlace) {
          return { x, y }
        }
      }
    }
    
    // Strategy 3: If no space found, place in a new row
    const maxYPosition = Math.max(0, ...widgets.map(w => w.layout.y + w.layout.h))
    return { x: 0, y: maxYPosition }
  }, [])

  // Add new widget with smart positioning and better defaults
  const addWidget = useCallback(() => {
    const defaultWidth = 4  // Professional default width
    const defaultHeight = 3 // Professional default height
    const nextPosition = findNextAvailablePosition(widgets, defaultWidth, defaultHeight)
    
    const widgetId = `widget_${Date.now()}`
    const newWidget: WidgetConfig = {
      id: widgetId,
      title: 'New Chart Widget',
      chartType: 'line',
      dataSource: 'Database',
      variable: '',
      color: '#00bcd4',
      layout: { 
        i: widgetId, 
        x: nextPosition.x, 
        y: nextPosition.y, 
        w: defaultWidth, 
        h: defaultHeight
      }
    }
    setWidgets(prev => [...prev, newWidget])
    setEditingWidget(newWidget)
  }, [widgets, findNextAvailablePosition])

  // Edit widget
  const editWidget = useCallback((widget: WidgetConfig) => {
    setEditingWidget(widget)
  }, [])

  // Handle data point click for statistics popup
  const handleDataPointClick = useCallback((dataPoint: any, chartType: string) => {
    setSelectedDataPoint({ ...dataPoint, chartType })
    setStatsPopupOpen(true)
  }, [])

  // Save widget changes with layout preservation
  const saveWidget = useCallback((updatedWidget: WidgetConfig) => {
    setWidgets(prev => prev.map(w => {
      if (w.id === updatedWidget.id) {
        // Preserve the current layout position when updating widget config
        return { 
          ...updatedWidget, 
          layout: w.layout // Keep existing layout position
        }
      }
      return w
    }))
    toast({
      title: "Widget Updated",
      description: "Chart configuration saved"
    })
  }, [toast])

  // Delete widget with confirmation
  const deleteWidget = useCallback((id: string) => {
    // Debug log
    setWidgets(prev => {
      const filtered = prev.filter(w => w.id !== id)
      // Debug log
      return filtered
    })
    toast({
      title: "Widget Deleted",
      description: "Chart removed from dashboard"
    })
  }, [toast])

  // Handle layout changes with collision detection
  const handleLayoutChange = useCallback((layout: any, allLayouts: any) => {
    setLayouts(allLayouts)
    
    // Update widget layouts with proper collision handling
    setWidgets(prev => prev.map(widget => {
      const layoutItem = layout.find((l: any) => l.i === widget.id)
      if (layoutItem) {
        // Ensure the layout item has valid bounds
        const validatedLayout = {
          ...layoutItem,
          x: Math.max(0, Math.min(layoutItem.x, 12 - layoutItem.w)),
          y: Math.max(0, layoutItem.y),
          w: Math.max(2, Math.min(layoutItem.w, 12)),
          h: Math.max(2, layoutItem.h)
        }
        return { ...widget, layout: validatedLayout }
      }
      return widget
    }))
  }, [])

  // Export configuration
  const exportConfig = useCallback(() => {
    const config = { widgets, layouts, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dashboard-config-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    
    toast({
      title: "Configuration Exported",
      description: "Dashboard exported successfully"
    })
  }, [widgets, layouts, toast])

  // Import configuration
  const importConfig = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string)
        setWidgets(config.widgets || [])
        setLayouts(config.layouts || {})
        toast({
          title: "Configuration Imported",
          description: "Dashboard loaded successfully"
        })
      } catch (error) {
        toast({
          title: "Import Failed",
          description: "Invalid configuration file",
          variant: "destructive"
        })
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [toast])

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 
                    relative overflow-hidden">
      
      {/* Animated Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Matrix Grid */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div className="w-full h-full" 
               style={{
                 backgroundImage: `linear-gradient(rgba(0,188,212,0.3) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(0,188,212,0.3) 1px, transparent 1px)`,
                 backgroundSize: '50px 50px'
               }}>
          </div>
        </div>
        
        {/* Floating Particles */}
        <div className="absolute inset-0">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-pulse opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Enhanced Toolbar with Water Management Theme */}
      <div className="h-16 bg-gradient-to-r from-slate-900/95 via-slate-800/90 to-slate-900/95 
                      border-b border-cyan-500/30 backdrop-blur-sm flex items-center justify-between px-6
                      shadow-lg shadow-cyan-500/10 relative z-10">
        
        {/* Scanning Line Animation */}
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent
                        animate-[scanning_4s_ease-in-out_infinite] opacity-60"></div>
        
        <div className="flex items-center space-x-6">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg 
                            flex items-center justify-center shadow-lg shadow-cyan-500/30 transform hover:scale-105 transition-transform">
              <Plus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-cyan-100 tracking-wide text-shadow-sm">
                Interactive Dashboard Editor
              </h1>
              <div className="text-xs text-cyan-300/70 font-medium">
                Water Management System Theme
              </div>
            </div>
          </div>
          
          {/* Primary Action */}
          <button
            onClick={addWidget}
            className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 
                       hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all duration-300 
                       shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/40 border border-cyan-400/30
                       transform hover:scale-105 font-medium tracking-wide"
          >
            <Plus className="h-4 w-4" />
            <span>Add Chart Widget</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Save Controls */}
          <button
            onClick={saveToLocalStorage}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 
                       hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-all duration-300 
                       shadow-lg shadow-green-500/30 hover:shadow-green-400/40 border border-green-400/30 font-medium"
          >
            <Save className="h-4 w-4" />
            <span>Save</span>
          </button>
          
          {/* Export/Import Controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={exportConfig}
              className="p-2.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 
                         rounded-lg transition-all duration-300 border border-cyan-400/30 hover:border-cyan-300/50
                         shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 backdrop-blur-sm"
              title="Export Configuration"
            >
              <Download className="h-4 w-4" />
            </button>
            
            <label className="p-2.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 
                              rounded-lg transition-all duration-300 border border-cyan-400/30 hover:border-cyan-300/50
                              shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 backdrop-blur-sm cursor-pointer" 
                   title="Import Configuration">
              <Upload className="h-4 w-4" />
              <input
                type="file"
                accept=".json"
                onChange={importConfig}
                className="hidden"
              />
            </label>
          </div>
          
          {/* Widget Counter */}
          <div className="flex items-center space-x-2 px-3 py-2 bg-slate-800/50 border border-slate-600/50 
                          rounded-lg backdrop-blur-sm">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-cyan-200 font-medium">
              {widgets.length} widgets
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Grid Layout with Hover Boundaries */}
      <div className="flex-1 p-8 overflow-auto relative">
        {widgets.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center relative">
              {/* Animated background ring */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-32 h-32 border-2 border-cyan-500/20 rounded-full animate-spin-slow"></div>
                <div className="absolute w-24 h-24 border border-cyan-400/30 rounded-full animate-pulse"></div>
              </div>
              
              <div className="relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-full 
                                flex items-center justify-center mx-auto mb-6 shadow-lg shadow-cyan-500/20
                                border border-cyan-500/30 backdrop-blur-sm">
                  <Plus className="w-8 h-8 text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold text-cyan-100 mb-2 tracking-wide">No Charts Added</h3>
                <p className="text-cyan-300/70 mb-6 max-w-md mx-auto leading-relaxed">
                  Start building your dashboard by adding interactive chart widgets with real-time data visualization
                </p>
                <button
                  onClick={addWidget}
                  className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 
                             hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all duration-300 
                             shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/40 border border-cyan-400/30
                             transform hover:scale-105 font-medium tracking-wide mx-auto"
                >
                  <Plus className="h-5 w-5" />
                  <span>Add Your First Chart</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Grid Background Pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-5">
              <div className="w-full h-full" 
                   style={{
                     backgroundImage: `linear-gradient(rgba(0,188,212,0.3) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(0,188,212,0.3) 1px, transparent 1px)`,
                     backgroundSize: '60px 60px'
                   }}>
              </div>
            </div>
            
            <ResponsiveGridLayout
              className="layout"
              layouts={layouts}
              onLayoutChange={handleLayoutChange}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={80}
              isDraggable={true}
              isResizable={true}
              useCSSTransforms={true}
              margin={[16, 16]}
              containerPadding={[16, 16]}
              compactType={null}
              preventCollision={true}
              autoSize={true}
              verticalCompact={false}
              onDragStart={(layout, oldItem, newItem, placeholder, e, element) => {
                // Prevent drag when clicking on control buttons
                const target = e.target as HTMLElement
                if (target.closest('button')) {
                  return false
                }
              }}
            >
              {widgets.map((widget) => (
                <div key={widget.id} className="transform-gpu">
                  <ChartWidget
                    config={widget}
                    onEdit={() => editWidget(widget)}
                    onDelete={() => deleteWidget(widget.id)}
                    onDataPointClick={handleDataPointClick}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          </div>
        )}
      </div>

      {/* Enhanced Widget Configuration Dialog */}
      <WidgetConfigDialog
        widget={editingWidget}
        isOpen={!!editingWidget}
        onClose={() => setEditingWidget(null)}
        onSave={saveWidget}
      />

      {/* Statistics Popup Dialog */}
      <Dialog open={statsPopupOpen} onOpenChange={setStatsPopupOpen}>
        <DialogContent className="max-w-md bg-slate-900/95 border border-cyan-500/30 backdrop-blur-lg">
          <DialogHeader>
            <DialogTitle className="text-cyan-100 flex items-center space-x-2">
              {selectedDataPoint?.chartType === 'line' && <TrendingUp className="h-5 w-5 text-cyan-400" />}
              {selectedDataPoint?.chartType === 'bar' && <BarChart3 className="h-5 w-5 text-cyan-400" />}
              {selectedDataPoint?.chartType === 'scatter' && <Activity className="h-5 w-5 text-cyan-400" />}
              {selectedDataPoint?.chartType === 'pie' && <BarChart3 className="h-5 w-5 text-cyan-400" />}
              <span>Data Point Statistics</span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedDataPoint && (
            <div className="space-y-4 pt-4">
              {/* Chart Information */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <h3 className="text-cyan-300 font-medium mb-3 flex items-center space-x-2">
                  <Database className="h-4 w-4" />
                  <span>Chart Information</span>
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">Chart:</span>
                    <div className="text-cyan-100 font-medium">{selectedDataPoint.chartTitle}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Source:</span>
                    <div className="text-cyan-100 font-medium">{selectedDataPoint.dataSource}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Variable:</span>
                    <div className="text-cyan-100 font-medium">{selectedDataPoint.variable || 'flow_rate_sensor'}</div>
                  </div>
                </div>
              </div>

              {/* Data Point Details */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <h3 className="text-cyan-300 font-medium mb-3 flex items-center space-x-2">
                  <Activity className="h-4 w-4" />
                  <span>Data Point Details</span>
                </h3>
                <div className="space-y-2 text-sm">
                  {selectedDataPoint.chartType !== 'pie' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">X-Axis Value:</span>
                        <span className="text-cyan-100 font-medium">{selectedDataPoint.x || selectedDataPoint.pointIndex + 1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Y-Axis Value:</span>
                        <span className="text-cyan-100 font-medium">{selectedDataPoint.y || selectedDataPoint.value}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Time Stamp:</span>
                        <span className="text-cyan-100 font-medium">{selectedDataPoint.time || `${String((selectedDataPoint.pointIndex || 0) + 1).padStart(2, '0')}:00`}</span>
                      </div>
                    </>
                  )}
                  {selectedDataPoint.chartType === 'pie' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Value:</span>
                        <span className="text-cyan-100 font-medium">{selectedDataPoint.value}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Percentage:</span>
                        <span className="text-cyan-100 font-medium">{selectedDataPoint.percentage}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total:</span>
                        <span className="text-cyan-100 font-medium">{selectedDataPoint.total?.toFixed(1)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <h3 className="text-cyan-300 font-medium mb-3">Metadata</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Chart Type:</span>
                    <span className="text-cyan-100 font-medium capitalize">{selectedDataPoint.chartType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Timestamp:</span>
                    <span className="text-cyan-100 font-medium">{new Date().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-green-400 font-medium flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Live Data</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStatsPopupOpen(false)}
                  className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}