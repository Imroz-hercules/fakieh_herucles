import React from 'react'
import { BarChart3, Gauge, PieChart, Network, Table, Zap, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'network' | 'table' | 'custom'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: {
    dataSource?: string
    valueField?: string
    chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter'
    displayMode?: 'single' | 'multiple' | 'xy-chart' | 'trend'
  }
}

interface WidgetLibraryProps {
  onAddWidget: (widgetType: Widget['type']) => void
  onClose: () => void
  isOpen: boolean
}

const WIDGET_TEMPLATES = [
  {
    type: 'kpi' as const,
    title: 'KPI Widget',
    description: 'Display key performance indicators with sparklines',
    icon: <BarChart3 size={24} />,
    color: 'cyan',
    defaultConfig: {
      displayMode: 'single' as const,
      dataSource: 'database_values'
    }
  },
  {
    type: 'chart' as const,
    title: 'Chart Widget',
    description: 'Interactive charts for data visualization',
    icon: <PieChart size={24} />,
    color: 'green',
    defaultConfig: {
      chartType: 'line' as const,
      displayMode: 'single' as const,
      dataSource: 'database_values'
    }
  },
  {
    type: 'gauge' as const,
    title: 'Gauge Widget',
    description: 'Circular progress indicators and meters',
    icon: <Gauge size={24} />,
    color: 'yellow',
    defaultConfig: {
      displayMode: 'single' as const,
      dataSource: 'database_values'
    }
  },
  {
    type: 'network' as const,
    title: 'Network Widget',
    description: 'Network topology and connection monitoring',
    icon: <Network size={24} />,
    color: 'purple',
    defaultConfig: {
      displayMode: 'multiple' as const,
      dataSource: 'facilities'
    }
  },
  {
    type: 'table' as const,
    title: 'Data Table',
    description: 'Tabular data display with sorting and filtering',
    icon: <Table size={24} />,
    color: 'blue',
    defaultConfig: {
      displayMode: 'multiple' as const,
      dataSource: 'database_values'
    }
  },
  {
    type: 'custom' as const,
    title: 'Custom Widget',
    description: 'Build your own custom visualization',
    icon: <Zap size={24} />,
    color: 'orange',
    defaultConfig: {
      displayMode: 'single' as const,
      dataSource: 'database_values'
    }
  }
]

export function WidgetLibrary({ onAddWidget, onClose, isOpen }: WidgetLibraryProps) {
  if (!isOpen) return null

  const getColorClasses = (color: string) => {
    const colorMap = {
      cyan: 'border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400',
      green: 'border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-400',
      yellow: 'border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400',
      purple: 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400',
      blue: 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400',
      orange: 'border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400'
    }
    return colorMap[color as keyof typeof colorMap] || colorMap.cyan
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-200">Widget Library</h2>
            <p className="text-sm text-slate-400 mt-1">Add widgets to your dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Widget Grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WIDGET_TEMPLATES.map((template) => (
              <button
                key={template.type}
                onClick={() => {
                  onAddWidget(template.type)
                  onClose()
                }}
                className={cn(
                  'p-6 rounded-lg border-2 transition-all duration-200 text-left hover:scale-105',
                  getColorClasses(template.color)
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  {template.icon}
                  <h3 className="font-semibold">{template.title}</h3>
                </div>
                <p className="text-sm opacity-80">{template.description}</p>
                
                {/* Preview indicators */}
                <div className="mt-4 flex items-center gap-2 text-xs opacity-60">
                  <span>•</span>
                  <span>Real-time data</span>
                  <span>•</span>
                  <span>Customizable</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <div>
              <span className="text-cyan-400">{WIDGET_TEMPLATES.length}</span> widget types available
            </div>
            <div className="flex items-center gap-4">
              <span>More widgets coming soon</span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}