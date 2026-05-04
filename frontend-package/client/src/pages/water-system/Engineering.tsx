// import { useState } from 'react'
// import { Button } from '@/components/ui/button'
// import { Input } from '@/components/ui/input'
// import { Label } from '@/components/ui/label'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
// import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
// import { Badge } from '@/components/ui/badge'
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// import { Plus, Settings, Database, Cpu, Eye, Edit, Trash2, Power } from 'lucide-react'
// import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'

// // Types for PLC configuration
// interface PLCField {
//   id: string
//   fieldName: string
//   offset: number
//   dataType: 'int' | 'float' | 'str'
//   accessType: 'read' | 'write' | 'both'
//   currentValue?: string
//   finalAddress: string
// }

// interface ProductionLine {
//   id: string
//   dbNumber: number
//   name: string
//   description: string
//   fields: PLCField[]
//   isActive: boolean
// }

// // Generate final PLC address based on data type and offset
// const generatePLCAddress = (dbNumber: number, dataType: 'int' | 'float' | 'str', offset: number): string => {
//   const memoryPrefix = {
//     int: 'DBW',
//     float: 'DBD', 
//     str: 'DBB'
//   }[dataType]
  
//   return `DB${dbNumber}.${memoryPrefix}${offset}`
// }

// // Mock PLC communication functions (placeholders for S7 protocol integration)
// const mockPLCRead = async (address: string): Promise<string> => {
//   // Simulate network delay
//   await new Promise(resolve => setTimeout(resolve, 500))
  
//   // Generate realistic values based on address type
//   if (address.includes('DBW')) return Math.floor(Math.random() * 1000).toString()
//   if (address.includes('DBD')) return (Math.random() * 100).toFixed(2)
//   if (address.includes('DBB')) return `Status_${Math.floor(Math.random() * 10)}`
  
//   return '0'
// }

// const mockPLCWrite = async (address: string, value: string): Promise<boolean> => {
//   // Simulate network delay
//   await new Promise(resolve => setTimeout(resolve, 500))
//   //   return true
// }

// function EngineeringContent() {
//   const [productionLines, setProductionLines] = useState<ProductionLine[]>([
//     {
//       id: '1',
//       dbNumber: 100,
//       name: 'Primary Filtration Line',
//       description: 'Main water filtration and treatment process',
//       isActive: true,
//       fields: [
//         {
//           id: '1',
//           fieldName: 'Flow Rate',
//           offset: 0,
//           dataType: 'float',
//           accessType: 'read',
//           currentValue: '45.67',
//           finalAddress: 'DB100.DBD0'
//         },
//         {
//           id: '2',
//           fieldName: 'Pressure Setpoint',
//           offset: 4,
//           dataType: 'float',
//           accessType: 'both',
//           currentValue: '3.2',
//           finalAddress: 'DB100.DBD4'
//         },
//         {
//           id: '3',
//           fieldName: 'Pump Status',
//           offset: 8,
//           dataType: 'int',
//           accessType: 'read',
//           currentValue: '1',
//           finalAddress: 'DB100.DBW8'
//         }
//       ]
//     }
//   ])

//   const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null)
//   const [isAddingLine, setIsAddingLine] = useState(false)
//   const [isAddingField, setIsAddingField] = useState(false)
//   const [readingValues, setReadingValues] = useState<Set<string>>(new Set())
//   const [writingValues, setWritingValues] = useState<Set<string>>(new Set())

//   // Form states
//   const [newLine, setNewLine] = useState({
//     dbNumber: '',
//     name: '',
//     description: ''
//   })

//   const [newField, setNewField] = useState({
//     fieldName: '',
//     offset: '',
//     dataType: 'int' as 'int' | 'float' | 'str',
//     accessType: 'read' as 'read' | 'write' | 'both'
//   })

//   const [writeValues, setWriteValues] = useState<Record<string, string>>({})

//   // Add new production line
//   const handleAddLine = () => {
//     if (!newLine.dbNumber || !newLine.name) return
    
//     const line: ProductionLine = {
//       id: Date.now().toString(),
//       dbNumber: parseInt(newLine.dbNumber),
//       name: newLine.name,
//       description: newLine.description,
//       fields: [],
//       isActive: true
//     }
    
//     setProductionLines([...productionLines, line])
//     setNewLine({ dbNumber: '', name: '', description: '' })
//     setIsAddingLine(false)
//   }

//   // Add new field to selected production line
//   const handleAddField = () => {
//     if (!selectedLine || !newField.fieldName || !newField.offset) return
    
