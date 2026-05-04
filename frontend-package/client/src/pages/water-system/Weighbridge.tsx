// import React, { useState, useEffect } from 'react'
// import axios from 'axios'
// import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
// import { KPICard } from '../../components/water-system/KPICard'
// import { Scale, Truck, AlertTriangle, CheckCircle, Plus, Filter } from 'lucide-react'
// import { Button } from '@/components/ui/button'
// import { Input } from '@/components/ui/input'
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// export function Weighbridge() {
//   const [weighbridgeData, setWeighbridgeData] = useState<any[]>([])
//   const [filters, setFilters] = useState({
//     truckId: '',
//     truckPlate: '',
//     truckDriver: '',
//     truckMaterial: 'all',
//     rfidLinked: 'all',
//     orderLinked: 'all'
//   })

//   // Fetch weighbridge data from backend
//   useEffect(() => {
//     const fetchData = async () => {
//       try {
//         const res = await axios.get('http://localhost:5000/api/weighbridge')
//         setWeighbridgeData(res.data)
//       } catch (error) {
//         
//       }
//     }
//     fetchData()
//   }, [])

//   // Get unique values for filter options from live data
//   const uniqueMaterials = Array.from(new Set(weighbridgeData.map(item => item.truck_material))).sort()
//   const uniqueOrders = Array.from(new Set(weighbridgeData.map(item => item.order_linked).filter(order => order !== null && order !== 'NA'))).sort()

//   // Filter the table data based on current filters
//   const filteredWeighbridgeData = weighbridgeData.filter(item => {
//     return (
//       (filters.truckId === '' || item.truck_id.toString().includes(filters.truckId)) &&
//       (filters.truckPlate === '' || item.truck_plate.toLowerCase().includes(filters.truckPlate.toLowerCase())) &&
//       (filters.truckDriver === '' || item.truck_driver.toLowerCase().includes(filters.truckDriver.toLowerCase())) &&
//       (filters.truckMaterial === 'all' || item.truck_material === filters.truckMaterial) &&
//       (filters.rfidLinked === 'all' || (filters.rfidLinked === 'YES' ? item.rfid_linked : !item.rfid_linked)) &&
//       (filters.orderLinked === 'all' || item.order_linked === filters.orderLinked)
//     )
//   })

//   const clearFilters = () => {
//     setFilters({
//       truckId: '',
//       truckPlate: '',
//       truckDriver: '',
//       truckMaterial: 'all',
//       rfidLinked: 'all',
//       orderLinked: 'all'
//     })
//   }

//   return (
//     <WaterSystemLayout 
//       title="Weighbridge Management" 
//       subtitle="Vehicle weighing, truck logging, and weight management"
//     >
//       <div className="space-y-6">
        
//         {/* KPI Cards */}
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//           <KPICard
//             title="TOTAL TRUCKS"
//             value="1"
//             icon="gauge"
//             color="blue"
//             chartType="bar"
//           />
//           <KPICard
//             title="ACTIVE BAYS"
//             value="1"
//             icon="activity"
//             color="orange"
//             chartType="circle"
//           />
//           <KPICard
//             title="WEIGHING"
//             value="0"
//             icon="pump"
//             color="purple"
//             chartType="line"
//           />
//           <KPICard
//             title="COMPLETE TODAY"
//             value="1"
//             icon="water"
//             color="green"
//             chartType="gauge"
//           />
//         </div>

//         {/* Filter Section */}
//         <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 mb-4 light:shadow-md">
//           <CardHeader className="pb-3">
//             <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
//               <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
//               Weighbridge Filters
//             </CardTitle>
//           </CardHeader>
//           <CardContent className="pt-0">
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck ID</label>
//                 <Input
//                   type="text"
//                   placeholder="Search ID..."
//                   value={filters.truckId}
//                   onChange={(e) => setFilters({ ...filters, truckId: e.target.value })}
//                   className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//                 />
//               </div>
              
//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck Plate</label>
//                 <Input
//                   type="text"
//                   placeholder="Search plate..."
//                   value={filters.truckPlate}
//                   onChange={(e) => setFilters({ ...filters, truckPlate: e.target.value })}
//                   className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//                 />
//               </div>
              
