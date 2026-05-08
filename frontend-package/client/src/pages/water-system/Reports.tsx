import { useState, useEffect } from 'react'
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, FileText, Download, Printer, Filter, Moon, Sun, Settings, Shield, Search, GripVertical, Edit3, Save, X, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// Draggable Tab Component
interface DraggableTabProps {
  tab: { id: string; label: string; icon: any }
  activeTab: string
  onTabChange: (tab: string) => void
  isAdmin: boolean
}

function DraggableTab({ tab, activeTab, onTabChange, isAdmin }: DraggableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = tab.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 
        hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/25 cursor-pointer
        ${activeTab === tab.id
          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/30 border border-cyan-400/50'
          : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/80 hover:text-cyan-300 border border-slate-600/50'
        }
        ${isDragging ? 'shadow-2xl shadow-cyan-500/50' : ''}
      `}
    >
      {isAdmin && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-cyan-300"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <div onClick={() => onTabChange(tab.id)} className="flex items-center space-x-2">
        <Icon className="h-4 w-4" />
        <span>{tab.label}</span>
      </div>
    </div>
  )
}

// Add New Tab Dialog Component
interface AddTabDialogProps {
  isOpen: boolean
  onClose: () => void
  onAddTab: (tab: { id: string; label: string; icon: any }) => void
}

function AddTabDialog({ isOpen, onClose, onAddTab }: AddTabDialogProps) {
  const [tabName, setTabName] = useState('')
  const [tabIcon, setTabIcon] = useState('FileText')

  const iconOptions = [
    { value: 'FileText', label: 'File Text', icon: FileText },
    { value: 'Calendar', label: 'Calendar', icon: Calendar },
    { value: 'Filter', label: 'Filter', icon: Filter },
    { value: 'Settings', label: 'Settings', icon: Settings },
    { value: 'Download', label: 'Download', icon: Download }
  ]

  const handleAdd = () => {
    if (tabName.trim()) {
      const selectedIcon = iconOptions.find(opt => opt.value === tabIcon)?.icon || FileText
      const newTab = {
        id: tabName.toLowerCase().replace(/\s+/g, '-'),
        label: tabName,
        icon: selectedIcon
      }
      onAddTab(newTab)
      setTabName('')
      setTabIcon('FileText')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-amber-300 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Report Tab
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-cyan-300">Tab Name</label>
            <Input
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              placeholder="Enter tab name (e.g., Custom Report)"
              className="bg-slate-800/70 border-slate-600/50 text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-cyan-300">Icon</label>
            <Select value={tabIcon} onValueChange={setTabIcon}>
              <SelectTrigger className="bg-slate-800/70 border-slate-600/50 text-white">
                <SelectValue placeholder="Select Icon" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {iconOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Add Tab
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Report Tab Component with Drag and Drop
interface ReportTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAdmin: boolean
  tabs: Array<{ id: string; label: string; icon: any }>
  onTabsReorder: (tabs: Array<{ id: string; label: string; icon: any }>) => void
  onAddTab: (tab: { id: string; label: string; icon: any }) => void
  onDeleteTab: (tabId: string) => void
}

function ReportTabs({ activeTab, onTabChange, isAdmin, tabs, onTabsReorder, onAddTab, onDeleteTab }: ReportTabsProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = tabs.findIndex((tab) => tab.id === active.id)
      const newIndex = tabs.findIndex((tab) => tab.id === over?.id)
      onTabsReorder(arrayMove(tabs, oldIndex, newIndex))
    }
  }

  const handleDeleteTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length > 1) { // Prevent deleting all tabs
      onDeleteTab(tabId)
      if (activeTab === tabId) {
        // Switch to first remaining tab
        const remainingTabs = tabs.filter(tab => tab.id !== tabId)
        if (remainingTabs.length > 0) {
          onTabChange(remainingTabs[0].id)
        }
      }
    }
  }

  return (
    <div className="mb-6">
      {isAdmin && (
        <div className="mb-3 flex justify-between items-center">
          <div className="text-sm text-amber-300 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Admin Mode: Drag tabs to reorder, click + to add new tab</span>
          </div>
          <Button
            onClick={() => setShowAddDialog(true)}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Add Tab
          </Button>
        </div>
      )}
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tabs.map(tab => tab.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <div key={tab.id} className="relative group">
                <DraggableTab
                  tab={tab}
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                  isAdmin={isAdmin}
                />
                {isAdmin && tabs.length > 1 && (
                  <Button
                    onClick={(e) => handleDeleteTab(tab.id, e)}
                    className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    size="sm"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      
      <AddTabDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAddTab={onAddTab}
      />
    </div>
  )
}

// Report Filters Component
interface ReportFiltersProps {
  filters: {
    dateRange: { start: string; end: string }
    product: string
    batch: string
    shift: string
  }
  onFilterChange: (filters: any) => void
}

function ReportFilters({ filters, onFilterChange }: ReportFiltersProps) {
  const handleViewReport = () => {
    // This could trigger data refresh or other actions in the future
    }

  return (
    <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 backdrop-blur-sm p-6 rounded-xl border border-slate-600/50 shadow-2xl mb-6">
      <div className="flex items-center mb-4">
        <Filter className="h-5 w-5 text-cyan-400 mr-2" />
        <h3 className="text-lg font-semibold text-white">Report Filters</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium text-cyan-300">Start Date</label>
          <Input
            type="date"
            value={filters.dateRange.start}
            onChange={(e) => onFilterChange({
              ...filters,
              dateRange: { ...filters.dateRange, start: e.target.value }
            })}
            className="bg-slate-800/70 border-slate-600/50 text-white hover:border-cyan-400/50 focus:border-cyan-400 transition-colors"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-cyan-300">End Date</label>
          <Input
            type="date"
            value={filters.dateRange.end}
            onChange={(e) => onFilterChange({
              ...filters,
              dateRange: { ...filters.dateRange, end: e.target.value }
            })}
            className="bg-slate-800/70 border-slate-600/50 text-white hover:border-cyan-400/50 focus:border-cyan-400 transition-colors"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-cyan-300">Product</label>
          <Select value={filters.product} onValueChange={(value) => onFilterChange({ ...filters, product: value })}>
            <SelectTrigger className="bg-slate-800/70 border-slate-600/50 text-white hover:border-cyan-400/50">
              <SelectValue placeholder="Select Product" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="water-treatment-a">Water Treatment A</SelectItem>
              <SelectItem value="water-treatment-b">Water Treatment B</SelectItem>
              <SelectItem value="filtration-system">Filtration System</SelectItem>
              <SelectItem value="chemical-dosing">Chemical Dosing</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-cyan-300">Batch</label>
          <Select value={filters.batch} onValueChange={(value) => onFilterChange({ ...filters, batch: value })}>
            <SelectTrigger className="bg-slate-800/70 border-slate-600/50 text-white hover:border-cyan-400/50">
              <SelectValue placeholder="Select Batch" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="batch-001">BATCH-001</SelectItem>
              <SelectItem value="batch-002">BATCH-002</SelectItem>
              <SelectItem value="batch-003">BATCH-003</SelectItem>
              <SelectItem value="batch-004">BATCH-004</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-cyan-300">Shift</label>
          <div className="flex gap-2">
            <Select value={filters.shift} onValueChange={(value) => onFilterChange({ ...filters, shift: value })}>
              <SelectTrigger className="bg-slate-800/70 border-slate-600/50 text-white hover:border-cyan-400/50">
                <SelectValue placeholder="Select Shift" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="morning">Morning (6AM-2PM)</SelectItem>
                <SelectItem value="afternoon">Afternoon (2PM-10PM)</SelectItem>
                <SelectItem value="night">Night (10PM-6AM)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleViewReport}
              className="
                bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500
                text-white font-semibold px-6 py-2 rounded-lg transition-all duration-300
                hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/25
                border border-cyan-400/30 hover:border-cyan-300/50
                flex items-center gap-2 whitespace-nowrap
              "
            >
              <Search className="h-4 w-4" />
              View Report
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Export Buttons Component
interface ExportButtonsProps {
  onPrint: () => void
  onExportCSV: () => void
}

function ExportButtons({ onPrint, onExportCSV }: ExportButtonsProps) {
  return (
    <div className="flex justify-end gap-3 mb-6">
      <Button
        onClick={onPrint}
        className="
          bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500
          text-white font-medium px-6 py-3 rounded-lg transition-all duration-300
          hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/25
          border border-emerald-400/30 hover:border-emerald-300/50
        "
      >
        <Printer className="h-4 w-4 mr-2" />
        Print Report
      </Button>
      
      <Button
        onClick={onExportCSV}
        className="
          bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500
          text-white font-medium px-6 py-3 rounded-lg transition-all duration-300
          hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25
          border border-purple-400/30 hover:border-purple-300/50
        "
      >
        <Download className="h-4 w-4 mr-2" />
        Export to CSV
      </Button>
    </div>
  )
}

// Admin Column Value Editor Component
interface ColumnValueEditorProps {
  column: string
  currentValues: string[]
  onValuesChange: (column: string, values: string[]) => void
}

function ColumnValueEditor({ column, currentValues, onValuesChange }: ColumnValueEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempValues, setTempValues] = useState(currentValues.join('\n'))

  const handleSave = () => {
    const newValues = tempValues.split('\n').filter(v => v.trim() !== '')
    onValuesChange(column, newValues)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempValues(currentValues.join('\n'))
    setIsEditing(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-cyan-300">{column}</label>
        <Button
          onClick={() => setIsEditing(!isEditing)}
          variant="outline"
          size="sm"
          className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <Edit3 className="h-3 w-3" />
        </Button>
      </div>
      
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={tempValues}
            onChange={(e) => setTempValues(e.target.value)}
            placeholder="Enter values (one per line)"
            className="bg-slate-800/70 border-slate-600/50 text-white min-h-[100px]"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/50 p-2 rounded border border-slate-600/50 min-h-[60px]">
          <div className="text-xs text-slate-400 mb-1">Current values ({currentValues.length}):</div>
          <div className="text-sm text-slate-300 max-h-16 overflow-y-auto">
            {currentValues.length > 0 ? currentValues.join(', ') : 'No values set'}
          </div>
        </div>
      )}
    </div>
  )
}

// Add New Column Dialog Component
interface AddColumnDialogProps {
  isOpen: boolean
  onClose: () => void
  onAddColumn: (column: string) => void
  existingColumns: string[]
}

function AddColumnDialog({ isOpen, onClose, onAddColumn, existingColumns }: AddColumnDialogProps) {
  const [columnName, setColumnName] = useState('')

  const handleAdd = () => {
    if (columnName.trim() && !existingColumns.includes(columnName.trim())) {
      onAddColumn(columnName.trim())
      setColumnName('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-amber-300 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Column
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-cyan-300">Column Name</label>
            <Input
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              placeholder="Enter column name (e.g., Custom Field)"
              className="bg-slate-800/70 border-slate-600/50 text-white"
            />
            {existingColumns.includes(columnName.trim()) && columnName.trim() && (
              <p className="text-red-400 text-xs">Column already exists</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!columnName.trim() || existingColumns.includes(columnName.trim())}
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            >
              Add Column
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Admin Column Configuration Component
interface AdminColumnConfigProps {
  reportType: string
  availableColumns: string[]
  visibleColumns: string[]
  onColumnToggle: (columns: string[]) => void
  isAdmin: boolean
  columnValues: Record<string, string[]>
  onColumnValuesChange: (column: string, values: string[]) => void
  onAddColumn: (column: string) => void
  onDeleteColumn: (column: string) => void
  customColumns: string[]
}

function AdminColumnConfig({ 
  reportType, 
  availableColumns, 
  visibleColumns, 
  onColumnToggle, 
  isAdmin,
  columnValues,
  onColumnValuesChange,
  onAddColumn,
  onDeleteColumn,
  customColumns
}: AdminColumnConfigProps) {
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false)
  
  if (!isAdmin) return null

  const batchRelatedColumns = availableColumns.filter(col => 
    ['batch', 'product', 'material', 'supplier', 'operator'].some(keyword => 
      col.toLowerCase().includes(keyword.toLowerCase())
    )
  )

  const handleDeleteColumn = (column: string) => {
    if (customColumns.includes(column)) {
      onDeleteColumn(column)
      // Remove from visible columns if present
      if (visibleColumns.includes(column)) {
        onColumnToggle(visibleColumns.filter(col => col !== column))
      }
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="
            bg-slate-800/70 border-slate-600/50 text-amber-300 hover:text-amber-200
            hover:bg-slate-700/80 hover:border-amber-400/50 transition-all duration-300
            flex items-center gap-2
          "
        >
          <Shield className="h-4 w-4" />
          Admin: Configure Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-amber-300 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Admin Column Configuration - {reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Column Management */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-white">Column Management</h4>
              <Button
                onClick={() => setShowAddColumnDialog(true)}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                Add Column
              </Button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Select which columns are visible and manage custom columns:
            </p>
            <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto">
              {availableColumns.map((column) => (
                <div key={column} className="flex items-center justify-between space-x-3 p-2 rounded bg-slate-800/30">
                  <div className="flex items-center space-x-3 flex-1">
                    <Checkbox
                      id={column}
                      checked={visibleColumns.includes(column)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onColumnToggle([...visibleColumns, column])
                        } else {
                          onColumnToggle(visibleColumns.filter(col => col !== column))
                        }
                      }}
                      className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                    />
                    <label 
                      htmlFor={column} 
                      className="text-sm text-slate-300 hover:text-white cursor-pointer flex-1"
                    >
                      {column}
                      {customColumns.includes(column) && (
                        <span className="ml-2 text-xs text-green-400">(Custom)</span>
                      )}
                    </label>
                  </div>
                  {customColumns.includes(column) && (
                    <Button
                      onClick={() => handleDeleteColumn(column)}
                      size="sm"
                      className="h-6 w-6 p-0 bg-red-600 hover:bg-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
              <Button
                onClick={() => onColumnToggle(availableColumns)}
                variant="outline"
                size="sm"
                className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Select All
              </Button>
              <Button
                onClick={() => onColumnToggle([])}
                variant="outline"
                size="sm"
                className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Clear All
              </Button>
            </div>
          </div>

          {/* Column Value Configuration for Batch-Related Columns */}
          {batchRelatedColumns.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-3">Batch-Related Column Values</h4>
              <p className="text-slate-400 text-sm mb-4">
                Configure custom values for batch-related columns. These values will be used in dropdown selectors and data generation:
              </p>
              <div className="space-y-4 max-h-60 overflow-y-auto">
                {batchRelatedColumns.map((column) => (
                  <ColumnValueEditor
                    key={column}
                    column={column}
                    currentValues={columnValues[column] || []}
                    onValuesChange={onColumnValuesChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
      
      <AddColumnDialog
        isOpen={showAddColumnDialog}
        onClose={() => setShowAddColumnDialog(false)}
        onAddColumn={onAddColumn}
        existingColumns={availableColumns}
      />
    </Dialog>
  )
}



// Editable Cell Component
interface EditableCellProps {
  value: string
  onSave: (newValue: string) => void
  isAdmin: boolean
  isEditable?: boolean
}

function EditableCell({ value, onSave, isAdmin, isEditable = true }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempValue, setTempValue] = useState(value)

  const handleSave = () => {
    onSave(tempValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempValue(value)
    setIsEditing(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!isAdmin || !isEditable) {
    return <span>{value || '-'}</span>
  }

  return (
    <div className="group relative">
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={handleKeyPress}
            className="h-8 text-xs bg-slate-700 border-slate-600 text-white"
            autoFocus
          />
          <Button
            onClick={handleSave}
            size="sm"
            className="h-6 w-6 p-0 bg-green-600 hover:bg-green-700"
          >
            <Save className="h-3 w-3" />
          </Button>
          <Button
            onClick={handleCancel}
            size="sm"
            className="h-6 w-6 p-0 bg-red-600 hover:bg-red-700"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div 
          onClick={() => setIsEditing(true)}
          className="cursor-pointer hover:bg-slate-600/30 rounded px-1 py-0.5 transition-colors flex items-center gap-1"
        >
          <span>{value || '-'}</span>
          <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </div>
      )}
    </div>
  )
}

// Report Table Component
interface ReportTableProps {
  data: any[]
  columns: string[]
  title: string
  reportType: string
  isAdmin: boolean
  columnValues: Record<string, string[]>
  onColumnValuesChange: (column: string, values: string[]) => void
  onDataChange?: (newData: any[]) => void
  customColumns: string[]
  availableColumns: string[]
  onAddColumn: (column: string) => void
  onDeleteColumn: (column: string) => void
}

function ReportTable({ 
  data, 
  columns, 
  title, 
  reportType, 
  isAdmin, 
  columnValues, 
  onColumnValuesChange, 
  onDataChange,
  customColumns = [],
  availableColumns,
  onAddColumn,
  onDeleteColumn
}: ReportTableProps) {
  const [visibleColumns, setVisibleColumns] = useState(columns)
  const [tableData, setTableData] = useState(data)

  // Define which columns are editable
  const getEditableColumns = (type: string) => {
    switch (type) {
      case 'daily':
        return ['No Of Batches', 'Sum SP', 'Sum Act', 'Err Kg', 'Err %', ...customColumns]
      case 'weekly':
        return ['No Of Batches', 'Sum SP', 'Sum Act', 'Err Kg', 'Err %', ...customColumns]
      case 'monthly':
        return ['No Of Batches', 'Sum SP', 'Sum Act', 'Err Kg', 'Err %', ...customColumns]
      case 'detailed':
        return ['Set Point', 'Actual', 'Err Kg', 'Err %', ...customColumns]
      case 'material':
        return ['Planned KG', 'Actual KG', 'Difference %', ...customColumns]
      default:
        return customColumns
    }
  }

  const editableColumns = getEditableColumns(reportType)
  const displayColumns = isAdmin ? visibleColumns : columns

  const handleCellSave = (rowIndex: number, column: string, newValue: string) => {
    const newData = [...tableData]
    const columnKey = column.toLowerCase().replace(/\s+/g, '_').replace(/%/g, 'percent')
    newData[rowIndex] = { ...newData[rowIndex], [columnKey]: newValue }
    setTableData(newData)
    if (onDataChange) {
      onDataChange(newData)
    }
  }

  // Update table data when prop data changes
  useEffect(() => {
    setTableData(data)
  }, [data])

  return (
    <div className="space-y-4">
      {/* Admin Controls */}
      {isAdmin && (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-amber-300">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">Admin Mode Active</span>
            </div>
            <div className="text-xs text-slate-400">
              Click any editable cell to modify data
            </div>
          </div>
          <AdminColumnConfig
            reportType={reportType}
            availableColumns={availableColumns}
            visibleColumns={visibleColumns}
            onColumnToggle={setVisibleColumns}
            isAdmin={isAdmin}
            columnValues={columnValues}
            onColumnValuesChange={onColumnValuesChange}
            onAddColumn={onAddColumn}
            onDeleteColumn={onDeleteColumn}
            customColumns={customColumns}
          />
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm rounded-xl border border-slate-600/50 shadow-2xl overflow-hidden">
        {/* Table Header */}
        <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 px-6 py-4 border-b border-slate-600/50">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-white">{title}</h3>
              <p className="text-slate-400 text-sm mt-1">
                Showing {tableData.length} records
                {isAdmin && editableColumns.length > 0 && (
                  <span className="ml-2 text-amber-300">• {editableColumns.length} editable columns</span>
                )}
                {isAdmin && customColumns.length > 0 && (
                  <span className="ml-2 text-green-400">• {customColumns.length} custom columns</span>
                )}
              </p>
            </div>
            {isAdmin && (
              <div className="text-xs text-amber-300 bg-amber-900/20 px-2 py-1 rounded border border-amber-700/30">
                Admin View: {displayColumns.length}/{availableColumns.length} columns
              </div>
            )}
          </div>
        </div>
        
        {/* Scrollable Table */}
        <div className="overflow-x-auto max-h-96">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 sticky top-0">
              <tr>
                {displayColumns.map((column, index) => (
                  <th
                    key={index}
                    className={`
                      px-6 py-4 text-left text-sm font-semibold text-cyan-300 uppercase tracking-wider border-b border-cyan-500/30
                      ${isAdmin && editableColumns.includes(column) ? 'bg-amber-900/20' : ''}
                      ${customColumns.includes(column) ? 'bg-green-900/20' : ''}
                    `}
                  >
                    {column}
                    {isAdmin && editableColumns.includes(column) && (
                      <Edit3 className="h-3 w-3 inline ml-1 opacity-60" />
                    )}
                    {customColumns.includes(column) && (
                      <Plus className="h-3 w-3 inline ml-1 opacity-60 text-green-400" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`
                    transition-all duration-200 hover:bg-slate-700/50 hover:shadow-lg hover:shadow-cyan-500/10
                    ${rowIndex % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-700/30'}
                    border-b border-slate-700/50 hover:border-cyan-500/30
                  `}
                >
                  {displayColumns.map((column, colIndex) => (
                    <td
                      key={colIndex}
                      className={`
                        px-6 py-4 text-sm text-slate-300 hover:text-white transition-colors
                        ${isAdmin && editableColumns.includes(column) ? 'bg-amber-900/10' : ''}
                        ${customColumns.includes(column) ? 'bg-green-900/10' : ''}
                      `}
                    >
                      <EditableCell
                        value={(() => {
                          const columnKey = column.toLowerCase().replace(/\s+/g, '_').replace(/%/g, 'percent')
                          const value = (row as any)[columnKey]
                          return value !== undefined ? String(value) : ''
                        })()}
                        onSave={(newValue) => handleCellSave(rowIndex, column, newValue)}
                        isAdmin={isAdmin}
                        isEditable={editableColumns.includes(column)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Dark Mode Toggle Component
function DarkModeToggle() {
  const [isDark, setIsDark] = useState(true)
  
  return (
    <Button
      onClick={() => setIsDark(!isDark)}
      variant="outline"
      size="sm"
      className="
        bg-slate-800/70 border-slate-600/50 text-slate-300 hover:text-white
        hover:bg-slate-700/80 hover:border-cyan-400/50 transition-all duration-300
      "
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}



// API base URL
const API_BASE_URL = 'http://localhost:5000/api'

function normalizeReportListBody(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown[] }).items)) {
    return (body as { items: unknown[] }).items
  }
  return []
}

// API service functions
const apiService = {
  // Fetch daily reports
  async getDailyReports(filters: any) {
    const params = new URLSearchParams()
    if (filters.dateRange?.start) params.append('start_date', filters.dateRange.start)
    if (filters.dateRange?.end) params.append('end_date', filters.dateRange.end)
    if (filters.product) params.append('product', filters.product)
    if (filters.batch) params.append('batch', filters.batch)
    if (filters.shift) params.append('shift', filters.shift)
    
    const response = await fetch(`${API_BASE_URL}/reports/daily?${params}`)
    if (!response.ok) throw new Error('Failed to fetch daily reports')
    const body = await response.json()
    return normalizeReportListBody(body)
  },

  // Fetch weekly reports
  async getWeeklyReports(filters: any) {
    const params = new URLSearchParams()
    if (filters.dateRange?.start) params.append('start_date', filters.dateRange.start)
    if (filters.dateRange?.end) params.append('end_date', filters.dateRange.end)
    if (filters.product) params.append('product', filters.product)
    if (filters.batch) params.append('batch', filters.batch)
    if (filters.shift) params.append('shift', filters.shift)
    
    const response = await fetch(`${API_BASE_URL}/reports/weekly?${params}`)
    if (!response.ok) throw new Error('Failed to fetch weekly reports')
    const body = await response.json()
    return normalizeReportListBody(body)
  },

  // Fetch monthly reports
  async getMonthlyReports(filters: any) {
    const params = new URLSearchParams()
    if (filters.dateRange?.start) params.append('start_date', filters.dateRange.start)
    if (filters.dateRange?.end) params.append('end_date', filters.dateRange.end)
    if (filters.product) params.append('product', filters.product)
    if (filters.batch) params.append('batch', filters.batch)
    if (filters.shift) params.append('shift', filters.shift)
    
    const response = await fetch(`${API_BASE_URL}/reports/monthly?${params}`)
    if (!response.ok) throw new Error('Failed to fetch monthly reports')
    const body = await response.json()
    return normalizeReportListBody(body)
  },

  // Fetch detailed reports
  async getDetailedReports(filters: any) {
    const params = new URLSearchParams()
    if (filters.dateRange?.start) params.append('start_date', filters.dateRange.start)
    if (filters.dateRange?.end) params.append('end_date', filters.dateRange.end)
    if (filters.product) params.append('product', filters.product)
    if (filters.batch) params.append('batch', filters.batch)
    if (filters.shift) params.append('shift', filters.shift)
    
    const response = await fetch(`${API_BASE_URL}/reports/detailed?${params}`)
    if (!response.ok) throw new Error('Failed to fetch detailed reports')
    const body = await response.json()
    return normalizeReportListBody(body)
  },

  // Fetch material reports
  async getMaterialReports(filters: any) {
    const params = new URLSearchParams()
    if (filters.dateRange?.start) params.append('start_date', filters.dateRange.start)
    if (filters.dateRange?.end) params.append('end_date', filters.dateRange.end)
    if (filters.product) params.append('product', filters.product)
    if (filters.batch) params.append('batch', filters.batch)
    if (filters.shift) params.append('shift', filters.shift)
    
    const response = await fetch(`${API_BASE_URL}/reports/material?${params}`)
    if (!response.ok) throw new Error('Failed to fetch material reports')
    const body = await response.json()
    return normalizeReportListBody(body)
  },

  // Export reports
  async exportReports(reportType: string, filters: any) {
    const params = new URLSearchParams()
    if (filters.dateRange?.start) params.append('start_date', filters.dateRange.start)
    if (filters.dateRange?.end) params.append('end_date', filters.dateRange.end)
    if (filters.product) params.append('product', filters.product)
    if (filters.batch) params.append('batch', filters.batch)
    if (filters.shift) params.append('shift', filters.shift)
    
    const response = await fetch(`${API_BASE_URL}/reports/export/${reportType}?${params}`)
    if (!response.ok) throw new Error('Failed to export reports')
    return response.json()
  }
}

// Transform backend data to frontend format
const transformBackendData = (backendData: any[], type: string): any[] => {
  return backendData.map(item => {
    switch (type) {
      case 'daily':
      case 'weekly':
      case 'monthly':
        return {
          product_name: item.productName,
          no_of_batches: item.noOfBatches,
          sum_sp: item.sumSP,
          sum_act: item.sumAct,
          err_kg: item.errKg,
          err_percent: item.errPercent
        }
      case 'detailed':
        return {
          batch: item.batch,
          material_name: item.materialName,
          code: item.code,
          set_point: item.setPoint,
          actual: item.actual,
          err_kg: item.errKg,
          err_percent: item.errPercent
        }
      case 'material':
        return {
          material_name: item.materialName,
          code: item.code,
          planned_kg: item.plannedKg,
          actual_kg: item.actualKg,
          difference_percent: item.differencePercent
        }
      default:
        return item
    }
  })
}

// Mock Data Generator (fallback)
const generateMockData = (type: string, columnValues?: Record<string, string[]>) => {
  const facilities = ['Riyadh Central', 'Jeddah West', 'Dammam East', 'Medina North', 'Mecca South']
  const products = columnValues?.['Product'] || ['Water Treatment A', 'Water Treatment B', 'Filtration System', 'Chemical Dosing']
  const batches = columnValues?.['Batch ID'] || ['BATCH-001', 'BATCH-002', 'BATCH-003', 'BATCH-004']
  const materials = columnValues?.['Material'] || ['Chlorine', 'Coagulant', 'pH Buffer', 'Flocculant', 'Carbon Filter']
  const suppliers = columnValues?.['Supplier'] || ['ChemCorp', 'AquaSupply', 'WaterTech']
  const operators = columnValues?.['Operator'] || ['Operator 1', 'Operator 2', 'Operator 3']
  
  switch (type) {
    case 'daily':
      const dailyData = [
        { product_name: 'Water Treatment A', no_of_batches: 8, sum_sp: '750.5', sum_act: '748.2', err_kg: '2.3', err_percent: '0.31%' },
        { product_name: 'Water Treatment B', no_of_batches: 12, sum_sp: '980.0', sum_act: '985.4', err_kg: '5.4', err_percent: '0.55%' },
        { product_name: 'Filtration System', no_of_batches: 6, sum_sp: '650.8', sum_act: '649.1', err_kg: '1.7', err_percent: '0.26%' },
        { product_name: 'Chemical Dosing', no_of_batches: 15, sum_sp: '1200.0', sum_act: '1205.8', err_kg: '5.8', err_percent: '0.48%' },
        { product_name: 'UV Treatment', no_of_batches: 9, sum_sp: '820.4', sum_act: '818.9', err_kg: '1.5', err_percent: '0.18%' },
        { product_name: 'Reverse Osmosis', no_of_batches: 11, sum_sp: '1150.2', sum_act: '1148.7', err_kg: '1.5', err_percent: '0.13%' },
        { product_name: 'Coagulation Process', no_of_batches: 7, sum_sp: '580.6', sum_act: '582.1', err_kg: '1.5', err_percent: '0.26%' },
        { product_name: 'Disinfection', no_of_batches: 14, sum_sp: '1080.0', sum_act: '1077.3', err_kg: '2.7', err_percent: '0.25%' },
        { product_name: 'Membrane Filtration', no_of_batches: 10, sum_sp: '945.3', sum_act: '943.8', err_kg: '1.5', err_percent: '0.16%' },
        { product_name: 'Ion Exchange', no_of_batches: 13, sum_sp: '1125.7', sum_act: '1128.2', err_kg: '2.5', err_percent: '0.22%' },
        { product_name: 'Ozonation', no_of_batches: 5, sum_sp: '456.8', sum_act: '455.3', err_kg: '1.5', err_percent: '0.33%' },
        { product_name: 'Electrocoagulation', no_of_batches: 8, sum_sp: '678.9', sum_act: '680.4', err_kg: '1.5', err_percent: '0.22%' }
      ]
      return dailyData
    
    case 'weekly':
      const weeklyData = [
        { product_name: 'Water Treatment A', no_of_batches: 45, sum_sp: '5240.5', sum_act: '5238.9', err_kg: '16.4', err_percent: '0.31%' },
        { product_name: 'Water Treatment B', no_of_batches: 78, sum_sp: '8960.0', sum_act: '8972.8', err_kg: '32.8', err_percent: '0.37%' },
        { product_name: 'Filtration System', no_of_batches: 38, sum_sp: '4120.6', sum_act: '4118.2', err_kg: '12.4', err_percent: '0.30%' },
        { product_name: 'Chemical Dosing', no_of_batches: 89, sum_sp: '9650.0', sum_act: '9668.4', err_kg: '38.4', err_percent: '0.40%' },
        { product_name: 'UV Treatment', no_of_batches: 52, sum_sp: '5820.8', sum_act: '5816.3', err_kg: '14.5', err_percent: '0.25%' },
        { product_name: 'Reverse Osmosis', no_of_batches: 67, sum_sp: '7380.2', sum_act: '7376.9', err_kg: '13.3', err_percent: '0.18%' },
        { product_name: 'Coagulation Process', no_of_batches: 41, sum_sp: '4560.4', sum_act: '4562.8', err_kg: '12.4', err_percent: '0.27%' },
        { product_name: 'Membrane Filtration', no_of_batches: 56, sum_sp: '6245.3', sum_act: '6243.8', err_kg: '15.5', err_percent: '0.25%' },
        { product_name: 'Ion Exchange', no_of_batches: 72, sum_sp: '7825.7', sum_act: '7828.2', err_kg: '22.5', err_percent: '0.29%' },
        { product_name: 'Ozonation', no_of_batches: 29, sum_sp: '3156.8', sum_act: '3155.3', err_kg: '11.5', err_percent: '0.36%' },
        { product_name: 'Electrocoagulation', no_of_batches: 44, sum_sp: '4678.9', sum_act: '4680.4', err_kg: '13.5', err_percent: '0.29%' },
        { product_name: 'Biological Treatment', no_of_batches: 35, sum_sp: '3890.2', sum_act: '3888.7', err_kg: '12.5', err_percent: '0.32%' }
      ]
      return weeklyData
    
    case 'monthly':
      const monthlyData = [
        { product_name: 'Water Treatment A', no_of_batches: 195, sum_sp: '22750.5', sum_act: '22738.2', err_kg: '82.3', err_percent: '0.36%' },
        { product_name: 'Water Treatment B', no_of_batches: 324, sum_sp: '38960.0', sum_act: '38985.4', err_kg: '125.4', err_percent: '0.32%' },
        { product_name: 'Filtration System', no_of_batches: 168, sum_sp: '18650.8', sum_act: '18649.1', err_kg: '51.7', err_percent: '0.28%' },
        { product_name: 'Chemical Dosing', no_of_batches: 387, sum_sp: '42200.0', sum_act: '42258.8', err_kg: '158.8', err_percent: '0.38%' },
        { product_name: 'UV Treatment', no_of_batches: 245, sum_sp: '28820.4', sum_act: '28818.9', err_kg: '71.5', err_percent: '0.25%' },
        { product_name: 'Reverse Osmosis', no_of_batches: 298, sum_sp: '33150.2', sum_act: '33148.7', err_kg: '61.5', err_percent: '0.19%' },
        { product_name: 'Coagulation Process', no_of_batches: 172, sum_sp: '19580.6', sum_act: '19582.1', err_kg: '51.5', err_percent: '0.26%' },
        { product_name: 'Disinfection', no_of_batches: 356, sum_sp: '40800.0', sum_act: '40773.3', err_kg: '126.7', err_percent: '0.31%' },
        { product_name: 'Membrane Filtration', no_of_batches: 278, sum_sp: '31245.3', sum_act: '31243.8', err_kg: '75.5', err_percent: '0.24%' },
        { product_name: 'Ion Exchange', no_of_batches: 312, sum_sp: '34825.7', sum_act: '34828.2', err_kg: '92.5', err_percent: '0.27%' },
        { product_name: 'Ozonation', no_of_batches: 134, sum_sp: '15156.8', sum_act: '15155.3', err_kg: '45.5', err_percent: '0.30%' },
        { product_name: 'Electrocoagulation', no_of_batches: 189, sum_sp: '20678.9', sum_act: '20680.4', err_kg: '53.5', err_percent: '0.26%' },
        { product_name: 'Biological Treatment', no_of_batches: 156, sum_sp: '17890.2', sum_act: '17888.7', err_kg: '48.5', err_percent: '0.27%' },
        { product_name: 'Advanced Oxidation', no_of_batches: 98, sum_sp: '11234.6', sum_act: '11236.1', err_kg: '31.5', err_percent: '0.28%' }
      ]
      return monthlyData
    
    case 'detailed':
      const detailedData = [
        { batch: 'BATCH-001', material_name: 'Chlorine', code: 'CLR-2501', set_point: '125.0', actual: '124.8', err_kg: '0.2', err_percent: '0.16%' },
        { batch: 'BATCH-002', material_name: 'Coagulant', code: 'COG-3402', set_point: '89.5', actual: '90.2', err_kg: '0.7', err_percent: '0.78%' },
        { batch: 'BATCH-003', material_name: 'pH Buffer', code: 'PHB-1205', set_point: '156.8', actual: '156.1', err_kg: '0.7', err_percent: '0.45%' },
        { batch: 'BATCH-004', material_name: 'Flocculant', code: 'FLC-4503', set_point: '78.2', actual: '78.9', err_kg: '0.7', err_percent: '0.89%' },
        { batch: 'BATCH-005', material_name: 'Carbon Filter', code: 'CRB-6701', set_point: '245.0', actual: '244.3', err_kg: '0.7', err_percent: '0.29%' },
        { batch: 'BATCH-006', material_name: 'Chlorine', code: 'CLR-2502', set_point: '132.4', actual: '133.1', err_kg: '0.7', err_percent: '0.53%' },
        { batch: 'BATCH-007', material_name: 'Aluminum Sulfate', code: 'ALS-8901', set_point: '98.7', actual: '98.2', err_kg: '0.5', err_percent: '0.51%' },
        { batch: 'BATCH-008', material_name: 'Lime', code: 'LIM-3304', set_point: '167.3', actual: '167.8', err_kg: '0.5', err_percent: '0.30%' },
        { batch: 'BATCH-009', material_name: 'Sodium Hypochlorite', code: 'SOH-5506', set_point: '110.5', actual: '109.9', err_kg: '0.6', err_percent: '0.54%' },
        { batch: 'BATCH-010', material_name: 'Potassium Permanganate', code: 'PPM-7708', set_point: '76.8', actual: '77.2', err_kg: '0.4', err_percent: '0.52%' },
        { batch: 'BATCH-011', material_name: 'Ferric Chloride', code: 'FRC-9909', set_point: '143.2', actual: '142.8', err_kg: '0.4', err_percent: '0.28%' },
        { batch: 'BATCH-012', material_name: 'Activated Carbon', code: 'ATC-1011', set_point: '198.5', actual: '199.1', err_kg: '0.6', err_percent: '0.30%' },
        { batch: 'BATCH-013', material_name: 'Polymer', code: 'PLY-4402', set_point: '65.3', actual: '65.8', err_kg: '0.5', err_percent: '0.77%' },
        { batch: 'BATCH-014', material_name: 'Calcium Hydroxide', code: 'CAH-7703', set_point: '189.4', actual: '188.9', err_kg: '0.5', err_percent: '0.26%' },
        { batch: 'BATCH-015', material_name: 'Sodium Carbonate', code: 'SOC-5504', set_point: '112.7', actual: '113.2', err_kg: '0.5', err_percent: '0.44%' }
      ]
      return detailedData
    
    case 'material':
      const materialData = [
        { material_name: 'Chlorine', code: 'CLR-2501', planned_kg: '450.0', actual_kg: '448.5', difference_percent: '-0.33%' },
        { material_name: 'Coagulant', code: 'COG-3402', planned_kg: '320.5', actual_kg: '322.8', difference_percent: '+0.72%' },
        { material_name: 'pH Buffer', code: 'PHB-1205', planned_kg: '280.0', actual_kg: '278.9', difference_percent: '-0.39%' },
        { material_name: 'Flocculant', code: 'FLC-4503', planned_kg: '185.3', actual_kg: '187.1', difference_percent: '+0.97%' },
        { material_name: 'Carbon Filter', code: 'CRB-6701', planned_kg: '520.0', actual_kg: '518.2', difference_percent: '-0.35%' },
        { material_name: 'Aluminum Sulfate', code: 'ALS-8901', planned_kg: '395.7', actual_kg: '397.2', difference_percent: '+0.38%' },
        { material_name: 'Lime', code: 'LIM-3304', planned_kg: '265.0', actual_kg: '266.4', difference_percent: '+0.53%' },
        { material_name: 'Sodium Hypochlorite', code: 'SOH-5506', planned_kg: '380.2', actual_kg: '378.9', difference_percent: '-0.34%' },
        { material_name: 'Potassium Permanganate', code: 'PPM-7708', planned_kg: '125.5', actual_kg: '126.8', difference_percent: '+1.04%' },
        { material_name: 'Ferric Chloride', code: 'FRC-9909', planned_kg: '340.0', actual_kg: '338.7', difference_percent: '-0.38%' },
        { material_name: 'Activated Carbon', code: 'ATC-1011', planned_kg: '485.0', actual_kg: '487.3', difference_percent: '+0.47%' },
        { material_name: 'Polymer', code: 'PLY-4402', planned_kg: '156.8', actual_kg: '155.2', difference_percent: '-1.02%' }
      ]
      return materialData
    
    default:
      return []
  }
}

// Column definitions for each report type
const getColumns = (type: string) => {
  switch (type) {
    case 'daily':
      return ['Product Name', 'No Of Batches', 'Sum SP', 'Sum Act', 'Err Kg', 'Err %']
    case 'weekly':
      return ['Product Name', 'No Of Batches', 'Sum SP', 'Sum Act', 'Err Kg', 'Err %']
    case 'monthly':
      return ['Product Name', 'No Of Batches', 'Sum SP', 'Sum Act', 'Err Kg', 'Err %']
    case 'detailed':
      return ['Batch', 'Material Name', 'Code', 'Set Point', 'Actual', 'Err Kg', 'Err %']
    case 'material':
      return ['Material Name', 'Code', 'Planned KG', 'Actual KG', 'Difference %']
    default:
      return []
  }
}

// Main Reports Component
export function Reports() {
  const [activeTab, setActiveTab] = useState('daily')
  const [isAdmin, setIsAdmin] = useState(true) // For demo purposes, set to true
  const [isCustomizeMode, setIsCustomizeMode] = useState(false) // New customization mode
  const [filters, setFilters] = useState({
    dateRange: {
      start: new Date().toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    },
    product: '',
    batch: '',
    shift: ''
  })
  
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Fetch data from backend
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      let response: any[]
      
      switch (activeTab) {
        case 'daily':
          response = await apiService.getDailyReports(filters)
          break
        case 'weekly':
          response = await apiService.getWeeklyReports(filters)
          break
        case 'monthly':
          response = await apiService.getMonthlyReports(filters)
          break
        case 'detailed':
          response = await apiService.getDetailedReports(filters)
          break
        case 'material':
          response = await apiService.getMaterialReports(filters)
          break
        default:
          response = await apiService.getDailyReports(filters)
      }
      
      const transformedData = transformBackendData(response, activeTab)
      setData(transformedData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
      // Fallback to mock data
      setData(generateMockData(activeTab))
    } finally {
      setLoading(false)
    }
  }

  // Fetch data when tab or filters change
  useEffect(() => {
    fetchData()
  }, [activeTab, filters])

  // Default tabs configuration
  const [tabs, setTabs] = useState([
    { id: 'daily', label: 'Daily Report', icon: Calendar },
    { id: 'weekly', label: 'Weekly Report', icon: Calendar },
    { id: 'monthly', label: 'Monthly Report', icon: Calendar },
    { id: 'detailed', label: 'Detailed Report', icon: FileText },
    { id: 'material', label: 'Material Consumption Report', icon: Filter }
  ])

  // Saved state for tabs and columns
  const [savedTabs, setSavedTabs] = useState(tabs)
  const [savedCustomColumns, setSavedCustomColumns] = useState<Record<string, string[]>>({
    daily: [],
    weekly: [],
    monthly: [],
    detailed: [],
    material: []
  })
  const [savedColumnValues, setSavedColumnValues] = useState<Record<string, string[]>>({
    'Product Name': ['Water Treatment A', 'Water Treatment B', 'Filtration System', 'Chemical Dosing', 'UV Treatment', 'Reverse Osmosis', 'Coagulation Process', 'Disinfection'],
    'Batch': ['BATCH-001', 'BATCH-002', 'BATCH-003', 'BATCH-004', 'BATCH-005', 'BATCH-006'],
    'Material Name': ['Chlorine', 'Coagulant', 'pH Buffer', 'Flocculant', 'Carbon Filter', 'Aluminum Sulfate', 'Lime', 'Sodium Hypochlorite'],
    'Code': ['CLR-2501', 'COG-3402', 'PHB-1205', 'FLC-4503', 'CRB-6701', 'ALS-8901', 'LIM-3304', 'SOH-5506']
  })

  // Working state (editable during customize mode)
  const [customColumns, setCustomColumns] = useState(savedCustomColumns)
  const [columnValues, setColumnValues] = useState(savedColumnValues)

  // Customization mode handlers
  const handleEnterCustomizeMode = () => {
    setIsCustomizeMode(true)
  }

  const handleSaveCustomizations = () => {
    setSavedTabs([...tabs])
    setSavedCustomColumns({ ...customColumns })
    setSavedColumnValues({ ...columnValues })
    setIsCustomizeMode(false)
  }

  const handleCancelCustomizations = () => {
    setTabs([...savedTabs])
    setCustomColumns({ ...savedCustomColumns })
    setColumnValues({ ...savedColumnValues })
    setIsCustomizeMode(false)
  }

  const handleTabsReorder = (newTabs: Array<{ id: string; label: string; icon: any }>) => {
    if (isCustomizeMode) {
      setTabs(newTabs)
    }
  }

  const handleAddTab = (newTab: { id: string; label: string; icon: any }) => {
    if (isCustomizeMode) {
      setTabs(prev => [...prev, newTab])
      setCustomColumns(prev => ({ ...prev, [newTab.id]: [] }))
    }
  }

  const handleDeleteTab = (tabId: string) => {
    if (isCustomizeMode) {
      setTabs(prev => prev.filter(tab => tab.id !== tabId))
      setCustomColumns(prev => {
        const { [tabId]: deleted, ...rest } = prev
        return rest
      })
    }
  }

  const handleAddColumn = (column: string) => {
    if (isCustomizeMode) {
      setCustomColumns(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), column]
      }))
    }
  }

  const handleDeleteColumn = (column: string) => {
    if (isCustomizeMode) {
      setCustomColumns(prev => ({
        ...prev,
        [activeTab]: (prev[activeTab] || []).filter(col => col !== column)
      }))
    }
  }

  const handleColumnValuesChange = (column: string, values: string[]) => {
    if (isCustomizeMode) {
      setColumnValues(prev => ({
        ...prev,
        [column]: values
      }))
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportCSV = () => {
    const data = generateMockData(activeTab, columnValues)
    const columns = getAllColumns(activeTab)
    
    const csvContent = "data:text/csv;charset=utf-8," + 
      columns.join(',') + '\n' +
      data.map(row => 
        columns.map(col => 
          row[col.toLowerCase().replace(/\s+/g, '_')] || ''
        ).join(',')
      ).join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${activeTab}-report-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getReportTitle = (type: string) => {
    const tabConfig = tabs.find(tab => tab.id === type)
    if (tabConfig) {
      return `${tabConfig.label} Analysis`
    }
    const titles: Record<string, string> = {
      daily: 'Daily Production Report',
      weekly: 'Weekly Performance Summary',
      monthly: 'Monthly Operations Overview',
      detailed: 'Detailed Batch Analysis',
      material: 'Material Consumption Report'
    }
    return titles[type] || 'Custom Report'
  }

  // Get all available columns including custom ones
  const getAllColumns = (type: string) => {
    const baseColumns = getColumns(type)
    const customCols = customColumns[type] || []
    return [...baseColumns, ...customCols]
  }

  return (
    <WaterSystemLayout 
      title="Fakieh Reports" 
      subtitle="Advanced production reporting and analytics dashboard"
    >
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 opacity-50 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1),transparent_50%)] pointer-events-none" />
      
      <div className="relative space-y-8">
        {/* Header with Admin Toggle and Dark Mode Toggle */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Production Reports
            </h1>
            <p className="text-slate-400 mt-2">Comprehensive facility monitoring and analysis</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Customization Mode Controls */}
            {isAdmin && !isCustomizeMode && (
              <Button
                onClick={handleEnterCustomizeMode}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Customize
              </Button>
            )}
            
            {isCustomizeMode && (
              <div className="flex items-center gap-2">
                <div className="text-sm text-amber-300 bg-amber-900/20 px-3 py-1 rounded border border-amber-700/30">
                  Customization Mode Active
                </div>
                <Button
                  onClick={handleSaveCustomizations}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                  size="sm"
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  onClick={handleCancelCustomizations}
                  variant="outline"
                  className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            )}

            <Button
              onClick={() => setIsAdmin(!isAdmin)}
              variant="outline"
              className={`
                transition-all duration-300 flex items-center gap-2
                ${isAdmin 
                  ? 'bg-amber-900/30 border-amber-600/50 text-amber-300 hover:bg-amber-800/40' 
                  : 'bg-slate-800/70 border-slate-600/50 text-slate-300 hover:bg-slate-700/80'
                }
              `}
            >
              <Shield className="h-4 w-4" />
              {isAdmin ? 'Admin Mode' : 'User Mode'}
            </Button>
            <DarkModeToggle />
          </div>
        </div>

        {/* Report Navigation Tabs */}
        <ReportTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          isAdmin={isCustomizeMode}
          tabs={tabs}
          onTabsReorder={handleTabsReorder}
          onAddTab={handleAddTab}
          onDeleteTab={handleDeleteTab}
        />

        {/* Filters Section */}
        <ReportFilters filters={filters} onFilterChange={setFilters} />

        {/* Export Buttons */}
        <ExportButtons onPrint={handlePrint} onExportCSV={handleExportCSV} />

        {/* Report Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <span className="ml-2 text-slate-300">Loading report data...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8">
            <AlertCircle className="h-8 w-8 text-red-400 mr-2" />
            <span className="text-red-400">{error}</span>
          </div>
        ) : (
          <ReportTable
            data={data}
            columns={getColumns(activeTab)}
            title={getReportTitle(activeTab)}
            reportType={activeTab}
            isAdmin={isCustomizeMode}
            columnValues={columnValues}
            onColumnValuesChange={handleColumnValuesChange}
            onDataChange={(newData) => {
              // Handle data changes if needed
              }}
            customColumns={customColumns[activeTab] || []}
            availableColumns={getAllColumns(activeTab)}
            onAddColumn={handleAddColumn}
            onDeleteColumn={handleDeleteColumn}
          />
        )}

        {/* Footer Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm p-6 rounded-xl border border-slate-600/50 hover:border-cyan-400/50 transition-all duration-300">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-slate-400 text-sm">Total Records</p>
                <p className="text-2xl font-bold text-cyan-400">{generateMockData(activeTab).length}</p>
              </div>
              <FileText className="h-8 w-8 text-cyan-400/60" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm p-6 rounded-xl border border-slate-600/50 hover:border-emerald-400/50 transition-all duration-300">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-slate-400 text-sm">Active Facilities</p>
                <p className="text-2xl font-bold text-emerald-400">5</p>
              </div>
              <Calendar className="h-8 w-8 text-emerald-400/60" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm p-6 rounded-xl border border-slate-600/50 hover:border-purple-400/50 transition-all duration-300">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-slate-400 text-sm">Report Type</p>
                <p className="text-2xl font-bold text-purple-400 capitalize">{activeTab}</p>
              </div>
              <Filter className="h-8 w-8 text-purple-400/60" />
            </div>
          </div>
        </div>
      </div>
    </WaterSystemLayout>
  )
}