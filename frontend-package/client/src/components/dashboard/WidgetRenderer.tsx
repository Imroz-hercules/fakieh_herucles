import React from 'react'
import { Target, BarChart3, Gauge, Monitor, Table, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    thresholds?: Array<{ value: number; color: string; label: string }>
  }
  data?: any[]
}

interface WidgetRendererProps {
  widget: Widget
}

export function WidgetRenderer({ widget }: WidgetRendererProps) {
  const renderKPIWidget = () => (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-cyan-400" />
        <h3 className="font-semibold text-slate-200 truncate">{widget.title}</h3>
      </div>
      
      <div className="flex-1 flex flex-col justify-center">
        {widget.config.displayMode === 'multiple' ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-2xl font-mono font-bold text-cyan-400">94.7</div>
              <div className="text-xs text-slate-400">Performance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-mono font-bold text-green-400">98.2</div>
              <div className="text-xs text-slate-400">Efficiency</div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-3xl font-mono font-bold text-cyan-400 mb-1">87.3</div>
            <div className="text-sm text-slate-400">{widget.config.valueField || 'Value'}</div>
            <div className="text-xs text-green-400 mt-1">+2.3% ↗</div>
          </div>
        )}
      </div>

      {/* Threshold indicators */}
      {widget.config.thresholds && widget.config.thresholds.length > 0 && (
        <div className="mt-3 flex h-2 rounded overflow-hidden">
          {widget.config.thresholds.map((threshold, index) => (
            <div
              key={index}
              className="flex-1"
              style={{ backgroundColor: threshold.color }}
              title={threshold.label}
            />
          ))}
        </div>
      )}
    </div>
  )

  const renderChartWidget = () => (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={16} className="text-cyan-400" />
        <h3 className="font-semibold text-slate-200 truncate">{widget.title}</h3>
      </div>

      <div className="flex-1 relative bg-slate-800/30 rounded border border-slate-700/50">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 size={48} className="text-slate-600 mx-auto mb-2" />
            <div className="text-sm text-slate-500">
              {widget.config.chartType || 'Line'} Chart
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {widget.config.displayMode === 'xy-chart' 
                ? `${widget.config.xAxisField || 'X'} vs ${widget.config.yAxisField || 'Y'}`
                : `${widget.config.valueField || 'Data'} visualization`
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderGaugeWidget = () => (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={16} className="text-cyan-400" />
        <h3 className="font-semibold text-slate-200 truncate">{widget.title}</h3>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {widget.config.displayMode === 'multiple' ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="relative">
                <svg width="80" height="80" className="transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="30"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="30"
                    stroke="#00ffff"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={`${(87 * 188.5) / 100} 188.5`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-sm font-bold text-cyan-400">87%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative">
            <svg width="120" height="120" className="transform -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="45"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="60"
                cy="60"
                r="45"
                stroke="#00ffff"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={`${(87 * 282.7) / 100} 282.7`}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">87%</div>
                <div className="text-xs text-slate-400">{widget.config.valueField || 'Value'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderNetworkWidget = () => (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Monitor size={16} className="text-cyan-400" />
        <h3 className="font-semibold text-slate-200 truncate">{widget.title}</h3>
      </div>

      <div className="flex-1 relative bg-slate-800/30 rounded border border-slate-700/50">
        <div className="absolute inset-4">
          {/* Network nodes */}
          <div className="relative h-full">
            <div className="absolute top-4 left-4 w-3 h-3 bg-green-400 rounded-full shadow-lg shadow-green-400/50"></div>
            <div className="absolute top-4 right-4 w-3 h-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-400/50"></div>
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-orange-400 rounded-full shadow-lg shadow-orange-400/50"></div>
            
            {/* Connection lines */}
            <svg className="absolute inset-0 w-full h-full">
              <line x1="16" y1="16" x2="80%" y2="16" stroke="#00ffff" strokeWidth="1" opacity="0.5" />
              <line x1="16" y1="16" x2="50%" y2="80%" stroke="#00ffff" strokeWidth="1" opacity="0.5" />
              <line x1="80%" y1="16" x2="50%" y2="80%" stroke="#00ffff" strokeWidth="1" opacity="0.5" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )

  const renderTableWidget = () => (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Table size={16} className="text-cyan-400" />
        <h3 className="font-semibold text-slate-200 truncate">{widget.title}</h3>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="border border-slate-700/50 rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 text-left text-slate-300 border-b border-slate-700/50">Item</th>
                <th className="px-3 py-2 text-left text-slate-300 border-b border-slate-700/50">Value</th>
                <th className="px-3 py-2 text-left text-slate-300 border-b border-slate-700/50">Status</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-slate-700/30">
                  <td className="px-3 py-2 text-slate-300">Item {i}</td>
                  <td className="px-3 py-2 text-slate-400">{Math.floor(Math.random() * 100)}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'px-2 py-1 rounded text-xs',
                      i % 3 === 0 ? 'bg-green-500/20 text-green-400' : 'bg-cyan-500/20 text-cyan-400'
                    )}>
                      {i % 3 === 0 ? 'Good' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const renderCustomWidget = () => (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} className="text-cyan-400" />
        <h3 className="font-semibold text-slate-200 truncate">{widget.title}</h3>
      </div>

      <div className="flex-1 flex items-center justify-center bg-slate-800/30 rounded border border-slate-700/50">
        <div className="text-center">
          <Zap size={32} className="text-slate-600 mx-auto mb-2" />
          <div className="text-sm text-slate-500">Custom Widget</div>
          <div className="text-xs text-slate-600 mt-1">Configure to add functionality</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600/70 transition-colors">
      {widget.type === 'kpi' && renderKPIWidget()}
      {widget.type === 'chart' && renderChartWidget()}
      {widget.type === 'gauge' && renderGaugeWidget()}
      {widget.type === 'network' && renderNetworkWidget()}
      {widget.type === 'table' && renderTableWidget()}
      {widget.type === 'custom' && renderCustomWidget()}
    </div>
  )
}