//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Driver</label>
//                 <Input
//                   type="text"
//                   placeholder="Search driver..."
//                   value={filters.truckDriver}
//                   onChange={(e) => setFilters({ ...filters, truckDriver: e.target.value })}
//                   className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//                 />
//               </div>
              
//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Material</label>
//                 <Select onValueChange={(value) => setFilters({ ...filters, truckMaterial: value })}>
//                   <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                     <SelectValue placeholder="All Materials" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                     <SelectItem value="all">All Materials</SelectItem>
//                     {uniqueMaterials.map(material => (
//                       <SelectItem key={material} value={material}>{material}</SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </div>
              
//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">RFID Linked</label>
//                 <Select onValueChange={(value) => setFilters({ ...filters, rfidLinked: value })}>
//                   <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                     <SelectValue placeholder="All Status" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                     <SelectItem value="all">All Status</SelectItem>
//                     <SelectItem value="YES">YES</SelectItem>
//                     <SelectItem value="NO">NO</SelectItem>
//                   </SelectContent>
//                 </Select>
//               </div>
              
//               <div className="flex items-end gap-2">
//                 <Button
//                   onClick={clearFilters}
//                   variant="outline"
//                   size="sm"
//                   className="border-slate-600 light:border-gray-500 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 light:hover:text-gray-800 bg-transparent light:bg-white h-8"
//                 >
//                   Clear Filters
//                 </Button>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* Weighbridge Data Table */}
//         <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg backdrop-blur-sm light:shadow-lg">
          
//           {/* Header */}
//           <div className="p-6 border-b border-slate-700/30 light:border-gray-200">
//             <h3 className="text-lg font-semibold text-white light:text-gray-900">Weighbridge Data Table</h3>
//           </div>
          
//           {/* Data Table */}
//           <div className="p-6">
//             <div className="rounded-md border border-slate-700/30 light:border-gray-200">
//               <Table>
//                 <TableHeader>
//                   <TableRow className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/50 light:hover:bg-gray-50">
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck ID</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck Plate</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck Driver</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck Material</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Weight</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">RFID Linked</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Order Linked</TableHead>
//                   </TableRow>
//                 </TableHeader>
//                 <TableBody>
//                   {filteredWeighbridgeData.map((item, index) => (
//                     <TableRow 
//                       key={index} 
//                       className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/30 light:hover:bg-gray-50 transition-colors"
//                     >
//                       <TableCell className="text-white light:text-gray-900 font-medium">
//                         {item.truck_id}
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         {item.truck_plate}
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         {item.truck_driver}
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         {item.truck_material}
//                       </TableCell>
//                       <TableCell>
//                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 light:bg-yellow-100 border border-yellow-500/20 light:border-yellow-300 text-yellow-400 light:text-yellow-600">
//                           {item.weight}
//                         </span>
//                       </TableCell>
//                       <TableCell>
//                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
//                           item.rfid_linked 
//                             ? 'text-green-400 light:text-green-600 bg-green-500/10 light:bg-green-100 border border-green-500/20 light:border-green-300' 
//                             : 'text-red-400 light:text-red-600 bg-red-500/10 light:bg-red-100 border border-red-500/20 light:border-red-300'
//                         }`}>
//                           {item.rfid_linked ? 'YES' : 'NO'}
//                         </span>
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         <span className={item.order_linked === null || item.order_linked === 'NA' ? 'text-slate-500 light:text-gray-400 italic' : ''}>
//                           {item.order_linked}
//                         </span>
//                       </TableCell>
//                     </TableRow>
//                   ))}
//                 </TableBody>
//               </Table>
//             </div>
//           </div>
//         </div>
//       </div>
//     </WaterSystemLayout>
//   )
// }


