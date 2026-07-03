import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { PLC_BASE_URL } from '../../config/api'

const ORDER_BTN =
  'bg-cyan-600 hover:bg-cyan-700 text-white light:bg-cyan-600 light:hover:bg-cyan-700 light:text-white'

export const RFID_ASSIGN_ORDER_REF_OPTIONS = [
  { value: 'intake1', label: 'Intake Line 1' },
  { value: 'intake2', label: 'Intake Line 2' },
  { value: 'mineral', label: 'Mineral Intake' },
  { value: 'outload1', label: 'Outloading Line 1' },
  { value: 'outload2', label: 'Outloading Line 2' },
  { value: 'outload3', label: 'Outloading Line 3' },
  { value: 'bulk', label: 'Bulk Line' },
  { value: 'pt', label: 'PIT Line' },
] as const

const TAB_TO_ORDER_REF: Record<string, string> = {
  'intake-line-1': 'Intake Line 1',
  'intake-line-2': 'Intake Line 2',
  'mineral-intake': 'Mineral Intake',
  'outloading-1': 'Outloading Line 1',
  'outloading-2': 'Outloading Line 2',
  'outloading-3': 'Outloading Line 3',
  'bulk-line': 'Bulk Line',
  'pt-line': 'PIT Line',
}

export function orderRefLabelFromActiveTab(activeTab: string): string {
  return TAB_TO_ORDER_REF[activeTab] ?? ''
}

interface RfidTag {
  id: number
  rfid_number: string
  rfid_used?: boolean | string | null
}

interface TruckOption {
  id: number
  license: string
  model?: string
}

interface RfidAssignModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rfidTags: RfidTag[]
  trucks: TruckOption[]
  defaultTruckId?: string
  defaultOrderRef?: string
  onAssigned?: () => void
}

export function RfidAssignModal({
  open,
  onOpenChange,
  rfidTags,
  trucks,
  defaultTruckId = '',
  defaultOrderRef = '',
  onAssigned,
}: RfidAssignModalProps) {
  const { toast } = useToast()
  const [assignForm, setAssignForm] = useState({
    rfid_number: '',
    truck_id: '',
    order_ref: '',
  })
  const [assignFormError, setAssignFormError] = useState<string | null>(null)
  const [assignFormLoading, setAssignFormLoading] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successData, setSuccessData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (open) {
      setAssignForm({
        rfid_number: '',
        truck_id: defaultTruckId,
        order_ref: defaultOrderRef,
      })
      setAssignFormError(null)
    }
  }, [open, defaultTruckId, defaultOrderRef])

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAssignFormError(null)
    setAssignFormLoading(true)
    try {
      if (!assignForm.rfid_number || !assignForm.truck_id || !assignForm.order_ref) {
        setAssignFormError('All fields are required.')
        return
      }

      const res = await axios.post(`${PLC_BASE_URL}/rfid/assign`, {
        rfid_number: assignForm.rfid_number,
        truck_id: Number(assignForm.truck_id),
        order_ref: assignForm.order_ref,
      })

      onOpenChange(false)
      setSuccessData(res.data)
      setShowSuccessModal(true)
      onAssigned?.()
    } catch (err: unknown) {
      const errorMessage =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Failed to assign RFID. Please try again.'
      setAssignFormError(errorMessage)
      toast({
        title: 'RFID Assignment Failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setAssignFormLoading(false)
    }
  }

  const availableRfids = rfidTags.filter((rfid) => {
    const used = rfid.rfid_used
    return used !== true && used !== 'true'
  })

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-3 border border-slate-700 light:border-gray-200 shadow-xl">
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-900 light:text-gray-900 dark:text-white">
              RFID Assignment
            </h2>
            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">
                  RFID Number
                </label>
                <Select
                  value={assignForm.rfid_number}
                  onValueChange={(v) => setAssignForm({ ...assignForm, rfid_number: v })}
                >
                  <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select RFID Number" />
                  </SelectTrigger>
                  <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                    {availableRfids.map((rfid) => (
                      <SelectItem key={rfid.id} value={rfid.rfid_number}>
                        {rfid.rfid_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">
                  Truck
                </label>
                <Select
                  value={assignForm.truck_id}
                  onValueChange={(v) => setAssignForm({ ...assignForm, truck_id: v })}
                >
                  <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Truck" />
                  </SelectTrigger>
                  <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                    {trucks.map((truck) => (
                      <SelectItem key={truck.id} value={String(truck.id)}>
                        {truck.id} - {truck.license}
                        {truck.model ? ` (${truck.model})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 light:text-gray-700 dark:text-slate-300 mb-1">
                  Order Reference
                </label>
                <Select
                  value={assignForm.order_ref}
                  onValueChange={(v) => setAssignForm({ ...assignForm, order_ref: v })}
                >
                  <SelectTrigger className="w-full bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Order Reference" />
                  </SelectTrigger>
                  <SelectContent className="bg-white light:bg-white dark:bg-slate-700 border-gray-300 light:border-gray-300 dark:border-slate-600">
                    {RFID_ASSIGN_ORDER_REF_OPTIONS.map((type) => (
                      <SelectItem key={type.value} value={type.label}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {assignFormError && <div className="text-red-500 text-sm">{assignFormError}</div>}
              <div className="flex justify-end pt-3 gap-2">
                <Button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  variant="outline"
                  className="border-gray-300 light:border-gray-300 dark:border-slate-600 text-gray-900 light:text-gray-900 dark:text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={ORDER_BTN}
                  disabled={assignFormLoading}
                >
                  {assignFormLoading ? 'Assigning...' : 'Assign RFID'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && successData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white light:bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-md space-y-4 border border-green-200 light:border-green-200 dark:border-green-600 shadow-xl">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 light:bg-green-100 dark:bg-green-900/20 mb-4">
                <svg className="h-6 w-6 text-green-600 light:text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 light:text-gray-900 dark:text-white mb-2">
                RFID Assignment Successful!
              </h2>
              <p className="text-sm text-gray-600 light:text-gray-600 dark:text-slate-300 mb-4">
                The RFID has been successfully assigned and sent to PLC.
              </p>
            </div>

            <div className="bg-green-50 light:bg-green-50 dark:bg-green-900/10 border border-green-200 light:border-green-200 dark:border-green-600/30 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">RFID Number:</span>
                <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">
                  {String(successData['RFID Number'] ?? '')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">Truck ID:</span>
                <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">
                  {String(successData['Truck ID'] ?? '')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700 light:text-gray-700 dark:text-slate-300">Order Reference:</span>
                <span className="text-green-600 light:text-green-600 dark:text-green-400 font-semibold">
                  {String(successData['Order Ref'] ?? '')}
                </span>
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
                className={ORDER_BTN}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
