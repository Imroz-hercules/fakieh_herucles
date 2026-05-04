import React, { useState, useEffect } from 'react'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { API_ENDPOINTS } from '../../config/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Filter, RotateCcw, Clock, TrendingUp, Package, Database, Zap, Warehouse, Truck } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Line, Pie, Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
)

export default function FakiehDashboard() {
  const [startDate, setStartDate] = useState<Date>(new Date('2025-02-08T07:00:00'))
  const [endDate, setEndDate] = useState<Date>(new Date('2025-02-09T07:00:00'))
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedBatch, setSelectedBatch] = useState<string>('all')
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all')

  // SQL Server data state
  const [batchMaterials, setBatchMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalRecords, setTotalRecords] = useState(0)
  
  // New state variables for API data
  const [totalOrders, setTotalOrders] = useState(0)
  const [totalStorage, setTotalStorage] = useState(0)
  const [totalTrucks, setTotalTrucks] = useState(0)
  
  // Computed KPI values from SQL Server data
  const activeBatches = batchMaterials.filter(item => !item['Batch Act End']).length
  const completedBatches = batchMaterials.filter(item => item['Batch Act End']).length
  
  // Calculate total quantity with proper unit conversion
  const totalQuantity = batchMaterials.reduce((sum, item) => {
    let quantity = item['Quantity'] || 0
    // Convert to tons if quantity > 1000 (likely kg)
    if (quantity > 1000) {
      quantity = quantity / 1000
    }
    return sum + quantity
  }, 0)
  

  
  // Extract unique values for filter dropdowns from SQL Server data
  const uniqueProducts = Array.from(new Set(batchMaterials.map(item => item['Product Name']).filter(Boolean)))
  const uniqueBatches = Array.from(new Set(batchMaterials.map(item => item['Batch Name']).filter(Boolean)))
  const uniqueMaterials = Array.from(new Set(batchMaterials.map(item => item['Material Name']).filter(Boolean)))
  
  // Calculate latest batch date
  const latestBatchDate = React.useMemo(() => {
    if (batchMaterials.length === 0) return null
    
    const dates = batchMaterials.map(item => {
      const startDate = item['Batch Act Start'] ? new Date(item['Batch Act Start']) : null
      const endDate = item['Batch Act End'] ? new Date(item['Batch Act End']) : null
      const transferDate = item['Batch Transfer Time'] ? new Date(item['Batch Transfer Time']) : null
      
      return [startDate, endDate, transferDate].filter(Boolean)
    }).flat()
    
    if (dates.length === 0) return null
    
    return new Date(Math.max(...dates.map(date => (date as Date).getTime())))
  }, [batchMaterials])

  // Chart data and configuration
  const productionTrendData = React.useMemo(() => {
    if (batchMaterials.length === 0) {
      return {
        labels: ['No Data'],
        datasets: [{
          label: 'Production Output (tons)',
          data: [0],
          borderColor: '#0891b2',
          backgroundColor: 'rgba(8, 145, 178, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#0891b2',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#0891b2',
          pointHoverBorderWidth: 3,
        }]
      }
    }

    // Group batch materials by date and calculate daily production
    const dailyProduction = new Map()
    
    batchMaterials.forEach(item => {
      let quantity = item['Quantity'] || 0
      // Convert to tons if quantity > 1000 (likely kg)
      if (quantity > 1000) {
        quantity = quantity / 1000
      }
      
              // Get the date from Batch Act Start, Batch Act End, or Batch Transfer Time
        const dateStr = item['Batch Act Start'] || item['Batch Act End'] || item['Batch Transfer Time']
        if (dateStr) {
          const date = new Date(dateStr)
          if (!isNaN(date.getTime())) { // Check if date is valid
            const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD format
            
            if (dailyProduction.has(dateKey)) {
              dailyProduction.set(dateKey, dailyProduction.get(dateKey) + quantity)
            } else {
              dailyProduction.set(dateKey, quantity)
            }
          }
        }
    })

    // Sort by date and get the last 7 days
    const sortedDates = Array.from(dailyProduction.keys()).sort()
    const last7Days = sortedDates.slice(-7)
    
    // Format dates for display
    const labels = last7Days.map(dateStr => {
      const date = new Date(dateStr)
      return format(date, 'MM/dd')
    })
    
    const data = last7Days.map(dateStr => dailyProduction.get(dateStr) || 0)

    return {
      labels,
      datasets: [{
        label: 'Production Output (tons)',
        data,
        borderColor: '#0891b2',
        backgroundColor: 'rgba(8, 145, 178, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#0891b2',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#0891b2',
        pointHoverBorderWidth: 3,
      }]
    }
  }, [batchMaterials])

  // Calculate material distribution from SQL Server data
  const materialDistribution = React.useMemo(() => {
    if (batchMaterials.length === 0) {
      return {
        labels: ['No Data'],
        datasets: [{
          data: [1],
          backgroundColor: ['rgba(156, 163, 175, 0.9)'],
          borderColor: ['rgba(156, 163, 175, 1)'],
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 8,
        }]
      }
    }

    // Aggregate material quantities with proper unit conversion
    const materialMap = new Map()
    
    // Debug: Log raw quantities to understand the data
    batchMaterials.map(item => ({
      material: item['Material Name'],
      quantity: item['Quantity'],
      unit: item['Quantity'] > 1000 ? 'likely kg' : 'likely tons'
    }))
    
    // Check if batchMaterials is actually an array and has data
    if (!Array.isArray(batchMaterials) || batchMaterials.length === 0) {
      
      return {
        labels: ['No Data'],
        datasets: [{
          data: [1],
          backgroundColor: ['rgba(156, 163, 175, 0.9)'],
          borderColor: ['rgba(156, 163, 175, 1)'],
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 8,
        }]
      }
    }
    
    batchMaterials.forEach(item => {
      const materialName = item['Material Name'] || 'Unknown Material'
      let quantity = item['Quantity'] || 0
      
      // Convert quantity to tons if it's in kg (assuming quantities > 1000 are in kg)
      // You can adjust this threshold based on your actual data
      if (quantity > 1000) {
        quantity = quantity / 1000 // Convert kg to tons
      }
      
      if (materialMap.has(materialName)) {
        const currentValue = materialMap.get(materialName)
        const newValue = currentValue + quantity
        materialMap.set(materialName, newValue)
        } else {
        materialMap.set(materialName, quantity)
        }
    })
    
    // Debug: Log aggregated results

    // Convert to arrays for chart and round to 2 decimal places
    const labels = Array.from(materialMap.keys())
    const data = Array.from(materialMap.values()).map(val => Math.round(val * 100) / 100)
    
    // Generate colors dynamically
    const colors = [
      'rgba(8, 145, 178, 0.9)',    // Cyan
      'rgba(34, 197, 94, 0.9)',    // Green
      'rgba(245, 158, 11, 0.9)',   // Yellow
      'rgba(239, 68, 68, 0.9)',    // Red
      'rgba(168, 85, 247, 0.9)',   // Purple
      'rgba(20, 184, 166, 0.9)',   // Teal
      'rgba(236, 72, 153, 0.9)',   // Pink
      'rgba(59, 130, 246, 0.9)',   // Blue
      'rgba(16, 185, 129, 0.9)',   // Emerald
      'rgba(251, 146, 60, 0.9)',   // Orange
    ]

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, index) => colors[index % colors.length]),
        borderColor: labels.map((_, index) => colors[index % colors.length].replace('0.9', '1')),
        borderWidth: 3,
        hoverBorderWidth: 4,
        hoverOffset: 8,
      }]
    }
  }, [batchMaterials])

  const materialDistributionData = materialDistribution

    // Weekly Production Bar Chart Data
  const weeklyProductionData = React.useMemo(() => {
    if (batchMaterials.length === 0) {
      return {
        labels: ['No Data'],
        datasets: [{
          label: 'Unique Batches',
          data: [0],
          backgroundColor: ['rgba(156, 163, 175, 0.8)'],
          borderColor: ['rgba(156, 163, 175, 1)'],
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          hoverBackgroundColor: ['rgba(156, 163, 175, 1)'],
          hoverBorderWidth: 3,
        }]
      }
    }

    // Count unique batches per weekday (same method as code.jsx)
    const productionByDaySets: Record<string, Set<string>> = {
      Monday: new Set(),
      Tuesday: new Set(),
      Wednesday: new Set(),
      Thursday: new Set(),
      Friday: new Set(),
      Saturday: new Set(),
      Sunday: new Set(),
    };

    batchMaterials.forEach((item) => {
      const batchDate = new Date(item["Batch Act Start"] || '');
      if (!isNaN(batchDate.getTime())) { // Check if date is valid
        const dayOfWeek = batchDate.toLocaleDateString("en-US", { weekday: "long" });
        const batchGUID = item["Batch GUID"] || "unknown";
        if (productionByDaySets.hasOwnProperty(dayOfWeek)) {
          productionByDaySets[dayOfWeek].add(batchGUID);
        }
      }
    });

    // Convert sets to counts and create data array
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const data = dayNames.map(day => productionByDaySets[day]?.size || 0);
    
    // Generate colors dynamically
    const colors = [
      'rgba(8, 145, 178, 0.8)',    // Cyan
      'rgba(34, 197, 94, 0.8)',    // Green
      'rgba(245, 158, 11, 0.8)',   // Yellow
      'rgba(239, 68, 68, 0.8)',    // Red
      'rgba(168, 85, 247, 0.8)',   // Purple
      'rgba(20, 184, 166, 0.8)',   // Teal
      'rgba(156, 163, 175, 0.8)',  // Gray
    ];

    return {
      labels: dayNames,
      datasets: [{
        label: 'Unique Batches',
        data,
        backgroundColor: colors,
        borderColor: colors.map(color => color.replace('0.8', '1')),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: colors.map(color => color.replace('0.8', '1')),
        hoverBorderWidth: 3,
      }]
    }
  }, [batchMaterials])

  // Quality Metrics Doughnut Chart Data - Now shows unique products with material counts
  const qualityMetricsData = React.useMemo(() => {
    if (batchMaterials.length === 0) {
      return {
        labels: ['No Data'],
        datasets: [{
          data: [1],
          backgroundColor: ['rgba(156, 163, 175, 0.9)'],
          borderColor: ['rgba(156, 163, 175, 1)'],
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 8,
          cutout: '65%',
        }]
      }
    }

    // Count materials per unique product
    const productMaterialCounts = new Map()
    
    batchMaterials.forEach(item => {
      const productName = item['Product Name'] || 'Unknown Product'
      const materialName = item['Material Name'] || 'Unknown Material'
      
      if (productMaterialCounts.has(productName)) {
        // If product exists, add material to its set
        productMaterialCounts.get(productName).add(materialName)
      } else {
        // If product doesn't exist, create new set with this material
        productMaterialCounts.set(productName, new Set([materialName]))
      }
    })

    // Convert to arrays for chart
    const labels = Array.from(productMaterialCounts.keys())
    const data = Array.from(productMaterialCounts.values()).map(materialSet => materialSet.size)
    
    // Generate colors dynamically
    const colors = [
      'rgba(34, 197, 94, 0.9)',    // Green
      'rgba(8, 145, 178, 0.9)',    // Cyan
      'rgba(245, 158, 11, 0.9)',   // Yellow
      'rgba(239, 68, 68, 0.9)',    // Red
      'rgba(168, 85, 247, 0.9)',   // Purple
      'rgba(20, 184, 166, 0.9)',   // Teal
      'rgba(236, 72, 153, 0.9)',   // Pink
      'rgba(59, 130, 246, 0.9)',   // Blue
      'rgba(16, 185, 129, 0.9)',   // Emerald
      'rgba(251, 146, 60, 0.9)',   // Orange
    ]

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, index) => colors[index % colors.length]),
        borderColor: labels.map((_, index) => colors[index % colors.length].replace('0.9', '1')),
        borderWidth: 3,
        hoverBorderWidth: 4,
        hoverOffset: 8,
        cutout: '65%',
      }]
    }
  }, [batchMaterials])

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#cbd5e1',
          font: {
            size: 12,
            weight: 'bold'
          },
          usePointStyle: true,
          padding: 20,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        borderColor: '#0891b2',
        borderWidth: 2,
        cornerRadius: 8,
        displayColors: true,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        padding: 12,
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(148, 163, 184, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            weight: 'normal'
          }
        }
      },
      y: {
        grid: {
          color: 'rgba(148, 163, 184, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            weight: 'normal'
          }
        }
      }
    }
  }

  // Bar chart specific options
  const barChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#cbd5e1',
          font: {
            size: 12,
            weight: 'bold'
          },
          usePointStyle: true,
          padding: 20,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        borderColor: '#8b5cf6',
        borderWidth: 2,
        cornerRadius: 8,
        displayColors: true,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        padding: 12,
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y} batches`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(148, 163, 184, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            weight: 'normal'
          }
        }
      },
      y: {
        grid: {
          color: 'rgba(148, 163, 184, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            weight: 'normal'
          },
          callback: function(value: any) {
            return value + ' batches'
          }
        }
      }
    }
  }

  const pieChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#cbd5e1',
          font: {
            size: 11,
            weight: 'normal'
          },
          usePointStyle: true,
          padding: 15,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        borderColor: '#0891b2',
        borderWidth: 2,
        cornerRadius: 8,
        displayColors: true,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        padding: 12,
        callbacks: {
          label: function(context: any) {
            const label = context.label || ''
            const value = context.parsed
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = ((value / total) * 100).toFixed(1)
            
            // Check if this is the products chart (qualityMetricsData) or materials chart (materialDistributionData)
            const chartElement = context.chart.ctx.canvas.parentElement
            const chartTitle = chartElement?.querySelector('h3')?.textContent || ''
            
            if (chartTitle.includes('Products & Materials')) {
              // For products chart, show material count
              return `${label}: ${value} materials (${percentage}%)`
            } else {
              // For materials chart, show quantity in tons
              let displayValue = value
              let unit = 'tons'
              
              if (value >= 1000) {
                displayValue = (value / 1000).toFixed(1)
                unit = 'k tons'
              } else if (value >= 1) {
                displayValue = value.toFixed(1)
                unit = 'tons'
              } else {
                displayValue = (value * 1000).toFixed(0)
                unit = 'kg'
              }
              
              return `${label}: ${displayValue} ${unit} (${percentage}%)`
            }
          }
        }
      }
    }
  }

  // Fetch batch materials from SQL Server
  const fetchBatchMaterials = async (limit: number = 50) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/sqlserver/batch-materials?limit=${limit}`)
      const data = await response.json()
      
      if (data.success) {
        setBatchMaterials(data.data)
        setTotalRecords(data.total_records)
      } else {
        setError(data.error || 'Failed to fetch data')
      }
    } catch (err) {
      setError('Failed to connect to server')
      
    } finally {
      setLoading(false)
    }
  }

  // Fetch total count
  const fetchTotalCount = async () => {
    try {
      const response = await fetch('/api/sqlserver/batch-materials/count')
      const data = await response.json()
      
      if (data.success) {
        setTotalRecords(data.total_records)
      }
    } catch (err) {
      
    }
  }

  // Load data on component mount
  useEffect(() => {
    fetchBatchMaterials()
    fetchTotalCount()
    fetchTotalOrders()
    fetchTotalStorage()
    fetchTotalTrucks()
  }, [])

  // Fetch total orders count
  const fetchTotalOrders = async () => {
    try {
      // Fetch from multiple order types and sum them up
      const [intake1, intake2, outload1, outload2, outload3, bulk, pt, plcOrders] = await Promise.all([
        fetch('/api/orders/intake1?page=1&per_page=1'),
        fetch('/api/orders/intake2?page=1&per_page=1'),
        fetch('/api/orders/outload1?page=1&per_page=1'),
        fetch('/api/orders/outload2?page=1&per_page=1'),
        fetch('/api/orders/outload3?page=1&per_page=1'),
        fetch('/api/orders/bulk?page=1&per_page=1'),
        fetch('/api/orders/pt?page=1&per_page=1'),
        fetch('/api/plc/plant/orders')
      ])

      const [intake1Data, intake2Data, outload1Data, outload2Data, outload3Data, bulkData, ptData, plcData] = await Promise.all([
        intake1.json(), intake2.json(), outload1.json(), outload2.json(), outload3.json(), bulk.json(), pt.json(), plcOrders.json()
      ])

      let totalCount = 0
      if (intake1Data.success) totalCount += intake1Data.data.pagination.total_count
      if (intake2Data.success) totalCount += intake2Data.data.pagination.total_count
      // Add mineral orders count from PLC data
      if (plcData.mineral) totalCount += plcData.mineral.length
      if (outload1Data.success) totalCount += outload1Data.data.pagination.total_count
      if (outload2Data.success) totalCount += outload2Data.data.pagination.total_count
      if (outload3Data.success) totalCount += outload3Data.data.pagination.total_count
      if (bulkData.success) totalCount += bulkData.data.pagination.total_count
      if (ptData.success) totalCount += ptData.data.pagination.total_count

      setTotalOrders(totalCount)
    } catch (err) {
      
      setTotalOrders(0)
    }
  }

  // Fetch total storage count
  const fetchTotalStorage = async () => {
    try {
      const response = await fetch('/api/storage')
      const data = await response.json()
      
      if (data.success) {
        setTotalStorage(data.data ? data.data.length : 0)
      } else {
        // Try alternative endpoint
        const altResponse = await fetch('/api/storage/silos')
        const altData = await altResponse.json()
        setTotalStorage(altData.success ? (altData.data ? altData.data.length : 0) : 0)
      }
    } catch (err) {
      
      setTotalStorage(0)
    }
  }

  // Fetch total truck entries count
  const fetchTotalTrucks = async () => {
    try {
      const response = await fetch('/api/trucks')
      const data = await response.json()
      
      if (data.success) {
        setTotalTrucks(data.data ? data.data.length : 0)
      } else {
        // Try alternative endpoint
        const altResponse = await fetch('/api/trucks/entries')
        const altData = await altResponse.json()
        setTotalTrucks(altData.success ? (altData.data ? altData.data.length : 0) : 0)
      }
    } catch (err) {
      
      setTotalTrucks(0)
    }
  }

  const handleApplyFilters = () => {
    // Handle filter application logic here
    // Refresh data when filters are applied
    fetchBatchMaterials(50)
  }

  return (
    <WaterSystemLayout 
      title="Fakieh Dashboard" 
      subtitle="Production Intelligence & Analytics Dashboard"
    >
      <div className="space-y-6">
        {/* Dashboard Filters Section */}
        <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white light:text-gray-900">Dashboard Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            {/* Start Date */}
            <div className="space-y-2">
              <Label className="text-xl font-bold text-slate-300 light:text-gray-700">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-50",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MM/dd/yyyy h:mm a") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-slate-800 light:bg-white border-slate-700 light:border-gray-300">
                  <div className="p-3">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && setStartDate(date)}
                      initialFocus
                      className="bg-slate-800 light:bg-white text-slate-300 light:text-gray-700"
                    />
                    <div className="mt-3 pt-3 border-t border-slate-600 light:border-gray-300">
                      <Label className="text-sm font-medium text-slate-300 light:text-gray-700 mb-2 block">Time</Label>
                      <Input
                        type="time"
                        value={format(startDate, "HH:mm")}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':')
                          const newDate = new Date(startDate)
                          newDate.setHours(parseInt(hours), parseInt(minutes))
                          setStartDate(newDate)
                        }}
                        className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label className="text-xl font-bold text-slate-300 light:text-gray-700">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-50",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MM/dd/yyyy h:mm a") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-slate-800 light:bg-white border-slate-700 light:border-gray-300">
                  <div className="p-3">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => date && setEndDate(date)}
                      initialFocus
                      className="bg-slate-800 light:bg-white text-slate-300 light:text-gray-700"
                    />
                    <div className="mt-3 pt-3 border-t border-slate-600 light:border-gray-300">
                      <Label className="text-xl font-medium text-slate-300 light:text-gray-700 mb-2 block">Time</Label>
                      <Input
                        type="time"
                        value={format(endDate, "HH:mm")}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':')
                          const newDate = new Date(endDate)
                          newDate.setHours(parseInt(hours), parseInt(minutes))
                          setEndDate(newDate)
                        }}
                        className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Product Filter */}
            <div className="space-y-2">
              <Label className="text-xl font-bold text-slate-300 light:text-gray-700">Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700">
                  <SelectItem value="all">All Products</SelectItem>
                  {uniqueProducts.map((product, index) => (
                    <SelectItem key={index} value={product}>
                      {product}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Batch Filter */}
            <div className="space-y-2">
              <Label className="text-xl font-bold text-slate-300 light:text-gray-700">Batch</Label>
              <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                <SelectTrigger className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700">
                  <SelectItem value="all">All Batches</SelectItem>
                  {uniqueBatches.map((batch, index) => (
                    <SelectItem key={index} value={batch}>
                      {batch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Material Filter with Apply Button above */}
            <div className="space-y-2">
              {/* Apply Filters Button positioned above Material dropdown */}
              <div className="flex justify-end mb-2">
                <Button 
                  onClick={handleApplyFilters}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white light:bg-cyan-600 light:hover:bg-cyan-700 light:text-white px-4 py-1.5 rounded-lg flex items-center space-x-2 transition-colors duration-200 text-sm shadow-lg"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Apply Filters</span>
                </Button>
              </div>
              
              <Label className="text-xl font-bold text-slate-300 light:text-gray-700">Material</Label>
              <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                <SelectTrigger className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 light:bg-white border-slate-700 light:border-gray-300 text-slate-300 light:text-gray-700">
                  <SelectItem value="all">All Materials</SelectItem>
                  {uniqueMaterials.map((material, index) => (
                    <SelectItem key={index} value={material}>
                      {material}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
            {/* Futuristic border glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 via-transparent to-green-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 light:text-gray-600">Total Batches</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{batchMaterials.length}</p>
                  <p className="text-xs text-green-400 flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                    {batchMaterials.length} batches processed
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
            {/* Futuristic border glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-transparent to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 light:text-gray-600">Total Material</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{totalQuantity.toFixed(1)}</p>
                  <p className="text-xs text-blue-400 flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></span>
                    {totalQuantity.toFixed(1)} tons total
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
            {/* Futuristic border glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 via-transparent to-yellow-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 light:text-gray-600">Unique Product</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{uniqueProducts.length}</p>
                  <p className="text-xs text-yellow-400 flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse"></span>
                    {uniqueProducts.length} unique products
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Package className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>



          {/* Active Silos KPI Card */}
          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
            {/* Futuristic border glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-transparent to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 light:text-gray-600">Total Silos</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{totalStorage}</p>
                  <p className="text-xs text-indigo-400 flex items-center">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full mr-2 animate-pulse"></span>
                    {totalStorage} total silos
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Warehouse className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Active Trucks KPI Card */}
          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
            {/* Futuristic border glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-transparent to-orange-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 light:text-gray-700">Total Truck Entries</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{totalTrucks}</p>
                  <p className="text-xs text-orange-400 flex items-center">
                    <span className="w-2 h-2 bg-orange-400 rounded-full mr-2 animate-pulse"></span>
                    {totalTrucks} total entries
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Truck className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Latest Batch Date KPI Card */}
          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
            {/* Futuristic border glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-transparent to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 light:text-gray-600">Latest Batch Date</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">
                    {latestBatchDate ? format(latestBatchDate, "MM/dd") : 'N/A'}
                  </p>
                  <p className="text-xs text-purple-400 flex items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-2 animate-pulse"></span>
                    {latestBatchDate ? format(latestBatchDate, "MMM dd, yyyy") : 'No batches'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <CalendarIcon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Statistics Panel */}
        {/* <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 light:from-white/90 light:to-gray-50/90 border border-slate-600/50 light:border-gray-200/50 rounded-xl p-4 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-cyan-400 font-medium">System Status: Operational</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-400 font-medium">Performance: 94.2%</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 light:text-gray-600">
              Last updated: {format(new Date(), "h:mm:ss a")}
            </div>
          </div>
        </div> */}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white light:text-gray-900">Production Trend</h3>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-cyan-400 font-medium">Live Data</span>
              </div>
            </div>
            <div className="relative h-64">
              <Line data={productionTrendData} options={chartOptions} />
              {/* Futuristic overlay elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"></div>
                <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent"></div>
                <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent"></div>
                <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent"></div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white light:text-gray-900">Material Distribution</h3>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400 font-medium">Real-time</span>
              </div>
            </div>
            <div className="relative h-64">
              <Pie data={materialDistributionData} options={pieChartOptions} />
              {/* Futuristic overlay elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-gradient-to-r from-cyan-400/10 to-blue-400/10 rounded-full blur-xl transform -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute top-1/2 left-1/2 w-16 h-16 bg-gradient-to-r from-cyan-400/20 to-blue-400/20 rounded-full blur-md transform -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white light:text-gray-900">Products & Materials</h3>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-teal-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-teal-400 font-medium">Quality Data</span>
              </div>
            </div>
            <div className="relative h-64">
              <Doughnut data={qualityMetricsData} options={pieChartOptions} />
              {/* Futuristic overlay elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 rounded-full blur-xl transform -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute top-1/2 left-1/2 w-16 h-16 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 rounded-full blur-md transform -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 light:bg-white border border-slate-700/50 light:border-gray-200 rounded-lg p-6 shadow-lg light:shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white light:text-gray-900">Weekly Batch Count</h3>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-purple-400 font-medium">Weekly Stats</span>
              </div>
            </div>
            <div className="relative h-64">
              <Bar data={weeklyProductionData} options={barChartOptions} />
              {/* Futuristic overlay elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"></div>
                <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-400/30 to-transparent"></div>
                <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-purple-400/30 to-transparent"></div>
                <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-purple-400/30 to-transparent"></div>
              </div>
            </div>
          </div>


        </div>




      </div>
    </WaterSystemLayout>
  )
}
