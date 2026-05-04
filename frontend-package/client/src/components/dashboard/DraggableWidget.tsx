import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Settings, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardWidget } from './DashboardWidgets'

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
    displayMode?: 'single' | 'multiple' | 'xy-chart' | 'trend'
    filters?: Record<string, any>
  }
  data?: any[]
}

interface DraggableWidgetProps {
  widget: Widget
  isEditMode: boolean
  isSelected: boolean
  isDragging?: boolean
  onClick: () => void
  onDelete: () => void
  onUpdate: (widget: Widget) => void
}

export function DraggableWidget({
  widget,
  isEditMode,
  isSelected,
  isDragging = false,
  onClick,
  onDelete,
  onUpdate
}: DraggableWidgetProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRefreshing(true)
    setError(null)
    
    try {
      // Simulate data refresh
      await new Promise(resolve => setTimeout(resolve, 1000))
      // In real implementation, fetch fresh data based on widget.config
    } catch (err) {
      setError('Failed to refresh data')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  const getWidgetSizeClass = () => {
    switch (widget.type) {
      case 'kpi':
        return 'col-span-1 row-span-1 min-h-[120px]'
      case 'chart':
        return 'col-span-2 row-span-2 min-h-[300px]'
      case 'gauge':
        return 'col-span-1 row-span-1 min-h-[200px]'
      case 'network':
        return 'col-span-3 row-span-2 min-h-[400px]'
      case 'table':
        return 'col-span-2 row-span-3 min-h-[400px]'
      default:
        return 'col-span-1 row-span-1 min-h-[150px]'
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group rounded-lg border transition-all duration-200',
        getWidgetSizeClass(),
        isSelected && isEditMode
          ? 'border-cyan-500 shadow-lg shadow-cyan-500/20 bg-slate-900/70'
          : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-600/70',
        isDragging || isSortableDragging
          ? 'opacity-50 transform rotate-3 scale-105 z-50'
          : 'opacity-100',
        isEditMode && 'cursor-pointer',
        error && 'border-red-500/50 bg-red-900/10'
      )}
      onClick={isEditMode ? onClick : undefined}
      {...attributes}
    >
      {/* Edit Mode Controls */}
      {isEditMode && (
        <>
          {/* Drag Handle */}
          <div
            {...listeners}
            className="absolute top-2 left-2 p-1 rounded cursor-grab active:cursor-grabbing bg-slate-700/50 hover:bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <GripVertical size={16} className="text-slate-400" />
          </div>

          {/* Widget Controls */}
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 rounded bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-cyan-400 transition-colors"
            >
              <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
            </button>
            
            <button
              onClick={handleDelete}
              className="p-1 rounded bg-slate-700/50 hover:bg-red-600/50 text-slate-400 hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Selection Indicator */}
          {isSelected && (
            <div className="absolute inset-0 border-2 border-cyan-500 rounded-lg pointer-events-none">
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-cyan-500 rounded-full"></div>
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-cyan-500 rounded-full"></div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-cyan-500 rounded-full"></div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-500 rounded-full"></div>
            </div>
          )}
        </>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs flex items-center gap-1 z-10">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Widget Content */}
      <div className={cn(
        'h-full w-full',
        isEditMode && 'pointer-events-none'
      )}>
        <DashboardWidget widget={widget} />
      </div>

      {/* Loading Overlay */}
      {isRefreshing && (
        <div className="absolute inset-0 bg-slate-900/50 rounded-lg flex items-center justify-center z-20">
          <div className="flex items-center gap-2 text-cyan-400">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Refreshing...</span>
          </div>
        </div>
      )}
    </div>
  )
}