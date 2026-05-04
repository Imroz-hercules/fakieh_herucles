import React from 'react'
import { Target, BarChart3, TrendingUp, Grid3x3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DisplayModeSelectorProps {
  widgetType: 'kpi' | 'chart' | 'gauge' | 'network' | 'table' | 'custom'
  value: 'single' | 'multiple' | 'xy-chart' | 'trend'
  onChange: (mode: 'single' | 'multiple' | 'xy-chart' | 'trend') => void
}

const DISPLAY_MODES = {
  kpi: [
    {
      id: 'single' as const,
      label: 'Single Value',
      description: 'Display one metric value',
      icon: <Target size={16} />
    },
    {
      id: 'multiple' as const,
      label: 'Multiple Values',
      description: 'Display multiple metrics',
      icon: <Grid3x3 size={16} />
    }
  ],
  chart: [
    {
      id: 'single' as const,
      label: 'Single Series',
      description: 'One data series over time',
      icon: <TrendingUp size={16} />
    },
    {
      id: 'multiple' as const,
      label: 'Multiple Series',
      description: 'Multiple data series',
      icon: <BarChart3 size={16} />
    },
    {
      id: 'xy-chart' as const,
      label: 'X-Y Chart',
      description: 'Two-axis correlation chart',
      icon: <BarChart3 size={16} />
    },
    {
      id: 'trend' as const,
      label: 'Trend Analysis',
      description: 'Time-based trend visualization',
      icon: <TrendingUp size={16} />
    }
  ],
  gauge: [
    {
      id: 'single' as const,
      label: 'Single Gauge',
      description: 'One circular gauge',
      icon: <Target size={16} />
    },
    {
      id: 'multiple' as const,
      label: 'Multiple Gauges',
      description: 'Multiple gauge display',
      icon: <Grid3x3 size={16} />
    }
  ],
  network: [
    {
      id: 'single' as const,
      label: 'Node View',
      description: 'Individual node focus',
      icon: <Target size={16} />
    },
    {
      id: 'multiple' as const,
      label: 'Network View',
      description: 'Full network topology',
      icon: <Grid3x3 size={16} />
    }
  ],
  table: [
    {
      id: 'single' as const,
      label: 'Simple Table',
      description: 'Basic data table',
      icon: <Grid3x3 size={16} />
    },
    {
      id: 'multiple' as const,
      label: 'Advanced Table',
      description: 'Table with grouping/filtering',
      icon: <BarChart3 size={16} />
    }
  ],
  custom: [
    {
      id: 'single' as const,
      label: 'Single Display',
      description: 'One custom visualization',
      icon: <Target size={16} />
    },
    {
      id: 'multiple' as const,
      label: 'Multiple Display',
      description: 'Multiple custom elements',
      icon: <Grid3x3 size={16} />
    }
  ]
}

export function DisplayModeSelector({ widgetType, value, onChange }: DisplayModeSelectorProps) {
  const availableModes = DISPLAY_MODES[widgetType] || DISPLAY_MODES.custom

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-3">
        Display Mode
      </label>

      <div className="space-y-2">
        {availableModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            className={cn(
              'w-full p-3 rounded-lg border transition-all duration-200 text-left',
              value === mode.id
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                : 'border-slate-700/50 bg-slate-800/30 text-slate-300 hover:border-slate-600/50 hover:bg-slate-700/30'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex-shrink-0 mt-0.5',
                value === mode.id ? 'text-cyan-400' : 'text-slate-400'
              )}>
                {mode.icon}
              </div>
              <div className="flex-1">
                <div className="font-medium mb-1">{mode.label}</div>
                <div className="text-sm text-slate-500">{mode.description}</div>
              </div>
              {value === mode.id && (
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Mode-specific help text */}
      <div className="mt-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="text-xs text-slate-400">
          {value === 'single' && 'Monitor one primary value or metric'}
          {value === 'multiple' && 'Display several related values together'}
          {value === 'xy-chart' && 'Show relationship between two variables'}
          {value === 'trend' && 'Visualize data changes over time'}
        </div>
      </div>
    </div>
  )
}