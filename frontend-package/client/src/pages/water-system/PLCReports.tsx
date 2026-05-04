// import { useState, useMemo, useEffect } from 'react'
// import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'
// import { Button } from '@/components/ui/button'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// import { Input } from '@/components/ui/input'
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// import { Badge } from '@/components/ui/badge'
// import { Calendar, Filter, Download, Printer, Database, Activity, BarChart3, Layers, Package, Loader2, AlertCircle } from 'lucide-react'
// import { useToast } from '@/hooks/use-toast'

// // Types for PLC reporting data
// interface PLCReportData {
//   id?: number
//   orderId?: string
//   batchId: string
//   productName: string
//   binNumber: string
//   binName: string
//   matCode: string
//   matName: string
//   qtySpSetpoint: number
//   qtyOut: number
//   dosed: boolean
//   timestamp: string
//   lineNumber: string
//   reportDate?: string
//   facilityId?: string
//   operator?: string
//   supplier?: string
//   createdAt?: string
//   updatedAt?: string
// }

// interface ReportFilters {
//   startDate: string
//   endDate: string
//   selectedBins: string[]
//   selectedBatches: string[]
//   selectedLines: string[]
//   product?: string
//   facilityId?: string
// }

// // API base URL
// const API_BASE_URL = 'http://localhost:5000/api'

// // API service functions
// const apiService = {
//   // Fetch daily reports
//   async getDailyReports(filters: ReportFilters) {
//     const params = new URLSearchParams()
//     if (filters.startDate) params.append('start_date', filters.startDate)
//     if (filters.endDate) params.append('end_date', filters.endDate)
//     if (filters.product) params.append('product', filters.product)
//     if (filters.facilityId) params.append('facility_id', filters.facilityId)
    
//     const response = await fetch(`${API_BASE_URL}/reports/daily?${params}`)
//     if (!response.ok) throw new Error('Failed to fetch daily reports')
//     return response.json()
//   },

//   // Fetch weekly reports
//   async getWeeklyReports(filters: ReportFilters) {
//     const params = new URLSearchParams()
//     if (filters.startDate) params.append('start_date', filters.startDate)
//     if (filters.endDate) params.append('end_date', filters.endDate)
//     if (filters.product) params.append('product', filters.product)
//     if (filters.facilityId) params.append('facility_id', filters.facilityId)
    
//     const response = await fetch(`${API_BASE_URL}/reports/weekly?${params}`)
//     if (!response.ok) throw new Error('Failed to fetch weekly reports')
//     return response.json()
//   },

//   // Fetch monthly reports
//   async getMonthlyReports(filters: ReportFilters) {
//     const params = new URLSearchParams()
//     if (filters.startDate) params.append('start_date', filters.startDate)
//     if (filters.endDate) params.append('end_date', filters.endDate)
//     if (filters.product) params.append('product', filters.product)
//     if (filters.facilityId) params.append('facility_id', filters.facilityId)
    
//     const response = await fetch(`${API_BASE_URL}/reports/monthly?${params}`)
//     if (!response.ok) throw new Error('Failed to fetch monthly reports')
//     return response.json()
//   },

//   // Fetch detailed reports
//   async getDetailedReports(filters: ReportFilters) {
//     const params = new URLSearchParams()
//     if (filters.startDate) params.append('start_date', filters.startDate)
//     if (filters.endDate) params.append('end_date', filters.endDate)
//     if (filters.product) params.append('product', filters.product)
//     if (filters.facilityId) params.append('facility_id', filters.facilityId)
    
//     const response = await fetch(`${API_BASE_URL}/reports/detailed?${params}`)
//     if (!response.ok) throw new Error('Failed to fetch detailed reports')
//     return response.json()
//   },

//   // Fetch material consumption reports
//   async getMaterialReports(filters: ReportFilters) {
//     const params = new URLSearchParams()
//     if (filters.startDate) params.append('start_date', filters.startDate)
//     if (filters.endDate) params.append('end_date', filters.endDate)
//     if (filters.product) params.append('product', filters.product)
//     if (filters.facilityId) params.append('facility_id', filters.facilityId)
    
//     const response = await fetch(`${API_BASE_URL}/reports/material?${params}`)
//     if (!response.ok) throw new Error('Failed to fetch material reports')
//     return response.json()
//   },

//   // Export reports
//   async exportReports(reportType: string, filters: ReportFilters) {
//     const params = new URLSearchParams()
//     if (filters.startDate) params.append('start_date', filters.startDate)
//     if (filters.endDate) params.append('end_date', filters.endDate)
//     if (filters.product) params.append('product', filters.product)
//     if (filters.facilityId) params.append('facility_id', filters.facilityId)
    
//     const response = await fetch(`${API_BASE_URL}/reports/export/${reportType}?${params}`)
//     if (!response.ok) throw new Error('Failed to export reports')
//     return response.json()
//   }
// }

// // Transform backend data to frontend format
// const transformBackendData = (backendData: any[]): PLCReportData[] => {
//   return backendData.map(item => ({
//     id: item.id,
//     batchId: item.batch || item.batchId || `BATCH-${item.id}`,
//     productName: item.productName || item.product_name,
//     binNumber: item.binNumber || item.bin_number || 'BIN001',
//     binName: item.binName || item.bin_name || 'Primary Storage',
//     matCode: item.code || item.matCode || item.material_code,
//     matName: item.materialName || item.material_name,
//     qtySpSetpoint: parseFloat(item.setPoint || item.sumSP || item.plannedKg || '0'),
//     qtyOut: parseFloat(item.actual || item.sumAct || item.actualKg || '0'),
//     dosed: true, // Assume all records are dosed since they're in the database
//     timestamp: item.reportDate || item.createdAt || new Date().toISOString(),
//     lineNumber: item.lineNumber || item.line_number || 'Line1',
//     reportDate: item.reportDate,
//     facilityId: item.facilityId,
//     operator: item.operator,
//     supplier: item.supplier,
//     createdAt: item.createdAt,
//     updatedAt: item.updatedAt
//   }))
// }

// // Report filtering logic
// const filterReportData = (data: PLCReportData[], filters: ReportFilters, reportType: string): PLCReportData[] => {
//   let filtered = data

//   // Date filtering
//   if (filters.startDate) {
//     filtered = filtered.filter(item => item.timestamp >= filters.startDate)
//   }
//   if (filters.endDate) {
//     filtered = filtered.filter(item => item.timestamp <= filters.endDate)
//   }