//     const field: PLCField = {
//       id: Date.now().toString(),
//       fieldName: newField.fieldName,
//       offset: parseInt(newField.offset),
//       dataType: newField.dataType,
//       accessType: newField.accessType,
//       finalAddress: generatePLCAddress(selectedLine.dbNumber, newField.dataType, parseInt(newField.offset))
//     }
    
//     const updatedLines = productionLines.map(line => 
//       line.id === selectedLine.id 
//         ? { ...line, fields: [...line.fields, field] }
//         : line
//     )
    
//     setProductionLines(updatedLines)
//     setSelectedLine({ ...selectedLine, fields: [...selectedLine.fields, field] })
//     setNewField({ fieldName: '', offset: '', dataType: 'int', accessType: 'read' })
//     setIsAddingField(false)
//   }

//   // Read value from PLC
//   const handleReadValue = async (field: PLCField) => {
//     setReadingValues(prev => new Set(prev).add(field.id))
    
//     try {
//       const value = await mockPLCRead(field.finalAddress)
      
//       // Update field value
//       const updatedLines = productionLines.map(line => ({
//         ...line,
//         fields: line.fields.map(f => 
//           f.id === field.id ? { ...f, currentValue: value } : f
//         )
//       }))
      
//       setProductionLines(updatedLines)
      
//       if (selectedLine) {
//         setSelectedLine({
//           ...selectedLine,
//           fields: selectedLine.fields.map(f => 
//             f.id === field.id ? { ...f, currentValue: value } : f
//           )
//         })
//       }
//     } finally {
//       setReadingValues(prev => {
//         const next = new Set(prev)
//         next.delete(field.id)
//         return next
//       })
//     }
//   }

//   // Write value to PLC
//   const handleWriteValue = async (field: PLCField) => {
//     const value = writeValues[field.id]
//     if (!value) return
    
//     setWritingValues(prev => new Set(prev).add(field.id))
    
//     try {
//       const success = await mockPLCWrite(field.finalAddress, value)
      
//       if (success) {
//         // Update current value after successful write
//         const updatedLines = productionLines.map(line => ({
//           ...line,
//           fields: line.fields.map(f => 
//             f.id === field.id ? { ...f, currentValue: value } : f
//           )
//         }))
        
//         setProductionLines(updatedLines)
        
//         if (selectedLine) {
//           setSelectedLine({
//             ...selectedLine,
//             fields: selectedLine.fields.map(f => 
//               f.id === field.id ? { ...f, currentValue: value } : f
//             )
//           })
//         }
        
//         // Clear write input
//         setWriteValues(prev => ({ ...prev, [field.id]: '' }))
//       }
//     } finally {
//       setWritingValues(prev => {
//         const next = new Set(prev)
//         next.delete(field.id)
//         return next
//       })
//     }
//   }

//   return (
//     <div className="p-6">
//       {/* Header */}
//       <div className="mb-8">
//         <div className="flex items-center justify-between">
//           <div>
//             <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
//               <Cpu className="h-10 w-10 text-cyan-400" />
//               Engineering Configuration
//             </h1>
//             <p className="text-slate-300 text-lg">
//               PLC Production Line & Field Management System
//             </p>
//           </div>
          
//           <Dialog open={isAddingLine} onOpenChange={setIsAddingLine}>
//             <DialogTrigger asChild>
//               <Button className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2">
//                 <Plus className="h-4 w-4" />
//                 Add Production Line
//               </Button>
//             </DialogTrigger>
//             <DialogContent className="bg-slate-800 border-slate-700">
//               <DialogHeader>
//                 <DialogTitle className="text-white">Add New Production Line</DialogTitle>
//                 <DialogDescription className="text-slate-300">
//                   Configure a new production line with DB number and description
//                 </DialogDescription>
//               </DialogHeader>
              
//               <div className="space-y-4">
//                 <div>
//                   <Label htmlFor="dbNumber" className="text-white">DB Number</Label>
//                   <Input
//                     id="dbNumber"
//                     type="number"
//                     placeholder="e.g., 101"
//                     value={newLine.dbNumber}
//                     onChange={(e) => setNewLine({ ...newLine, dbNumber: e.target.value })}
//                     className="bg-slate-700 border-slate-600 text-white"
//                   />
//                 </div>
                
//                 <div>
//                   <Label htmlFor="lineName" className="text-white">Line Name</Label>
//                   <Input
//                     id="lineName"
//                     placeholder="e.g., Secondary Treatment Line"
//                     value={newLine.name}
//                     onChange={(e) => setNewLine({ ...newLine, name: e.target.value })}
//                     className="bg-slate-700 border-slate-600 text-white"
//                   />
//                 </div>
                
