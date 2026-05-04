import { Facility, Alert, Metric, FacilityMetrics, ChartDataPoint } from "@shared/schema";

export const mockFacilities: Facility[] = [
  {
    id: 1,
    name: "Riyadh Central Water Treatment Plant",
    location: "Riyadh",
    status: "operational",
    dailyProduction: 2847,
    efficiency: 94,
    latitude: 24.7136,
    longitude: 46.6753,
    lastUpdated: new Date(),
  },
  {
    id: 2,
    name: "Jeddah Coastal Desalination Plant",
    location: "Jeddah",
    status: "warning",
    dailyProduction: 1923,
    efficiency: 76,
    latitude: 21.4858,
    longitude: 39.0500,
    lastUpdated: new Date(),
  },
  {
    id: 3,
    name: "Dammam Eastern Province Plant",
    location: "Dammam",
    status: "operational",
    dailyProduction: 2456,
    efficiency: 89,
    latitude: 26.4207,
    longitude: 50.0888,
    lastUpdated: new Date(),
  },
  {
    id: 4,
    name: "Medina Holy City Water Facility",
    location: "Medina",
    status: "offline",
    dailyProduction: 856,
    efficiency: 32,
    latitude: 24.4681,
    longitude: 39.6142,
    lastUpdated: new Date(),
  },
  {
    id: 5,
    name: "Mecca Holy City Water Facility",
    location: "Mecca",
    status: "operational",
    dailyProduction: 2234,
    efficiency: 87,
    latitude: 21.4269,
    longitude: 39.8800,
    lastUpdated: new Date(),
  },
  {
    id: 6,
    name: "Tabuk Northern Region Plant",
    location: "Tabuk",
    status: "operational",
    dailyProduction: 2678,
    efficiency: 91,
    latitude: 28.3998,
    longitude: 36.5700,
    lastUpdated: new Date(),
  },
  {
    id: 7,
    name: "Al-Khobar Eastern Coast Plant",
    location: "Al-Khobar",
    status: "warning",
    dailyProduction: 1756,
    efficiency: 68,
    latitude: 26.2172,
    longitude: 50.5000,
    lastUpdated: new Date(),
  },
  {
    id: 8,
    name: "Abha Southern Highlands Plant",
    location: "Abha",
    status: "operational",
    dailyProduction: 2112,
    efficiency: 85,
    latitude: 18.2164,
    longitude: 42.5053,
    lastUpdated: new Date(),
  },
  {
    id: 9,
    name: "Jubail Industrial Desalination Plant",
    location: "Jubail",
    status: "operational",
    dailyProduction: 1890,
    efficiency: 83,
    latitude: 27.0174,
    longitude: 49.2000,
    lastUpdated: new Date(),
  },
  {
    id: 10,
    name: "Ha'il Northwestern Plant",
    location: "Ha'il",
    status: "operational",
    dailyProduction: 1634,
    efficiency: 79,
    latitude: 27.5114,
    longitude: 41.6900,
    lastUpdated: new Date(),
  },
];

export const mockAlerts: Alert[] = [
  {
    id: 1,
    facilityId: 4,
    severity: "critical",
    message: "Kolkata Facility Offline",
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: 2,
    facilityId: 2,
    severity: "medium",
    message: "Delhi High Pressure Detected",
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: 3,
    facilityId: 7,
    severity: "medium",
    message: "Pune Maintenance Due",
    isActive: true,
    createdAt: new Date(),
  },
];

export const generateTimeSeriesData = (points: number = 24): ChartDataPoint[] => {
  const data: ChartDataPoint[] = [];
  const now = new Date();
  
  for (let i = points - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    data.push({
      timestamp: timestamp.toISOString(),
      value: Math.random() * 100 + 50,
    });
  }
  
  return data;
};

export const mockFacilityMetrics: FacilityMetrics = {
  flowRate: generateTimeSeriesData().map(d => ({ ...d, value: d.value * 30 + 2000 })),
  pressure: generateTimeSeriesData().map(d => ({ ...d, value: d.value * 0.05 + 3.5 })),
  energyConsumption: generateTimeSeriesData().map(d => ({ ...d, value: d.value * 2 + 100 })),
  qualityScore: generateTimeSeriesData().map(d => ({ ...d, value: Math.max(85, d.value * 0.15 + 85) })),
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case "operational":
      return "hsl(158, 100%, 50%)"; // neon-green
    case "warning":
      return "hsl(45, 100%, 50%)"; // neon-amber
    case "offline":
      return "hsl(0, 84%, 60%)"; // red
    default:
      return "hsl(240, 5%, 64.9%)"; // muted
  }
};

export const aggregateMetrics = {
  totalProduction: mockFacilities.reduce((sum, f) => sum + f.dailyProduction, 0),
  averageEfficiency: mockFacilities.reduce((sum, f) => sum + f.efficiency, 0) / mockFacilities.length,
  operationalCount: mockFacilities.filter(f => f.status === "operational").length,
  warningCount: mockFacilities.filter(f => f.status === "warning").length,
  offlineCount: mockFacilities.filter(f => f.status === "offline").length,
};