//   // Bin filtering
//   if (filters.selectedBins.length > 0) {
//     filtered = filtered.filter(item => filters.selectedBins.includes(item.binNumber))
//   }

//   // Batch filtering
//   if (filters.selectedBatches.length > 0) {
//     filtered = filtered.filter(item => filters.selectedBatches.includes(item.batchId))
//   }

//   // Line filtering
//   if (filters.selectedLines.length > 0) {
//     filtered = filtered.filter(item => filters.selectedLines.includes(item.lineNumber))
//   }

//   return filtered
// }

// // Aggregate data for summary reports by product
// const aggregateByProduct = (data: PLCReportData[], groupBy: 'day' | 'week' | 'month') => {
//   const grouped = data.reduce((acc, item) => {
//     const date = new Date(item.timestamp)
//     let periodKey: string

//     switch (groupBy) {
//       case 'day':
//         periodKey = date.toISOString().split('T')[0]
//         break
//       case 'week':
//         const weekStart = new Date(date)
//         weekStart.setDate(date.getDate() - date.getDay())
//         periodKey = weekStart.toISOString().split('T')[0]
//         break
//       case 'month':
//         periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
//         break
//       default:
//         periodKey = date.toISOString().split('T')[0]
//     }

//     const key = `${periodKey}-${item.productName}`

//     if (!acc[key]) {
//       acc[key] = {
//         period: periodKey,
//         productName: item.productName,
//         noOfBatches: 0,
//         sumSP: 0,
//         sumAct: 0,
//         errKg: 0,
//         errPercent: 0
//       }
//     }

//     acc[key].noOfBatches++
//     acc[key].sumSP += item.qtySpSetpoint
//     acc[key].sumAct += item.qtyOut

//     return acc
//   }, {} as any)

//   return Object.values(grouped).map((item: any) => ({
//     ...item,
//     errKg: parseFloat((item.sumAct - item.sumSP).toFixed(2)),
//     errPercent: parseFloat((((item.sumAct - item.sumSP) / item.sumSP) * 100).toFixed(2))
//   }))
// }

// // Aggregate data for material consumption report
// const aggregateByMaterial = (data: PLCReportData[]) => {
//   const grouped = data.reduce((acc, item) => {
//     const key = item.matCode

//     if (!acc[key]) {
//       acc[key] = {
//         materialName: item.matName,
//         code: item.matCode,
//         plannedKG: 0,
//         actualKG: 0,
//         differencePercent: 0
//       }
//     }

//     acc[key].plannedKG += item.qtySpSetpoint
//     acc[key].actualKG += item.qtyOut

//     return acc
//   }, {} as any)

//   return Object.values(grouped).map((item: any) => ({
//     ...item,
//     plannedKG: parseFloat(item.plannedKG.toFixed(2)),
//     actualKG: parseFloat(item.actualKG.toFixed(2)),
//     differencePercent: parseFloat((((item.actualKG - item.plannedKG) / item.plannedKG) * 100).toFixed(2))
//   }))
// }

// // Report table components
// interface ReportTableProps {
//   data: PLCReportData[]
//   reportType: string
// }

// // Product Summary Report Table (Daily, Weekly, Monthly)
// function ProductSummaryTable({ data }: { data: any[] }) {
//   return (
//     <div className="overflow-x-auto rounded-lg border border-slate-700 light:border-gray-300">
//       <table className="w-full border-collapse">
//         <thead>
//           <tr className="bg-slate-800/50 light:bg-gray-100 border-b border-slate-700 light:border-gray-300">
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Product Name</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">No Of Batches</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Sum SP</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Sum Act</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err Kg</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err %</th>
//           </tr>
//         </thead>
//         <tbody>
//           {data.map((row, index) => (
//             <tr key={index} className="border-b border-slate-700/50 light:border-gray-200 hover:bg-slate-700/30 light:hover:bg-gray-50">
//               <td className="py-2 px-3 text-white light:text-gray-900 text-sm">{row.productName}</td>
//               <td className="py-2 px-3 text-cyan-400 light:text-blue-600 text-sm">{row.noOfBatches}</td>
//               <td className="py-2 px-3 text-green-400 light:text-green-600 text-sm">{row.sumSP.toFixed(2)}</td>
//               <td className="py-2 px-3 text-blue-400 light:text-blue-700 text-sm">{row.sumAct.toFixed(2)}</td>
//               <td className="py-2 px-3 text-orange-400 light:text-orange-600 text-sm">{row.errKg}</td>
//               <td className="py-2 px-3 text-purple-400 light:text-purple-600 text-sm">{row.errPercent}%</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   )
// }

// // Material Consumption Report Table
// function MaterialConsumptionTable({ data }: { data: any[] }) {
//   return (
//     <div className="overflow-x-auto rounded-lg border border-slate-700 light:border-gray-300">
//       <table className="w-full border-collapse">
//         <thead>
//           <tr className="bg-slate-800/50 light:bg-gray-100 border-b border-slate-700 light:border-gray-300">
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Material Name</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Code</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Planned KG</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Actual KG</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Difference %</th>
//           </tr>
//         </thead>
//         <tbody>
//           {data.map((row, index) => (
//             <tr key={index} className="border-b border-slate-700/50 light:border-gray-200 hover:bg-slate-700/30 light:hover:bg-gray-50">
//               <td className="py-2 px-3 text-white light:text-gray-900 text-sm">{row.materialName}</td>
//               <td className="py-2 px-3 text-orange-400 light:text-orange-600 font-mono text-sm">{row.code}</td>
//               <td className="py-2 px-3 text-green-400 light:text-green-600 text-sm">{row.plannedKG.toFixed(2)}</td>
//               <td className="py-2 px-3 text-blue-400 light:text-blue-700 text-sm">{row.actualKG.toFixed(2)}</td>
//               <td className="py-2 px-3 text-purple-400 light:text-purple-600 text-sm">{row.differencePercent}%</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   )
// }

// // Detailed Report Table with batch grouping
// function DetailedReportTable({ data }: ReportTableProps) {
//   // Group data by batch ID
//   const groupedData = useMemo(() => {
//     const groups = data.reduce((acc, item) => {
//       if (!acc[item.batchId]) {
//         acc[item.batchId] = {
//           batch: item,
//           materials: []
//         }
//       }
//       acc[item.batchId].materials.push(item)
//       return acc
//     }, {} as any)
    
//     return Object.values(groups)
//   }, [data])

