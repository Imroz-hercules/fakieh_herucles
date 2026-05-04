import React, { useState } from 'react'
import { Plus, X, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Threshold {
  value: number
  color: string
  label: string
}

interface ThresholdEditorProps {
  thresholds: Threshold[]
  onChange: (thresholds: Threshold[]) => void
}

const PRESET_COLORS = [
  { name: 'Green', value: '#00ff88', icon: <CheckCircle size={14} /> },
  { name: 'Yellow', value: '#ffaa00', icon: <AlertTriangle size={14} /> },
  { name: 'Red', value: '#ff4444', icon: <AlertCircle size={14} /> },
  { name: 'Blue', value: '#00ffff', icon: <CheckCircle size={14} /> },
  { name: 'Purple', value: '#8000ff', icon: <AlertTriangle size={14} /> },
  { name: 'Orange', value: '#ff8000', icon: <AlertCircle size={14} /> }
]

export function ThresholdEditor({ thresholds, onChange }: ThresholdEditorProps) {
  const [newThreshold, setNewThreshold] = useState<Threshold>({
    value: 0,
    color: '#00ff88',
    label: ''
  })

  const addThreshold = () => {
    if (newThreshold.label && newThreshold.value !== null) {
      const updated = [...thresholds, newThreshold].sort((a, b) => a.value - b.value)
      onChange(updated)
      setNewThreshold({ value: 0, color: '#00ff88', label: '' })
    }
  }

  const removeThreshold = (index: number) => {
    const updated = thresholds.filter((_, i) => i !== index)
    onChange(updated)
  }

  const updateThreshold = (index: number, updates: Partial<Threshold>) => {
    const updated = thresholds.map((threshold, i) => 
      i === index ? { ...threshold, ...updates } : threshold
    )
    onChange(updated.sort((a, b) => a.value - b.value))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-3">
        Alert Thresholds
      </label>

      {/* Existing Thresholds */}
      <div className="space-y-3 mb-4">
        {thresholds.map((threshold, index) => (
          <div key={index} className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-3">
              {/* Color Indicator */}
              <div 
                className="w-4 h-4 rounded-full border border-slate-600"
                style={{ backgroundColor: threshold.color }}
              />

              {/* Value Input */}
              <div className="flex-1">
                <input
                  type="number"
                  value={threshold.value}
                  onChange={(e) => updateThreshold(index, { value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                  placeholder="Threshold value"
                />
              </div>

              {/* Label Input */}
              <div className="flex-1">
                <input
                  type="text"
                  value={threshold.label}
                  onChange={(e) => updateThreshold(index, { label: e.target.value })}
                  className="w-full px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
                  placeholder="Label"
                />
              </div>

              {/* Color Picker */}
              <select
                value={threshold.color}
                onChange={(e) => updateThreshold(index, { color: e.target.value })}
                className="px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              >
                {PRESET_COLORS.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.name}
                  </option>
                ))}
              </select>

              {/* Remove Button */}
              <button
                onClick={() => removeThreshold(index)}
                className="p-1 text-slate-400 hover:text-red-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Threshold */}
      <div className="p-3 bg-slate-800/20 rounded-lg border border-dashed border-slate-600/50">
        <div className="flex items-center gap-3 mb-3">
          <div 
            className="w-4 h-4 rounded-full border border-slate-600"
            style={{ backgroundColor: newThreshold.color }}
          />
          <input
            type="number"
            value={newThreshold.value}
            onChange={(e) => setNewThreshold(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
            className="flex-1 px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
            placeholder="Threshold value"
          />
          <input
            type="text"
            value={newThreshold.label}
            onChange={(e) => setNewThreshold(prev => ({ ...prev, label: e.target.value }))}
            className="flex-1 px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
            placeholder="Label (e.g., Critical)"
          />
          <select
            value={newThreshold.color}
            onChange={(e) => setNewThreshold(prev => ({ ...prev, color: e.target.value }))}
            className="px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
          >
            {PRESET_COLORS.map((color) => (
              <option key={color.value} value={color.value}>
                {color.name}
              </option>
            ))}
          </select>
          <button
            onClick={addThreshold}
            disabled={!newThreshold.label}
            className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {/* Preset Quick Actions */}
      <div className="mt-4">
        <div className="text-xs text-slate-400 mb-2">Quick Presets</div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const standardThresholds = [
                { value: 80, color: '#00ff88', label: 'Good' },
                { value: 60, color: '#ffaa00', label: 'Warning' },
                { value: 40, color: '#ff4444', label: 'Critical' }
              ]
              onChange(standardThresholds)
            }}
            className="px-2 py-1 text-xs bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50"
          >
            Standard
          </button>
          <button
            onClick={() => {
              const performanceThresholds = [
                { value: 90, color: '#00ff88', label: 'Excellent' },
                { value: 70, color: '#ffaa00', label: 'Good' },
                { value: 50, color: '#ff8000', label: 'Poor' },
                { value: 30, color: '#ff4444', label: 'Critical' }
              ]
              onChange(performanceThresholds)
            }}
            className="px-2 py-1 text-xs bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50"
          >
            Performance
          </button>
          <button
            onClick={() => onChange([])}
            className="px-2 py-1 text-xs bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Threshold Preview */}
      {thresholds.length > 0 && (
        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-2">Threshold Preview</div>
          <div className="flex h-6 rounded overflow-hidden">
            {thresholds.map((threshold, index) => (
              <div
                key={index}
                className="flex-1 flex items-center justify-center text-xs font-medium text-white"
                style={{ backgroundColor: threshold.color }}
                title={`${threshold.label}: ${threshold.value}`}
              >
                {threshold.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}