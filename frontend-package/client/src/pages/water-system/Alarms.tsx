import React from 'react'
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout'
import { KPICard } from '../../components/water-system/KPICard'
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'

// Mock alarm data
const alarms = [
  {
    id: 'ALM-001',
    alarmID: 'ALM-001',
    type: 'Critical',
    message: 'Temperature exceeded threshold in Furnace #3',
    source: 'Furnace Control System',
    timestamp: '17/04/2024, 8:30:27 PM',
    status: 'Active',
    operator: '',
    actions: 'Ack'
  },
  {
    id: 'ALM-002',
    alarmID: 'ALM-002', 
    type: 'Warning',
    message: 'Low level detected',
    source: 'Level Control System',
    timestamp: '17/04/2024, 6:42:15 PM',
    status: 'Active',
    operator: '',
    actions: 'Ack'
  },
  {
    id: 'ALM-003',
    alarmID: 'ALM-003',
    type: 'Warning',
    message: 'Scheduled maintenance required for Conveyor Belt #1',
    source: 'Maintenance System', 
    timestamp: '17/04/2024, 5:46:27 PM',
    status: 'Resolved',
    operator: 'John Smith',
    actions: 'Resolve'
  }
]

const getTypeColor = (type: string) => {
  switch (type) {
    case 'Critical':
      return 'text-red-400 bg-red-500/10 border-red-500/20'
    case 'Warning':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'Info':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
  }
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Critical':
      return <XCircle className="h-4 w-4" />
    case 'Warning':
      return <AlertTriangle className="h-4 w-4" />
    case 'Info': 
      return <CheckCircle className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active':
      return 'text-red-400'
    case 'Resolved':
      return 'text-green-400'
    default:
      return 'text-slate-400'
  }
}

export function Alarms() {
  return (
    <WaterSystemLayout 
      title="Alarms & Notifications" 
      subtitle="System alerts, notifications, and status management"
    >
      <div className="space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            title="CRITICAL ALARMS"
            value="1"
            icon="activity"
            color="orange"
            chartType="circle"
          />
          <KPICard
            title="ACTIVE ALARMS"
            value="2"
            icon="pump"
            color="orange"
            chartType="line"
          />
          <KPICard
            title="RESOLVED TODAY"
            value="1"
            icon="water"
            color="green"
            chartType="bar"
          />
          <KPICard
            title="SYSTEM STATUS"
            value="98%"
            subtitle="Operational"
            icon="gauge"
            color="green"
            chartType="gauge"
          />
        </div>

        {/* Alarms Feed */}
        <div className="bg-slate-950/50 border border-slate-700/30 rounded-lg backdrop-blur-sm">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-700/30">
            <h3 className="text-lg font-semibold text-white">Alarms Feed</h3>
          </div>
          
          {/* Alarms Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/30">
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Alarm ID</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Message</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Source</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Timestamp</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Operator</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alarms.map((alarm) => (
                  <tr key={alarm.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-cyan-400">{alarm.alarmID}</div>
                    </td>
                    <td className="p-4">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(alarm.type)}`}>
                        {getTypeIcon(alarm.type)}
                        <span className="ml-1">{alarm.type}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-white max-w-xs">{alarm.message}</div>
                    </td>
                    <td className="p-4 text-slate-300">{alarm.source}</td>
                    <td className="p-4 text-slate-300 text-sm">{alarm.timestamp}</td>
                    <td className="p-4">
                      <div className={`font-medium ${getStatusColor(alarm.status)}`}>
                        {alarm.status}
                      </div>
                    </td>
                    <td className="p-4 text-slate-300">{alarm.operator || '-'}</td>
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        {alarm.status === 'Active' ? (
                          <button className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 
                                             text-white text-xs rounded transition-colors">
                            Ack
                          </button>
                        ) : (
                          <button className="px-3 py-1 bg-green-600 hover:bg-green-700 
                                             text-white text-xs rounded transition-colors">
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </WaterSystemLayout>
  )
}