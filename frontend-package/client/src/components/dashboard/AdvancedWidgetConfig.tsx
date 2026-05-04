import React, { useState, useEffect } from 'react'
import { X, Save, Database, BarChart, Palette, Settings2, Plus, Trash2, Eye, ChevronDown, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { SketchPicker } from 'react-color'
import { cn } from '@/lib/utils'

// Enhanced mock data sources
const DATA_SOURCES = [
  { 
    value: 'Database', 
    label: 'Database', 
    icon: Database,
    description: 'Historical data from main database',
    variables: ['temperature_sensor', 'pressure_gauge', 'flow_meter', 'level_indicator', 'ph_sensor', 'conductivity_meter']
  },
  { 
    value: 'OT', 
    label: 'OT Systems', 
    icon: Wifi,
    description: 'Real-time data from operational technology',
    variables: ['plc_data_01', 'scada_reading', 'fieldbus_sensor', 'modbus_device', 'ethernet_ip_data', 'profinet_tag']
  },
] as const

const CHART_TYPES = [
  { value: 'line', label: 'Line Chart', description: 'Best for trends over time' },
  { value: 'bar', label: 'Bar Chart', description: 'Compare values across categories' },
  { value: 'area', label: 'Area Chart', description: 'Show volume and trends' },
  { value: 'pie', label: 'Pie Chart', description: 'Show proportions of a whole' },
  { value: 'scatter', label: 'Scatter Plot', description: 'Show correlation between variables' },
] as const

const PRESET_COLORS = [
  '#00bcd4', '#4caf50', '#ff9800', '#f44336', '#9c27b0', '#2196f3',
  '#ffeb3b', '#e91e63', '#795548', '#607d8b', '#8bc34a', '#ffc107'
]

// Enhanced mock data for energy monitoring and water treatment
const mockDatabaseCategories = {
  'Flow': [
    { id: 'flow_rate', name: 'Flow Rate', unit: 'L/min', color: '#00ffff' },
    { id: 'flow_velocity', name: 'Flow Velocity', unit: 'm/s', color: '#06b6d4' },
    { id: 'flow_pressure', name: 'System Pressure', unit: 'bar', color: '#0891b2' },
    { id: 'pump_speed', name: 'Pump Speed', unit: 'RPM', color: '#0e7490' }
  ],
  'Water Quality': [
    { id: 'ph_level', name: 'pH Level', unit: 'pH', color: '#10b981' },
    { id: 'turbidity', name: 'Turbidity', unit: 'NTU', color: '#059669' },
    { id: 'chlorine', name: 'Chlorine Level', unit: 'mg/L', color: '#047857' },
    { id: 'dissolved_oxygen', name: 'Dissolved Oxygen', unit: 'mg/L', color: '#065f46' }
  ],
  'Energy': [
    { id: 'power_consumption', name: 'Power Consumption', unit: 'kW', color: '#f59e0b' },
    { id: 'energy_usage', name: 'Energy Usage', unit: 'kWh', color: '#d97706' },
    { id: 'voltage', name: 'Voltage', unit: 'V', color: '#b45309' },
    { id: 'current', name: 'Current', unit: 'A', color: '#92400e' },
    { id: 'power_factor', name: 'Power Factor', unit: '', color: '#78350f' },
    { id: 'frequency', name: 'Frequency', unit: 'Hz', color: '#451a03' }
  ],
  'Chemical': [
    { id: 'chemical_dosing', name: 'Chemical Dosing Rate', unit: 'ml/min', color: '#8b5cf6' },
    { id: 'tank_level', name: 'Chemical Tank Level', unit: '%', color: '#7c3aed' },
    { id: 'coagulant', name: 'Coagulant Usage', unit: 'mg/L', color: '#6d28d9' },
    { id: 'ph_adjuster', name: 'pH Adjuster', unit: 'ml/min', color: '#5b21b6' }
  ],
  'Environmental': [
    { id: 'temperature', name: 'Temperature', unit: '°C', color: '#ef4444' },
    { id: 'humidity', name: 'Humidity', unit: '%', color: '#dc2626' },
    { id: 'ambient_pressure', name: 'Ambient Pressure', unit: 'mbar', color: '#b91c1c' },
    { id: 'noise_level', name: 'Noise Level', unit: 'dB', color: '#991b1b' }
  ],
  'Maintenance': [
    { id: 'vibration', name: 'Vibration Level', unit: 'mm/s', color: '#6b7280' },
    { id: 'bearing_temp', name: 'Bearing Temperature', unit: '°C', color: '#4b5563' },
    { id: 'motor_current', name: 'Motor Current', unit: 'A', color: '#374151' },
    { id: 'filter_pressure', name: 'Filter Pressure Drop', unit: 'mbar', color: '#1f2937' }
  ]
}

// Flatten all parameters for search
const allParameters = Object.entries(mockDatabaseCategories).flatMap(([category, params]) =>
  params.map(param => ({ ...param, category }))
)

// Widget Interface
interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'table' | 'network' | 'custom'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: {
    dataSource?: string
    values?: Array<{
      id: string
      name: string
      unit: string
      color: string
      category: string
    }>
    chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter'
    displayMode?: 'single' | 'dual' | 'multiple'
    refreshInterval?: number
    thresholds?: Array<{ value: number; color: string; label: string }>
    styling?: {
      backgroundColor?: string
      borderColor?: string
      textColor?: string
    }
  }
}

