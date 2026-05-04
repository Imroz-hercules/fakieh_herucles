import React, { useEffect, useState } from 'react';
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout';
import { KPICard } from '../../components/water-system/KPICard';
import { CheckCircle, Clock, AlertTriangle, TrendingUp, Plus, Trash2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Batch = {
  id: number;
  recipe: string;
  batchNo: string;
  feedType: string;
  formula: string;
  targetQty: number;
  actualQty: number;
  productRange: string;
  qualityCheck: string;
  status: string;
  createdAt: string;
};

const initialFormData = {
  recipe: '',
  batchNo: '',
  feedType: '',
  formula: '',
  targetQty: '',
  actualQty: '',
  productRange: '',
  qualityCheck: '',
  status: '',
};

const formFields = [
  { key: 'recipe', label: 'Recipe ID' },
  { key: 'batchNo', label: 'Batch No' },
  { key: 'feedType', label: 'Feed Type' },
  { key: 'formula', label: 'Formula' },
  { key: 'targetQty', label: 'Target Qty' },
  { key: 'actualQty', label: 'Actual Qty' },
  { key: 'productRange', label: 'Product Range' },
  { key: 'qualityCheck', label: 'Quality Check' },
  { key: 'status', label: 'Status' },
];

export function Production() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [editBatchId, setEditBatchId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Fetch batches
  useEffect(() => {
    async function fetchBatches() {
      try {
        const res = await fetch('http://localhost:5000/api/production');
        const data = await res.json();
        setBatches(data);
      } catch (err) {
        
      }
    }
    fetchBatches();
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...formData,
      targetQty: Number(formData.targetQty) || 0,
      actualQty: Number(formData.actualQty) || 0,
    };

    try {
      if (editBatchId) {
        // Update batch
        const res = await fetch(`/api/production/${editBatchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setBatches(prev => prev.map(b => b.id === editBatchId ? updated : b));
        }
      } else {
        // Add batch
        const res = await fetch('/api/production', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const added = await res.json();
          setBatches(prev => [...prev, added]);
        }
      }
      setShowForm(false);
      setFormData(initialFormData);
      setEditBatchId(null);
    } catch (err) {
      
    }
  };

  const handleDeleteBatch = async (id: number) => {
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setBatches(prev => prev.filter(batch => batch.id !== id));
      }
    } catch (err) {
      
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'In Progress': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'Quality Check': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'Ready': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed': return <CheckCircle className="h-4 w-4" />;
      case 'In Progress': return <Clock className="h-4 w-4" />;
      case 'Quality Check': return <AlertTriangle className="h-4 w-4" />;
      case 'Ready': return <TrendingUp className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getQualityColor = (check: string) => {
    switch (check) {
      case 'Passed': return 'text-green-400';
      case 'Warning': return 'text-orange-400';
      case 'Failed': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <WaterSystemLayout title="Production Management" subtitle="Production monitoring, batch tracking, and method tracking">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPICard title="TOTAL OUTPUT" value="50.5" unit="MT" trend={12} icon="gauge" color="blue" chartType="line" />
          <KPICard title="EFFICIENCY" value="42.8" unit="%" trend={8} icon="activity" color="green" chartType="circle" />
          <KPICard title="QUALITY RATE" value="94.7" unit="%" trend={-2} icon="water" color="cyan" chartType="gauge" />
        </div>

        {/* Table Header */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Batch Recipe Management</h3>
          <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => { setShowForm(true); setEditBatchId(null); }}>
            <Plus className="h-4 w-4 mr-2" /> New Batch
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto bg-slate-950/50 rounded-lg border border-slate-700/30">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/30">
                {formFields.map(f => (
                  <th key={f.key} className="p-4 text-left text-sm font-medium text-slate-300">{f.label}</th>
                ))}
                <th className="p-4 text-left text-sm font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-4 text-white font-medium">{batch.recipe}</td>
                  <td className="p-4 text-cyan-400 font-medium">{batch.batchNo}</td>
                  <td className="p-4 text-slate-300">{batch.feedType}</td>
                  <td className="p-4 text-slate-300">{batch.formula}</td>
                  <td className="p-4 text-white font-medium">{batch.targetQty}</td>
                  <td className="p-4 text-white font-medium">{batch.actualQty}</td>
                  <td className="p-4 text-cyan-400">{batch.productRange}</td>
                  <td className={`p-4 font-medium ${getQualityColor(batch.qualityCheck)}`}>{batch.qualityCheck}</td>
                  <td className="p-4">
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(batch.status)}`}>
                      {getStatusIcon(batch.status)}
                      <span className="ml-1">{batch.status}</span>
                    </div>
                  </td>
                  <td className="p-4 flex gap-2">
                    <Button variant="ghost" size="sm" className="text-green-400 hover:bg-green-400/10"
                      onClick={() => { setEditBatchId(batch.id); setFormData(batch); setShowForm(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-400/10"
                      onClick={() => setConfirmDeleteId(batch.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
            <div className="bg-slate-900 p-6 rounded-lg w-[900px] border border-slate-700 mt-20">
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">{editBatchId ? 'Edit Batch' : 'Add New Batch'}</h2>
                <button onClick={() => setShowForm(false)}>
                  <X className="text-slate-400 hover:text-white" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleFormSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {formFields.map(({ key, label }) => (
                  <div key={key} className="flex flex-col">
                    <label className="text-slate-300 text-sm capitalize mb-1">{label}</label>
                    <input
                      type="text"
                      name={key}
                      value={formData[key as keyof typeof formData]}
                      onChange={(e) => setFormData({ ...formData, [e.target.name]: e.target.value })}
                      className="w-full px-3 py-2 rounded bg-slate-800 text-white border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                ))}

                {/* Buttons */}
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2 mt-4">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600">Cancel</Button>
                  <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 text-white">Save</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {confirmDeleteId !== null && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
            <div className="bg-slate-900 p-6 rounded-lg border border-slate-700">
              <h3 className="text-white mb-4">Are you sure you want to delete this batch?</h3>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmDeleteId(null)} className="bg-slate-700 hover:bg-slate-600">Cancel</Button>
                <Button onClick={() => handleDeleteBatch(confirmDeleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </WaterSystemLayout>
  );
}
