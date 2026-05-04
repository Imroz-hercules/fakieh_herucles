import React, { useState, useEffect } from 'react'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { KPICard } from '../../components/water-system/KPICard'
import { Search, Filter, Plus, AlertTriangle, CheckCircle, XCircle, Clock, Eye, Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const getStatusColor = (status: string) => {
  switch (status) {
    case 'In Stock':
      return 'text-green-400 bg-green-500/10 border-green-500/20'
    case 'Low Stock':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'Critical':
      return 'text-red-400 bg-red-500/10 border-red-500/20'
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'In Stock':
      return <CheckCircle className="h-4 w-4" />
    case 'Low Stock':
      return <Clock className="h-4 w-4" />
    case 'Critical':
      return <AlertTriangle className="h-4 w-4" />
    default:
      return <XCircle className="h-4 w-4" />
  }
}

export function Material() {
  const [materials, setMaterials] = useState<any[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'view' | 'edit'>('add')
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null)

  const [newMaterial, setNewMaterial] = useState({
    name: '',
    code: '',
    type: '',
    stock: '',
    unit: '',
    cost: '',
    supplier: ''
  })

  // Fetch materials from backend
  useEffect(() => {
    fetch('/api/materials')
      .then(res => res.json())
      .then(data => setMaterials(data))
      .catch(err => console.error('Error fetching materials:', err))
  }, [])

  const handleOpenModal = (mode: 'add' | 'view' | 'edit', material: any = null) => {
    setModalMode(mode)
    if (mode === 'add') {
      setNewMaterial({ name: '', code: '', type: '', stock: '', unit: '', cost: '', supplier: '' })
    } else {
      setSelectedMaterial(material)
      setNewMaterial(material)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedMaterial(null)
    setNewMaterial({ name: '', code: '', type: '', stock: '', unit: '', cost: '', supplier: '' })
  }

  const handleAddMaterial = () => {
    const newItem = {
      name: newMaterial.name,
      code: newMaterial.code,
      type: newMaterial.type,
      stock: parseFloat(newMaterial.stock) || 0,
      unit: newMaterial.unit,
      cost: parseFloat(newMaterial.cost) || 0,
      reorderLevel: 1000, // default or could be an input
      status: 'In Stock',
      supplier: newMaterial.supplier
    }

    fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    })
      .then(res => res.json())
      .then(savedMaterial => {
        setMaterials(prev => [savedMaterial, ...prev])
        handleCloseModal()
        setSuccessMessage('Material added successfully!')
        setTimeout(() => setSuccessMessage(''), 3000)
      })
      .catch(err => console.error('Error adding material:', err))
  }

  const handleUpdateMaterial = () => {
    if (!selectedMaterial) return

    const updatedItem = { ...newMaterial, stock: parseFloat(newMaterial.stock) || 0, cost: parseFloat(newMaterial.cost) || 0 }

    fetch(`/api/materials/${selectedMaterial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedItem)
    })
      .then(res => res.json())
      .then(updatedMaterial => {
        setMaterials(prev => prev.map(m => m.id === updatedMaterial.id ? updatedMaterial : m))
        handleCloseModal()
        setSuccessMessage('Material updated successfully!')
        setTimeout(() => setSuccessMessage(''), 3000)
      })
      .catch(err => console.error('Error updating material:', err))
  }

  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterType === 'All' || material.type === filterType
    return matchesSearch && matchesFilter
  })

  const renderModalContent = () => {
    const isViewMode = modalMode === 'view'
    const title = modalMode === 'add' ? 'Add New Material' : (modalMode === 'edit' ? 'Edit Material' : 'View Material')
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-slate-900 p-6 rounded-lg w-full max-w-lg space-y-4 border border-slate-700 mt-40">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <div className="space-y-3">
            <Input placeholder="Material Name" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.name} onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })} disabled={isViewMode} />
            <Input placeholder="Code" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.code} onChange={e => setNewMaterial({ ...newMaterial, code: e.target.value })} disabled={isViewMode} />
            <Input placeholder="Type" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.type} onChange={e => setNewMaterial({ ...newMaterial, type: e.target.value })} disabled={isViewMode} />
            <Input placeholder="Stock" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.stock} onChange={e => setNewMaterial({ ...newMaterial, stock: e.target.value })} disabled={isViewMode} />
            <Input placeholder="Unit" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.unit} onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })} disabled={isViewMode} />
            <Input placeholder="Cost" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.cost} onChange={e => setNewMaterial({ ...newMaterial, cost: e.target.value })} disabled={isViewMode} />
            <Input placeholder="Supplier" className="bg-slate-800/50 border-slate-600 text-white"
              value={newMaterial.supplier} onChange={e => setNewMaterial({ ...newMaterial, supplier: e.target.value })} disabled={isViewMode} />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="ghost" className="text-slate-400 hover:bg-slate-700/50" onClick={handleCloseModal}>
              {isViewMode ? 'Close' : 'Cancel'}
            </Button>
            {!isViewMode && (
              <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={modalMode === 'add' ? handleAddMaterial : handleUpdateMaterial}>
                {modalMode === 'add' ? 'Add' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <WaterSystemLayout 
      title="Material Management" 
      subtitle="Material inventory, costs, and specifications management"
    >
      <div className="space-y-6">
        {successMessage && (
          <div className="bg-green-600/20 border border-green-500/30 text-green-300 px-4 py-2 rounded-md">
            {successMessage}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="ACTIVE MATERIALS" value={materials.length.toString()} subtitle="Programs & Recipes" icon="activity" color="blue" chartType="line" />
          <KPICard title="IN STOCK ITEMS" value={materials.filter(m => m.status === 'In Stock').length.toString()} subtitle="Ready to Handling" icon="gauge" color="green" chartType="bar" />
          <KPICard title="URGENT STOCK" value={materials.filter(m => m.status === 'Critical').length.toString()} subtitle="Reorder Required" icon="activity" color="orange" chartType="circle" />
          <KPICard title="LOW STOCK ITEMS" value={materials.filter(m => m.status === 'Low Stock').length.toString()} subtitle="Requires Attention" icon="activity" color="purple" chartType="gauge" />
        </div>

        {/* Material Management Table */}
        <div className="bg-slate-950/50 border border-slate-700/30 rounded-lg backdrop-blur-sm">
          
          {/* Table Header */}
          <div className="p-6 border-b border-slate-700/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Material Management</h3>
              <Button onClick={() => handleOpenModal('add')} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </div>
            
            {/* Search and Filters */}
            <div className="flex items-center space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-slate-600 text-white placeholder-slate-400"
                />
              </div>
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800">
                <Filter className="h-4 w-4 mr-2" />
                All Filters
              </Button>
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800">
                All Types
              </Button>
            </div>
          </div>
          
          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/30">
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Material</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Code</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Stock</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Unit</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Cost/Unit</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Supplier</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material) => (
                  <tr key={material.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="p-4"><div className="font-medium text-white">{material.name}</div></td>
                    <td className="p-4 text-slate-300">{material.code}</td>
                    <td className="p-4 text-slate-300">{material.type}</td>
                    <td className="p-4"><div className="font-medium text-white">{material.stock.toLocaleString()}</div></td>
                    <td className="p-4 text-slate-300">{material.unit}</td>
                    <td className="p-4 text-slate-300">${material.cost}</td>
                    <td className="p-4">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(material.status)}`}>
                        {getStatusIcon(material.status)}
                        <span className="ml-1">{material.status}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-300">{material.supplier}</td>
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <Button onClick={() => handleOpenModal('view', material)} variant="ghost" size="sm" className="text-cyan-400 hover:bg-cyan-400/10"><Eye className="h-4 w-4" /></Button>
                        <Button onClick={() => handleOpenModal('edit', material)} variant="ghost" size="sm" className="text-slate-400 hover:bg-slate-700/50"><Edit className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal for adding/viewing/editing material */}
        {showModal && renderModalContent()}
      </div>
    </WaterSystemLayout>
  )
}