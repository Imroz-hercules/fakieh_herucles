import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import axios from 'axios';
import { PLC_BASE_URL } from '../config/api';
import { usePolling } from '../hooks/usePolling';

interface Silo {
  bin_name: string;
  material_code: string;
  material_name: string;
  hl_active: boolean;
  lock_active: boolean;
  quantity_kg?: number | null;
  dbSource: string;
  dbType: string;
  silo_no?: number;
}

interface SiloContextType {
  allSilos: Silo[];
  db1Silos: Silo[];
  db2Silos: Silo[];
  db3Silos: Silo[];
  loading: boolean;
  error: string | null;
  lastUpdated: string;
  fetchSilos: (signal?: AbortSignal) => Promise<void>;
  getSilosForOrder: (dbType: 'intake' | 'outloading' | 'storage') => Silo[];
  getAvailableSilos: () => Silo[];
}

const SiloContext = createContext<SiloContextType | undefined>(undefined);

export const useSilos = () => {
  const context = useContext(SiloContext);
  if (context === undefined) {
    throw new Error('useSilos must be used within a SiloProvider');
  }
  return context;
};

interface SiloProviderProps {
  children: ReactNode;
}

export const SiloProvider: React.FC<SiloProviderProps> = ({ children }) => {
  const [allSilos, setAllSilos] = useState<Silo[]>([]);
  const [db1Silos, setDb1Silos] = useState<Silo[]>([]);
  const [db2Silos, setDb2Silos] = useState<Silo[]>([]);
  const [db3Silos, setDb3Silos] = useState<Silo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Guards against overlapping /silos calls (the endpoint can take seconds when
  // the PLC is slow; without this, callers stack requests and starve other XHR).
  const inFlightRef = useRef(false);

  const fetchSilos = async (signal?: AbortSignal) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      setError(null);

      // Fetch all silos from the unified endpoint
      const response = await axios.get(`${PLC_BASE_URL}/silos`, { signal });
      const allSilosData = response.data;
      
      // Filter silos by database and add source information
      const db1SilosWithSource = allSilosData
        .filter((silo: any) => silo.dbNo === 1)
        .map((silo: any) => ({ 
          bin_name: silo.binName,
          material_code: silo.materialCode,
          material_name: silo.materialName,
          hl_active: silo.hlActive,
          lock_active: silo.lockActive,
          quantity_kg: silo.quantityKg ?? 0,
          updated_at: silo.updatedAt,
          dbSource: 'DB1', 
          dbType: 'Intake',
          silo_no: silo.siloNo || parseInt(silo.binName.replace('Silo ', '')) || 0
        }));
      
      const db2SilosWithSource = allSilosData
        .filter((silo: any) => silo.dbNo === 2)
        .map((silo: any) => ({ 
          bin_name: silo.binName,
          material_code: silo.materialCode,
          material_name: silo.materialName,
          hl_active: silo.hlActive,
          lock_active: silo.lockActive,
          quantity_kg: silo.quantityKg ?? 0,
          updated_at: silo.updatedAt,
          dbSource: 'DB2', 
          dbType: 'Outloading',
          silo_no: silo.siloNo || parseInt(silo.binName.replace('Silo ', '')) || 0
        }));
      
      const db3SilosWithSource = allSilosData
        .filter((silo: any) => silo.dbNo === 3)
        .map((silo: any) => ({ 
          bin_name: silo.binName,
          material_code: silo.materialCode,
          material_name: silo.materialName,
          hl_active: silo.hlActive,
          lock_active: silo.lockActive,
          quantity_kg: silo.quantityKg ?? 0,
          updated_at: silo.updatedAt,
          dbSource: 'DB3', 
          dbType: 'Mineral',
          silo_no: silo.siloNo || parseInt(silo.binName.replace('Silo ', '')) || 0
        }));

      setDb1Silos(db1SilosWithSource);
      setDb2Silos(db2SilosWithSource);
      setDb3Silos(db3SilosWithSource);

      // Combine all silos
      const combinedSilos = [...db1SilosWithSource, ...db2SilosWithSource, ...db3SilosWithSource];
      setAllSilos(combinedSilos);

      setLastUpdated(new Date().toLocaleTimeString());

    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'CanceledError' || name === 'AbortError') return;
      setError("Failed to load silo data. Please check your connection.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  // Get silos filtered by type for order creation
  const getSilosForOrder = (dbType: 'intake' | 'outloading' | 'storage'): Silo[] => {
    switch (dbType) {
      case 'intake':
        return db1Silos.filter(silo => silo.material_code || silo.material_name);
      case 'outloading':
        return db2Silos.filter(silo => silo.material_code || silo.material_name);
      case 'storage':
        return db3Silos.filter(silo => silo.material_code || silo.material_name);
      default:
        return [];
    }
  };

  // Get all available silos (with materials)
  const getAvailableSilos = (): Silo[] => {
    return allSilos.filter(silo => silo.material_code || silo.material_name);
  };

  // NOTE: the provider deliberately does NOT poll. It used to refetch /silos
  // every 10s for the whole app, so pages that never show silos (Truck Entry,
  // Dashboard, Reports…) still paid for a slow PLC call on every tick.
  // Pages that need live silo data opt in with `useSilosPolling()` below.
  // A single fetch on mount keeps first render populated for consumers.
  useEffect(() => {
    void fetchSilos();
  }, []);

  const value: SiloContextType = {
    allSilos,
    db1Silos,
    db2Silos,
    db3Silos,
    loading,
    error,
    lastUpdated,
    fetchSilos,
    getSilosForOrder,
    getAvailableSilos,
  };

  return (
    <SiloContext.Provider value={value}>
      {children}
    </SiloContext.Provider>
  );
};

/**
 * Opt-in live silo polling. Call this ONLY from pages that display live silo
 * state (Orders, Storage). Non-overlapping via usePolling + the provider's
 * in-flight guard, so a slow /silos response can never stack up.
 */
export function useSilosPolling(intervalMs = 15000, enabled = true) {
  const { fetchSilos } = useSilos();
  usePolling(async (signal) => {
    await fetchSilos(signal);
  }, intervalMs, enabled);
}