//   return (
//     <div className="overflow-x-auto rounded-lg border border-slate-700 light:border-gray-300">
//       <table className="w-full border-collapse">
//         <thead>
//           <tr className="bg-slate-800/50 light:bg-gray-100 border-b border-slate-700 light:border-gray-300">
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm w-1/3">Batch</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Material Name</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Code</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Set Point</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Actual</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err Kg</th>
//             <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err %</th>
//           </tr>
//         </thead>
//         <tbody>
//           {groupedData.map((group: any, groupIndex) => {
//             const batch = group.batch
//             const materials = group.materials
            
//             return materials.map((material: PLCReportData, materialIndex: number) => {
//               const errKg = material.qtyOut - material.qtySpSetpoint
//               const errPercent = ((errKg / material.qtySpSetpoint) * 100).toFixed(2)
//               const isFirstMaterial = materialIndex === 0
              
//               return (
//                 <tr key={`${batch.batchId}-${materialIndex}`} className="border-b border-slate-700/30 light:border-gray-200 hover:bg-slate-700/20 light:hover:bg-gray-50">
//                   {isFirstMaterial ? (
//                     <td 
//                       rowSpan={materials.length} 
//                       className="py-2 px-3 bg-slate-800/30 light:bg-gray-100 border-r border-slate-600 light:border-gray-300 align-top"
//                     >
//                       <div className="space-y-1">
//                         <div className="text-white light:text-gray-900 font-semibold text-sm">
//                           {batch.batchId}
//                         </div>
//                         <div className="text-slate-400 light:text-gray-600 text-xs">
//                           {batch.productName}
//                         </div>
//                         <div className="text-slate-500 light:text-gray-500 text-xs">
//                           {new Date(batch.timestamp).toLocaleDateString()}
//                         </div>
//                         <div className="text-slate-500 light:text-gray-500 text-xs">
//                           {batch.lineNumber}
//                         </div>
//                         <div className="text-slate-500 light:text-gray-500 text-xs">
//                           {materials.reduce((sum, m) => sum + m.qtyOut, 0).toFixed(0)} kg
//                         </div>
//                       </div>
//                     </td>
//                   ) : null}
//                   <td className="py-2 px-3 text-slate-300 light:text-gray-800 text-sm">{material.matName}</td>
//                   <td className="py-2 px-3 text-orange-400 light:text-orange-600 font-mono text-sm">{material.matCode}</td>
//                   <td className="py-2 px-3 text-green-400 light:text-green-600 text-sm">{material.qtySpSetpoint.toFixed(2)}</td>
//                   <td className="py-2 px-3 text-blue-400 light:text-blue-700 text-sm">{material.qtyOut.toFixed(2)}</td>
//                   <td className="py-2 px-3 text-orange-400 light:text-orange-600 text-sm">{errKg.toFixed(2)}</td>
//                   <td className={`py-2 px-3 text-sm ${Math.abs(parseFloat(errPercent)) > 5 ? 'text-red-400 light:text-red-600' : 'text-green-400 light:text-green-600'}`}>
//                     {errPercent}%
//                   </td>
//                 </tr>
//               )
//             })
//           })}
//         </tbody>
//       </table>
//     </div>
//   )
// }

// // Loading component
// function LoadingSpinner() {
//   return (
//     <div className="flex items-center justify-center py-8">
//       <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
//       <span className="ml-2 text-slate-300">Loading report data...</span>
//     </div>
//   )
// }

// // Error component
// function ErrorMessage({ message }: { message: string }) {
//   return (
//     <div className="flex items-center justify-center py-8">
//       <AlertCircle className="h-8 w-8 text-red-400 mr-2" />
//       <span className="text-red-400">{message}</span>
//     </div>
//   )
// }

// // Main PLC Reports component
// function PLCReportsContent() {
//   const [activeTab, setActiveTab] = useState('daily')
//   const [filters, setFilters] = useState<ReportFilters>({
//     startDate: '',
//     endDate: '',
//     selectedBins: [],
//     selectedBatches: [],
//     selectedLines: []
//   })
  
//   const [data, setData] = useState<PLCReportData[]>([])
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const { toast } = useToast()

//   // Fetch data based on active tab and filters
//   const fetchData = async () => {
//     setLoading(true)
//     setError(null)
    
//     try {
//       let response: any[]
      
//       switch (activeTab) {
//         case 'daily':
//           response = await apiService.getDailyReports(filters)
//           break
//         case 'weekly':
//           response = await apiService.getWeeklyReports(filters)
//           break
//         case 'monthly':
//           response = await apiService.getMonthlyReports(filters)
//           break
//         case 'detailed':
//           response = await apiService.getDetailedReports(filters)
//           break
//         case 'material':
//           response = await apiService.getMaterialReports(filters)
//           break
//         default:
//           response = await apiService.getDailyReports(filters)
//       }
      
//       const transformedData = transformBackendData(response)
//       setData(transformedData)
//     } catch (err) {
//       const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data'
//       setError(errorMessage)
//       toast({
//         title: "Error",
//         description: errorMessage,
//         variant: "destructive"
//       })
//     } finally {
//       setLoading(false)
//     }
//   }

//   // Fetch data when tab or filters change
//   useEffect(() => {
//     fetchData()
//   }, [activeTab, filters])

//   // Get unique values for filters
//   const availableBins = useMemo(() => [...new Set(data.map(item => item.binNumber))], [data])
//   const availableBatches = useMemo(() => [...new Set(data.map(item => item.batchId))], [data])
//   const availableLines = useMemo(() => [...new Set(data.map(item => item.lineNumber))], [data])

//   // Filter data based on current filters
//   const filteredData = useMemo(() => filterReportData(data, filters, activeTab), [data, filters, activeTab])

//   // Generate aggregated data for summary reports
//   const dailyData = useMemo(() => aggregateByProduct(filteredData, 'day'), [filteredData])
//   const weeklyData = useMemo(() => aggregateByProduct(filteredData, 'week'), [filteredData])
//   const monthlyData = useMemo(() => aggregateByProduct(filteredData, 'month'), [filteredData])
//   const materialData = useMemo(() => aggregateByMaterial(filteredData), [filteredData])

//   const exportData = async () => {
//     try {
//       setLoading(true)
//       const exportData = await apiService.exportReports(activeTab, filters)
      
//       // Create CSV content
//       const csvContent = exportData.map((row: any) => 
//         `${row.batchId || row.batch || ''},${row.binNumber || ''},${row.binName || ''},${row.matCode || row.code || ''},${row.matName || row.materialName || ''},${row.qtySpSetpoint || row.setPoint || ''},${row.qtyOut || row.actual || ''},${row.dosed || 'true'},${row.lineNumber || ''},${row.timestamp || ''}`
//       ).join('\n')
      
