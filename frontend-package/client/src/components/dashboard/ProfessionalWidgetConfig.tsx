import React, { useState, useEffect } from 'react'
import { X, Save, Palette, Database, BarChart, Settings2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
// Mock data for demonstration - replace with real API
const mockDatabaseValues = [
  { id: 'flow_rate', name: 'Flow Rate', category: 'Flow', unit: 'L/min', sampleData: [120, 125, 118, 122, 130] },
  { id: 'ph_level', name: 'pH Level', category: 'Water Quality', unit: 'pH', sampleData: [7.2, 7.1, 7.3, 7.0, 7.2] },
  { id: 'turbidity', name: 'Turbidity', category: 'Water Quality', unit: 'NTU', sampleData: [0.8, 0.9, 0.7, 0.8, 0.6] },
  { id: 'chlorine', name: 'Chlorine Level', category: 'Chemical', unit: 'mg/L', sampleData: [1.2, 1.1, 1.3, 1.2, 1.4] },
  { id: 'temperature', name: 'Temperature', category: 'Environmental', unit: '°C', sampleData: [22, 23, 21, 22, 24] },
  { id: 'pressure', name: 'System Pressure', category: 'Flow', unit: 'bar', sampleData: [2.1, 2.0, 2.2, 2.1, 2.3] },
  { id: 'energy_usage', name: 'Energy Usage', category: 'Energy', unit: 'kWh', sampleData: [45, 48, 42, 46, 50] },
  { id: 'pump_speed', name: 'Pump Speed', category: 'Maintenance', unit: 'RPM', sampleData: [1800, 1750, 1850, 1800, 1900] }
]

// Widget Interface
interface Widget {
  id: string
  type: 'kpi' | 'chart' | 'gauge' | 'table' | 'network' | 'custom'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: {
    dataSource?: string
    values?: string[]
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

// Data Selection Panel
function DataSelectionPanel({ 
  widget, 
  onChange 
}: { 
  widget: Widget
  onChange: (config: Partial<Widget['config']>) => void 
}) {
  const [selectedValues, setSelectedValues] = useState<string[]>(widget.config.values || [])
  const [searchTerm, setSearchTerm] = useState('')

  const filteredData = mockDatabaseValues.filter((item: any) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleValueToggle = (valueId: string) => {
    const maxSelections = widget.config.displayMode === 'dual' ? 2 : 
                         widget.config.displayMode === 'single' ? 1 : 10

    let newValues = [...selectedValues]
    
    if (newValues.includes(valueId)) {
      newValues = newValues.filter(id => id !== valueId)
    } else if (newValues.length < maxSelections) {
      newValues.push(valueId)
    }
    
    setSelectedValues(newValues)
    onChange({ values: newValues })
  }

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'water quality': return '💧'
      case 'energy': return '⚡'
      case 'maintenance': return '🔧'
      case 'flow': return '🌊'
      case 'chemical': return '🧪'
      default: return '📊'
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-slate-300">Search Data Points</Label>
        <Input
          placeholder="Search by name or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mt-2 bg-slate-800 border-slate-600 text-slate-200"
        />
      </div>

      <div className="text-sm text-slate-400">
        Selected: {selectedValues.length} / {
          widget.config.displayMode === 'dual' ? 2 : 
          widget.config.displayMode === 'single' ? 1 : 10
        }
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
        {filteredData.map((item: any) => {
          const isSelected = selectedValues.includes(item.id)
          const canSelect = selectedValues.length < (
            widget.config.displayMode === 'dual' ? 2 : 
            widget.config.displayMode === 'single' ? 1 : 10
          )

          return (
            <div
              key={item.id}
              onClick={() => (isSelected || canSelect) && handleValueToggle(item.id)}
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all",
                isSelected 
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200" 
                  : canSelect
                    ? "bg-slate-800/50 border-slate-600/50 hover:border-slate-500 text-slate-300"
                    : "bg-slate-800/30 border-slate-700/30 text-slate-500 cursor-not-allowed"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{getCategoryIcon(item.category)}</span>
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs opacity-75">{item.category} • {item.unit}</div>
                  </div>
                </div>
                <div className="text-sm font-mono">
                  {item.sampleData[item.sampleData.length - 1]?.toFixed(1) || '0.0'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Chart Configuration Panel
function ChartConfigPanel({ 
  widget, 
  onChange 
}: { 
  widget: Widget
  onChange: (config: Partial<Widget['config']>) => void 
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-slate-300">Chart Type</Label>
        <Select 
          value={widget.config.chartType || 'line'} 
          onValueChange={(value) => onChange({ chartType: value as any })}
        >
          <SelectTrigger className="mt-2 bg-slate-800 border-slate-600 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="line">Line Chart</SelectItem>
            <SelectItem value="bar">Bar Chart</SelectItem>
            <SelectItem value="area">Area Chart</SelectItem>
            <SelectItem value="pie">Pie Chart</SelectItem>
            <SelectItem value="donut">Donut Chart</SelectItem>
            <SelectItem value="scatter">Scatter Plot</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-slate-300">Display Mode</Label>
        <Select 
          value={widget.config.displayMode || 'single'} 
          onValueChange={(value) => onChange({ displayMode: value as any })}
        >
          <SelectTrigger className="mt-2 bg-slate-800 border-slate-600 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="single">Single Series</SelectItem>
            <SelectItem value="multiple">Multiple Series</SelectItem>
            {widget.type === 'gauge' && <SelectItem value="dual">Dual Gauge</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-slate-300">Refresh Interval (seconds)</Label>
        <Input
          type="number"
          min="5"
          max="300"
          value={widget.config.refreshInterval || 30}
          onChange={(e) => onChange({ refreshInterval: parseInt(e.target.value) })}
          className="mt-2 bg-slate-800 border-slate-600 text-slate-200"
        />
      </div>
    </div>
  )
}

// Styling Panel
function StylingPanel({ 
  widget, 
  onChange 
}: { 
  widget: Widget
  onChange: (config: Partial<Widget['config']>) => void 
}) {
  const styling = widget.config.styling || {}

  const handleStyleChange = (key: string, value: string) => {
    onChange({
      styling: {
        ...styling,
        [key]: value
      }
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-slate-300">Background Color</Label>
        <div className="mt-2 flex space-x-2">
          {['transparent', '#1e293b', '#0f172a', '#334155', '#475569'].map((color) => (
            <button
              key={color}
              onClick={() => handleStyleChange('backgroundColor', color)}
              className={cn(
                "w-8 h-8 rounded border-2 transition-all",
                styling.backgroundColor === color 
                  ? "border-cyan-400 scale-110" 
                  : "border-slate-600 hover:border-slate-500"
              )}
              style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
            >
              {color === 'transparent' && <span className="text-xs">T</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-slate-300">Border Color</Label>
        <div className="mt-2 flex space-x-2">
          {['#64748b', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map((color) => (
            <button
              key={color}
              onClick={() => handleStyleChange('borderColor', color)}
              className={cn(
                "w-8 h-8 rounded border-2 transition-all",
                styling.borderColor === color 
                  ? "border-white scale-110" 
                  : "border-slate-600 hover:border-slate-500"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div>
        <Label className="text-slate-300">Text Color</Label>
        <div className="mt-2 flex space-x-2">
          {['#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'].map((color) => (
            <button
              key={color}
              onClick={() => handleStyleChange('textColor', color)}
              className={cn(
                "w-8 h-8 rounded border-2 transition-all flex items-center justify-center",
                styling.textColor === color 
                  ? "border-cyan-400 scale-110" 
                  : "border-slate-600 hover:border-slate-500"
              )}
              style={{ backgroundColor: color }}
            >
              <span className="text-xs text-slate-900">A</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Main Widget Configuration Component
export function ProfessionalWidgetConfig({
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
    setEditedWidget(widget)
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-200">Configure Widget</h2>
              <p className="text-slate-400 text-sm">{editedWidget?.type ? editedWidget.type.charAt(0).toUpperCase() + editedWidget.type.slice(1) : 'Widget'} Settings</p>
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
              <Label className="text-slate-300">Widget Title</Label>
              <Input
                value={editedWidget.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="mt-2 bg-slate-800 border-slate-600 text-slate-200"
                placeholder="Enter widget title..."
              />
            </div>

            {/* Configuration Tabs */}
            <Tabs defaultValue="data" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-slate-800">
                <TabsTrigger value="data" className="data-[state=active]:bg-slate-700">
                  <Database className="w-4 h-4 mr-2" />
                  Data
                </TabsTrigger>
                <TabsTrigger value="display" className="data-[state=active]:bg-slate-700">
                  <BarChart className="w-4 h-4 mr-2" />
                  Display
                </TabsTrigger>
                <TabsTrigger value="style" className="data-[state=active]:bg-slate-700">
                  <Palette className="w-4 h-4 mr-2" />
                  Style
                </TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="mt-6">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-200 flex items-center">
                      <Database className="w-5 h-5 mr-2 text-cyan-400" />
                      Data Selection
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Choose which data points to display in this widget
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataSelectionPanel widget={editedWidget} onChange={handleConfigChange} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="display" className="mt-6">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-200 flex items-center">
                      <BarChart className="w-5 h-5 mr-2 text-green-400" />
                      Display Settings
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Configure how your data is visualized
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartConfigPanel widget={editedWidget} onChange={handleConfigChange} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="style" className="mt-6">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-200 flex items-center">
                      <Palette className="w-5 h-5 mr-2 text-purple-400" />
                      Styling Options
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Customize the appearance of your widget
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StylingPanel widget={editedWidget} onChange={handleConfigChange} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Configure your widget settings
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300 hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              <Save className="w-4 h-4 mr-2" />
              Save & Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}