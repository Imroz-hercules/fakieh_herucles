import React, { useState, useEffect } from 'react'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { KPICard } from '../../components/water-system/KPICard'
import { ChartComponent } from '../../components/water-system/ChartComponent'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, RotateCcw, Plus, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Mock data for charts
const productionTrendData = {
  labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
  datasets: [
    {
      label: 'Production Output',
      data: [45, 52, 48, 61, 58, 55],
      borderColor: '#0891b2',
      backgroundColor: 'rgba(8, 145, 178, 0.1)',
      fill: true,
      tension: 0.4
    }
  ]
}

const weeklyOutputData = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  datasets: [
    {
      label: 'Weekly Output',
      data: [1200, 1450, 1100, 1350, 1600, 1200, 900],
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(156, 163, 175, 0.8)'
      ],
      borderColor: [
        'rgb(34, 197, 94)',
        'rgb(59, 130, 246)',
        'rgb(168, 85, 247)',
        'rgb(245, 158, 11)',
        'rgb(239, 68, 68)',
        'rgb(20, 184, 166)',
        'rgb(156, 163, 175)'
      ],
      borderWidth: 1
    }
  ]
}

const energyConsumptionData = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  datasets: [
    {
      label: 'Energy Consumption',
      data: [320, 380, 290, 420, 360, 310, 250],
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      fill: true,
      tension: 0.4
    }
  ]
}

const productionDistributionData = {
  labels: ['Product A', 'Product B', 'Product C', 'Product D'],
  datasets: [
    {
      data: [35, 25, 25, 15],
      backgroundColor: [
        'rgba(8, 145, 178, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)'
      ],
      borderColor: [
        'rgb(8, 145, 178)',
        'rgb(34, 197, 94)',
        'rgb(245, 158, 11)',
        'rgb(239, 68, 68)'
      ],
      borderWidth: 2
    }
  ]
}

const orderStatusData = {
  labels: ['Completed', 'In Progress', 'Pending', 'Cancelled'],
  datasets: [
    {
      data: [45, 30, 20, 5],
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)'
      ],
      borderColor: [
        'rgb(34, 197, 94)',
        'rgb(59, 130, 246)',
        'rgb(245, 158, 11)',
        'rgb(239, 68, 68)'
      ],
      borderWidth: 2
    }
  ]
}

// Sortable Chart Component
function SortableChart({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 p-1.5 drag-handle rounded cursor-grab 
                   opacity-0 group-hover:opacity-100 transition-all duration-300
                   hover:scale-110 active:cursor-grabbing active:scale-95"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-cyan-400" />
      </div>
      {children}
    </div>
  )
}

// Chart Form Interface
interface ChartFormData {
  title: string
  type: 'line' | 'bar' | 'doughnut' | 'pie' | 'polarArea' | 'radar'
  color: string
  dataSource: string | string[]
}

// Available data sources for charts
const availableDataSources = [
  { value: "raw-material-quality", label: "Raw Material Quality", unit: "%" },
  {
    value: "pre-cleaning-efficiency",
    label: "Pre-Cleaning Efficiency",
    unit: "%",
  },
  {
    value: "final-product-quality",
    label: "Final Product Quality",
    unit: "%",
  },
  { value: "production-output", label: "Production Output", unit: "m³/day" },
  { value: "energy-consumption", label: "Energy Consumption", unit: "kWh" },
  { value: "water-quality", label: "Water Quality Score", unit: "%" },
  { value: "facility-efficiency", label: "Facility Efficiency", unit: "%" },
  { value: "maintenance-alerts", label: "Maintenance Alerts", unit: "count" },
]