//       const blob = new Blob([csvContent], { type: 'text/csv' })
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `plc-report-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`
//       a.click()
      
//       toast({
//         title: "Success",
//         description: "Report exported successfully",
//       })
//     } catch (err) {
//       const errorMessage = err instanceof Error ? err.message : 'Failed to export data'
//       toast({
//         title: "Error",
//         description: errorMessage,
//         variant: "destructive"
//       })
//     } finally {
//       setLoading(false)
//     }
//   }

//   if (loading && data.length === 0) {
//     return <LoadingSpinner />
//   }

//   if (error && data.length === 0) {
//     return <ErrorMessage message={error} />
//   }

//   return (
//     <div className="space-y-4">
//       {/* Filters with Export Actions */}
//       <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
//         <CardHeader className="pb-3">
//           <div className="flex items-center justify-between">
//             <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
//               <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
//               Report Filters
//             </CardTitle>
//             <div className="flex gap-2">
//               <Button 
//                 onClick={exportData} 
//                 variant="outline" 
//                 size="sm" 
//                 disabled={loading}
//                 className="border-green-600 light:border-green-600 text-green-400 light:text-green-700 hover:bg-green-900/30 light:hover:bg-green-50 light:hover:text-green-800 bg-transparent light:bg-white"
//               >
//                 {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
//                 Export CSV
//               </Button>
//               <Button 
//                 onClick={() => window.print()} 
//                 variant="outline" 
//                 size="sm" 
//                 className="border-blue-600 light:border-blue-600 text-blue-400 light:text-blue-700 hover:bg-blue-900/30 light:hover:bg-blue-50 light:hover:text-blue-800 bg-transparent light:bg-white"
//               >
//                 <Printer className="h-4 w-4 mr-2" />
//                 Print
//               </Button>
//             </div>
//           </div>
//         </CardHeader>
//         <CardContent className="pt-0">
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
//             <div>
//               <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Start Date</label>
//               <Input
//                 type="date"
//                 value={filters.startDate}
//                 onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
//                 className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//               />
//             </div>
            
//             <div>
//               <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">End Date</label>
//               <Input
//                 type="date"
//                 value={filters.endDate}
//                 onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
//                 className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//               />
//             </div>
            
//             <div>
//               <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Production Lines</label>
//               <Select onValueChange={(value) => setFilters({ ...filters, selectedLines: value === 'all' ? [] : [value] })}>
//                 <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                   <SelectValue placeholder="All Lines" />
//                 </SelectTrigger>
//                 <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                   <SelectItem value="all">All Lines</SelectItem>
//                   {availableLines.map(line => (
//                     <SelectItem key={line} value={line}>{line}</SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
            
//             <div>
//               <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Bins</label>
//               <Select onValueChange={(value) => setFilters({ ...filters, selectedBins: value === 'all' ? [] : [value] })}>
//                 <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                   <SelectValue placeholder="All Bins" />
//                 </SelectTrigger>
//                 <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                   <SelectItem value="all">All Bins</SelectItem>
//                   {availableBins.slice(0, 10).map(bin => (
//                     <SelectItem key={bin} value={bin}>{bin}</SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
            
//             <div>
//               <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Batches</label>
//               <Select onValueChange={(value) => setFilters({ ...filters, selectedBatches: value === 'all' ? [] : [value] })}>
//                 <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                   <SelectValue placeholder="All Batches" />
//                 </SelectTrigger>
//                 <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                   <SelectItem value="all">All Batches</SelectItem>
//                   {availableBatches.slice(0, 15).map(batch => (
//                     <SelectItem key={batch} value={batch}>{batch}</SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
            
//             <div className="flex items-end gap-2">
//               <Button
//                 onClick={() => setFilters({
//                   startDate: '',
//                   endDate: '',
//                   selectedBins: [],
//                   selectedBatches: [],
//                   selectedLines: []
//                 })}
//                 variant="outline"
//                 size="sm"
//                 className="border-slate-600 light:border-gray-500 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 light:hover:text-gray-800 bg-transparent light:bg-white h-8"
//               >
//                 Clear Filters
//               </Button>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* Reports Tabs */}
//       <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
//         <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 light:bg-gray-100 border border-slate-700 light:border-gray-200">
//           <TabsTrigger value="daily" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
//             <Activity className="h-4 w-4 mr-2" />
//             Daily Report
//           </TabsTrigger>
//           <TabsTrigger value="weekly" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
//             <BarChart3 className="h-4 w-4 mr-2" />
//             Weekly Report
//           </TabsTrigger>
//           <TabsTrigger value="monthly" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
//             <Calendar className="h-4 w-4 mr-2" />
//             Monthly Report
//           </TabsTrigger>
//           <TabsTrigger value="detailed" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
//             <Layers className="h-4 w-4 mr-2" />
//             Detailed Report
//           </TabsTrigger>
//           <TabsTrigger value="material" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
//             <Package className="h-4 w-4 mr-2" />
//             Material Consumption
//           </TabsTrigger>
//         </TabsList>

//         <TabsContent value="daily" className="mt-3">
//           <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
//             <CardHeader className="pb-3">
//               <CardTitle className="text-white light:text-gray-900 text-lg">Daily Production Summary</CardTitle>
//               <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
//                 Daily aggregated production data from Mix Line 1 & 2 ({filteredData.length} records)
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="pt-0">
//               {loading ? <LoadingSpinner /> : <ProductSummaryTable data={dailyData} />}
//             </CardContent>
//           </Card>
//         </TabsContent>

//         <TabsContent value="weekly" className="mt-3">
//           <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
//             <CardHeader className="pb-3">
//               <CardTitle className="text-white light:text-gray-900 text-lg">Weekly Production Summary</CardTitle>
//               <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
//                 Weekly aggregated production data from Mix Line 1 & 2 ({filteredData.length} records)
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="pt-0">
//               {loading ? <LoadingSpinner /> : <ProductSummaryTable data={weeklyData} />}
//             </CardContent>
//           </Card>
//         </TabsContent>

//         <TabsContent value="monthly" className="mt-3">
//           <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
//             <CardHeader className="pb-3">
//               <CardTitle className="text-white light:text-gray-900 text-lg">Monthly Production Summary</CardTitle>
//               <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
//                 Monthly aggregated production data from Mix Line 1 & 2 ({filteredData.length} records)
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="pt-0">
//               {loading ? <LoadingSpinner /> : <ProductSummaryTable data={monthlyData} />}
//             </CardContent>
//           </Card>
//         </TabsContent>