//                 <div>
//                   <Label htmlFor="description" className="text-white">Description</Label>
//                   <Input
//                     id="description"
//                     placeholder="Brief description of the production line"
//                     value={newLine.description}
//                     onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
//                     className="bg-slate-700 border-slate-600 text-white"
//                   />
//                 </div>
                
//                 <div className="flex gap-2 pt-4">
//                   <Button onClick={handleAddLine} className="bg-cyan-600 hover:bg-cyan-700">
//                     Create Line
//                   </Button>
//                   <Button variant="outline" onClick={() => setIsAddingLine(false)} className="border-slate-600 text-slate-300">
//                     Cancel
//                   </Button>
//                 </div>
//               </div>
//             </DialogContent>
//           </Dialog>
//         </div>
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//         {/* Production Lines List */}
//         <div className="lg:col-span-1">
//           <Card className="bg-slate-800/50 border-slate-700">
//             <CardHeader>
//               <CardTitle className="text-white flex items-center gap-2">
//                 <Database className="h-5 w-5 text-cyan-400" />
//                 Production Lines
//               </CardTitle>
//               <CardDescription className="text-slate-300">
//                 Select a line to configure fields
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="space-y-3">
//               {productionLines.map((line) => (
//                 <div
//                   key={line.id}
//                   className={`p-4 rounded-lg border cursor-pointer transition-all ${
//                     selectedLine?.id === line.id
//                       ? 'bg-cyan-900/30 border-cyan-500'
//                       : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
//                   }`}
//                   onClick={() => setSelectedLine(line)}
//                 >
//                   <div className="flex items-center justify-between mb-2">
//                     <h3 className="text-white font-medium">{line.name}</h3>
//                     <div className="flex items-center gap-2">
//                       <Badge variant={line.isActive ? 'default' : 'secondary'} className="text-xs">
//                         DB{line.dbNumber}
//                       </Badge>
//                       <div className={`w-2 h-2 rounded-full ${line.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
//                     </div>
//                   </div>
//                   <p className="text-slate-300 text-sm">{line.description}</p>
//                   <div className="text-slate-400 text-xs mt-2">
//                     {line.fields.length} fields configured
//                   </div>
//                 </div>
//               ))}
//             </CardContent>
//           </Card>
//         </div>

//         {/* Field Configuration */}
//         <div className="lg:col-span-2">
//           {selectedLine ? (
//             <Card className="bg-slate-800/50 border-slate-700">
//               <CardHeader>
//                 <div className="flex items-center justify-between">
//                   <div>
//                     <CardTitle className="text-white flex items-center gap-2">
//                       <Settings className="h-5 w-5 text-cyan-400" />
//                       {selectedLine.name} - DB{selectedLine.dbNumber}
//                     </CardTitle>
//                     <CardDescription className="text-slate-300">
//                       Configure fields and PLC addresses
//                     </CardDescription>
//                   </div>
                  
//                   <Dialog open={isAddingField} onOpenChange={setIsAddingField}>
//                     <DialogTrigger asChild>
//                       <Button className="bg-green-600 hover:bg-green-700 gap-2">
//                         <Plus className="h-4 w-4" />
//                         Add Field
//                       </Button>
//                     </DialogTrigger>
//                     <DialogContent className="bg-slate-800 border-slate-700">
//                       <DialogHeader>
//                         <DialogTitle className="text-white">Add New Field</DialogTitle>
//                         <DialogDescription className="text-slate-300">
//                           Configure a new field for DB{selectedLine.dbNumber}
//                         </DialogDescription>
//                       </DialogHeader>
                      
//                       <div className="space-y-4">
//                         <div>
//                           <Label htmlFor="fieldName" className="text-white">Field Name</Label>
//                           <Input
//                             id="fieldName"
//                             placeholder="e.g., Temperature Sensor"
//                             value={newField.fieldName}
//                             onChange={(e) => setNewField({ ...newField, fieldName: e.target.value })}
//                             className="bg-slate-700 border-slate-600 text-white"
//                           />
//                         </div>
                        
//                         <div>
//                           <Label htmlFor="offset" className="text-white">Offset (bytes)</Label>
//                           <Input
//                             id="offset"
//                             type="number"
//                             placeholder="e.g., 12"
//                             value={newField.offset}
//                             onChange={(e) => setNewField({ ...newField, offset: e.target.value })}
//                             className="bg-slate-700 border-slate-600 text-white"
//                           />
//                         </div>
                        
