// API Configuration
// Use relative URLs to work with Vite proxy in development
// and with the actual domain in production

const isDevelopment = import.meta.env.DEV;

// In development, use relative URLs that will be proxied by Vite
// In production, use the actual API URL
export const API_BASE_URL = isDevelopment ? '/api' : 'http://192.168.199.160:5000/api';
export const PLC_BASE_URL = isDevelopment ? '/api/plc' : 'http://192.168.199.160:5000/api/plc';

// Export individual API endpoints
export const API_ENDPOINTS = {
  // Health check
  HEALTH: '/api/health',
  
  // Orders
  ORDERS: {
    INTAKE1: '/api/orders/intake1',
    INTAKE2: '/api/orders/intake2',
    OUTLOAD1: '/api/orders/outload1',
    OUTLOAD2: '/api/orders/outload2',
    OUTLOAD3: '/api/orders/outload3',
    BULK: '/api/orders/bulk',
    PT: '/api/orders/pt',
    MINERAL: '/api/orders/mineral',
  },
  
  // PLC
  PLC: {
    ORDERS: '/api/plc/plant/orders',
    SILOS: '/api/plc/silos',
    HEALTH: '/api/plc/health',
    INFO: '/api/plc/info',
  },
  
  // Storage
  STORAGE: '/api/storage',
  
  // Trucks
  TRUCKS: '/api/trucks',
  
  // Orders History
  ORDERS_HISTORY: {
    ACTIVE: '/api/orders/active',
    COMPLETED: '/api/orders/completed',
    HISTORY: '/api/orders/history',
    STATS: '/api/orders/stats',
  },
  
  // RFID
  RFID: '/api/rfid',
  
  // Weighbridge
  WEIGHBRIDGE: '/api/weighbridge',
  
  // Reports
  REPORTS: '/api/reports',
  
  // Production
  PRODUCTION: '/api/production',
};

export default API_ENDPOINTS;
