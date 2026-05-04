import React from 'react'
import { Database, Building2, BarChart3, AlertTriangle, Zap, Droplets, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataSourceSelectorProps {
  value: string
  onChange: (dataSource: string) => void
}

const DATA_SOURCES = [
  { id: 'database_values', label: 'Database Values', icon: <Database size={16} /> },
  { id: 'facilities', label: 'Facilities', icon: <Building2 size={16} /> },
  { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={16} /> },
  { id: 'alerts', label: 'Alerts', icon: <AlertTriangle size={16} /> },
  { id: 'energy', label: 'Energy', icon: <Zap size={16} /> },
  { id: 'quality', label: 'Water Quality', icon: <Droplets size={16} /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={16} /> }
]

export function DataSourceSelector({ value, onChange }: DataSourceSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DATA_SOURCES.map((source) => (
        <button
          key={source.id}
          onClick={() => onChange(source.id)}
          className={cn(
            'flex items-center gap-2 p-3 rounded-lg border text-sm transition-all',
            value === source.id
              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
              : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-slate-600/50 hover:bg-slate-700/50'
          )}
        >
          {source.icon}
          <span className="font-medium">{source.label}</span>
        </button>
      ))}
    </div>
  )
}