//         <TabsContent value="detailed" className="mt-3">
//           <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
//             <CardHeader className="pb-3">
//               <CardTitle className="text-white light:text-gray-900 text-lg">Detailed Batch Report</CardTitle>
//               <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
//                 Complete batch-level data with all Mix Line information ({filteredData.length} records)
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="pt-0">
//               {loading ? <LoadingSpinner /> : <DetailedReportTable data={filteredData} reportType="detailed" />}
//             </CardContent>
//           </Card>
//         </TabsContent>

//         <TabsContent value="material" className="mt-3">
//           <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
//             <CardHeader className="pb-3">
//               <CardTitle className="text-white light:text-gray-900 text-lg">Material Consumption Analysis</CardTitle>
//               <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
//                 Material usage efficiency and consumption patterns ({filteredData.length} records)
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="pt-0">
//               {loading ? <LoadingSpinner /> : <MaterialConsumptionTable data={materialData} />}
//             </CardContent>
//           </Card>
//         </TabsContent>
//       </Tabs>
//     </div>
//   )
// }

// export function PLCReports() {
//   return (
//     <WaterSystemLayout 
//       title="PLC Production Reports" 
//       subtitle="Comprehensive production line reporting with Mix Line 1 & 2 integration"
//     >
//       <PLCReportsContent />
//     </WaterSystemLayout>
//   )
// }




import { useState, useMemo, useEffect } from 'react'
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Calendar, Filter, Download, Printer, Database, Activity, BarChart3, Layers, Package, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// Types for PLC reporting data
interface PLCReportData {
  id?: number
  orderId?: string
  batchId: string
  productName: string
  binNumber: string
  binName: string
  matCode: string
  matName: string
  qtySpSetpoint: number
  qtyOut: number
  dosed: boolean
  timestamp: string
  lineNumber: string
  reportDate?: string
  facilityId?: string
  operator?: string
  supplier?: string
  createdAt?: string
  updatedAt?: string
}

interface ReportFilters {
  startDate: string
  endDate: string
  selectedBins: string[]
  selectedBatches: string[]
  selectedLines: string[]
  product?: string
  facilityId?: string
}

// Mock PLC report data
const mockPLCData: PLCReportData[] = [
  {
    id: 1,
    batchId: 'BATCH-001',
    productName: 'Premium Feed Mix',
    binNumber: 'BIN001',
    binName: 'Primary Storage',
    matCode: 'MAT001',
    matName: 'Wheat Flour',
    qtySpSetpoint: 150.0,
    qtyOut: 148.5,
    dosed: true,
    timestamp: '2025-07-24T08:30:00Z',
    lineNumber: 'Line1',
    reportDate: '2025-07-24',
    facilityId: 'FAC001',
    operator: 'John Smith',
    supplier: 'Hercules Mills'
  },
  {
    id: 2,
    batchId: 'BATCH-001',
    productName: 'Premium Feed Mix',
    binNumber: 'BIN002',
    binName: 'Secondary Storage',
    matCode: 'MAT002',
    matName: 'Corn Meal',
    qtySpSetpoint: 100.0,
    qtyOut: 99.8,
    dosed: true,
    timestamp: '2025-07-24T08:35:00Z',
    lineNumber: 'Line1',
    reportDate: '2025-07-24',
    facilityId: 'FAC001',
    operator: 'John Smith',
    supplier: 'Hercules Mills'
  },
  {
    id: 3,
    batchId: 'BATCH-002',
    productName: 'Growth Formula',
    binNumber: 'BIN003',
    binName: 'Mineral Storage',
    matCode: 'MAT003',
    matName: 'Soybean Meal',
    qtySpSetpoint: 75.0,
    qtyOut: 74.2,
    dosed: true,
    timestamp: '2025-07-24T09:00:00Z',
    lineNumber: 'Line2',
    reportDate: '2025-07-24',
    facilityId: 'FAC001',
    operator: 'Sarah Wilson',
    supplier: 'Hercules Mills'
  },
  {
    id: 4,
    batchId: 'BATCH-002',
    productName: 'Growth Formula',
    binNumber: 'BIN004',
    binName: 'Vitamin Storage',
    matCode: 'MAT004',
    matName: 'Vitamin Mix',
    qtySpSetpoint: 25.0,
    qtyOut: 25.1,
    dosed: true,
    timestamp: '2025-07-24T09:05:00Z',
    lineNumber: 'Line2',
    reportDate: '2025-07-24',
    facilityId: 'FAC001',
    operator: 'Sarah Wilson',
    supplier: 'Hercules Mills'
  },
  {
    id: 5,
    batchId: 'BATCH-003',
    productName: 'Bulk Feed',
    binNumber: 'BIN005',
    binName: 'Bulk Storage',
    matCode: 'MAT005',
    matName: 'Barley',
    qtySpSetpoint: 200.0,
    qtyOut: 198.5,
    dosed: true,
    timestamp: '2025-07-25T07:30:00Z',
    lineNumber: 'Line1',
    reportDate: '2025-07-25',
    facilityId: 'FAC001',
    operator: 'Mike Johnson',
    supplier: 'Hercules Mills'
  },
  {
    id: 6,
    batchId: 'BATCH-003',
    productName: 'Bulk Feed',
    binNumber: 'BIN006',
    binName: 'Protein Storage',
    matCode: 'MAT006',
    matName: 'Fish Meal',
    qtySpSetpoint: 50.0,
    qtyOut: 49.8,
    dosed: true,
    timestamp: '2025-07-25T07:35:00Z',
    lineNumber: 'Line1',
    reportDate: '2025-07-25',
    facilityId: 'FAC001',
    operator: 'Mike Johnson',
    supplier: 'Hercules Mills'
  },
  {
    id: 7,
    batchId: 'BATCH-004',
    productName: 'Special Blend',
    binNumber: 'BIN007',
    binName: 'Special Storage',
    matCode: 'MAT007',
    matName: 'Oats',
    qtySpSetpoint: 120.0,
    qtyOut: 121.2,
    dosed: true,
    timestamp: '2025-07-25T10:00:00Z',
    lineNumber: 'Line2',
    reportDate: '2025-07-25',
    facilityId: 'FAC001',
    operator: 'David Brown',
    supplier: 'Hercules Mills'
  },
  {
    id: 8,
    batchId: 'BATCH-004',
    productName: 'Special Blend',
    binNumber: 'BIN008',
    binName: 'Additive Storage',
    matCode: 'MAT008',
    matName: 'Mineral Premix',
    qtySpSetpoint: 30.0,
    qtyOut: 30.1,
    dosed: true,
    timestamp: '2025-07-25T10:05:00Z',
    lineNumber: 'Line2',
    reportDate: '2025-07-25',
    facilityId: 'FAC001',
    operator: 'David Brown',
    supplier: 'Hercules Mills'
  },
  {
    id: 9,
    batchId: 'BATCH-005',
    productName: 'Premium Feed Mix',
    binNumber: 'BIN001',
    binName: 'Primary Storage',
    matCode: 'MAT001',
    matName: 'Wheat Flour',
    qtySpSetpoint: 160.0,
    qtyOut: 159.5,
    dosed: true,
    timestamp: '2025-07-26T08:00:00Z',
    lineNumber: 'Line1',
    reportDate: '2025-07-26',
    facilityId: 'FAC001',
    operator: 'Lisa Davis',
    supplier: 'Hercules Mills'
  },
  {
    id: 10,
    batchId: 'BATCH-005',
    productName: 'Premium Feed Mix',
    binNumber: 'BIN002',
    binName: 'Secondary Storage',
    matCode: 'MAT002',
    matName: 'Corn Meal',
    qtySpSetpoint: 110.0,
    qtyOut: 109.8,
    dosed: true,
    timestamp: '2025-07-26T08:05:00Z',
    lineNumber: 'Line1',
    reportDate: '2025-07-26',
    facilityId: 'FAC001',
    operator: 'Lisa Davis',
    supplier: 'Hercules Mills'
  }
]