//                         <div>
//                           <Label htmlFor="dataType" className="text-white">Data Type</Label>
//                           <Select value={newField.dataType} onValueChange={(value: 'int' | 'float' | 'str') => setNewField({ ...newField, dataType: value })}>
//                             <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
//                               <SelectValue />
//                             </SelectTrigger>
//                             <SelectContent className="bg-slate-700 border-slate-600">
//                               <SelectItem value="int">Integer (DBW - 2 bytes)</SelectItem>
//                               <SelectItem value="float">Float (DBD - 4 bytes)</SelectItem>
//                               <SelectItem value="str">String (DBB - 1 byte/char)</SelectItem>
//                             </SelectContent>
//                           </Select>
//                         </div>
                        
//                         <div>
//                           <Label htmlFor="accessType" className="text-white">Access Type</Label>
//                           <Select value={newField.accessType} onValueChange={(value: 'read' | 'write' | 'both') => setNewField({ ...newField, accessType: value })}>
//                             <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
//                               <SelectValue />
//                             </SelectTrigger>
//                             <SelectContent className="bg-slate-700 border-slate-600">
//                               <SelectItem value="read">Read Only</SelectItem>
//                               <SelectItem value="write">Write Only</SelectItem>
//                               <SelectItem value="both">Read & Write</SelectItem>
//                             </SelectContent>
//                           </Select>
//                         </div>
                        
//                         <div className="p-3 bg-slate-700/50 rounded-lg">
//                           <div className="text-sm text-slate-300 mb-1">Generated Address:</div>
//                           <div className="text-cyan-400 font-mono">
//                             {newField.offset ? generatePLCAddress(selectedLine.dbNumber, newField.dataType, parseInt(newField.offset) || 0) : 'DB' + selectedLine.dbNumber + '.???'}
//                           </div>
//                         </div>
                        
//                         <div className="flex gap-2 pt-4">
//                           <Button onClick={handleAddField} className="bg-green-600 hover:bg-green-700">
//                             Add Field
//                           </Button>
//                           <Button variant="outline" onClick={() => setIsAddingField(false)} className="border-slate-600 text-slate-300">
//                             Cancel
//                           </Button>
//                         </div>
//                       </div>
//                     </DialogContent>
//                   </Dialog>
//                 </div>
//               </CardHeader>
              
//               <CardContent>
//                 <div className="overflow-x-auto">
//                   <table className="w-full">
//                     <thead>
//                       <tr className="border-b border-slate-700">
//                         <th className="text-left text-slate-300 p-3 font-medium">Field Name</th>
//                         <th className="text-left text-slate-300 p-3 font-medium">Offset</th>
//                         <th className="text-left text-slate-300 p-3 font-medium">Type</th>
//                         <th className="text-left text-slate-300 p-3 font-medium">Access</th>
//                         <th className="text-left text-slate-300 p-3 font-medium">PLC Address</th>
//                         <th className="text-left text-slate-300 p-3 font-medium">Current Value</th>
//                         <th className="text-left text-slate-300 p-3 font-medium">Actions</th>
//                       </tr>
//                     </thead>
//                     <tbody>
//                       {selectedLine.fields.map((field) => (
//                         <tr key={field.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
//                           <td className="p-3 text-white font-medium">{field.fieldName}</td>
//                           <td className="p-3 text-slate-300">{field.offset}</td>
//                           <td className="p-3">
//                             <Badge variant="outline" className="border-slate-600 text-slate-300">
//                               {field.dataType.toUpperCase()}
//                             </Badge>
//                           </td>
//                           <td className="p-3">
//                             <Badge variant="outline" className={`border-slate-600 ${
//                               field.accessType === 'read' ? 'text-blue-400' :
//                               field.accessType === 'write' ? 'text-orange-400' :
//                               'text-green-400'
//                             }`}>
//                               {field.accessType.toUpperCase()}
//                             </Badge>
//                           </td>
//                           <td className="p-3 font-mono text-cyan-400">{field.finalAddress}</td>
//                           <td className="p-3">
//                             <div className={`px-2 py-1 rounded text-sm font-mono ${
//                               field.currentValue ? 'bg-green-900/30 text-green-400' : 'bg-slate-700/50 text-slate-400'
//                             }`}>
//                               {field.currentValue || '---'}
//                             </div>
//                           </td>
//                           <td className="p-3">
//                             <div className="flex gap-1">
//                               {(field.accessType === 'read' || field.accessType === 'both') && (
//                                 <Button
//                                   size="sm"
//                                   variant="outline"
//                                   onClick={() => handleReadValue(field)}
//                                   disabled={readingValues.has(field.id)}
//                                   className="border-blue-600 text-blue-400 hover:bg-blue-900/30"
//                                 >
//                                   {readingValues.has(field.id) ? (
//                                     <Power className="h-3 w-3 animate-spin" />
//                                   ) : (
//                                     <Eye className="h-3 w-3" />
//                                   )}
//                                 </Button>
//                               )}
                              
