import React, { useState } from 'react'
import { X, Settings, Palette, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataSelector } from './DataSelector'

interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'network' | 'table' | 'custom'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: {
    dataSource?: string
    valueField?: string
    xAxisField?: string
    yAxisField?: string
    chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter'
    refreshInterval?: number
    thresholds?: Array<{ value: number; color: string; label: string }>
    displayMode?: 'single' | 'multiple' | 'xy-chart' | 'trend' | 'dual'
    filters?: Record<string, any>
  }
  data?: any[]
}

interface WidgetConfigPanelProps {
  widget: Widget | null
  onClose: () => void
  onUpdate: (widget: Widget) => void
  isOpen: boolean
}

export function WidgetConfigPanel({ widget, onClose, onUpdate, isOpen }: WidgetConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'data' | 'appearance'>('general')

  if (!widget || !isOpen) return null

  const handleConfigUpdate = (configUpdates: Partial<Widget['config']>) => {
    onUpdate({
      ...widget,
      config: { ...widget.config, ...configUpdates }
    })
  }

  const handleTitleUpdate = (title: string) => {
    onUpdate({ ...widget, title })
  }

  // Helper functions for new DataSelector
  const getSelectedValues = (): string[] => {
    const values = []
    if (widget.config.valueField) {
      if (widget.config.valueField.includes(',')) {
        values.push(...widget.config.valueField.split(','))
      } else {
        values.push(widget.config.valueField)
      }
    }
    if (widget.config.yAxisField && widget.type === 'gauge' && widget.config.displayMode === 'dual') {
      values.push(widget.config.yAxisField)
    }
    return values.filter(Boolean)
  }

  const getSelectionMode = (): 'single' | 'dual' | 'multiple' => {
    if (widget.type === 'gauge' && widget.config.displayMode === 'dual') return 'dual'
    if (widget.type === 'chart' || widget.type === 'table' || widget.config.displayMode === 'multiple') return 'multiple'
    return 'single'
  }

  const getDataSelectorTitle = (): string => {
    if (widget.type === 'gauge' && widget.config.displayMode === 'dual') return 'Select Primary & Secondary Values'
    if (widget.type === 'chart') return 'Select Chart Data'
    if (widget.type === 'table') return 'Select Table Columns'
    if (widget.type === 'kpi') return 'Select KPI Metric'
    return 'Select Data Source'
  }

  const handleDataSelection = (values: string[]) => {
    const updates: Partial<Widget['config']> = { dataSource: 'database_values' }
    
    if (widget.type === 'gauge' && widget.config.displayMode === 'dual') {
      // Dual gauge mode: first value is primary, second is secondary
      if (values.length > 0) updates.valueField = values[0]
      if (values.length > 1) updates.yAxisField = values[1]
    } else if (widget.config.displayMode === 'multiple' || widget.type === 'chart' || widget.type === 'table') {
      // Multiple values joined with comma
      updates.valueField = values.join(',')
    } else {
      // Single value mode
      if (values.length > 0) updates.valueField = values[0]
    }
    
    handleConfigUpdate(updates)
  }

  const tabs = [
    { id: 'general', label: 'General', icon: <Settings size={16} /> },
    { id: 'data', label: 'Data', icon: <Database size={16} /> },
    { id: 'appearance', label: 'Style', icon: <Palette size={16} /> }
  ]

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-slate-900/95 border-l border-slate-700/50 backdrop-blur-sm z-50 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <h3 className="text-lg font-semibold text-slate-200">Widget Settings</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700/50 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-cyan-400 border-b-2 border-cyan-500 bg-slate-800/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Widget Title
              </label>
              <input
                type="text"
                value={widget.title}
                onChange={(e) => handleTitleUpdate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                placeholder="Enter widget title..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Widget Type
              </label>
              <div className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-400">
                {widget.type.charAt(0).toUpperCase() + widget.type.slice(1)}
              </div>
            </div>

            {widget.type === 'chart' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Chart Type
                </label>
                <select
                  value={widget.config.chartType || 'line'}
                  onChange={(e) => handleConfigUpdate({ chartType: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="area">Area Chart</option>
                  <option value="pie">Pie Chart</option>
                  <option value="donut">Donut Chart</option>
                  <option value="scatter">Scatter Plot</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Display Mode
              </label>
              <select
                value={widget.config.displayMode || 'single'}
                onChange={(e) => handleConfigUpdate({ displayMode: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="single">Single Value</option>
                <option value="multiple">Multiple Values</option>
                {widget.type === 'gauge' && <option value="dual">Dual Value Gauge</option>}
                <option value="xy-chart">XY Chart</option>
                <option value="trend">Trend Analysis</option>
              </select>
              {widget.type === 'gauge' && widget.config.displayMode === 'dual' && (
                <div className="mt-2 text-xs text-cyan-400 bg-cyan-500/10 p-2 rounded">
                  💡 Dual gauges show two values side-by-side with independent scales
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Refresh Interval (seconds)
              </label>
              <input
                type="number"
                value={widget.config.refreshInterval || 30}
                onChange={(e) => handleConfigUpdate({ refreshInterval: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                min="5"
                max="300"
              />
            </div>
          </div>
        )}

        {activeTab === 'data' && widget.type !== 'network' && (
          <DataSelector
            selectedValues={getSelectedValues()}
            onSelectionChange={handleDataSelection}
            mode={getSelectionMode()}
            title={getDataSelectorTitle()}
            maxSelections={widget.type === 'table' ? 10 : widget.type === 'chart' ? 5 : 2}
          />
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button className="p-3 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-400">
                  Cyberpunk
                </button>
                <button className="p-3 rounded-lg border border-slate-600/50 bg-slate-800/50 text-slate-400">
                  Industrial
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Color Scheme
              </label>
              <div className="flex gap-2">
                {['#00ffff', '#00ff88', '#ffff00', '#ff6b6b', '#a78bfa'].map((color) => (
                  <button
                    key={color}
                    className="w-8 h-8 rounded border border-slate-600/50"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Animation Level
              </label>
              <select className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500">
                <option value="high">High (Full Effects)</option>
                <option value="medium">Medium (Reduced)</option>
                <option value="low">Low (Minimal)</option>
                <option value="none">None (Static)</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}