// Mock data sources for dashboard prototyping
export interface DatabaseValue {
  id: string
  name: string
  category: string
  unit: string
  type: 'number' | 'string' | 'boolean' | 'timestamp'
  description: string
  sampleData: any[]
}

export const mockDatabaseValues: DatabaseValue[] = [
  // Water Quality Parameters
  {
    id: 'ph_level',
    name: 'pH Level',
    category: 'Water Quality',
    unit: 'pH',
    type: 'number',
    description: 'Water acidity/alkalinity measurement',
    sampleData: [7.2, 7.1, 7.3, 7.0, 7.2, 7.4, 7.1, 7.3]
  },
  {
    id: 'turbidity',
    name: 'Turbidity',
    category: 'Water Quality',
    unit: 'NTU',
    type: 'number',
    description: 'Water clarity measurement',
    sampleData: [0.8, 0.9, 0.7, 1.1, 0.6, 0.8, 0.9, 1.0]
  },
  {
    id: 'chlorine_residual',
    name: 'Chlorine Residual',
    category: 'Water Quality',
    unit: 'mg/L',
    type: 'number',
    description: 'Free chlorine concentration',
    sampleData: [1.2, 1.1, 1.3, 1.0, 1.2, 1.4, 1.1, 1.3]
  },
  {
    id: 'temperature',
    name: 'Water Temperature',
    category: 'Water Quality',
    unit: '°C',
    type: 'number',
    description: 'Water temperature',
    sampleData: [22.5, 23.1, 22.8, 23.2, 22.9, 23.0, 22.7, 23.1]
  },

  // Flow & Pressure
  {
    id: 'flow_rate',
    name: 'Flow Rate',
    category: 'Flow & Pressure',
    unit: 'm³/h',
    type: 'number',
    description: 'Water flow rate through system',
    sampleData: [850, 875, 820, 900, 865, 840, 890, 855]
  },
  {
    id: 'inlet_pressure',
    name: 'Inlet Pressure',
    category: 'Flow & Pressure',
    unit: 'bar',
    type: 'number',
    description: 'System inlet pressure',
    sampleData: [4.2, 4.1, 4.3, 4.0, 4.2, 4.4, 4.1, 4.3]
  },
  {
    id: 'outlet_pressure',
    name: 'Outlet Pressure',
    category: 'Flow & Pressure',
    unit: 'bar',
    type: 'number',
    description: 'System outlet pressure',
    sampleData: [3.8, 3.7, 3.9, 3.6, 3.8, 4.0, 3.7, 3.9]
  },

  // Energy & Power
  {
    id: 'power_consumption',
    name: 'Power Consumption',
    category: 'Energy & Power',
    unit: 'kW',
    type: 'number',
    description: 'Total facility power consumption',
    sampleData: [125, 130, 120, 135, 128, 122, 132, 127]
  },
  {
    id: 'pump_efficiency',
    name: 'Pump Efficiency',
    category: 'Energy & Power',
    unit: '%',
    type: 'number',
    description: 'Main pump operational efficiency',
    sampleData: [87, 85, 89, 84, 88, 86, 90, 87]
  },
  {
    id: 'energy_cost',
    name: 'Energy Cost',
    category: 'Energy & Power',
    unit: 'SAR/kWh',
    type: 'number',
    description: 'Real-time energy cost',
    sampleData: [0.18, 0.19, 0.17, 0.20, 0.18, 0.16, 0.19, 0.18]
  },

  // Chemical Dosing
  {
    id: 'coagulant_dosing',
    name: 'Coagulant Dosing Rate',
    category: 'Chemical Dosing',
    unit: 'mg/L',
    type: 'number',
    description: 'Coagulant chemical dosing rate',
    sampleData: [8.5, 8.2, 8.8, 8.0, 8.6, 8.3, 8.7, 8.4]
  },
  {
    id: 'polymer_tank_level',
    name: 'Polymer Tank Level',
    category: 'Chemical Dosing',
    unit: '%',
    type: 'number',
    description: 'Polymer storage tank level',
    sampleData: [75, 72, 78, 70, 76, 73, 79, 74]
  },
  {
    id: 'chlorine_tank_level',
    name: 'Chlorine Tank Level',
    category: 'Chemical Dosing',
    unit: '%',
    type: 'number',
    description: 'Chlorine storage tank level',
    sampleData: [65, 63, 68, 61, 66, 64, 69, 65]
  },

  // Operations & Maintenance
  {
    id: 'filter_backwash_cycle',
    name: 'Filter Backwash Cycle',
    category: 'Operations',
    unit: 'hours',
    type: 'number',
    description: 'Time since last filter backwash',
    sampleData: [4.2, 4.8, 3.6, 5.1, 4.5, 3.9, 4.7, 4.3]
  },
  {
    id: 'system_uptime',
    name: 'System Uptime',
    category: 'Operations',
    unit: '%',
    type: 'number',
    description: 'Overall system availability',
    sampleData: [99.2, 99.5, 98.8, 99.7, 99.1, 99.4, 99.0, 99.3]
  },
  {
    id: 'alarm_count',
    name: 'Active Alarms',
    category: 'Operations',
    unit: 'count',
    type: 'number',
    description: 'Number of active system alarms',
    sampleData: [2, 1, 3, 0, 2, 1, 2, 1]
  },

  // Production Metrics
  {
    id: 'daily_production',
    name: 'Daily Production',
    category: 'Production',
    unit: 'm³/day',
    type: 'number',
    description: 'Daily water production volume',
    sampleData: [20400, 20800, 19600, 21600, 20760, 20160, 21360, 20520]
  },
  {
    id: 'production_efficiency',
    name: 'Production Efficiency',
    category: 'Production',
    unit: '%',
    type: 'number',
    description: 'Overall production efficiency',
    sampleData: [92, 94, 89, 96, 93, 91, 95, 92]
  },
  {
    id: 'waste_water_volume',
    name: 'Waste Water Volume',
    category: 'Production',
    unit: 'm³/day',
    type: 'number',
    description: 'Daily waste water volume',
    sampleData: [1200, 1150, 1280, 1100, 1170, 1220, 1140, 1190]
  }
]

// Generate mock time-series data
export function generateTimeSeriesData(valueId: string, hours: number = 24): { timestamp: string, value: number }[] {
  const dbValue = mockDatabaseValues.find(v => v.id === valueId)
  if (!dbValue || dbValue.type !== 'number') return []

  const data = []
  const now = new Date()
  const baseValue = dbValue.sampleData[0] as number
  
  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000)).toISOString()
    // Add some realistic variation
    const variation = (Math.random() - 0.5) * 0.1 * baseValue
    const value = Math.max(0, baseValue + variation)
    data.push({ timestamp, value })
  }
  
  return data
}

// Get current value for a database field
export function getCurrentValue(valueId: string): number | string | boolean {
  const dbValue = mockDatabaseValues.find(v => v.id === valueId)
  if (!dbValue) return 0
  
  const sampleData = dbValue.sampleData
  return sampleData[Math.floor(Math.random() * sampleData.length)]
}

// Get multiple values for multi-value widgets
export function getMultipleValues(valueIds: string[]): { [key: string]: any } {
  const result: { [key: string]: any } = {}
  valueIds.forEach(id => {
    result[id] = getCurrentValue(id)
  })
  return result
}