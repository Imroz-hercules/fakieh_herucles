import React, { useMemo } from 'react'
import { useLocation } from 'wouter'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RFID } from './RFID'
import TruckManagement from './TruckManagement'
import ClientInformation from './ClientInformation'

export type ManagementSection = 'rfid' | 'trucks' | 'drivers' | 'clients'

const SECTION_OPTIONS: { value: ManagementSection; label: string; path: string }[] = [
  { value: 'rfid', label: 'RFID', path: '/fakieh/management/rfid' },
  { value: 'trucks', label: 'Trucks', path: '/fakieh/management/trucks' },
  { value: 'drivers', label: 'Drivers', path: '/fakieh/management/drivers' },
  { value: 'clients', label: 'Clients', path: '/fakieh/management/clients' },
]

export function managementSectionFromPath(location: string): ManagementSection {
  if (location.startsWith('/fakieh/management/rfid')) return 'rfid'
  if (location.startsWith('/fakieh/management/drivers')) return 'drivers'
  if (location.startsWith('/fakieh/management/clients')) return 'clients'
  return 'trucks'
}

export default function Management(): JSX.Element {
  const [location, setLocation] = useLocation()
  const section = useMemo(() => managementSectionFromPath(location), [location])

  const subtitleBySection: Record<ManagementSection, string> = {
    rfid: 'RFID cards, assignment, and tracking',
    trucks: 'Fleet registration and truck records',
    drivers: 'Driver profiles and truck assignments',
    clients: 'Client names and contact numbers',
  }

  return (
    <WaterSystemLayout title="Management" subtitle={subtitleBySection[section]} showPageTitle={false}>
      <div className="px-6 pt-4 pb-2 border-b border-slate-700/40 light:border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-xs">
          <label className="text-sm font-medium text-slate-300 light:text-gray-600 shrink-0">Section</label>
          <Select
            value={section}
            onValueChange={(value) => {
              const next = SECTION_OPTIONS.find((o) => o.value === value)
              if (next) setLocation(next.path)
            }}
          >
            <SelectTrigger className="bg-slate-800 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-900">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 light:bg-white border-slate-600 light:border-gray-300">
              {SECTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {section === 'rfid' && <RFID />}
      {section === 'trucks' && <TruckManagement section="trucks" />}
      {section === 'drivers' && <TruckManagement section="drivers" />}
      {section === 'clients' && <ClientInformation />}
    </WaterSystemLayout>
  )
}

export { Management }
