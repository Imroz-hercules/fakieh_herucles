import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { API_BASE_URL } from '../../config/api'
import { Radio, Filter, Eye, Pencil, Trash2, Plus, Activity, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'



// Mock RFID table data based on the provided image
const rfidTableData = [
  {
    rfidNumber: 'RFID-001',
    rfidUsed: 'Yes',
    rfidLinkedToOrder: 'Intake Line 1'
  },
  {
    rfidNumber: 'RFID-002',
    rfidUsed: 'No',
    rfidLinkedToOrder: 'NA'
  },
  {
    rfidNumber: 'RFID-003',
    rfidUsed: 'Yes',
    rfidLinkedToOrder: 'Processing Line 2'
  },
  {
    rfidNumber: 'RFID-004',
    rfidUsed: 'Yes',
    rfidLinkedToOrder: 'Storage Bay A'
  },
  {
    rfidNumber: 'RFID-005',
    rfidUsed: 'No',
    rfidLinkedToOrder: 'NA'
  },
  {
    rfidNumber: 'RFID-006',
    rfidUsed: 'Yes',
    rfidLinkedToOrder: 'Intake Line 3'
  },
  {
    rfidNumber: 'RFID-007',
    rfidUsed: 'No',
    rfidLinkedToOrder: 'NA'
  },
  {
    rfidNumber: 'RFID-008',
    rfidUsed: 'Yes',
    rfidLinkedToOrder: 'Processing Line 1'
  },
  {
    rfidNumber: 'RFID-009',
    rfidUsed: 'Yes',
    rfidLinkedToOrder: 'Storage Bay B'
  },
  {
    rfidNumber: 'RFID-010',
    rfidUsed: 'No',
    rfidLinkedToOrder: 'NA'
  }
]

// Order types for dropdown
const orderTypes = [
  { value: 'intake1', label: 'Intake Line 1' },
  { value: 'intake2', label: 'Intake Line 2' },
  { value: 'mineral', label: 'Mineral Intake' },
  { value: 'outload1', label: 'Outloading Line 1' },
  { value: 'outload2', label: 'Outloading Line 2' },
  { value: 'outload3', label: 'Outloading Line 3' },
  { value: 'bulk', label: 'Bulk Line' },
  { value: 'pt', label: 'PIT Line' }
]



export function RFID() {
  const { toast } = useToast()
  const [rfidTableData, setRfidTableData] = useState<any[]>([])
  const [truckData, setTruckData] = useState<any[]>([])
  const [tableFilters, setTableFilters] = useState({
    rfidNumber: '',
    rfidUsed: 'all',
    rfidLinkedToOrder: 'all'
  })

  // CRUD state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [selectedTag, setSelectedTag] = useState<any>(null)
  const [form, setForm] = useState<any>({ 
    rfidNumber: '', 
    rfidUsed: false
  })
  const [assignForm, setAssignForm] = useState<any>({
    rfid_number: '',
    truck_id: '',
    order_ref: ''
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [assignFormError, setAssignFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [assignFormLoading, setAssignFormLoading] = useState(false)
  const [successData, setSuccessData] = useState<any>(null)

  // Order data state
  const [selectedOrderType, setSelectedOrderType] = useState('none')

  // Fetch data from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const configRes = await axios.get('/api/rfid/config')
        const trucksRes = await axios.get('/api/trucks/')
        const cfg = configRes.data
        const tr = trucksRes.data
        setRfidTableData(Array.isArray(cfg) ? cfg : cfg?.items ?? [])
        setTruckData(Array.isArray(tr) ? tr : tr?.items ?? [])
      } catch (err) {
        
        // Use mock data if API fails
        setRfidTableData(rfidTableData)
        setTruckData([])
      }
    }
    fetchData()
  }, [])

  // CRUD handlers
  const handleView = (tag: any) => {
    setSelectedTag(tag)
    setShowViewModal(true)
  }
  
  const handleEdit = (tag: any) => {
    setSelectedTag(tag)
    setForm({
      rfidNumber: tag.rfid_number,
      rfidUsed: tag.rfid_used
    })
    setFormError(null)
    setShowEditModal(true)
  }
  
  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this RFID?')) {
      try {
        await axios.delete(`/api/rfid/config/${id}`)
        setRfidTableData(rfidTableData.filter((t) => t.id !== id))
      } catch (error) {
        
      }
    }
  }
  
  const handleAdd = () => {
    setForm({ 
      rfidNumber: '', 
      rfidUsed: false
    })
    setFormError(null)
    setShowAddModal(true)
  }

  const handleAssign = () => {
    setAssignForm({
      rfid_number: '',
      truck_id: '',
      order_ref: ''
    })
    setAssignFormError(null)
    setShowAssignModal(true)
  }

  const handleAssignSubmit = async (e: any) => {
    e.preventDefault()
    setAssignFormError(null)
    setAssignFormLoading(true)
    try {
      if (!assignForm.rfid_number || !assignForm.truck_id || !assignForm.order_ref) {
        setAssignFormError('All fields are required.')
        setAssignFormLoading(false)
        return
      }

      const res = await axios.post('/api/plc/rfid/assign', {
        rfid_number: assignForm.rfid_number,
        truck_id: Number(assignForm.truck_id),
        order_ref: assignForm.order_ref
      })
      
      setShowAssignModal(false)
      
      // Store success data and show success modal
      setSuccessData(res.data)
      setShowSuccessModal(true)
      
      // Refresh RFID data to show updated status
      try {
        const configRes = await axios.get('/api/rfid/config')
        const cfg = configRes.data
        setRfidTableData(Array.isArray(cfg) ? cfg : cfg?.items ?? [])
      } catch (err) {
        
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to assign RFID. Please try again.'
      setAssignFormError(errorMessage)
      toast({
        title: "RFID Assignment Failed",
        description: errorMessage,
        variant: "destructive",
      })
    }
    setAssignFormLoading(false)
  }
  
  const handleAddSubmit = async (e: any) => {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      if (!form.rfidNumber) {
        setFormError('RFID Number is required.')
        setFormLoading(false)
        return
      }

      // Validate RFID number is integer
      const rfidNumber = parseInt(form.rfidNumber)
      if (isNaN(rfidNumber)) {
        setFormError('RFID Number must be a valid integer.')
        setFormLoading(false)
        return
      }

      const res = await axios.post('/api/rfid/config', {
        rfidNumber: rfidNumber,
        rfidUsed: form.rfidUsed
      })
      setRfidTableData([...rfidTableData, res.data])
      setShowAddModal(false)
    } catch (err) {
      setFormError('Failed to add RFID. Please try again.')
    }
    setFormLoading(false)
  }
  
  const handleEditSubmit = async (e: any) => {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      if (!form.rfidNumber) {
        setFormError('RFID Number is required.')
        setFormLoading(false)
        return
      }

      // Validate RFID number is integer
      const rfidNumber = parseInt(form.rfidNumber)
      if (isNaN(rfidNumber)) {
        setFormError('RFID Number must be a valid integer.')
        setFormLoading(false)
        return
      }

      const res = await axios.put(`/api/rfid/config/${selectedTag.id}`, {
        rfidNumber: rfidNumber,
        rfidUsed: form.rfidUsed
      })
      setRfidTableData(rfidTableData.map(t => t.id === selectedTag.id ? res.data : t))
      setShowEditModal(false)
    } catch (err) {
      setFormError('Failed to update RFID. Please try again.')
    }
    setFormLoading(false)
  }



  // Get unique values for filter options
  const uniqueOrders = rfidTableData
    .map(item => item.rfidLinkedToOrder)
    .filter(order => order !== 'NA')
    .filter((order, index, arr) => arr.indexOf(order) === index)
    .sort()

  // Filter the table data based on current filters
  const filteredTableData = rfidTableData.filter(item => {
    const rfidUsedMatch = tableFilters.rfidUsed === 'all' || 
      (tableFilters.rfidUsed === 'true' && (item.rfid_used === true || item.rfid_used === 'true')) ||
      (tableFilters.rfidUsed === 'false' && (item.rfid_used === false || item.rfid_used === 'false'))
    
    return (
      (tableFilters.rfidNumber === '' || item.rfid_number.toString().includes(tableFilters.rfidNumber)) &&
      rfidUsedMatch &&
      (tableFilters.rfidLinkedToOrder === 'all' || item.rfid_linked_to_order === tableFilters.rfidLinkedToOrder)
    )
  })

  const clearTableFilters = () => {
    setTableFilters({
      rfidNumber: '',
      rfidUsed: 'all',
      rfidLinkedToOrder: 'all'
    })
  }

  // Calculate KPI metrics
  const totalRfids = rfidTableData.length
  const usedRfids = rfidTableData.filter(item => item.rfid_used === true || item.rfid_used === 'true').length
  const availableRfids = totalRfids - usedRfids
  const assignedRfids = rfidTableData.filter(item => item.rfid_linked_to_order && item.rfid_linked_to_order !== 'NA').length
  const utilizationRate = totalRfids > 0 ? Math.round((usedRfids / totalRfids) * 100) : 0

  return (
    <WaterSystemLayout 
      title="RFID Tracking System" 
      subtitle="Real-time RFID tracking and inventory monitoring"
    >
      <div className="space-y-6">
        
        {/* KPI Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total RFID Cards */}
          <Card className="bg-slate-900/50 light:bg-white border-slate-700/30 light:border-gray-200 backdrop-blur-sm light:shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 light:text-gray-600 text-sm font-medium">Total RFID Cards</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{totalRfids}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/10 light:bg-blue-100 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-blue-400 light:text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Used RFID Cards */}
          <Card className="bg-slate-900/50 light:bg-white border-slate-700/30 light:border-gray-200 backdrop-blur-sm light:shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 light:text-gray-600 text-sm font-medium">Used RFID Cards</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{usedRfids}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-500/10 light:bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-400 light:text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Available RFID Cards */}
          <Card className="bg-slate-900/50 light:bg-white border-slate-700/30 light:border-gray-200 backdrop-blur-sm light:shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 light:text-gray-600 text-sm font-medium">Available RFID Cards</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{availableRfids}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-orange-500/10 light:bg-orange-100 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-orange-400 light:text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Utilization Rate */}
          <Card className="bg-slate-900/50 light:bg-white border-slate-700/30 light:border-gray-200 backdrop-blur-sm light:shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 light:text-gray-600 text-sm font-medium">Utilization Rate</p>
                  <p className="text-2xl font-bold text-white light:text-gray-900">{utilizationRate}%</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-500/10 light:bg-purple-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-purple-400 light:text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Button */}
        <div className="flex justify-end mb-4 gap-3">
          <Button className="bg-blue-600 text-white light:bg-blue-600 light:text-white hover:bg-blue-700 light:hover:bg-blue-700" onClick={handleAssign}>
            <Radio className="h-4 w-4 mr-2" /> RFID Assign
          </Button>
          <Button className="bg-green-600 text-white light:bg-green-600 light:text-white hover:bg-green-700 light:hover:bg-green-700" onClick={handleAdd}><Plus className="h-4 w-4 mr-2" /> Add RFID</Button>
        </div>



        {/* RFID Table Filter Section */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 mb-4 light:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-cyan-400 light:text-blue-600" />
              RFID Table Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">RFID Number</label>
                <Input
                  type="text"
                  placeholder="Search number..."
                  value={tableFilters.rfidNumber}
                  onChange={(e) => setTableFilters({ ...tableFilters, rfidNumber: e.target.value })}
                  className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm"
                />
              </div>
              
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">RFID Used</label>
                <Select onValueChange={(value) => setTableFilters({ ...tableFilters, rfidUsed: value })}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-slate-300 light:text-gray-700 text-xs mb-1 block">Linked to Order</label>
                <Select onValueChange={(value) => setTableFilters({ ...tableFilters, rfidLinkedToOrder: value })}>
                  <SelectTrigger className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-700 h-8 text-sm">
                    <SelectValue placeholder="All Orders" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300">
                    <SelectItem value="all">All Orders</SelectItem>
                    <SelectItem value="NA">Not Assigned (NA)</SelectItem>
                    {uniqueOrders.map(order => (
                      <SelectItem key={order} value={order}>{order}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end gap-2">
                <Button
                  onClick={clearTableFilters}
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 light:border-gray-300 light:text-gray-700 hover:bg-slate-700 light:hover:bg-gray-100 h-8"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RFID Data Table */}
        <div className="bg-slate-950/50 light:bg-white border border-slate-700/30 light:border-gray-200 rounded-lg backdrop-blur-sm light:shadow-lg">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-700/30 light:border-gray-200">
            <h3 className="text-lg font-semibold text-white light:text-gray-900">RFID Configuration Table</h3>
          </div>
          
          {/* Data Table */}
          <div className="p-6">
            <div className="rounded-md border border-slate-700/30 light:border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/50 light:hover:bg-gray-50">
                    <TableHead className="text-white light:text-gray-900 font-semibold">RFID Number</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">RFID Used</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">RFID Linked to Order</TableHead>
                    <TableHead className="text-white light:text-gray-900 font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTableData.map((item, index) => (
                    <TableRow 
                      key={index} 
                      className="border-slate-700/30 light:border-gray-200 hover:bg-slate-800/30 light:hover:bg-gray-50 transition-colors"
                    >
                      <TableCell className="text-white light:text-gray-900 font-medium">
                        {item.rfid_number}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.rfid_used === true || item.rfid_used === 'true'
                            ? 'text-green-400 light:text-green-600 bg-green-500/10 light:bg-green-100 border border-green-500/20 light:border-green-300' 
                            : 'text-red-400 light:text-red-600 bg-red-500/10 light:bg-red-100 border border-red-500/20 light:border-red-300'
                        }`}>
                          {item.rfid_used === true || item.rfid_used === 'true' ? 'True' : 'False'}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-300 light:text-gray-700">
                        <span className={item.rfid_linked_to_order === 'NA' ? 'text-slate-500 light:text-gray-400 italic' : ''}>
                          {item.rfid_linked_to_order}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleView(item)}><Eye className="w-4 h-4 text-blue-400" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="w-4 h-4 text-yellow-400" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>



        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-3 border border-slate-700 light:border-gray-200 shadow-xl">
              <h2 className="text-lg font-semibold mb-2 text-center text-slate-900 light:text-gray-900 dark:text-white">Add RFID</h2>
              <form onSubmit={handleAddSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">RFID Number</label>
                  <Input 
                    type="number" 
                    placeholder="Enter RFID Number (e.g., 11)" 
                    value={form.rfidNumber} 
                    onChange={e => setForm({ ...form, rfidNumber: e.target.value })} 
                    className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">RFID Used</label>
                  <Select value={form.rfidUsed.toString()} onValueChange={v => setForm({ ...form, rfidUsed: v === 'true' })}>
                    <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formError && <div className="text-red-500 text-sm">{formError}</div>}
                <div className="flex justify-end pt-3 gap-2">
                  <Button type="button" onClick={() => setShowAddModal(false)} variant="outline" className="border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-slate-300">Cancel</Button>
                  <Button type="submit" className="bg-green-600 text-white light:bg-green-600 light:text-white hover:bg-green-700 light:hover:bg-green-700" disabled={formLoading}>{formLoading ? 'Adding...' : 'Add'}</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Modal */}
        {showViewModal && selectedTag && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-3 border border-slate-700 light:border-gray-200 shadow-xl">
              <h2 className="text-lg font-semibold mb-2 text-center text-slate-900 light:text-gray-900 dark:text-white">RFID Details</h2>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium text-slate-700 light:text-gray-700 dark:text-slate-300">RFID Number:</span> <span className="text-slate-900 light:text-gray-900 dark:text-white">{selectedTag.rfid_number}</span></div>
                <div><span className="font-medium text-slate-700 light:text-gray-700 dark:text-slate-300">RFID Used:</span> <span className="text-slate-900 light:text-gray-900 dark:text-white">{selectedTag.rfid_used}</span></div>
                <div><span className="font-medium text-slate-700 light:text-gray-700 dark:text-slate-300">RFID Linked to Order:</span> <span className="text-slate-900 light:text-gray-900 dark:text-white">{selectedTag.rfid_linked_to_order}</span></div>
              </div>
              <div className="flex justify-end pt-3">
                <Button onClick={() => setShowViewModal(false)} className="bg-cyan-600 text-white light:bg-cyan-600 light:text-white hover:bg-cyan-700 light:hover:bg-cyan-700">Close</Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedTag && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-3 border border-slate-700 light:border-gray-200 shadow-xl">
              <h2 className="text-lg font-semibold mb-2 text-center text-slate-900 light:text-gray-900 dark:text-white">Edit RFID</h2>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">RFID Number</label>
                  <Input 
                    type="number" 
                    placeholder="Enter RFID Number (e.g., 11)" 
                    value={form.rfidNumber} 
                    onChange={e => setForm({ ...form, rfidNumber: e.target.value })} 
                    className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">RFID Used</label>
                  <Select value={form.rfidUsed.toString()} onValueChange={v => setForm({ ...form, rfidUsed: v === 'true' })}>
                    <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formError && <div className="text-red-500 text-sm">{formError}</div>}
                <div className="flex justify-end pt-3 gap-2">
                  <Button type="button" onClick={() => setShowEditModal(false)} variant="outline" className="border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-slate-300">Cancel</Button>
                  <Button type="submit" className="bg-yellow-500 text-white light:bg-yellow-500 light:text-white hover:bg-yellow-600 light:hover:bg-yellow-600" disabled={formLoading}>{formLoading ? 'Saving...' : 'Save'}</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* RFID Assign Modal */}
        {showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-3 border border-slate-700 light:border-gray-200 shadow-xl">
              <h2 className="text-lg font-semibold mb-2 text-center text-slate-900 light:text-gray-900 dark:text-white">RFID Assignment</h2>
              <form onSubmit={handleAssignSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">RFID Number</label>
                  <Select 
                    value={assignForm.rfid_number} 
                    onValueChange={v => setAssignForm({ ...assignForm, rfid_number: v })}
                  >
                    <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select RFID Number" />
                    </SelectTrigger>
                    <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                      {rfidTableData
                        .filter(rfid => !rfid.rfid_used || rfid.rfid_used === false || rfid.rfid_used === 'false')
                        .map(rfid => (
                          <SelectItem key={rfid.id} value={rfid.rfid_number}>
                            {rfid.rfid_number} {(rfid.rfid_used === true || rfid.rfid_used === 'true') ? '(Used)' : '(Available)'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">Truck ID</label>
                  <Select 
                    value={assignForm.truck_id} 
                    onValueChange={v => setAssignForm({ ...assignForm, truck_id: v })}
                  >
                    <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select Truck" />
                    </SelectTrigger>
                    <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                      {truckData.map(truck => (
                        <SelectItem key={truck.id} value={String(truck.id)}>
                          {truck.id} - {truck.license} ({truck.model})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">Order Reference</label>
                  <Select 
                    value={assignForm.order_ref} 
                    onValueChange={v => setAssignForm({ ...assignForm, order_ref: v })}
                  >
                    <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                      <SelectValue placeholder="Select Order Reference" />
                    </SelectTrigger>
                    <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                      {orderTypes.map(type => (
                        <SelectItem key={type.value} value={type.label}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {assignFormError && <div className="text-red-500 text-sm">{assignFormError}</div>}
                <div className="flex justify-end pt-3 gap-2">
                  <Button type="button" onClick={() => setShowAssignModal(false)} variant="outline" className="border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-slate-300">Cancel</Button>
                  <Button type="submit" className="bg-blue-600 text-white light:bg-blue-600 light:text-white hover:bg-blue-700 light:hover:bg-blue-700" disabled={assignFormLoading}>
                    {assignFormLoading ? 'Assigning...' : 'Assign RFID'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && successData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-4 border border-green-200 light:border-green-200 dark:border-green-600 shadow-xl">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 light:bg-green-100 dark:bg-green-900/20 mb-4">
                  <svg className="h-6 w-6 text-green-600 light:text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 light:text-gray-900 dark:text-white mb-2">RFID Assignment Successful!</h2>
                <p className="text-sm text-gray-600 light:text-gray-600 dark:text-slate-300 mb-4">The RFID has been successfully assigned and sent to PLC.</p>
              </div>
              
              <div className="bg-green-50 light:bg-green-50 dark:bg-green-900/10 border border-green-200 light:border-green-200 dark:border-green-600/30 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">RFID Number:</span>
                  <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">{successData['RFID Number']}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">Truck ID:</span>
                  <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">{successData['Truck ID']}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">Order Reference:</span>
                  <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">{successData['Order Ref']}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">Sent to PLC:</span>
                  <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">
                    {successData['SentToPLC'] ? '✅ Yes' : '❌ No'}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-center pt-4">
                <Button 
                  onClick={() => setShowSuccessModal(false)} 
                  className="bg-green-600 hover:bg-green-700 text-white light:bg-green-600 light:hover:bg-green-700 light:text-white"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </WaterSystemLayout>
  )
}