//                               {(field.accessType === 'write' || field.accessType === 'both') && (
//                                 <div className="flex gap-1">
//                                   <Input
//                                     size={4}
//                                     placeholder="Value"
//                                     value={writeValues[field.id] || ''}
//                                     onChange={(e) => setWriteValues({ ...writeValues, [field.id]: e.target.value })}
//                                     className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-20"
//                                   />
//                                   <Button
//                                     size="sm"
//                                     variant="outline"
//                                     onClick={() => handleWriteValue(field)}
//                                     disabled={writingValues.has(field.id) || !writeValues[field.id]}
//                                     className="border-orange-600 text-orange-400 hover:bg-orange-900/30"
//                                   >
//                                     {writingValues.has(field.id) ? (
//                                       <Power className="h-3 w-3 animate-spin" />
//                                     ) : (
//                                       <Edit className="h-3 w-3" />
//                                     )}
//                                   </Button>
//                                 </div>
//                               )}
//                             </div>
//                           </td>
//                         </tr>
//                       ))}
//                     </tbody>
//                   </table>
                  
//                   {selectedLine.fields.length === 0 && (
//                     <div className="text-center py-12 text-slate-400">
//                       <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
//                       <p>No fields configured yet</p>
//                       <p className="text-sm">Click "Add Field" to get started</p>
//                     </div>
//                   )}
//                 </div>
//               </CardContent>
//             </Card>
//           ) : (
//             <Card className="bg-slate-800/50 border-slate-700">
//               <CardContent className="text-center py-12">
//                 <Cpu className="h-16 w-16 mx-auto mb-4 text-slate-600" />
//                 <h3 className="text-xl text-slate-400 mb-2">Select Production Line</h3>
//                 <p className="text-slate-500">Choose a production line from the left to configure fields</p>
//               </CardContent>
//             </Card>
//           )}
//         </div>
//       </div>
      
//       {/* S7 Protocol Integration Note */}
//       <div className="mt-8">
//         <Card className="bg-slate-800/30 border-slate-700">
//           <CardContent className="p-4">
//             <div className="flex items-start gap-3">
//               <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
//                 <Power className="h-4 w-4 text-blue-400" />
//               </div>
//               <div>
//                 <h4 className="text-white font-medium mb-1">S7 Protocol Integration Ready</h4>
//                 <p className="text-slate-300 text-sm mb-3">
//                   This interface includes placeholder functions for PLC communication using S7 protocol. 
//                   The <code className="text-cyan-400 bg-slate-700 px-1 rounded">mockPLCRead</code> and <code className="text-cyan-400 bg-slate-700 px-1 rounded">mockPLCWrite</code> functions 
//                   can be replaced with actual S7 communication libraries for production deployment.
//                 </p>
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
//                   <div className="bg-slate-700/30 p-3 rounded-lg">
//                     <h5 className="text-cyan-400 font-medium text-sm mb-2">Production Libraries</h5>
//                     <ul className="text-slate-300 text-xs space-y-1">
//                       <li>• <code className="text-cyan-400">node-snap7</code> - Siemens S7 protocol</li>
//                       <li>• <code className="text-cyan-400">nodes7</code> - Alternative S7 library</li>
//                       <li>• <code className="text-cyan-400">ethernet-ip</code> - Allen-Bradley PLCs</li>
//                     </ul>
//                   </div>
//                   <div className="bg-slate-700/30 p-3 rounded-lg">
//                     <h5 className="text-green-400 font-medium text-sm mb-2">Ready for Production</h5>
//                     <ul className="text-slate-300 text-xs space-y-1">
//                       <li>• S7 client configuration prepared</li>
//                       <li>• API endpoints for read/write operations</li>
//                       <li>• Error handling and connection management</li>
//                       <li>• See <code className="text-cyan-400">PRODUCTION_DEPLOYMENT.md</code></li>
//                     </ul>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   )
// }

// export function Engineering() {
//   return (
//     <WaterSystemLayout>
//       <EngineeringContent />
//     </WaterSystemLayout>
//   )
// }