// import React, { useState, useEffect } from 'react'
// import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
// import { KPICard } from '../../components/water-system/KPICard'
// import { Scale, Truck, AlertTriangle, CheckCircle, Plus, Filter } from 'lucide-react'
// import { Button } from '@/components/ui/button'
// import { Input } from '@/components/ui/input'
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// // Mock weighbridge data
// const mockWeighbridgeData = [
//   {
//     id: 1,
//     truck_id: 'TRK001',
//     truck_plate: 'ABC-123',
//     truck_driver: 'John Smith',
//     truck_material: 'Wheat Feed',
//     weight: '25.5 tons',
//     rfid_linked: true,
//     order_linked: 'Intake Line 1'
//   },
//   {
//     id: 2,
//     truck_id: 'TRK002',
//     truck_plate: 'XYZ-789',
//     truck_driver: 'Mike Johnson',
//     truck_material: 'Corn Meal',
//     weight: '28.2 tons',
//     rfid_linked: false,
//     order_linked: null
//   },
//   {
//     id: 3,
//     truck_id: 'TRK003',
//     truck_plate: 'DEF-456',
//     truck_driver: 'Sarah Wilson',
//     truck_material: 'Soybean',
//     weight: '22.8 tons',
//     rfid_linked: true,
//     order_linked: 'Processing Line 2'
//   },
//   {
//     id: 4,
//     truck_id: 'TRK004',
//     truck_plate: 'GHI-789',
//     truck_driver: 'David Brown',
//     truck_material: 'Barley',
//     weight: '30.1 tons',
//     rfid_linked: true,
//     order_linked: 'Storage Bay A'
//   },
//   {
//     id: 5,
//     truck_id: 'TRK005',
//     truck_plate: 'JKL-012',
//     truck_driver: 'Lisa Davis',
//     truck_material: 'Mineral Mix',
//     weight: '26.7 tons',
//     rfid_linked: false,
//     order_linked: 'NA'
//   },
//   {
//     id: 6,
//     truck_id: 'TRK006',
//     truck_plate: 'MNO-345',
//     truck_driver: 'Robert Taylor',
//     truck_material: 'Bulk Feed',
//     weight: '24.3 tons',
//     rfid_linked: true,
//     order_linked: 'Bulk Line 1'
//   },
//   {
//     id: 7,
//     truck_id: 'TRK007',
//     truck_plate: 'PQR-678',
//     truck_driver: 'Emma Wilson',
//     truck_material: 'Wheat Feed',
//     weight: '27.9 tons',
//     rfid_linked: true,
//     order_linked: 'PT Line 2'
//   },
//   {
//     id: 8,
//     truck_id: 'TRK008',
//     truck_plate: 'STU-901',
//     truck_driver: 'James Anderson',
//     truck_material: 'Corn Meal',
//     weight: '29.4 tons',
//     rfid_linked: false,
//     order_linked: null
//   }
// ]

// export function Weighbridge() {
//   const [weighbridgeData, setWeighbridgeData] = useState<any[]>([])
//   const [filters, setFilters] = useState({
//     truckId: '',
//     truckPlate: '',
//     truckDriver: '',
//     truckMaterial: 'all',
//     rfidLinked: 'all',
//     orderLinked: 'all'
//   })
//   useEffect(() => {
//     const fetchWeighbridgeData = async () => {
//       try {
//         const res = await fetch('http://localhost:5000/api/weighbridge/')
//         const data = await res.json()
//         // Ensure data is always an array
//         setWeighbridgeData(Array.isArray(data) ? data : [])
//       } catch (err) {
//         
//         setWeighbridgeData([]) // Set empty array on error
//       }
//     }
  
//     fetchWeighbridgeData()
//   }, [])



  
  
  

//   // Get unique values for filter options from mock data
//   const uniqueMaterials = Array.from(new Set(weighbridgeData.map(item => item.truck_material).filter(Boolean))).sort()
//   const uniqueOrders = Array.from(new Set(weighbridgeData.map(item => item.order_linked).filter(order => order !== null && order !== 'NA' && order !== undefined))).sort()

//   // Filter the table data based on current filters
//   const filteredWeighbridgeData = weighbridgeData.filter(item => {
//     if (!item) return false
//     return (
//       (filters.truckId === '' || String(item.truck_id || '').includes(filters.truckId)) &&
//       (filters.truckPlate === '' || String(item.truck_plate || '').toLowerCase().includes(filters.truckPlate.toLowerCase())) &&
//       (filters.truckDriver === '' || String(item.truck_driver || '').toLowerCase().includes(filters.truckDriver.toLowerCase())) &&
//       (filters.truckMaterial === 'all' || item.truck_material === filters.truckMaterial) &&
//       (filters.rfidLinked === 'all' || (filters.rfidLinked === 'YES' ? item.rfid_linked : !item.rfid_linked)) &&
//       (filters.orderLinked === 'all' || item.order_linked === filters.orderLinked)
//     )
//   })