// Transform backend data to frontend format
const transformBackendData = (backendData: any[]): PLCReportData[] => {
  return backendData.map(item => ({
    id: item.id,
    batchId: item.batch || item.batchId || `BATCH-${item.id}`,
    productName: item.productName || item.product_name,
    binNumber: item.binNumber || item.bin_number || 'BIN001',
    binName: item.binName || item.bin_name || 'Primary Storage',
    matCode: item.code || item.matCode || item.material_code,
    matName: item.materialName || item.material_name,
    qtySpSetpoint: parseFloat(item.setPoint || item.sumSP || item.plannedKg || '0'),
    qtyOut: parseFloat(item.actual || item.sumAct || item.actualKg || '0'),
    dosed: true, // Assume all records are dosed since they're in the database
    timestamp: item.reportDate || item.createdAt || new Date().toISOString(),
    lineNumber: item.lineNumber || item.line_number || 'Line1',
    reportDate: item.reportDate,
    facilityId: item.facilityId,
    operator: item.operator,
    supplier: item.supplier,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }))
}

// Report filtering logic
const filterReportData = (data: PLCReportData[], filters: ReportFilters, reportType: string): PLCReportData[] => {
  let filtered = data

  // Date filtering
  if (filters.startDate) {
    filtered = filtered.filter(item => item.timestamp >= filters.startDate)
  }
  if (filters.endDate) {
    filtered = filtered.filter(item => item.timestamp <= filters.endDate)
  }

  // Bin filtering
  if (filters.selectedBins.length > 0) {
    filtered = filtered.filter(item => filters.selectedBins.includes(item.binNumber))
  }

  // Batch filtering
  if (filters.selectedBatches.length > 0) {
    filtered = filtered.filter(item => filters.selectedBatches.includes(item.batchId))
  }

  // Line filtering
  if (filters.selectedLines.length > 0) {
    filtered = filtered.filter(item => filters.selectedLines.includes(item.lineNumber))
  }

  return filtered
}

// Aggregate data for summary reports by product
const aggregateByProduct = (data: PLCReportData[], groupBy: 'day' | 'week' | 'month') => {
  const grouped = data.reduce((acc, item) => {
    const date = new Date(item.timestamp)
    let periodKey: string

    switch (groupBy) {
      case 'day':
        periodKey = date.toISOString().split('T')[0]
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        periodKey = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
      default:
        periodKey = date.toISOString().split('T')[0]
    }

    const key = `${periodKey}-${item.productName}`

    if (!acc[key]) {
      acc[key] = {
        period: periodKey,
        productName: item.productName,
        noOfBatches: 0,
        sumSP: 0,
        sumAct: 0,
        errKg: 0,
        errPercent: 0
      }
    }

    acc[key].noOfBatches++
    acc[key].sumSP += item.qtySpSetpoint
    acc[key].sumAct += item.qtyOut

    return acc
  }, {} as any)

  return Object.values(grouped).map((item: any) => ({
    ...item,
    errKg: parseFloat((item.sumAct - item.sumSP).toFixed(2)),
    errPercent: parseFloat((((item.sumAct - item.sumSP) / item.sumSP) * 100).toFixed(2))
  }))
}

// Aggregate data for material consumption report
const aggregateByMaterial = (data: PLCReportData[]) => {
  const grouped = data.reduce((acc, item) => {
    const key = item.matCode

    if (!acc[key]) {
      acc[key] = {
        materialName: item.matName,
        code: item.matCode,
        plannedKG: 0,
        actualKG: 0,
        differencePercent: 0
      }
    }

    acc[key].plannedKG += item.qtySpSetpoint
    acc[key].actualKG += item.qtyOut

    return acc
  }, {} as any)

  return Object.values(grouped).map((item: any) => ({
    ...item,
    plannedKG: parseFloat(item.plannedKG.toFixed(2)),
    actualKG: parseFloat(item.actualKG.toFixed(2)),
    differencePercent: parseFloat((((item.actualKG - item.plannedKG) / item.plannedKG) * 100).toFixed(2))
  }))
}

// Report table components
interface ReportTableProps {
  data: PLCReportData[]
  reportType: string
}

