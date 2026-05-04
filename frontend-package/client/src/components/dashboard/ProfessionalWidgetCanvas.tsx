import React, { useState, useRef, useCallback } from 'react'
import { useDrag, useDrop, DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { cn } from '@/lib/utils'
import { Move, Settings, X, RotateCcw } from 'lucide-react'
import { ProfessionalWidgetRenderer } from './ProfessionalWidgetRenderer'

// Widget Interface
interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'table' | 'network' | 'custom'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: any
}

// Draggable Widget Component
function DraggableWidget({ 
  widget, 
  isSelected, 
  onSelect, 
  onMove, 
  onResize, 
  onDelete, 
  onConfigure 
}: {
  widget: Widget
  isSelected: boolean
  onSelect: (widget: Widget) => void
  onMove: (id: string, position: { x: number; y: number }) => void
  onResize: (id: string, size: { width: number; height: number }) => void
  onDelete: (id: string) => void
  onConfigure: (widget: Widget) => void
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: 'widget',
    item: { id: widget.id, type: 'widget' },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onSelect(widget)
    setIsResizing(true)

    const startX = e.clientX
    const startY = e.clientY
    const startWidth = widget.size.width
    const startHeight = widget.size.height

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, startWidth + (e.clientX - startX))
      const newHeight = Math.max(150, startHeight + (e.clientY - startY))
      onResize(widget.id, { width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [widget, onSelect, onResize])

  return (
    <div
      ref={preview}
      className={cn(
        "absolute border-2 rounded-lg transition-all duration-200 cursor-pointer",
        isSelected 
          ? "border-cyan-500 shadow-lg shadow-cyan-500/20" 
          : "border-slate-600/50 hover:border-slate-500",
        isDragging && "opacity-50",
        isResizing && "transition-none"
      )}
      style={{
        left: widget.position.x,
        top: widget.position.y,
        width: widget.size.width,
        height: widget.size.height,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(widget)
      }}
    >
      {/* Widget Header */}
      <div 
        ref={drag}
        className={cn(
          "h-8 bg-slate-800/90 border-b border-slate-600/50 rounded-t-lg px-3 flex items-center justify-between cursor-move",
          isSelected && "bg-slate-700/90"
        )}
      >
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <Move className="w-3 h-3 text-slate-400" />
          <span className="text-xs font-medium text-slate-300 truncate">
            {widget.title}
          </span>
        </div>
        
        {isSelected && (
          <div className="flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onConfigure(widget)
              }}
              className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-600/50 rounded transition-colors"
            >
              <Settings className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(widget.id)
              }}
              className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600/50 rounded transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Widget Content */}
      <div className="flex-1 bg-slate-900/50 rounded-b-lg overflow-hidden relative">
        <ProfessionalWidgetRenderer widget={widget} />
        {!isSelected && (
          <div 
            className="absolute inset-0 bg-transparent cursor-pointer"
            onClick={() => onSelect(widget)}
          />
        )}
      </div>

      {/* Resize Handle */}
      {isSelected && (
        <div
          ref={resizeRef}
          onMouseDown={handleMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 bg-cyan-500/80 rounded-tl-lg cursor-se-resize hover:bg-cyan-400/80 transition-colors"
        >
          <div className="absolute bottom-0.5 right-0.5 w-2 h-2 border-r border-b border-white/60"></div>
        </div>
      )}
    </div>
  )
}



// Canvas Content Component (without DragDropProvider)
function CanvasContent({
  widgets,
  selectedWidget,
  onWidgetSelect,
  onWidgetMove,
  onWidgetResize,
  onWidgetDelete,
  onWidgetConfigure,
  gridSize,
  snapToGrid
}: {
  widgets: Widget[]
  selectedWidget: Widget | null
  onWidgetSelect: (widget: Widget | null) => void
  onWidgetMove: (id: string, position: { x: number; y: number }) => void
  onWidgetResize: (id: string, size: { width: number; height: number }) => void
  onWidgetDelete: (id: string) => void
  onWidgetConfigure: (widget: Widget) => void
  gridSize: number
  snapToGrid: boolean
}) {
  const canvasRef = useRef<HTMLDivElement>(null)

  const [, drop] = useDrop({
    accept: 'widget',
    drop: (item: { id: string; type: string }, monitor) => {
      if (!canvasRef.current) return
      
      const delta = monitor.getDifferenceFromInitialOffset()
      if (!delta) return

      const widget = widgets.find(w => w.id === item.id)
      if (!widget) return

      let newX = widget.position.x + delta.x
      let newY = widget.position.y + delta.y

      // Snap to grid
      if (snapToGrid) {
        newX = Math.round(newX / gridSize) * gridSize
        newY = Math.round(newY / gridSize) * gridSize
      }

      // Keep within bounds
      const rect = canvasRef.current.getBoundingClientRect()
      newX = Math.max(0, Math.min(newX, rect.width - widget.size.width))
      newY = Math.max(0, Math.min(newY, rect.height - widget.size.height))

      onWidgetMove(item.id, { x: newX, y: newY })
    },
  })

  // Handle canvas click (deselect widgets)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onWidgetSelect(null)
    }
  }, [onWidgetSelect])

  return (
    <div
      ref={(node) => {
        if (node) {
          canvasRef.current = node
          drop(node)
        }
      }}
      className="relative w-full h-full bg-slate-950 overflow-hidden"
      onClick={handleCanvasClick}
      style={{
        backgroundImage: snapToGrid 
          ? `radial-gradient(circle, #64748b 1px, transparent 1px)`
          : undefined,
        backgroundSize: snapToGrid ? `${gridSize}px ${gridSize}px` : undefined,
      }}
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" />
      
      {/* Widgets */}
      {widgets.map((widget) => (
        <DraggableWidget
          key={widget.id}
          widget={widget}
          isSelected={selectedWidget?.id === widget.id}
          onSelect={onWidgetSelect}
          onMove={onWidgetMove}
          onResize={onWidgetResize}
          onDelete={onWidgetDelete}
          onConfigure={onWidgetConfigure}
        />
      ))}

      {/* Empty State */}
      {widgets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="w-24 h-24 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <RotateCcw className="w-12 h-12 text-slate-600" />
            </div>
            <h3 className="text-xl font-medium text-slate-400 mb-2">Canvas Ready</h3>
            <p className="text-slate-600">Add widgets using the toolbar above</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Main Canvas Component
export function ProfessionalWidgetCanvas({
  widgets,
  selectedWidget,
  onWidgetSelect,
  onWidgetMove,
  onWidgetResize,
  onWidgetDelete,
  onWidgetConfigure,
  gridSize = 20,
  snapToGrid = true
}: {
  widgets: Widget[]
  selectedWidget: Widget | null
  onWidgetSelect: (widget: Widget | null) => void
  onWidgetMove: (id: string, position: { x: number; y: number }) => void
  onWidgetResize: (id: string, size: { width: number; height: number }) => void
  onWidgetDelete: (id: string) => void
  onWidgetConfigure: (widget: Widget) => void
  gridSize?: number
  snapToGrid?: boolean
}) {
  return (
    <DndProvider backend={HTML5Backend}>
      <CanvasContent
        widgets={widgets}
        selectedWidget={selectedWidget}
        onWidgetSelect={onWidgetSelect}
        onWidgetMove={onWidgetMove}
        onWidgetResize={onWidgetResize}
        onWidgetDelete={onWidgetDelete}
        onWidgetConfigure={onWidgetConfigure}
        gridSize={gridSize}
        snapToGrid={snapToGrid}
      />
    </DndProvider>
  )
}