//   const clearFilters = () => {
//     setFilters({
//       truckId: '',
//       truckPlate: '',
//       truckDriver: '',
//       truckMaterial: 'all',
//       rfidLinked: 'all',
//       orderLinked: 'all'
//     })
//   }

//   return (
//     <WaterSystemLayout 
//       title="Weighbridge Management" 
//       subtitle="Vehicle weighing, truck logging, and weight management"
//     >
//       <div className="space-y-6">

//         {/* KPI Cards */}
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//           <KPICard
//             title="TOTAL TRUCKS"
//             value="1"
//             icon="gauge"
//             color="blue"
//             chartType="bar"
//           />
//           <KPICard
//             title="ACTIVE BAYS"
//             value="1"
//             icon="activity"
//             color="orange"
//             chartType="circle"
//           />
//           <KPICard
//             title="WEIGHING"
//             value="0"
//             icon="pump"
//             color="purple"
//             chartType="line"
//           />
//           <KPICard
//             title="COMPLETE TODAY"
//             value="1"
//             icon="water"
//             color="green"
//             chartType="gauge"
//           />
//         </div>

//         {/* Filter Section */}
//         <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 mb-4 light:shadow-md">
//           <CardHeader className="pb-3">
//             <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
//               <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
//               Weighbridge Filters
//             </CardTitle>
//           </CardHeader>
//           <CardContent className="pt-0">
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck ID</label>
//                 <Input
//                   type="text"
//                   placeholder="Search ID..."
//                   value={filters.truckId}
//                   onChange={(e) => setFilters({ ...filters, truckId: e.target.value })}
//                   className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//                 />
//               </div>

//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck Plate</label>
//                 <Input
//                   type="text"
//                   placeholder="Search plate..."
//                   value={filters.truckPlate}
//                   onChange={(e) => setFilters({ ...filters, truckPlate: e.target.value })}
//                   className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//                 />
//               </div>

//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Driver</label>
//                 <Input
//                   type="text"
//                   placeholder="Search driver..."
//                   value={filters.truckDriver}
//                   onChange={(e) => setFilters({ ...filters, truckDriver: e.target.value })}
//                   className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
//                 />
//               </div>

//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Material</label>
//                 <Select onValueChange={(value) => setFilters({ ...filters, truckMaterial: value })}>
//                   <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                     <SelectValue placeholder="All Materials" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                     <SelectItem value="all">All Materials</SelectItem>
//                     {uniqueMaterials.map(material => (
//                       <SelectItem key={material} value={material}>{material}</SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </div>

//               <div>
//                 <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">RFID Linked</label>
//                 <Select onValueChange={(value) => setFilters({ ...filters, rfidLinked: value })}>
//                   <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
//                     <SelectValue placeholder="All Status" />
//                   </SelectTrigger>
//                   <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
//                     <SelectItem value="all">All Status</SelectItem>
//                     <SelectItem value="YES">YES</SelectItem>
//                     <SelectItem value="NO">NO</SelectItem>
//                   </SelectContent>
//                 </Select>
//               </div>

//               <div className="flex items-end gap-2">
//                 <Button
//                   onClick={clearFilters}
//                   variant="outline"
//                   size="sm"
//                   className="border-slate-600 light:border-gray-500 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 light:hover:text-gray-800 bg-transparent light:bg-white h-8"
//                 >
//                   Clear Filters
//                 </Button>
//               </div>
//             </div>
//           </CardContent>
//         </Card>


//         {/* Weighbridge Data Table */}
//         <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg backdrop-blur-sm light:shadow-lg">

//           {/* Header */}
//           <div className="p-6 border-b border-slate-700/30 light:border-gray-200">
//             <h3 className="text-lg font-semibold text-white light:text-gray-900">Weighbridge Data Table</h3>
//           </div>

