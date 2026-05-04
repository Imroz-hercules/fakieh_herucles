import React from 'react'
import { Grid3x3, LayoutGrid, Maximize } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GridLayoutSelectorProps {
  value: 'auto' | '2x2' | '3x3' | '4x4' | 'custom'
  onChange: (layout: 'auto' | '2x2' | '3x3' | '4x4' | 'custom') => void
}

const LAYOUT_OPTIONS = [
  {
    id: 'auto' as const,
    label: 'Auto Layout',
    description: 'Automatic responsive grid',
    icon: <LayoutGrid size={16} />,
    gridClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  },
  {
    id: '2x2' as const,
    label: '2×2 Grid',
    description: '4 widgets in 2x2 layout',
    icon: <Grid3x3 size={16} />,
    gridClass: 'grid-cols-2'
  },
  {
    id: '3x3' as const,
    label: '3×3 Grid',
    description: '9 widgets in 3x3 layout',
    icon: <Grid3x3 size={16} />,
    gridClass: 'grid-cols-3'
  },
  {
    id: '4x4' as const,
    label: '4×4 Grid',
    description: '16 widgets in 4x4 layout',
    icon: <Grid3x3 size={16} />,
    gridClass: 'grid-cols-4'
  },
  {
    id: 'custom' as const,
    label: 'Custom',
    description: 'Free-form positioning',
    icon: <Maximize size={16} />,
    gridClass: 'grid-cols-1'
  }
]

export function GridLayoutSelector({ value, onChange }: GridLayoutSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-300">
        Grid Layout
      </label>
      
      <div className="grid grid-cols-1 gap-2">
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
              value === option.id
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-slate-600/50 hover:bg-slate-700/50'
            )}
          >
            {option.icon}
            <div className="flex-1">
              <div className="font-medium">{option.label}</div>
              <div className="text-xs opacity-70">{option.description}</div>
            </div>
            
            {/* Visual grid preview */}
            <div className="w-8 h-8 relative">
              <div className={cn(
                'grid gap-0.5 w-full h-full',
                option.id === 'auto' ? 'grid-cols-3' :
                option.id === '2x2' ? 'grid-cols-2' :
                option.id === '3x3' ? 'grid-cols-3' :
                option.id === '4x4' ? 'grid-cols-4' :
                'grid-cols-1'
              )}>
                {Array.from({ 
                  length: option.id === 'auto' ? 6 :
                         option.id === '2x2' ? 4 :
                         option.id === '3x3' ? 9 :
                         option.id === '4x4' ? 16 : 1 
                }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-sm',
                      value === option.id ? 'bg-cyan-400/60' : 'bg-slate-600/60'
                    )}
                  />
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
      
      <div className="text-xs text-slate-500 mt-2">
        {value === 'auto' && 'Widgets automatically arrange based on screen size'}
        {value === '2x2' && 'Fixed 2×2 grid with 4 equal-sized widgets'}
        {value === '3x3' && 'Fixed 3×3 grid with 9 equal-sized widgets'}
        {value === '4x4' && 'Fixed 4×4 grid with 16 equal-sized widgets'}
        {value === 'custom' && 'Drag and position widgets freely'}
      </div>
    </div>
  )
}