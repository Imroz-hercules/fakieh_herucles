import React, { useState, useEffect } from 'react'
import { Database, BarChart3, Target, Plus, X, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockDatabaseValues } from '@shared/mock-data'

interface Widget {
  type: 'kpi' | 'chart' | 'gauge' | 'network' | 'table' | 'custom'
  config: {
    dataSource?: string
    valueField?: string
    xAxisField?: string
    yAxisField?: string
    displayMode?: 'single' | 'multiple' | 'xy-chart' | 'trend' | 'dual'
    filters?: Record<string, any>
  }
}

interface ValueSelectorProps {
  dataSource: string
  widget: Widget
  onUpdate: (config: Partial<Widget['config']>) => void
}

// Group database values by category for organized selection
const getFieldsByCategory = () => {
  const categories: Record<string, any[]> = {}
  mockDatabaseValues.forEach(dbValue => {
    if (!categories[dbValue.category]) {
      categories[dbValue.category] = []
    }
    categories[dbValue.category].push({
      id: dbValue.id,
      label: dbValue.name,
      type: dbValue.type,
      unit: dbValue.unit,
      description: dbValue.description
    })
  })
  return categories
}

const DATA_FIELDS_BY_CATEGORY = getFieldsByCategory()

// Legacy data fields for backward compatibility
const LEGACY_DATA_FIELDS = {
  facilities: [
    { id: 'name', label: 'Facility Name', type: 'string' },
    { id: 'status', label: 'Status', type: 'string' },
    { id: 'dailyProduction', label: 'Daily Production', type: 'number' },
    { id: 'efficiency', label: 'Efficiency %', type: 'number' },
    { id: 'location', label: 'Location', type: 'string' },
    { id: 'lastUpdated', label: 'Last Updated', type: 'datetime' }
  ],
  metrics: [
    { id: 'metricType', label: 'Metric Type', type: 'string' },
    { id: 'value', label: 'Value', type: 'number' },
    { id: 'unit', label: 'Unit', type: 'string' },
    { id: 'timestamp', label: 'Timestamp', type: 'datetime' }
  ],
  alerts: [
    { id: 'severity', label: 'Severity', type: 'string' },
    { id: 'message', label: 'Message', type: 'string' },
    { id: 'isActive', label: 'Is Active', type: 'boolean' },
    { id: 'createdAt', label: 'Created At', type: 'datetime' }
  ]
}