//           {/* Data Table */}
//           <div className="p-6">
//             <div className="rounded-md border border-slate-700/30 light:border-gray-200">
//               <Table>
//                 <TableHeader>
//                   <TableRow className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/50 light:hover:bg-gray-50">
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck ID</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck Plate</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck Driver</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Truck Material</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Weight</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">RFID Linked</TableHead>
//                     <TableHead className="text-white light:text-gray-900 font-semibold">Order Linked</TableHead>
//                   </TableRow>
//                 </TableHeader>
//                 <TableBody>
//                   {filteredWeighbridgeData.map((item, index) => (
//                     <TableRow 
//                       key={index} 
//                       className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/30 light:hover:bg-gray-50 transition-colors"
//                     >
//                       <TableCell className="text-white light:text-gray-900 font-medium">
//                         {item.truck_id}
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         {item.truck_plate}
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         {item.truck_driver}
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         {item.truck_material}
//                       </TableCell>
//                       <TableCell>
//                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 light:bg-yellow-100 border border-yellow-500/20 light:border-yellow-300 text-yellow-400 light:text-yellow-600">
//                           {item.weight}
//                         </span>
//                       </TableCell>
//                       <TableCell>
//                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
//                           item.rfid_linked 
//                             ? 'text-green-400 light:text-green-600 bg-green-500/10 light:bg-green-100 border border-green-500/20 light:border-green-300' 
//                             : 'text-red-400 light:text-red-600 bg-red-500/10 light:bg-red-100 border border-red-500/20 light:border-red-300'
//                         }`}>
//                           {item.rfid_linked ? 'YES' : 'NO'}
//                         </span>
//                       </TableCell>
//                       <TableCell className="text-slate-300 light:text-gray-700">
//                         <span className={item.order_linked === null || item.order_linked === 'NA' ? 'text-slate-500 light:text-gray-400 italic' : ''}>
//                           {item.order_linked}
//                         </span>
//                       </TableCell>
//                     </TableRow>
//                   ))}
//                 </TableBody>
//               </Table>
//             </div>
//           </div>
//         </div>
//       </div>
//     </WaterSystemLayout>
//   )
// }
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WaterSystemLayout } from "../../components/water-system/WaterSystemLayout";
import { KPICard } from "../../components/water-system/KPICard";
import { Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------- Config ----------
import { API_BASE_URL } from '../../config/api'
const API_BASE = API_BASE_URL; // change if backend runs elsewhere

// ---------- Types from /api/weights/today ----------
interface Row {
  ticket: string;
  truck_id: number | string;
  truck_plate?: string | null;
  truck_driver?: string | null;
  truck_material?: string | null; // derived from RFIDLog.order_ref
  weight: string; // e.g. "24T" or "24000 kg"
  weight_kg: number; // exact kg
  rfid_linked: boolean;
  order_linked: string | null;
  in_ts?: string | null;
  out_ts?: string | null;
}

export default function Weighbridge() {
  // ------- table state -------
  const [weighbridgeData, setWeighbridgeData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);



  // ------- filters -------
  const [filters, setFilters] = useState({
    truckId: "",
    truckPlate: "",
    truckDriver: "",
    truckMaterial: "all",
    rfidLinked: "all",
    orderLinked: "all",
  });

  // ------- helpers -------
  async function fetchTable() {
    setErrorMsg(null);
    setMessage(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/weights/today`, {
        signal: ac.signal,
      });
      const data = await res.json();
      setWeighbridgeData(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        
        setErrorMsg("Failed to load table");
        setWeighbridgeData([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function postJSON(path: string, body: any) {
    setErrorMsg(null);
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  useEffect(() => {
    fetchTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unique options for filters
  const uniqueMaterials = useMemo(
    () => Array.from(new Set(weighbridgeData.map((i) => i.truck_material).filter(Boolean))).sort(),
    [weighbridgeData]
  );
  const uniqueOrders = useMemo(
    () => Array.from(new Set(weighbridgeData.map((i) => i.order_linked).filter((o) => o && o !== "NA"))).sort() as string[],
    [weighbridgeData]
  );

  // apply filters
  const filteredWeighbridgeData = useMemo(() => {
    return weighbridgeData.filter((item) => {
      if (!item) return false;
      return (
        (filters.truckId === "" || String(item.truck_id ?? "").includes(filters.truckId)) &&
        (filters.truckPlate === "" || String(item.truck_plate ?? "").toLowerCase().includes(filters.truckPlate.toLowerCase())) &&
        (filters.truckDriver === "" || String(item.truck_driver ?? "").toLowerCase().includes(filters.truckDriver.toLowerCase())) &&
        (filters.truckMaterial === "all" || item.truck_material === filters.truckMaterial) &&
        (filters.rfidLinked === "all" || (filters.rfidLinked === "YES" ? item.rfid_linked : !item.rfid_linked)) &&
        (filters.orderLinked === "all" || item.order_linked === filters.orderLinked)
      );
    });
  }, [weighbridgeData, filters]);

  function clearFilters() {
    setFilters({ truckId: "", truckPlate: "", truckDriver: "", truckMaterial: "all", rfidLinked: "all", orderLinked: "all" });
  }

  // KPI values (simple examples using the filtered rows)
  const totalTrucks = filteredWeighbridgeData.length;
  const completeToday = weighbridgeData.length; // all rows are completed pairs
  const weighingNow = 0; // no incomplete pairs in this endpoint
  const activeBays = 1; // static or from your plant context



  return (
    <WaterSystemLayout title="Weighbridge Management" subtitle="Vehicle weighing, truck logging, and weight management">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="TOTAL TRUCKS" value={String(totalTrucks)} icon="gauge" color="blue" chartType="bar" />
          <KPICard title="ACTIVE BAYS" value={String(activeBays)} icon="activity" color="orange" chartType="circle" />
          <KPICard title="WEIGHING" value={String(weighingNow)} icon="pump" color="purple" chartType="line" />
          <KPICard title="COMPLETE TODAY" value={String(completeToday)} icon="water" color="green" chartType="gauge" />
        </div>



        {/* Filter Section */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 mb-4 light:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
              Weighbridge Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck ID</label>
                <Input type="text" placeholder="Search ID..." value={filters.truckId} onChange={(e) => setFilters({ ...filters, truckId: e.target.value })} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm" />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Truck Plate</label>
                <Input type="text" placeholder="Search plate..." value={filters.truckPlate} onChange={(e) => setFilters({ ...filters, truckPlate: e.target.value })} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm" />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Driver</label>
                <Input type="text" placeholder="Search driver..." value={filters.truckDriver} onChange={(e) => setFilters({ ...filters, truckDriver: e.target.value })} className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm" />
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Material</label>
                <Select onValueChange={(value) => setFilters({ ...filters, truckMaterial: value })}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Materials" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Materials</SelectItem>
                    {uniqueMaterials.map((m) => (
                      <SelectItem key={String(m)} value={String(m)}>{String(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">RFID Linked</label>
                <Select onValueChange={(value) => setFilters({ ...filters, rfidLinked: value })}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="YES">YES</SelectItem>
                    <SelectItem value="NO">NO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={clearFilters} variant="outline" size="sm" className="border-slate-600 light:border-gray-500 text-slate-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 bg-transparent h-8">
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weighbridge Data Table */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg backdrop-blur-sm light:shadow-lg">
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white light:text-gray-900">Weighbridge Data Table</h3>
            {(message || errorMsg) && (
              <div className="text-xs">
                {message && <span className="text-green-400 light:text-green-700 mr-3">{message}</span>}
                {errorMsg && <span className="text-red-400 light:text-red-700">{errorMsg}</span>}
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="rounded-md border border-slate-700/30 light:border-gray-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/50 light:hover:bg-gray-50">
                    <TableHead className="text-white light:text-gray-900 font-semibold">Truck ID</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Truck Plate</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Truck Driver</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Truck Material</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Weight</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">RFID Linked</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Order Linked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWeighbridgeData.map((item, index) => (
                    <TableRow key={index} className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/30 light:hover:bg-gray-50 transition-colors">
                      <TableCell className="text-white light:text-gray-900 font-medium">{item.truck_id}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.truck_plate ?? "-"}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.truck_driver ?? "-"}</TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">{item.truck_material ?? "-"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 light:bg-yellow-100 border border-yellow-500/20 light:border-yellow-300 text-yellow-400 light:text-yellow-600">
                          {item.weight}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.rfid_linked ? "text-green-400 light:text-green-600 bg-green-500/10 light:bg-green-100 border border-green-500/20 light:border-green-300" : "text-red-400 light:text-red-600 bg-red-500/10 light:bg-red-100 border border-red-500/20 light:border-red-300"}`}>
                          {item.rfid_linked ? "YES" : "NO"}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">
                        <span className={!item.order_linked || item.order_linked === "NA" ? "text-slate-500 light:text-gray-400 italic" : ""}>
                          {item.order_linked ?? "NA"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredWeighbridgeData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-sm text-slate-400 light:text-gray-600">No records</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </WaterSystemLayout>
  );
}

// Optional named export if your router imports it as a named component
export { Weighbridge };
