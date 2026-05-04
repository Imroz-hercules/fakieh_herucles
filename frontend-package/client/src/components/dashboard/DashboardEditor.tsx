import React, { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from '@dnd-kit/sortable'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { DraggableWidget } from './DraggableWidget'
import { WidgetConfigPanel } from './WidgetConfigPanel'
import { WidgetLibrary } from './WidgetLibrary'
import { GridLayoutSelector } from './GridLayoutSelector'
import { ValueSelector } from './ValueSelector'
import { Save, Eye, Settings, Grid3x3, Plus } from 'lucide-react'
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

interface DashboardEditorProps {
  widgets: Widget[]
  onSave: (widgets: Widget[]) => void
  onPreview: () => void
  isEditMode: boolean
  onToggleEditMode: () => void
}

export function DashboardEditor({ 
  widgets, 
  onSave, 
  onPreview, 
  isEditMode, 
  onToggleEditMode 
}: DashboardEditorProps) {
  const [localWidgets, setLocalWidgets] = useState<Widget[]>(widgets)
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showWidgetLibrary, setShowWidgetLibrary] = useState(false)
  const [gridLayout, setGridLayout] = useState<'auto' | '2x2' | '3x3' | '4x4' | 'custom'>('auto')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      setLocalWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over?.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }

    setActiveId(null)
  }, [])

  const addWidget = useCallback((widgetType: Widget['type']) => {
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type: widgetType,
      title: `New ${widgetType.charAt(0).toUpperCase() + widgetType.slice(1)} Widget`,
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      config: {
        dataSource: 'database_values',
        displayMode: 'single',
        refreshInterval: 30,
        thresholds: []
      }
    }
    setLocalWidgets(prev => [...prev, newWidget])
    setSelectedWidget(newWidget)
    setShowWidgetLibrary(false)
  }, [])

  const updateWidget = useCallback((updatedWidget: Widget) => {
    setLocalWidgets(prev => 
      prev.map(widget => 
        widget.id === updatedWidget.id ? updatedWidget : widget
      )
    )
    setSelectedWidget(updatedWidget)
  }, [])

  const deleteWidget = useCallback((widgetId: string) => {
    setLocalWidgets(prev => prev.filter(widget => widget.id !== widgetId))
    if (selectedWidget?.id === widgetId) {
      setSelectedWidget(null)
    }
  }, [selectedWidget])

  const handleSave = useCallback(() => {
    onSave(localWidgets)
  }, [localWidgets, onSave])

  const getGridClasses = () => {
    switch (gridLayout) {
      case '2x2': return 'grid-cols-2 gap-4'
      case '3x3': return 'grid-cols-3 gap-4'
      case '4x4': return 'grid-cols-4 gap-3'
      case 'custom': return 'grid-cols-1 lg:grid-cols-6 gap-4'
      default: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Editor Toolbar */}
      <div className="bg-slate-900/50 border-b border-slate-700/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onToggleEditMode}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2',
                isEditMode 
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                  : 'bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-600/50'
              )}
            >
              <Settings size={16} />
              {isEditMode ? 'Exit Edit Mode' : 'Edit Dashboard'}
            </button>

            {isEditMode && (
              <>
                <button
                  onClick={() => setShowWidgetLibrary(true)}
                  className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 font-medium flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add Widget
                </button>

                <div className="flex items-center gap-2">
                  <Grid3x3 size={16} className="text-slate-400" />
                  <select
                    value={gridLayout}
                    onChange={(e) => setGridLayout(e.target.value as any)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="auto">Auto Layout</option>
                    <option value="2x2">2×2 Grid</option>
                    <option value="3x3">3×3 Grid</option>
                    <option value="4x4">4×4 Grid</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isEditMode && (
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 font-medium flex items-center gap-2"
              >
                <Save size={16} />
                Save Layout
              </button>
            )}
            
            <button
              onClick={onPreview}
              className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30 font-medium flex items-center gap-2"
            >
              <Eye size={16} />
              Preview
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Main Dashboard Area */}
        <div className="flex-1 p-6 overflow-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToWindowEdges]}
          >
            <SortableContext 
              items={localWidgets.map(w => w.id)} 
              strategy={rectSortingStrategy}
            >
              <div className={cn('grid min-h-full', getGridClasses())}>
                {localWidgets.map((widget) => (
                  <DraggableWidget
                    key={widget.id}
                    widget={widget}
                    isEditMode={isEditMode}
                    isSelected={selectedWidget?.id === widget.id}
                    onClick={() => setSelectedWidget(widget)}
                    onDelete={() => deleteWidget(widget.id)}
                    onUpdate={updateWidget}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <DraggableWidget
                  widget={localWidgets.find(w => w.id === activeId)!}
                  isEditMode={isEditMode}
                  isSelected={false}
                  onClick={() => {}}
                  onDelete={() => {}}
                  onUpdate={() => {}}
                  isDragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {localWidgets.length === 0 && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-600 rounded-lg">
              <div className="text-center">
                <Grid3x3 size={48} className="mx-auto text-slate-500 mb-4" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">No widgets yet</h3>
                <p className="text-slate-500 mb-4">Add your first widget to get started</p>
                <button
                  onClick={() => setShowWidgetLibrary(true)}
                  className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/30 font-medium"
                >
                  Add Widget
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Widget Configuration Panel */}
        <WidgetConfigPanel
          widget={selectedWidget}
          isOpen={isEditMode && selectedWidget !== null}
          onUpdate={updateWidget}
          onClose={() => setSelectedWidget(null)}
        />
      </div>

      {/* Widget Library Modal */}
      <WidgetLibrary
        isOpen={showWidgetLibrary}
        onAddWidget={addWidget}
        onClose={() => setShowWidgetLibrary(false)}
      />
    </div>
  )
}