// Product Summary Report Table (Daily, Weekly, Monthly)
function ProductSummaryTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 light:border-gray-300">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-800/50 light:bg-gray-100 border-b border-slate-700 light:border-gray-300">
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Product Name</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">No Of Batches</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Sum SP</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Sum Act</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err Kg</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index} className="border-b border-slate-700/50 light:border-gray-200 hover:bg-slate-700/30 light:hover:bg-gray-50">
              <td className="py-2 px-3 text-white light:text-gray-900 text-sm">{row.productName}</td>
              <td className="py-2 px-3 text-cyan-400 light:text-blue-600 text-sm">{row.noOfBatches}</td>
              <td className="py-2 px-3 text-green-400 light:text-green-600 text-sm">{row.sumSP.toFixed(2)}</td>
              <td className="py-2 px-3 text-blue-400 light:text-blue-700 text-sm">{row.sumAct.toFixed(2)}</td>
              <td className="py-2 px-3 text-orange-400 light:text-orange-600 text-sm">{row.errKg}</td>
              <td className="py-2 px-3 text-purple-400 light:text-purple-600 text-sm">{row.errPercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Material Consumption Report Table
function MaterialConsumptionTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 light:border-gray-300">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-800/50 light:bg-gray-100 border-b border-slate-700 light:border-gray-300">
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Material Name</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Code</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Planned KG</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Actual KG</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Difference %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index} className="border-b border-slate-700/50 light:border-gray-200 hover:bg-slate-700/30 light:hover:bg-gray-50">
              <td className="py-2 px-3 text-white light:text-gray-900 text-sm">{row.materialName}</td>
              <td className="py-2 px-3 text-orange-400 light:text-orange-600 font-mono text-sm">{row.code}</td>
              <td className="py-2 px-3 text-green-400 light:text-green-600 text-sm">{row.plannedKG.toFixed(2)}</td>
              <td className="py-2 px-3 text-blue-400 light:text-blue-700 text-sm">{row.actualKG.toFixed(2)}</td>
              <td className="py-2 px-3 text-purple-400 light:text-purple-600 text-sm">{row.differencePercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Detailed Report Table with batch grouping
function DetailedReportTable({ data }: ReportTableProps) {
  // Group data by batch ID
  const groupedData = useMemo(() => {
    const groups = data.reduce((acc, item) => {
      if (!acc[item.batchId]) {
        acc[item.batchId] = {
          batch: item,
          materials: []
        }
      }
      acc[item.batchId].materials.push(item)
      return acc
    }, {} as any)

    return Object.values(groups)
  }, [data])

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 light:border-gray-300">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-800/50 light:bg-gray-100 border-b border-slate-700 light:border-gray-300">
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm w-1/3">Batch</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Material Name</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Code</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Set Point</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Actual</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err Kg</th>
            <th className="text-left py-2 px-3 text-slate-300 light:text-gray-700 font-medium text-sm">Err %</th>
          </tr>
        </thead>
        <tbody>
          {groupedData.map((group: any, groupIndex) => {
            const batch = group.batch
            const materials = group.materials

            return materials.map((material: PLCReportData, materialIndex: number) => {
              const errKg = material.qtyOut - material.qtySpSetpoint
              const errPercent = ((errKg / material.qtySpSetpoint) * 100).toFixed(2)
              const isFirstMaterial = materialIndex === 0

              return (
                <tr key={`${batch.batchId}-${materialIndex}`} className="border-b border-slate-700/30 light:border-gray-200 hover:bg-slate-700/20 light:hover:bg-gray-50">
                  {isFirstMaterial ? (
                    <td 
                      rowSpan={materials.length} 
                      className="py-2 px-3 bg-slate-800/30 light:bg-gray-100 border-r border-slate-600 light:border-gray-300 align-top"
                    >
                      <div className="space-y-1">
                        <div className="text-white light:text-gray-900 font-semibold text-sm">
                          {batch.batchId}
                        </div>
                        <div className="text-slate-400 light:text-gray-600 text-xs">
                          {batch.productName}
                        </div>
                        <div className="text-slate-500 light:text-gray-500 text-xs">
                          {new Date(batch.timestamp).toLocaleDateString()}
                        </div>
                        <div className="text-slate-500 light:text-gray-500 text-xs">
                          {batch.lineNumber}
                        </div>
                        <div className="text-slate-500 light:text-gray-500 text-xs">
                          {materials.reduce((sum: number, m: PLCReportData) => sum + m.qtyOut, 0).toFixed(0)} kg
                        </div>
                      </div>
                    </td>
                  ) : null}
                  <td className="py-2 px-3 text-slate-300 light:text-gray-800 text-sm">{material.matName}</td>
                  <td className="py-2 px-3 text-orange-400 light:text-orange-600 font-mono text-sm">{material.matCode}</td>
                  <td className="py-2 px-3 text-green-400 light:text-green-600 text-sm">{material.qtySpSetpoint.toFixed(2)}</td>
                  <td className="py-2 px-3 text-blue-400 light:text-blue-700 text-sm">{material.qtyOut.toFixed(2)}</td>
                  <td className="py-2 px-3 text-orange-400 light:text-orange-600 text-sm">{errKg.toFixed(2)}</td>
                  <td className={`py-2 px-3 text-sm ${Math.abs(parseFloat(errPercent)) > 5 ? 'text-red-400 light:text-red-600' : 'text-green-400 light:text-green-600'}`}>
                    {errPercent}%
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  )
}

// Loading component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      <span className="ml-2 text-slate-300">Loading report data...</span>
    </div>
  )
}

// Error component
function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <AlertCircle className="h-8 w-8 text-red-400 mr-2" />
      <span className="text-red-400">{message}</span>
    </div>
  )
}

// Main PLC Reports component
function PLCReportsContent() {
  const [activeTab, setActiveTab] = useState('daily')
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: '',
    endDate: '',
    selectedBins: [],
    selectedBatches: [],
    selectedLines: []
  })

  const [data, setData] = useState<PLCReportData[]>(mockPLCData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Update data based on active tab and filters
  const updateData = () => {
    setLoading(true)
    setError(null)

    try {
      let response: PLCReportData[]

      switch (activeTab) {
        case 'daily':
          // Show all data for daily view (since mock data is from 2024, it won't match current date)
          response = mockPLCData
          break
        case 'weekly':
          // Show all data for weekly view
          response = mockPLCData
          break
        case 'monthly':
          // Show all data for monthly view
          response = mockPLCData
          break
        case 'detailed':
          response = mockPLCData
          break
        case 'material':
          response = mockPLCData // Show all materials for material consumption
          break
        default:
          response = mockPLCData
      }

      setData(response)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  // Update data when tab or filters change
  useEffect(() => {
    updateData()
  }, [activeTab, filters])

  // Get unique values for filters
  const availableBins = useMemo(() => Array.from(new Set(data.map(item => item.binNumber))), [data])
  const availableBatches = useMemo(() => Array.from(new Set(data.map(item => item.batchId))), [data])
  const availableLines = useMemo(() => Array.from(new Set(data.map(item => item.lineNumber))), [data])

  // Filter data based on current filters
  const filteredData = useMemo(() => filterReportData(data, filters, activeTab), [data, filters, activeTab])

  // Generate aggregated data for summary reports
  const dailyData = useMemo(() => aggregateByProduct(filteredData, 'day'), [filteredData])
  const weeklyData = useMemo(() => aggregateByProduct(filteredData, 'week'), [filteredData])
  const monthlyData = useMemo(() => aggregateByProduct(filteredData, 'month'), [filteredData])
  const materialData = useMemo(() => aggregateByMaterial(filteredData), [filteredData])

  const exportData = async () => {
    try {
      setLoading(true)
      // In a real application, you would call an API here to export data
      // For now, we'll just simulate the export process
      const exportData = filteredData.map(item => ({
        batchId: item.batchId,
        binNumber: item.binNumber,
        binName: item.binName,
        matCode: item.matCode,
        matName: item.matName,
        qtySpSetpoint: item.qtySpSetpoint,
        qtyOut: item.qtyOut,
        dosed: item.dosed,
        lineNumber: item.lineNumber,
        timestamp: item.timestamp,
        reportDate: item.reportDate,
        facilityId: item.facilityId,
        operator: item.operator,
        supplier: item.supplier,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))

      // Create CSV content
      const csvContent = exportData.map((row: any) => 
        `${row.batchId || ''},${row.binNumber || ''},${row.binName || ''},${row.matCode || ''},${row.matName || ''},${row.qtySpSetpoint || ''},${row.qtyOut || ''},${row.dosed || 'true'},${row.lineNumber || ''},${row.timestamp || ''}`
      ).join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `plc-report-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`
      a.click()

      toast({
        title: "Success",
        description: "Report exported successfully",
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export data'
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading && data.length === 0) {
    return <LoadingSpinner />
  }

  if (error && data.length === 0) {
    return <ErrorMessage message={error} />
  }

  return (
    <div className="space-y-4">
      {/* Filters with Export Actions */}
      <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
              Report Filters
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={exportData} 
                variant="outline" 
                size="sm" 
                disabled={loading}
                className="border-green-600 light:border-green-600 text-green-400 light:text-green-700 hover:bg-green-900/30 light:hover:bg-green-50 light:hover:text-green-800 bg-transparent light:bg-white"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export CSV
              </Button>
              <Button 
                onClick={() => window.print()} 
                variant="outline" 
                size="sm" 
                className="border-blue-600 light:border-blue-600 text-blue-400 light:text-blue-700 hover:bg-blue-900/30 light:hover:bg-blue-50 light:hover:text-blue-800 bg-transparent light:bg-white"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
              />
            </div>

            <div>
              <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
              />
            </div>

            <div>
              <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Production Lines</label>
              <Select onValueChange={(value) => setFilters({ ...filters, selectedLines: value === 'all' ? [] : [value] })}>
                <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                  <SelectValue placeholder="All Lines" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                  <SelectItem value="all">All Lines</SelectItem>
                  {availableLines.map(line => (
                    <SelectItem key={line} value={line}>{line}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Bins</label>
              <Select onValueChange={(value) => setFilters({ ...filters, selectedBins: value === 'all' ? [] : [value] })}>
                <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                  <SelectValue placeholder="All Bins" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                  <SelectItem value="all">All Bins</SelectItem>
                  {availableBins.slice(0, 10).map(bin => (
                    <SelectItem key={bin} value={bin}>{bin}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Batches</label>
              <Select onValueChange={(value) => setFilters({ ...filters, selectedBatches: value === 'all' ? [] : [value] })}>
                <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                  <SelectItem value="all">All Batches</SelectItem>
                  {availableBatches.slice(0, 15).map(batch => (
                    <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={() => setFilters({
                  startDate: '',
                  endDate: '',
                  selectedBins: [],
                  selectedBatches: [],
                  selectedLines: []
                })}
                variant="outline"
                size="sm"
                className="border-slate-600 light:border-gray-500 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 light:hover:text-gray-800 bg-transparent light:bg-white h-8"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 light:bg-gray-100 border border-slate-700 light:border-gray-200">
          <TabsTrigger value="daily" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
            <Activity className="h-4 w-4 mr-2" />
            Daily Report
          </TabsTrigger>
          <TabsTrigger value="weekly" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
            <BarChart3 className="h-4 w-4 mr-2" />
            Weekly Report
          </TabsTrigger>
          <TabsTrigger value="monthly" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
            <Calendar className="h-4 w-4 mr-2" />
            Monthly Report
          </TabsTrigger>
          <TabsTrigger value="detailed" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
            <Layers className="h-4 w-4 mr-2" />
            Detailed Report
          </TabsTrigger>
          <TabsTrigger value="material" className="data-[state=active]:bg-cyan-600 light:data-[state=active]:bg-blue-600 data-[state=active]:text-white light:data-[state=active]:text-white">
            <Package className="h-4 w-4 mr-2" />
            Material Consumption
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-3">
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-white light:text-gray-900 text-lg">Daily Production Summary</CardTitle>
              <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
                Daily aggregated production data from Mix Line 1 & 2 ({filteredData.length} records)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? <LoadingSpinner /> : <ProductSummaryTable data={dailyData} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly" className="mt-3">
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-white light:text-gray-900 text-lg">Weekly Production Summary</CardTitle>
              <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
                Weekly aggregated production data from Mix Line 1 & 2 ({filteredData.length} records)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? <LoadingSpinner /> : <ProductSummaryTable data={weeklyData} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="mt-3">
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-white light:text-gray-900 text-lg">Monthly Production Summary</CardTitle>
              <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
                Monthly aggregated production data from Mix Line 1 & 2 ({filteredData.length} records)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? <LoadingSpinner /> : <ProductSummaryTable data={monthlyData} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detailed" className="mt-3">
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-white light:text-gray-900 text-lg">Detailed Batch Report</CardTitle>
              <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
                Complete batch-level data with all Mix Line information ({filteredData.length} records)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? <LoadingSpinner /> : <DetailedReportTable data={filteredData} reportType="detailed" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="material" className="mt-3">
          <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-white light:text-gray-900 text-lg">Material Consumption Analysis</CardTitle>
              <CardDescription className="text-slate-300 light:text-gray-600 text-sm">
                Material usage efficiency and consumption patterns ({filteredData.length} records)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? <LoadingSpinner /> : <MaterialConsumptionTable data={materialData} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function PLCReports() {
  return (
    <WaterSystemLayout 
      title="PLC Production Reports" 
      subtitle="Comprehensive production line reporting with Mix Line 1 & 2 integration"
    >
      <PLCReportsContent />
    </WaterSystemLayout>
  )
}