// Data Selection Component
function DataSelectionPanel({ 
  widget, 
  onConfigChange 
}: { 
  widget: Widget
  onConfigChange: (config: Partial<Widget['config']>) => void 
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const selectedValues = widget.config.values || []
  
  const maxValues = widget.config.displayMode === 'single' ? 1 : 
                   widget.config.displayMode === 'dual' ? 2 : 10

  const filteredParams = allParameters.filter(param => {
    const matchesSearch = param.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         param.category.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || param.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleValueToggle = (param: typeof allParameters[0]) => {
    const isSelected = selectedValues.some(v => v.id === param.id)
    
    if (isSelected) {
      // Remove value
      const newValues = selectedValues.filter(v => v.id !== param.id)
      onConfigChange({ values: newValues })
    } else if (selectedValues.length < maxValues) {
      // Add value
      const newValues = [...selectedValues, param]
      onConfigChange({ values: newValues })
    }
  }

  const handleColorChange = (paramId: string, color: string) => {
    const newValues = selectedValues.map(v => 
      v.id === paramId ? { ...v, color } : v
    )
    onConfigChange({ values: newValues })
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter */}
      <div className="flex space-x-3">
        <div className="flex-1">
          <Input
            placeholder="Search parameters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-800 border-slate-600 text-slate-200"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-600 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="all">All Categories</SelectItem>
            {Object.keys(mockDatabaseCategories).map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selected Values */}
      {selectedValues.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300">Selected Parameters ({selectedValues.length}/{maxValues})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedValues.map((value) => (
              <div key={value.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-4 h-4 rounded border border-slate-500"
                    style={{ backgroundColor: value.color }}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{value.name}</div>
                    <div className="text-xs text-slate-400">{value.category} • {value.unit}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Color Picker */}
                  <div className="flex space-x-1">
                    {['#00ffff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'].map(color => (
                      <button
                        key={color}
                        onClick={() => handleColorChange(value.id, color)}
                        className={cn(
                          "w-6 h-6 rounded border-2 transition-all",
                          value.color === color ? "border-white scale-110" : "border-slate-500"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleValueToggle(value)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Available Parameters */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-300">Available Parameters</CardTitle>
          <CardDescription className="text-slate-500">
            Select up to {maxValues} parameter(s) for your {widget.type} widget
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {filteredParams.map((param) => {
              const isSelected = selectedValues.some(v => v.id === param.id)
              const canSelect = selectedValues.length < maxValues || isSelected
              
              return (
                <div
                  key={param.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all",
                    isSelected ? "bg-cyan-900/30 border border-cyan-500/30" : "bg-slate-700/30 hover:bg-slate-700/50",
                    !canSelect && !isSelected && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => canSelect && handleValueToggle(param)}
                >
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      checked={isSelected}
                      className="data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                    />
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: param.color }}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-200">{param.name}</div>
                      <div className="text-xs text-slate-400">{param.category} • {param.unit}</div>
                    </div>
                  </div>
                  {isSelected && <Eye className="w-4 h-4 text-cyan-400" />}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Display Configuration Panel
function DisplayConfigPanel({ 
  widget, 
  onConfigChange 
}: { 
  widget: Widget
  onConfigChange: (config: Partial<Widget['config']>) => void 
}) {
  return (
    <div className="space-y-6">
      {/* Chart Type Selection */}
      {widget.type === 'chart' && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-sm text-slate-300">Chart Type</CardTitle>
            <CardDescription className="text-slate-500">Choose how to visualize your data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: 'line', name: 'Line Chart', icon: '📈' },
                { type: 'bar', name: 'Bar Chart', icon: '📊' },
                { type: 'area', name: 'Area Chart', icon: '🏔️' },
                { type: 'pie', name: 'Pie Chart', icon: '🥧' },
                { type: 'donut', name: 'Donut Chart', icon: '🍩' },
                { type: 'scatter', name: 'Scatter Plot', icon: '⚡' }
              ].map(({ type, name, icon }) => (
                <button
                  key={type}
                  onClick={() => onConfigChange({ chartType: type as any })}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all text-center",
                    widget.config.chartType === type
                      ? "border-cyan-500 bg-cyan-900/30"
                      : "border-slate-600 bg-slate-700/30 hover:border-slate-500"
                  )}
                >
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-sm font-medium text-slate-200">{name}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Display Mode */}
      {(widget.type === 'gauge' || widget.type === 'kpi') && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-sm text-slate-300">Display Mode</CardTitle>
            <CardDescription className="text-slate-500">Choose how many values to display</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                { mode: 'single', name: 'Single Value', desc: '1 parameter' },
                { mode: 'dual', name: 'Dual Values', desc: '2 parameters' },
                { mode: 'multiple', name: 'Multiple Values', desc: 'Up to 10 parameters' }
              ].map(({ mode, name, desc }) => (
                <button
                  key={mode}
                  onClick={() => onConfigChange({ displayMode: mode as any })}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all text-center",
                    widget.config.displayMode === mode
                      ? "border-cyan-500 bg-cyan-900/30"
                      : "border-slate-600 bg-slate-700/30 hover:border-slate-500"
                  )}
                >
                  <div className="text-sm font-medium text-slate-200 mb-1">{name}</div>
                  <div className="text-xs text-slate-400">{desc}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Interval */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm text-slate-300">Refresh Interval</CardTitle>
          <CardDescription className="text-slate-500">How often to update the data</CardDescription>
        </CardHeader>
        <CardContent>
          <Select 
            value={widget.config.refreshInterval?.toString() || '30'} 
            onValueChange={(value) => onConfigChange({ refreshInterval: parseInt(value) })}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="5">Every 5 seconds</SelectItem>
              <SelectItem value="10">Every 10 seconds</SelectItem>
              <SelectItem value="30">Every 30 seconds</SelectItem>
              <SelectItem value="60">Every minute</SelectItem>
              <SelectItem value="300">Every 5 minutes</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  )
}

// Style Configuration Panel
function StyleConfigPanel({ 
  widget, 
  onConfigChange 
}: { 
  widget: Widget
  onConfigChange: (config: Partial<Widget['config']>) => void 
}) {
  const styling = widget.config.styling || {}

  const handleStyleChange = (key: string, value: string) => {
    onConfigChange({
      styling: {
        ...styling,
        [key]: value
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Background Color */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm text-slate-300">Background</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              'transparent', '#1e293b', '#0f172a', '#020617', 
              '#164e63', '#134e4a', '#365314', '#831843'
            ].map(color => (
              <button
                key={color}
                onClick={() => handleStyleChange('backgroundColor', color)}
                className={cn(
                  "w-10 h-10 rounded border-2 transition-all",
                  styling.backgroundColor === color ? "border-cyan-400 scale-110" : "border-slate-600"
                )}
                style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
              >
                {color === 'transparent' && <div className="w-full h-full border border-slate-500 rounded bg-gradient-to-br from-red-500/20 to-transparent" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Border Color */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm text-slate-300">Border</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['#475569', '#00ffff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(color => (
              <button
                key={color}
                onClick={() => handleStyleChange('borderColor', color)}
                className={cn(
                  "w-10 h-10 rounded border-2 transition-all",
                  styling.borderColor === color ? "border-white scale-110" : "border-slate-600"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Text Color */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm text-slate-300">Text Color</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['#f1f5f9', '#cbd5e1', '#94a3b8', '#00ffff', '#10b981', '#f59e0b'].map(color => (
              <button
                key={color}
                onClick={() => handleStyleChange('textColor', color)}
                className={cn(
                  "w-10 h-10 rounded border-2 transition-all flex items-center justify-center",
                  styling.textColor === color ? "border-white scale-110" : "border-slate-600"
                )}
                style={{ backgroundColor: color }}
              >
                <span className="text-xs font-bold" style={{ color: color === '#f1f5f9' ? '#000' : '#fff' }}>A</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Main Advanced Widget Configuration Component
export function AdvancedWidgetConfig({
  widget,
  isOpen,
  onClose,
  onSave
}: {
  widget: Widget | null
  isOpen: boolean
  onClose: () => void
  onSave: (widget: Widget) => void
}) {
  const [editedWidget, setEditedWidget] = useState<Widget | null>(null)

  useEffect(() => {
    if (widget) {
      setEditedWidget({ ...widget })
    }
  }, [widget])

  const handleConfigChange = (config: Partial<Widget['config']>) => {
    if (!editedWidget) return
    
    setEditedWidget({
      ...editedWidget,
      config: {
        ...editedWidget.config,
        ...config
      }
    })
  }

  const handleTitleChange = (title: string) => {
    if (!editedWidget) return
    
    setEditedWidget({
      ...editedWidget,
      title
    })
  }

  const handleSave = () => {
    if (editedWidget) {
      onSave(editedWidget)
    }
  }

  if (!isOpen || !editedWidget) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Settings2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-200">Advanced Widget Configuration</h2>
              <p className="text-slate-400 text-sm">Full precision customization for {editedWidget?.type ? editedWidget.type.charAt(0).toUpperCase() + editedWidget.type.slice(1) : 'Widget'} widget</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Widget Title */}
            <div className="mb-6">
              <Label className="text-slate-300 text-sm font-medium">Widget Title</Label>
              <Input
                value={editedWidget.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="mt-2 bg-slate-800 border-slate-600 text-slate-200"
                placeholder="Enter descriptive widget title..."
              />
            </div>

            {/* Advanced Configuration Tabs */}
            <Tabs defaultValue="data" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-slate-800 h-12">
                <TabsTrigger value="data" className="data-[state=active]:bg-slate-700 flex items-center space-x-2">
                  <Database className="w-4 h-4" />
                  <span>Data Selection</span>
                </TabsTrigger>
                <TabsTrigger value="display" className="data-[state=active]:bg-slate-700 flex items-center space-x-2">
                  <BarChart className="w-4 h-4" />
                  <span>Display Options</span>
                </TabsTrigger>
                <TabsTrigger value="style" className="data-[state=active]:bg-slate-700 flex items-center space-x-2">
                  <Palette className="w-4 h-4" />
                  <span>Styling</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="mt-6">
                <DataSelectionPanel widget={editedWidget} onConfigChange={handleConfigChange} />
              </TabsContent>

              <TabsContent value="display" className="mt-6">
                <DisplayConfigPanel widget={editedWidget} onConfigChange={handleConfigChange} />
              </TabsContent>

              <TabsContent value="style" className="mt-6">
                <StyleConfigPanel widget={editedWidget} onConfigChange={handleConfigChange} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Selected: {editedWidget.config.values?.length || 0} parameter(s) • Type: {editedWidget.config.chartType || editedWidget.type}
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300 hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white">
              <Save className="w-4 h-4 mr-2" />
              Apply Configuration
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}