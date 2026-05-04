import React, { useState, useEffect } from 'react'
import { Search, Filter, ChevronRight, Database, Zap, Activity, BarChart3, Eye, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockDatabaseValues } from '@shared/mock-data'

interface DataPoint {
  id: string
  name: string
  category: string
  unit: string
  type: 'number' | 'string' | 'boolean' | 'timestamp'
  description: string
  priority: 'high' | 'medium' | 'low'
  icon: React.ReactNode
}

interface DataSelectorProps {
  selectedValues: string[]
  onSelectionChange: (values: string[]) => void
  maxSelections?: number
  title?: string
  mode?: 'single' | 'dual' | 'multiple'
}

// Enhanced data points with priorities and icons
const createDataPoints = (): DataPoint[] => {
  const iconMap: Record<string, React.ReactNode> = {
    'Water Quality': <Activity className="w-4 h-4 text-blue-400" />,
    'Flow & Pressure': <BarChart3 className="w-4 h-4 text-cyan-400" />,
    'Energy': <Zap className="w-4 h-4 text-yellow-400" />,
    'Maintenance': <Settings2 className="w-4 h-4 text-orange-400" />,
    'Chemical': <Database className="w-4 h-4 text-green-400" />
  }

  const priorities: Record<string, 'high' | 'medium' | 'low'> = {
    'flow_rate': 'high',
    'ph_level': 'high',
    'turbidity': 'high',
    'inlet_pressure': 'high',
    'outlet_pressure': 'high',
    'energy_consumption': 'high',
    'pump_speed': 'medium',
    'tank_level': 'medium',
    'chlorine_residual': 'medium'
  }

  return mockDatabaseValues.map(item => ({
    ...item,
    priority: priorities[item.id] || 'low',
    icon: iconMap[item.category] || <Database className="w-4 h-4 text-slate-400" />
  }))
}

export function DataSelector({ 
  selectedValues, 
  onSelectionChange, 
  maxSelections = 10,
  title = "Select Data Sources",
  mode = 'single'
}: DataSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [dataPoints] = useState<DataPoint[]>(createDataPoints())

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(dataPoints.map(item => item.category)))]

  // Filter and sort data points
  const filteredData = dataPoints
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = activeCategory === 'all' || item.category === activeCategory
      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      // Priority sorting: high > medium > low
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      }
      return a.name.localeCompare(b.name)
    })

  // Handle selection
  const handleSelect = (itemId: string) => {
    if (mode === 'single') {
      onSelectionChange([itemId])
    } else if (mode === 'dual') {
      if (selectedValues.includes(itemId)) {
        onSelectionChange(selectedValues.filter(id => id !== itemId))
      } else if (selectedValues.length < 2) {
        onSelectionChange([...selectedValues, itemId])
      }
    } else {
      if (selectedValues.includes(itemId)) {
        onSelectionChange(selectedValues.filter(id => id !== itemId))
      } else if (selectedValues.length < maxSelections) {
        onSelectionChange([...selectedValues, itemId])
      }
    }
  }

  // Get high priority recommendations
  const recommendations = dataPoints
    .filter(item => item.priority === 'high')
    .slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-slate-200 flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">
            {selectedValues.length}/{mode === 'dual' ? 2 : maxSelections}
          </span>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 rounded-lg bg-slate-800/50 border border-slate-600/50 hover:bg-slate-700/50 transition-colors"
          >
            <Eye className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Quick Recommendations */}
      {searchTerm === '' && activeCategory === 'all' && (
        <div className="bg-gradient-to-r from-cyan-500/5 to-blue-500/5 border border-cyan-500/20 rounded-lg p-4">
          <h4 className="text-sm font-medium text-cyan-400 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Recommended for Water Treatment
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {recommendations.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                disabled={mode === 'dual' && selectedValues.length >= 2 && !selectedValues.includes(item.id)}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg text-sm transition-all',
                  selectedValues.includes(item.id)
                    ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800/50 border border-slate-600/30 text-slate-300 hover:bg-slate-700/50 hover:border-slate-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {item.icon}
                <div className="text-left flex-1 min-w-0">
                  <div className="font-medium truncate">{item.name}</div>
                  <div className="text-xs opacity-70">{item.unit}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search parameters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:bg-slate-800/70"
          />
        </div>
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          className="px-4 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500/50"
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category === 'all' ? 'All Categories' : category}
            </option>
          ))}
        </select>
      </div>

      {/* Data Grid/List */}
      <div className={cn(
        "max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600",
        viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-2'
      )}>
        {filteredData.length > 0 ? (
          filteredData.map((item) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                'group cursor-pointer rounded-lg border transition-all duration-200',
                selectedValues.includes(item.id)
                  ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600/50',
                mode === 'dual' && selectedValues.length >= 2 && !selectedValues.includes(item.id) 
                  ? 'opacity-50 cursor-not-allowed' 
                  : '',
                viewMode === 'grid' ? 'p-4' : 'p-3 flex items-center gap-3'
              )}
            >
              {viewMode === 'grid' ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span className={cn(
                        'text-xs px-2 py-1 rounded-full',
                        item.priority === 'high' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        item.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      )}>
                        {item.priority}
                      </span>
                    </div>
                    {selectedValues.includes(item.id) && (
                      <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-200 group-hover:text-cyan-300 transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-cyan-400 font-mono">{item.unit}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-500">{item.category}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {item.icon}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-200 truncate">{item.name}</h4>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        item.priority === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                        item.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-500/20 text-slate-400'
                      )}>
                        {item.priority}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 truncate">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-cyan-400 font-mono">{item.unit}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-500">{item.category}</span>
                    </div>
                  </div>
                  {selectedValues.includes(item.id) && (
                    <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                  )}
                </>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-2 text-center py-12 text-slate-500">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No parameters found</p>
            <p className="text-sm">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>

      {/* Selection Summary */}
      {selectedValues.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-slate-300 mb-2">Selected Parameters</h4>
          <div className="flex flex-wrap gap-2">
            {selectedValues.map((valueId, index) => {
              const item = dataPoints.find(d => d.id === valueId)
              if (!item) return null
              return (
                <div key={valueId} className="flex items-center gap-2 px-3 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded-full text-sm">
                  {mode === 'dual' && (
                    <span className="text-xs text-cyan-300 font-mono">
                      {index === 0 ? 'PRIMARY' : 'SECONDARY'}
                    </span>
                  )}
                  <span className="text-cyan-300">{item.name}</span>
                  <button
                    onClick={() => handleSelect(valueId)}
                    className="w-4 h-4 rounded-full bg-cyan-500/30 hover:bg-cyan-500/50 flex items-center justify-center transition-colors"
                  >
                    <span className="text-xs text-cyan-300">×</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}