export function ValueSelector({ dataSource, widget, onUpdate }: ValueSelectorProps) {
  const [availableFields, setAvailableFields] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    // Use new database values or fallback to legacy
    if (dataSource === 'database_values') {
      const allFields = Object.values(DATA_FIELDS_BY_CATEGORY).flat()
      setAvailableFields(allFields)
    } else {
      setAvailableFields(LEGACY_DATA_FIELDS[dataSource as keyof typeof LEGACY_DATA_FIELDS] || [])
    }
  }, [dataSource])

  const displayMode = widget.config.displayMode || 'single'
  const isMultipleMode = displayMode === 'multiple'
  const isXYMode = displayMode === 'xy-chart'
  const isDualGauge = widget.type === 'gauge' && displayMode === 'dual'

  // Filter fields based on search and category
  const filteredFields = availableFields.filter(field => {
    const matchesSearch = field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         field.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || 
                           (dataSource === 'database_values' && 
                            mockDatabaseValues.find(db => db.id === field.id)?.category === selectedCategory)
    return matchesSearch && matchesCategory
  })

  // Get available categories
  const categories = ['all', ...Object.keys(DATA_FIELDS_BY_CATEGORY)]

  // Get most popular/relevant fields first
  const getPopularFields = () => {
    const popular = [
      'flow_rate', 'ph_level', 'turbidity', 'inlet_pressure', 'outlet_pressure', 
      'energy_consumption', 'pump_speed', 'tank_level', 'chlorine_residual'
    ]
    return filteredFields.sort((a, b) => {
      const aIndex = popular.indexOf(a.id)
      const bIndex = popular.indexOf(b.id)
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return 0
    })
  }

  const handleValueFieldChange = (fieldId: string) => {
    if (isMultipleMode) {
      const currentValues = (widget.config.valueField || '').split(',').filter(v => v)
      const updatedValues = currentValues.includes(fieldId)
        ? currentValues.filter(v => v !== fieldId)
        : [...currentValues, fieldId]
      onUpdate({ valueField: updatedValues.join(',') })
    } else {
      onUpdate({ valueField: fieldId })
    }
  }

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'number': return <BarChart3 size={14} className="text-cyan-400" />
      case 'string': return <Database size={14} className="text-green-400" />
      case 'datetime': return <Target size={14} className="text-purple-400" />
      case 'boolean': return <Target size={14} className="text-orange-400" />
      default: return <Database size={14} className="text-slate-400" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Dual Gauge Configuration */}
      {isDualGauge && (
        <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-cyan-400 mb-3 flex items-center gap-2">
            <Target size={16} />
            Dual Value Gauge Configuration
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Primary Value</label>
              <select
                value={widget.config.valueField || ''}
                onChange={(e) => onUpdate({ valueField: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select primary...</option>
                {getPopularFields().slice(0, 8).map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label} ({field.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Secondary Value</label>
              <select
                value={widget.config.yAxisField || ''}
                onChange={(e) => onUpdate({ yAxisField: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select secondary...</option>
                {getPopularFields().slice(0, 8).map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label} ({field.unit})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Smart Value Selection Interface */}
      {!isDualGauge && dataSource === 'database_values' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            <Database className="inline mr-2" size={16} />
            {isMultipleMode ? 'Select Multiple Values' : 'Select Value'}
          </label>
          
          {/* Search and Filter */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search values..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Categories</option>
                {Object.keys(DATA_FIELDS_BY_CATEGORY).map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Popular/Quick Selection */}
          {searchTerm === '' && selectedCategory === 'all' && (
            <div className="mb-4">
              <h5 className="text-xs font-medium text-slate-400 mb-2">Most Popular</h5>
              <div className="grid grid-cols-2 gap-2">
                {getPopularFields().slice(0, 6).map((field) => (
                  <button
                    key={field.id}
                    onClick={() => handleValueFieldChange(field.id)}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border text-sm transition-all',
                      (isMultipleMode 
                        ? (widget.config.valueField || '').split(',').includes(field.id)
                        : widget.config.valueField === field.id)
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-slate-600/50'
                    )}
                  >
                    {getFieldIcon(field.type)}
                    <div className="text-left flex-1">
                      <div className="font-medium">{field.label}</div>
                      <div className="text-xs opacity-70">{field.unit}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filtered Results */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {filteredFields.length > 0 ? (
              filteredFields.map((field) => (
                <label key={field.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800/50 hover:border-slate-600/50 cursor-pointer bg-slate-900/30 transition-colors">
                  <input
                    type={isMultipleMode ? 'checkbox' : 'radio'}
                    name="valueField"
                    checked={isMultipleMode 
                      ? (widget.config.valueField || '').split(',').includes(field.id)
                      : widget.config.valueField === field.id
                    }
                    onChange={() => handleValueFieldChange(field.id)}
                    className="text-cyan-500"
                  />
                  {getFieldIcon(field.type)}
                  <div className="flex-1">
                    <span className="text-sm text-slate-200 font-medium">{field.label}</span>
                    <div className="text-xs text-slate-400">
                      {field.unit} • {field.description}
                    </div>
                  </div>
                </label>
              ))
            ) : (
              <div className="text-center py-6 text-slate-500">
                <Database size={32} className="mx-auto mb-2 opacity-50" />
                <p>No values found matching your search</p>
              </div>
            )}
          </div>
        </div>
      )}

        {/* Legacy fields for other data sources */}
        {dataSource !== 'database_values' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {displayMode === 'single' ? 'Value Field' : 'Value Fields'}
            </label>
            
            <div className="space-y-2">
              {availableFields.map((field) => (
                <label key={field.id} className="flex items-center gap-3 p-2 rounded border border-slate-800/50 hover:border-slate-600/50 cursor-pointer bg-slate-900/30">
                  <input
                    type={displayMode === 'multiple' ? 'checkbox' : 'radio'}
                    name="valueField"
                    checked={displayMode === 'multiple' 
                      ? (widget.config.valueField || '').split(',').includes(field.id)
                      : widget.config.valueField === field.id
                    }
                    onChange={() => handleValueFieldChange(field.id)}
                    className="text-cyan-500"
                  />
                  {getFieldIcon(field.type)}
                  <div className="flex-1">
                    <span className="text-sm text-slate-200">{field.label}</span>
                    <div className="text-xs text-slate-400">({field.type})</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

      {/* XY Chart Mode Fields */}
      {isXYMode && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              X-Axis Field
            </label>
            <select
              value={widget.config.xAxisField || ''}
              onChange={(e) => onUpdate({ xAxisField: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select X-axis field...</option>
              {availableFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label} ({field.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Y-Axis Field
            </label>
            <select
              value={widget.config.yAxisField || ''}
              onChange={(e) => onUpdate({ yAxisField: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select Y-axis field...</option>
              {availableFields.filter(f => f.type === 'number').map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label} ({field.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}