// Chart Management Functions
function ChartManagementDialog({ 
  chart, 
  isEdit = false, 
  isOpen, 
  setIsOpen, 
  onSave, 
  onDelete 
}: {
  chart?: any
  isEdit?: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  onSave: (data: ChartFormData, chartId?: string) => void
  onDelete?: (chartId: string) => void
}) {
  const [formData, setFormData] = useState<ChartFormData>({
    title: chart?.title || "",
    type: chart?.type || "line",
    color: chart?.color || "cyan",
    dataSource: chart?.dataSource || "production-output",
  });

  useEffect(() => {
    if (chart) {
      setFormData({
        title: chart.title,
        type: chart.type,
        color: chart.color,
        dataSource: chart.dataSource,
      });
    }
  }, [chart]);

  // Check if chart type supports multiple datasets
  const supportsMultipleDatasets = ["line", "bar", "radar"].includes(
    formData.type,
  );
  
  // Convert single dataSource to array for multi-select
  const selectedDataSources = Array.isArray(formData.dataSource) 
    ? formData.dataSource 
    : [formData.dataSource]

  const chartTypes = [
    { value: 'line', label: 'Line Chart' },
    { value: 'bar', label: 'Bar Chart' },
    { value: 'doughnut', label: 'Doughnut Chart' },
    { value: 'pie', label: 'Pie Chart' },
    { value: 'polarArea', label: 'Polar Area Chart' },
    { value: 'radar', label: 'Radar Chart' }
  ]

  const colorOptions = [
    { value: 'cyan', label: 'Cyan', color: 'rgba(8, 145, 178, 0.8)' },
    { value: 'green', label: 'Green', color: 'rgba(34, 197, 94, 0.8)' },
    { value: 'orange', label: 'Orange', color: 'rgba(245, 158, 11, 0.8)' },
    { value: 'purple', label: 'Purple', color: 'rgba(168, 85, 247, 0.8)' },
    { value: 'red', label: 'Red', color: 'rgba(239, 68, 68, 0.8)' },
    { value: 'blue', label: 'Blue', color: 'rgba(59, 130, 246, 0.8)' }
  ]

  const handleSave = () => {
    onSave(formData, chart?.id);
    setIsOpen(false);
    setFormData({
      title: "",
      type: "line",
      color: "cyan",
      dataSource: "production-output",
    });
  };

  const handleDelete = () => {
    if (chart?.id && onDelete) {
      onDelete(chart.id);
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-cyan-400">
            {isEdit ? 'Edit Chart' : 'Add New Chart'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm text-slate-300">Chart Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter chart title"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type" className="text-sm text-slate-300">Chart Type</Label>
            <Select value={formData.type} onValueChange={(value: any) => {
              // Reset dataSource to single when switching to single-dataset chart types
              const newDataSource = ['doughnut', 'pie', 'polarArea'].includes(value)
                ? (Array.isArray(formData.dataSource) ? formData.dataSource[0] : formData.dataSource)
                : formData.dataSource
              setFormData({ ...formData, type: value, dataSource: newDataSource })
            }}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="Select chart type" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {chartTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="text-white hover:bg-slate-700">
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      {['line', 'bar', 'radar'].includes(type.value) && (
                        <span className="text-xs text-cyan-400">✓ Supports multiple datasets</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color" className="text-sm text-slate-300">Chart Color</Label>
            <Select value={formData.color} onValueChange={(value) => setFormData({ ...formData, color: value })}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="Select color" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {colorOptions.map((color) => (
                  <SelectItem key={color.value} value={color.value} className="text-white hover:bg-slate-700">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-4 h-4 rounded" 
                        style={{ backgroundColor: color.color }}
                      />
                      <span>{color.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataSource" className="text-sm text-slate-300">
              Data Source{supportsMultipleDatasets ? 's (Select multiple)' : ''}
            </Label>
            
            {supportsMultipleDatasets ? (
              <div className="space-y-2">
                <div className="text-xs text-cyan-400 mb-2">
                  ✓ This chart type supports multiple data sources for comparison
                </div>
                <div className="max-h-32 overflow-y-auto border border-slate-600 rounded-md bg-slate-800">
                  {availableDataSources.map((source) => (
                    <label key={source.value} className="flex items-center p-2 hover:bg-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDataSources.includes(source.value)}
                        onChange={(e) => {
                          const newSources = e.target.checked
                            ? [...selectedDataSources, source.value]
                            : selectedDataSources.filter(s => s !== source.value)
                          setFormData({ ...formData, dataSource: newSources })
                        }}
                        className="mr-3 w-4 h-4 text-cyan-600 bg-slate-700 border-slate-500 rounded focus:ring-cyan-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm text-white">{source.label}</div>
                        <div className="text-xs text-slate-400">Unit: {source.unit}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedDataSources.length === 0 && (
                  <div className="text-xs text-red-400">Please select at least one data source</div>
                )}
              </div>
            ) : (
              <Select 
                value={Array.isArray(formData.dataSource) ? formData.dataSource[0] : formData.dataSource} 
                onValueChange={(value) => setFormData({ ...formData, dataSource: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {availableDataSources.map((source) => (
                    <SelectItem key={source.value} value={source.value} className="text-white hover:bg-slate-700">
                      <div className="flex flex-col">
                        <span>{source.label}</span>
                        <span className="text-xs text-slate-400">Unit: {source.unit}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-slate-700">
          {isEdit && onDelete && (
            <Button
              onClick={handleDelete}
              variant="destructive"
              size="sm"
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
          
          <div className="flex space-x-2 ml-auto">
            <Button
              onClick={() => setIsOpen(false)}
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-700"
              disabled={!formData.title.trim() || (supportsMultipleDatasets && selectedDataSources.length === 0)}
            >
              {isEdit ? 'Update' : 'Add'} Chart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Dashboard() {
  // Chart management state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedChart, setSelectedChart] = useState<any>(null)

  // Define chart items with their data
  // Explicit element type: without it the state type is inferred from the
  // literal seed data, so charts added/edited later (which may carry a
  // multi-select dataSource) do not fit the inferred shape.
  interface ChartItem {
    id: string
    type: ChartFormData['type'] | string
    title: string
    color: string
    dataSource: string | string[]
    data: any
  }

  const [chartItems, setChartItems] = useState<ChartItem[]>([
    {
      id: 'production-summary',
      type: 'line',
      title: 'Production Summary',
      dataSource: 'production-output',
      color: 'cyan',
      data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [{
          label: 'Production Output',
          data: [45000, 52000, 48000, 61000, 58000, 55000],
          borderColor: 'rgba(8, 145, 178, 0.8)',
          backgroundColor: 'rgba(8, 145, 178, 0.1)',
          tension: 0.4,
          borderWidth: 2
        }]
      }
    },
    {
      id: 'weekly-output',
      type: 'bar',
      title: 'Facility Efficiency',
      dataSource: 'facility-efficiency',
      color: 'green',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Facility Efficiency',
          data: [88, 92, 85, 94, 91, 89],
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1
        }]
      }
    },
    {
      id: 'energy-consumption',
      type: 'line',
      title: 'Energy Consumption',
      dataSource: 'energy-consumption',
      color: 'orange',
      data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [{
          label: 'Energy Consumption',
          data: [320, 380, 290, 420, 360, 310],
          borderColor: 'rgba(245, 158, 11, 0.8)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.4,
          borderWidth: 2
        }]
      }
    },
    {
      id: 'water-quality',
      type: 'doughnut',
      title: 'Water Quality Distribution',
      dataSource: 'water-quality',
      color: 'blue',
      data: {
        labels: ['Excellent', 'Good', 'Fair', 'Poor'],
        datasets: [{
          data: [45, 35, 15, 5],
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(59, 130, 246, 0.6)',
            'rgba(59, 130, 246, 0.4)',
            'rgba(59, 130, 246, 0.2)'
          ],
          borderColor: [
            'rgb(59, 130, 246)',
            'rgb(59, 130, 246)',
            'rgb(59, 130, 246)',
            'rgb(59, 130, 246)'
          ],
          borderWidth: 2
        }]
      }
    },
    {
      id: 'maintenance-alerts',
      type: 'bar',
      title: 'Maintenance Alerts',
      dataSource: 'maintenance-alerts',
      color: 'red',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Maintenance Alerts',
          data: [3, 1, 5, 2, 4, 0, 2],
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1
        }]
      }
    },
    {
      id: 'flow-rate',
      type: 'line',
      title: 'Flow Rate Monitoring',
      dataSource: 'flow-rate',
      color: 'purple',
      data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [{
          label: 'Flow Rate',
          data: [850, 920, 780, 950, 880, 860],
          borderColor: 'rgba(168, 85, 247, 0.8)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          tension: 0.4,
          borderWidth: 2
        }]
      }
    }
  ])

  // Load saved layout on component mount
  useEffect(() => {
    const savedLayout = localStorage.getItem("fakieh-dashboard-charts");
    if (savedLayout) {
      try {
        const parsedLayout = JSON.parse(savedLayout);
        if (Array.isArray(parsedLayout) && parsedLayout.length > 0) {
          setChartItems(parsedLayout);
        }
      } catch (error) {
        
      }
    }
  }, []);

  // Save layout when items change
  useEffect(() => {
    localStorage.setItem("fakieh-dashboard-charts", JSON.stringify(chartItems));
  }, [chartItems]);

  // Generate realistic data based on data source
  const generateDataBySource = (
    dataSource: string,
  ): { labels: string[]; data: number[] } => {
    const timeLabels = [
      "00:00",
      "04:00",
      "08:00",
      "12:00",
      "16:00",
      "20:00",
    ];
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

    switch (dataSource) {
      case "raw-material-quality":
        return { labels: dayLabels, data: [97, 95, 98, 96, 97, 99, 98] };
      case "pre-cleaning-efficiency":
        return { labels: dayLabels, data: [85, 88, 86, 89, 87, 90, 88] };
      case "final-product-quality":
        return { labels: dayLabels, data: [92, 94, 93, 95, 94, 96, 95] };
      case "production-output":
        return {
          labels: timeLabels,
          data: [45000, 52000, 48000, 61000, 58000, 55000],
        };
      case "energy-consumption":
        return { labels: timeLabels, data: [320, 380, 290, 420, 360, 310] };
      case "water-quality":
        return { labels: dayLabels, data: [95, 97, 93, 98, 96, 94, 99] };
      case "facility-efficiency":
        return { labels: monthLabels, data: [88, 92, 85, 94, 91, 89] };
      case "chemical-usage":
        return { labels: dayLabels, data: [120, 135, 110, 145, 125, 130, 118] };
      case "maintenance-alerts":
        return { labels: dayLabels, data: [3, 1, 5, 2, 4, 0, 2] };
      case "flow-rate":
        return { labels: timeLabels, data: [850, 920, 780, 950, 880, 860] };
      case "pressure-levels":
        return { labels: timeLabels, data: [2.1, 2.3, 1.9, 2.5, 2.2, 2.0] };
      case "temperature":
        return { labels: timeLabels, data: [22, 24, 21, 26, 25, 23] };
      case "ph-levels":
        return { labels: timeLabels, data: [7.2, 7.4, 7.1, 7.5, 7.3, 7.2] };
      case "turbidity":
        return { labels: timeLabels, data: [0.8, 1.2, 0.6, 1.5, 1.0, 0.9] };
      case "chlorine-residual":
        return { labels: timeLabels, data: [0.5, 0.7, 0.4, 0.8, 0.6, 0.5] };
      default:
        return { labels: monthLabels, data: [65, 78, 85, 72, 88, 92] };
    }
  };

  // Helper for categorical data for pie/doughnut/polarArea
  const getCategoricalData = (dataSource: string) => {
    switch (dataSource) {
      case "water-quality":
        return {
          labels: ["Excellent", "Good", "Fair", "Poor"],
          data: [45, 35, 15, 5],
        };
      case "facility-efficiency":
        return {
          labels: ["High", "Medium", "Low"],
          data: [60, 30, 10],
        };
      case "maintenance-alerts":
        return {
          labels: ["Critical", "Warning", "Info"],
          data: [2, 4, 8],
        };
      default:
        // fallback to time or day labels
        return generateDataBySource(dataSource);
    }
  };

  // Chart management functions
  const generateSampleData = (
    type: string,
    color: string,
    dataSource: string | string[] = "production-output",
  ): any => {
    const colorMap: { [key: string]: string } = {
      cyan: "rgba(8, 145, 178, 0.8)",
      green: "rgba(34, 197, 94, 0.8)",
      orange: "rgba(245, 158, 11, 0.8)",
      purple: "rgba(168, 85, 247, 0.8)",
      red: "rgba(239, 68, 68, 0.8)",
      blue: "rgba(59, 130, 246, 0.8)",
    };

    const selectedColor = colorMap[color] || colorMap.cyan;
    const colors = Object.values(colorMap);

    const dataSources = Array.isArray(dataSource) ? dataSource : [dataSource];
    const isMultipleDatasets = Array.isArray(dataSource) && dataSource.length > 1;

    const datasets = dataSources.map((source, index) => {
      const { data: sampleData } = generateDataBySource(source);
      const sourceInfo = availableDataSources.find((s) => s.value === source);
      const dataLabel = sourceInfo?.label || "Data";
      const datasetColor = isMultipleDatasets
        ? colors[index % colors.length]
        : selectedColor;

      return {
        label: dataLabel,
        data: sampleData,
        borderColor: datasetColor,
        backgroundColor: datasetColor.replace("0.8)", "0.1)"),
        tension: 0.4,
        borderWidth: 2,
        fill: type === "line" ? true : undefined,
      };
    });

    // Use labels from first dataset
    let sampleLabels, sampleData;
    if (["pie", "doughnut", "polarArea"].includes(type)) {
      const cat = getCategoricalData(dataSources[0]);
      sampleLabels = cat.labels;
      sampleData = cat.data;
    } else {
      const result = generateDataBySource(dataSources[0]);
      sampleLabels = result.labels;
      sampleData = result.data;
    }

    switch (type) {
      case "bar":
        return {
          labels: sampleLabels,
          datasets: datasets.map((dataset) => ({
            ...dataset,
            backgroundColor: dataset.borderColor,
            borderWidth: 1,
          })),
        };
      case "radar":
        return {
          labels: sampleLabels,
          datasets: datasets.map((dataset, idx) => ({
            ...dataset,
            backgroundColor: colors[idx % colors.length].replace("0.8)", "0.2)"),
            pointBackgroundColor: colors[idx % colors.length],
            pointBorderColor: "#fff",
            borderWidth: 2,
          })),
        };
      case "polarArea":
        return {
          labels: sampleLabels,
          datasets: [
            {
              label: availableDataSources.find(s => s.value === dataSources[0])?.label || "Data",
              data: sampleData,
              backgroundColor: sampleLabels.map((_, idx) => colors[idx % colors.length]),
              borderColor: sampleLabels.map((_, idx) => colors[idx % colors.length].replace("0.8)", "1)")),
              borderWidth: 2,
            },
          ],
        };
      case "doughnut":
      case "pie":
        return {
          labels: sampleLabels,
          datasets: [
            {
              label: availableDataSources.find(s => s.value === dataSources[0])?.label || "Data",
              data: sampleData,
              backgroundColor: sampleLabels.map((_, idx) => colors[idx % colors.length]),
              borderColor: sampleLabels.map((_, idx) => colors[idx % colors.length].replace("0.8)", "1)")),
              borderWidth: 2,
            },
          ],
        };
      default: // line
        return {
          labels: sampleLabels,
          datasets: datasets,
        };
    }
  };

  const handleSaveChart = (formData: ChartFormData, chartId?: string) => {
    if (chartId) {
      // Edit existing chart
      setChartItems(prev => prev.map(chart => 
        chart.id === chartId 
          ? { 
              ...chart, 
              title: formData.title, 
              type: formData.type,
              color: formData.color,
              dataSource: formData.dataSource,
              data: generateSampleData(formData.type, formData.color, formData.dataSource)
            }
          : chart
      ))
    } else {
      // Add new chart
      const newChart = {
        id: `chart-${Date.now()}`,
        type: formData.type,
        title: formData.title,
        color: formData.color,
        dataSource: formData.dataSource,
        data: generateSampleData(formData.type, formData.color, formData.dataSource)
      }
      setChartItems(prev => [...prev, newChart])
    }
  };

  const handleDeleteChart = (chartId: string) => {
    setChartItems(prev => prev.filter(chart => chart.id !== chartId))
  };

  const handleEditChart = (chart: any) => {
    setSelectedChart(chart)
    setEditDialogOpen(true)
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (active.id !== over.id) {
      setChartItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)

        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const resetLayout = () => {
    localStorage.removeItem("fakieh-dashboard-charts")
    window.location.reload()
  }

  return (
    <WaterSystemLayout 
      title="Fakieh Production Intelligence Dashboard" 
      subtitle="Real-time production monitoring, KPI tracking, and operational intelligence"
    >
      <div className="space-y-6 pb-8">

        {/* Dashboard Controls */}
        <div className="bg-slate-950/50 border border-slate-700/30 rounded-lg p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                Customizable Dashboard
              </div>
              <span className="text-xs text-slate-400">
                🎯 Hover over charts and drag using the grip handle • Layout auto-saves
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                onClick={() => setAddDialogOpen(true)}
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add New Chart
              </Button>
              <Button
                onClick={resetLayout}
                size="sm"
                className="bg-slate-600 hover:bg-slate-700 text-white text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset Layout
              </Button>
            </div>
          </div>
        </div>
        
        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            title="TOTAL OUTPUT"
            value="45.2K"
            unit="m/day"
            trend={12}
            icon="water"
            color="blue"
            chartType="line"
          />
          <KPICard
            title="AVG EFFICIENCY"
            value="94%"
            subtitle="Target: 95%"
            trend={-3}
            icon="gauge"
            color="green"
            chartType="circle" 
          />
          <KPICard
            title="ENERGY USAGE"
            value="2.4"
            unit="kWh/m³"
            trend={8}
            icon="energy"
            color="orange"
            chartType="gauge"
          />
          <KPICard
            title="FACILITIES"
            value="8"
            subtitle="Online"
            trend={-5}
            icon="activity"
            color="green"
            chartType="bar"
          />
          <KPICard
            title="ALERTS"
            value="3"
            subtitle="Active"
            icon="activity"
            color="orange"
            chartType="circle"
          />
          <KPICard
            title="QUALITY SCORE"
            value="97"
            subtitle="Excellent"
            trend={15}
            icon="water"
            color="green"
            chartType="line"
          />
        </div>

        {/* Customizable Charts Grid */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={chartItems.map(item => item.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {chartItems.map((chart) => (
                <SortableChart key={chart.id} id={chart.id}>
                  <div className="chart-container bg-slate-950/50 border border-slate-700/30 rounded-lg p-4 backdrop-blur-sm
                                  hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/20
                                  transition-all duration-300 group/chart cursor-pointer
                                  hover:bg-slate-900/60 hover:scale-[1.02] relative">
                    
                    {/* Chart Management Buttons */}
                    <div className="absolute top-2 left-2 opacity-0 group-hover/chart:opacity-100 transition-all duration-300 z-20 flex space-x-1">
                      <button
                        onClick={() => handleEditChart(chart)}
                        className="p-1.5 bg-slate-800/90 hover:bg-cyan-600/90 rounded-md border border-slate-600 hover:border-cyan-500 transition-all duration-200"
                        title="Edit Chart"
                      >
                        <Edit2 className="h-3 w-3 text-cyan-400 hover:text-white" />
                      </button>
                      <button
                        onClick={() => handleDeleteChart(chart.id)}
                        className="p-1.5 bg-slate-800/90 hover:bg-red-600/90 rounded-md border border-slate-600 hover:border-red-500 transition-all duration-200"
                        title="Delete Chart"
                      >
                        <Trash2 className="h-3 w-3 text-red-400 hover:text-white" />
                      </button>
                    </div>

                    <ChartComponent
                      // ChartComponent only renders line | bar | doughnut; any
                      // other configured type previously rendered a blank chart.
                      // Map to the nearest supported type instead.
                      type={
                        chart.type === "line" || chart.type === "bar" || chart.type === "doughnut"
                          ? chart.type
                          : chart.type === "pie" || chart.type === "polarArea"
                            ? "doughnut"
                            : "bar"
                      }
                      data={chart.data}
                      title={chart.title}
                      height={240}
                    />
                    
                    {/* Subtle drag indicator */}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-30 transition-opacity duration-300">
                      <div className="flex space-x-0.5">
                        <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                        <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                        <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                </SortableChart>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Quality Intelligence Indicators */}
        <div className="bg-slate-950/50 border border-slate-700/30 rounded-lg p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Quality Intelligence Indicators</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Raw Material */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Raw Material</span>
                <span className="text-xs text-green-400">97%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full" 
                     style={{width: '97%'}}></div>
              </div>
            </div>
            
            {/* Pre Cleaning */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Pre Cleaning</span>
                <span className="text-xs text-blue-400">85%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full" 
                     style={{width: '85%'}}></div>
              </div>
            </div>
            
            {/* Method Product */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Method Product</span>
                <span className="text-xs text-green-400">92%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full" 
                     style={{width: '92%'}}></div>
              </div>
            </div>
            
            {/* Packing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Packing</span>
                <span className="text-xs text-red-400">74%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full" 
                     style={{width: '74%'}}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Management Dialogs */}
        <ChartManagementDialog
          isOpen={addDialogOpen}
          setIsOpen={setAddDialogOpen}
          onSave={handleSaveChart}
        />

        <ChartManagementDialog
          chart={selectedChart}
          isEdit={true}
          isOpen={editDialogOpen}
          setIsOpen={setEditDialogOpen}
          onSave={handleSaveChart}
          onDelete={handleDeleteChart}
        />
      </div>
    </WaterSystemLayout>
  )
}