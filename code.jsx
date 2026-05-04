
import React, { useState, useEffect, useRef } from "react";
import { WaterSystemLayout } from '../../components/hercules-sfms/WaterSystemLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChartComponent from "@/components/hercules-sfms/ChartComponent";
import { FaSyncAlt } from "react-icons/fa";
import {
  Activity,
  Package,
  Shapes,
  TrendingUp,
  Calendar,
  Filter,
  ChevronDown,
  LucideIcon,
  Check,
  X,
  Info
} from "lucide-react";
import axios from "axios";
import { useLiveData } from '../../hooks/useLiveData';

interface KPIData {
  title: string;
  value: number | string;
  unit: string;
  icon: LucideIcon;
  color: string;
  glow: string;
}

interface Filters {
  startDate: string;
  endDate: string;
  product: string[];
  batch: string[];
  material: string[];
}

interface APIDataItem {
  "Batch GUID"?: string;
  "Product Name"?: string;
  "Material Name"?: string;
  "Batch Name"?: string;
  "Batch Act Start"?: string;
  "Actual Value Float"?: number;
  [key: string]: any;
}

// Debounce function
const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Helper to format date for datetime-local input
function toDatetimeLocalString(date: Date): string {
  if (!date) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const getDefaultDates = () => {
  const today = new Date();
  const oneDayAgo = new Date();

  oneDayAgo.setDate(today.getDate() - 1);

  // Both start & end time = 7:00 AM
  today.setHours(7, 0, 0, 0);
  oneDayAgo.setHours(7, 0, 0, 0);

  return {
    startDate: toDatetimeLocalString(oneDayAgo),
    endDate: toDatetimeLocalString(today)
  };
};

// Performance optimization: Changed from 1 month to 1 day for faster loading



// Loading Overlay Component
const LoadingOverlay: React.FC<{ isLoading: boolean; children: React.ReactNode }> = ({ isLoading, children }) => {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
          <div className="flex items-center space-x-2 text-cyan-400">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400"></div>
            <span className="text-sm font-medium">Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Custom MultiSelect Component
interface MultiSelectProps {
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  allSelectedText: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder,
  allSelectedText
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const handleOptionClick = (option: string) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter(item => item !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === options.length) return allSelectedText;
    return `${selectedValues.length} Selected`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className="w-full min-h-[2.25rem] px-3 py-2 rounded-md bg-slate-800 border border-slate-600 text-white cursor-pointer hover:border-slate-500 focus-within:border-cyan-500 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm truncate">{getDisplayText()}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-md shadow-xl max-h-64 overflow-y-auto">
          {/* Select All Option */}
          <div
            className="px-3 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-600 text-cyan-400 font-medium"
            onClick={handleSelectAll}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {selectedValues.length === options.length ? "Deselect All" : "Select All"}
              </span>
              {selectedValues.length === options.length ? (
                <X className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </div>
          </div>

          {/* Individual Options */}
          {options.map((option) => (
            <div
              key={option}
              className={`px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm flex items-center justify-between ${selectedValues.includes(option) ? 'bg-slate-700 text-cyan-300' : 'text-white'
                }`}
              onClick={() => handleOptionClick(option)}
            >
              <span className="truncate flex-1">{option}</span>
              {selectedValues.includes(option) && (
                <Check className="h-4 w-4 text-cyan-400 ml-2 flex-shrink-0" />
              )}
            </div>
          ))}

          {options.length === 0 && (
            <div className="px-3 py-2 text-slate-400 text-sm">
              No options available
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export function KPIDashboard() {
  const { data, status, startStream, stopStream, getSingleReading } = useLiveData();

  // DB3 state
  const [db3Data, setDb3Data] = useState<any>(null);
  const [db3Status, setDb3Status] = useState({
    connected: false,
    lastUpdated: null as string | null,
    error: null as string | null
  });

  const getDefaultDates = () => {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    today.setHours(7, 0, 0, 0);
    oneMonthAgo.setHours(7, 0, 0, 0);

    return {
      startDate: toDatetimeLocalString(oneMonthAgo),
      endDate: toDatetimeLocalString(today)
    };
  };

  const defaultDates = getDefaultDates();

  const [filters, setFilters] = useState<Filters>({
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    product: [],
    batch: [],
    material: [],
  });

  const [kpiData, setKpiData] = useState<KPIData[]>([]);
  const [barChartData, setBarChartData] = useState({ labels: [] as string[], values: [] as number[] });
  const [lineChartData, setLineChartData] = useState({ labels: [] as string[], values: [] as number[] });
  const [pieChartData, setPieChartData] = useState({ labels: [] as string[], values: [] as number[] });
  const [batchesByWeekdayData, setBatchesByWeekdayData] = useState({ labels: [] as string[], values: [] as number[] });
  const [efficiencyComplexityData, setEfficiencyComplexityData] = useState({ labels: [] as string[], values: [] as number[] });
  const [plcTrendData, setPlcTrendData] = useState({ labels: [] as string[], values: [] as number[] });
  const [plcDetailedData, setPlcDetailedData] = useState<{
    labels: string[];
    datasets: { name: string; values: number[]; color: string; visible: boolean }[];
  }>({
    labels: [],
    datasets: []
  });
  const [plcChartZoom, setPlcChartZoom] = useState({ start: 0, end: 100 });
  const [plcChartControls, setPlcChartControls] = useState({
    showTemperature: true,
    showThroughput: true,
    showAmps: true,
    autoScale: true
  });
  const [showInfo, setShowInfo] = useState(false);

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(true);

  const [productNames, setProductNames] = useState<string[]>([]);
  const [batchNames, setBatchNames] = useState<string[]>([]);
  const [materialNames, setMaterialNames] = useState<string[]>([]);

  const getApiDateWithOffset = (displayDate: string): Date | null => {
    if (!displayDate) return null;
    const apiDate = new Date(displayDate);
    apiDate.setHours(apiDate.getHours() - 4);
    return apiDate;
  };

  // Helper function to check if value is finite number
  function isFiniteNumber(val: any): boolean {
    return typeof val === 'number' && isFinite(val) || (!isNaN(val) && val !== null && val !== '' && isFinite(Number(val)));
  }

  function calculateKPIsAndCharts(data: APIDataItem[]) {
    if (!Array.isArray(data)) return;

    const totalMaterialsDosed = data.length; // Each row = one material dosed
    const totalBatches = new Set(data.map(item => item["Batch GUID"])).size;
    const uniqueProductsSet = new Set<string>();
    const productCounts: Record<string, number> = {};
    const batchTimeline: Record<string, Set<string>> = {};

    // Throughput and Complexity calculation
    const productMaterialMap: Record<string, Set<string>> = {};
    data.forEach(item => {
      const product = item["Product Name"];
      const material = item["Material Name"];
      if (product && material) {
        if (!productMaterialMap[product]) {
          productMaterialMap[product] = new Set();
        }
        productMaterialMap[product].add(material);
      }
    });

    data.forEach((item) => {
      if (item["Product Name"]) {
        uniqueProductsSet.add(item["Product Name"]);
        productCounts[item["Product Name"]] = (productCounts[item["Product Name"]] || 0) + 1;
      }

      // FIXED: Count unique batches per day, not materials
      if (item["Batch Act Start"] !== "N/A" && item["Batch Act Start"]) {
        const batchDate = new Date(item["Batch Act Start"]);
        // Only include batchDate if it is within the selected date range
        if (
          !isNaN(batchDate.getTime()) &&
          filters.startDate &&
          filters.endDate &&
          batchDate >= new Date(filters.startDate) &&
          batchDate <= new Date(filters.endDate)
        ) {
          const formattedDate = batchDate.toDateString();
          const batchGUID = item["Batch GUID"] || "unknown";

          // Initialize batch set for this date if it doesn't exist
          if (!batchTimeline[formattedDate]) {
            batchTimeline[formattedDate] = new Set();
          }
          // Add this batch GUID to the set for this date
          batchTimeline[formattedDate].add(batchGUID);
        }
      }
    });

    // Convert batch sets to counts
    const batchTimelineCounts: Record<string, number> = {};
    Object.keys(batchTimeline).forEach(date => {
      batchTimelineCounts[date] = batchTimeline[date].size;
    });

    // After filling batchTimeline, ensure all dates in the selected range are present with 0 if missing
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(0, 0, 0, 0);
      for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
        const formattedDate = d.toDateString();
        if (!(formattedDate in batchTimelineCounts)) {
          batchTimelineCounts[formattedDate] = 0;
        }
      }
    }

    // Sort batchTimeline by date and filter out any date before selected range
    const sortedBatchTimeline = Object.keys(batchTimelineCounts)
      .map(dateStr => new Date(dateStr))
      .filter(dateObj => dateObj >= new Date(filters.startDate))
      .sort((a, b) => a.getTime() - b.getTime())
      .map(dateObj => dateObj.toDateString());
    const filteredBatchTimeline: Record<string, number> = {};
    for (const dateStr of sortedBatchTimeline) {
      filteredBatchTimeline[dateStr] = batchTimelineCounts[dateStr];
    }

    // Update unique material names for dropdowns
    const uniqueMaterialNames = Array.from(
      new Set(data.map((item) => item["Material Name"]).filter((name): name is string => !!name))
    );
    setMaterialNames(uniqueMaterialNames);

    const uniqueProducts = uniqueProductsSet.size || 1;
    const batchesPerProduct = (totalBatches / uniqueProducts).toFixed(2);

    // Find the most recent (latest) valid Batch Act Start date
    let latestBatchDate = "N/A";
    const validBatchDates = data
      .map(item => item["Batch Act Start"])
      .filter((dateStr): dateStr is string => {
        return typeof dateStr === 'string' && dateStr !== "N/A" && !isNaN(new Date(dateStr).getTime());
      });
    if (validBatchDates.length > 0) {
      const maxDate = new Date(Math.max(...validBatchDates.map(dateStr => new Date(dateStr).getTime())));
      latestBatchDate = maxDate.toDateString();
    }

    const calculatedKpis = [
      { title: "Total Batches", value: totalBatches, unit: "batches", icon: Activity, color: "from-cyan-500 to-blue-500", glow: "shadow-[0_0_20px_rgba(0,255,255,0.3)]" },
      { title: "Total Materials", value: totalMaterialsDosed, unit: "dosed", icon: Package, color: "from-yellow-500 to-orange-500", glow: "shadow-[0_0_20px_rgba(255,193,7,0.3)]" },
      { title: "Unique Products", value: uniqueProducts, unit: "types", icon: Shapes, color: "from-purple-500 to-pink-500", glow: "shadow-[0_0_20px_rgba(168,85,247,0.3)]" },
      { title: "Avg Batches/Product", value: batchesPerProduct, unit: "", icon: TrendingUp, color: "from-emerald-500 to-green-500", glow: "shadow-[0_0_20px_rgba(16,185,129,0.3)]" },
      { title: "Latest Batch Date", value: latestBatchDate, unit: "", icon: Calendar, color: "from-slate-500 to-gray-500", glow: "shadow-[0_0_20px_rgba(148,163,184,0.3)]" },
    ];
    setKpiData(calculatedKpis);

    
    // For Historical Material dosed per day
    const historicalTimeline: Record<string, number> = {};
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(0, 0, 0, 0);
      for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
        const formattedDate = d.toDateString();
        historicalTimeline[formattedDate] = 0;
      }
    }

    // Calculate materials dosed weight per day using Actual Value Float
    data.forEach((item) => {
      if (item["Batch Act Start"] !== "N/A") {
        const batchDate = new Date(item["Batch Act Start"] || '');
        // Only include batchDate if it is within the selected date range
        if (
          !isNaN(batchDate.getTime()) &&
          filters.startDate &&
          filters.endDate &&
          batchDate >= new Date(filters.startDate) &&
          batchDate <= new Date(filters.endDate)
        ) {
          const formattedDate = batchDate.toDateString();
          // Step 1: Sum of Actual Value Float for each material
          const actualValueFloat = Number(item["Actual Value Float"] || 0);
          // Step 2: Convert to tons (kg to tons)
          const materialWeightTons = actualValueFloat / 1000;
          // Step 3: Add to daily total for all materials
          historicalTimeline[formattedDate] = (historicalTimeline[formattedDate] || 0) + materialWeightTons;
        }
      }
    });

    const sortedHistoricalTimeline = Object.keys(historicalTimeline)
      .map(dateStr => new Date(dateStr))
      .filter(dateObj => dateObj >= new Date(filters.startDate))
      .sort((a, b) => a.getTime() - b.getTime())
      .map(dateObj => dateObj.toDateString());
    const filteredHistoricalTimeline: Record<string, number> = {};
    for (const dateStr of sortedHistoricalTimeline) {
      filteredHistoricalTimeline[dateStr] = historicalTimeline[dateStr];
    }

    // Count unique batches per weekday
    const productionByDaySets: Record<string, Set<string>> = {
      Monday: new Set(),
      Tuesday: new Set(),
      Wednesday: new Set(),
      Thursday: new Set(),
      Friday: new Set(),
      Saturday: new Set(),
      Sunday: new Set(),
    };
    data.forEach((item) => {
      const batchDate = new Date(item["Batch Act Start"] || '');
      const dayOfWeek = batchDate.toLocaleDateString("en-US", { weekday: "long" });
      const batchGUID = item["Batch GUID"] || "unknown";
      if (productionByDaySets.hasOwnProperty(dayOfWeek)) {
        productionByDaySets[dayOfWeek].add(batchGUID);
      }
    });
    // Convert sets to counts for charting
    const productionByDay: Record<string, number> = {};
    Object.keys(productionByDaySets).forEach(day => {
      productionByDay[day] = productionByDaySets[day].size;
    });

    // Efficiency & Complexity: Unique material count per product
    const efficiencyComplexity = Object.entries(productMaterialMap).map(
      ([product, materialsSet]) => ({ product, uniqueMaterials: materialsSet.size })
    );

    // Set chart data with proper sorting and filtering
    setBarChartData({ labels: Object.keys(filteredHistoricalTimeline), values: Object.values(filteredHistoricalTimeline) });
    setLineChartData({ labels: Object.keys(filteredBatchTimeline), values: Object.values(filteredBatchTimeline) });
    setPieChartData({ labels: Object.keys(productCounts), values: Object.values(productCounts) });
    setBatchesByWeekdayData({ labels: Object.keys(productionByDay), values: Object.values(productionByDay) });
    setEfficiencyComplexityData({
      labels: efficiencyComplexity.map(e => e.product),
      values: efficiencyComplexity.map(e => e.uniqueMaterials),
    });
  }

  const fetchGraphData = async () => {
    try {
      // Skip data fetching if initial load isn't complete
      if (!initialLoadComplete) {
        return;
      }

      // Make sure we have dates to query with
      if (!filters.startDate || !filters.endDate) {
        return;
      }

      setDataLoading(true);
      setError(null);

      // Prepare API URL with query parameters
      let apiUrl = "http://localhost:5002/api/kpi";
      const params = new URLSearchParams();

      // Apply 4-hour offset to start date for API call
      const apiStartDate = getApiDateWithOffset(filters.startDate);
      const apiEndDate = getApiDateWithOffset(filters.endDate);
      if (apiStartDate) params.append('startDate', apiStartDate.toISOString());
      if (apiEndDate) params.append('endDate', apiEndDate.toISOString());
      params.append('strictDateFilter', 'true');
      params.append('page', '1');
      params.append('limit', '10000'); // Performance optimization: Limited to 10k records for faster loading

      // Handle multi-select filters
      if (filters.batch.length > 0) {
        filters.batch.forEach(batch => params.append('batch', batch));
      }

      if (filters.product.length > 0) {
        filters.product.forEach(product => params.append('product', product));
      }

      if (filters.material.length > 0) {
        filters.material.forEach(material => params.append('material', material));
      }

      apiUrl += '?' + params.toString();

      const response = await axios.get(apiUrl);
      let data = response.data;

      // Parse if string
      if (typeof data === "string") {
        try {
          data = JSON.parse(data.replace(/NaN/g, "null"));
        } catch (parseError) {
          console.error("Error parsing JSON:", parseError instanceof Error ? parseError.message : 'Unknown error');
          setError(new Error("Failed to parse server response"));
          return;
        }
      }

      // If data is an object with nested array
      if (!Array.isArray(data)) {
        if (Array.isArray(data.result)) {
          data = data.result;
        } else if (Array.isArray(data.data)) {
          data = data.data;
        } else {
          console.error("Expected an array but got:", typeof data);
          setError(new Error("Invalid data format received from server"));
          return;
        }
      }

      // Final check
      if (!Array.isArray(data)) {
        console.error("Data is not an array after processing");
        setError(new Error("Data processing failed"));
        return;
      }

      // Set unique values for dropdowns
      setBatchNames(
        Array.from(new Set(data.map((item) => item["Batch Name"] || "Unknown")))
      );
      setProductNames(
        Array.from(new Set(data.map((item) => item["Product Name"] || "Unknown")))
      );
      setMaterialNames(
        Array.from(new Set(data.map((item) => item["Material Name"] || "Unknown")))
      );

      calculateKPIsAndCharts(data);
    } catch (error) {
      console.error("Error fetching graph data:", error);
      setError(error instanceof Error ? error : new Error('Unknown error occurred'));
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    // Create debounced version of fetchGraphData
    const debouncedFetch = debounce(fetchGraphData, 500);

    // Call the debounced function
    debouncedFetch();

    // Cleanup
    return () => {
      // Note: Our simple debounce doesn't have cancel, but this is where it would go
    };
  }, [
    filters.startDate,
    filters.endDate,
    filters.batch,
    filters.product,
    filters.material,
    initialLoadComplete
  ]);

  const handleApplyFilters = () => {
    // Set the initialLoadComplete flag to true when Apply is clicked
    setInitialLoadComplete(true);
    fetchGraphData();
  };

  // Transform live data to match the expected format
  const liveDB4Data = data ? [
    { label: "Pellet1_TonHr", value: data.pellet1_ton_hr.toFixed(2) },
    { label: "Pellet2_TonHr", value: data.pellet2_ton_hr.toFixed(2) },
    { label: "Pellet3_TonHr", value: data.pellet3_ton_hr.toFixed(2) },
    { label: "Pellet1_KwTon", value: data.pellet1_kw_ton.toFixed(2) },
    { label: "Pellet2_KwTon", value: data.pellet2_kw_ton.toFixed(2) },
    { label: "Pellet3_KwTon", value: data.pellet3_kw_ton.toFixed(2) },
    { label: "Pellet1_Temp", value: data.pellet1_temp.toFixed(2) },
    { label: "Pellet2_Temp", value: data.pellet2_temp.toFixed(2) },
    { label: "Pellet3_Temp", value: data.pellet3_temp.toFixed(2) },
  ] : [];

  // Transform DB3 data to match the expected format
  const liveDB3Data = db3Data ? [
    { label: "HammerMill_Amp", value: db3Data.hammermill_amp?.toFixed(2) || '0.00' },
    { label: "RollerMill_Amp", value: db3Data.rollermill_amp?.toFixed(2) || '0.00' },
  ] : [];

  // Fetch DB3 data
  const fetchDB3Data = async () => {
    try {
      const response = await fetch('http://localhost:5002/api/db3/live/read');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setDb3Data(result);
      setDb3Status({
        connected: true,
        lastUpdated: new Date().toISOString(),
        error: null
      });
    } catch (err: any) {
      console.error('Error fetching DB3 data:', err);
      setDb3Status({
        connected: false,
        lastUpdated: null,
        error: err.message
      });
    }
  };

  // Fetch DB3 data on component mount and when streaming starts
  useEffect(() => {
    fetchDB3Data(); // Initial fetch

    if (status.streaming) {
      const interval = setInterval(fetchDB3Data, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [status.streaming]);

  // Update PLC trend data when live data changes
  useEffect(() => {
    const updatePlcTrendData = () => {
      const now = new Date();
      const timeLabel = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Get current values from live data
      const currentValues = [];

      // DB4 values (normalize to similar scale)
      if (data) {
        currentValues.push(
          data.pellet1_ton_hr || 0,
          data.pellet2_ton_hr || 0,
          data.pellet3_ton_hr || 0,
          (data.pellet1_temp || 0) / 10, // Scale down temperature
          (data.pellet2_temp || 0) / 10,
          (data.pellet3_temp || 0) / 10
        );
      }

      // DB3 values
      if (db3Data) {
        currentValues.push(
          (db3Data.hammermill_amp || 0) / 10, // Scale down amps
          (db3Data.rollermill_amp || 0) / 10
        );
      }

      // Calculate average value for trend
      const avgValue = currentValues.length > 0
        ? currentValues.reduce((sum, val) => sum + val, 0) / currentValues.length
        : 0;

      setPlcTrendData(prev => {
        const newLabels = [...prev.labels, timeLabel];
        const newValues = [...prev.values, avgValue];

        // Keep only last 20 data points for performance
        if (newLabels.length > 20) {
          return {
            labels: newLabels.slice(-20),
            values: newValues.slice(-20)
          };
        }

        return { labels: newLabels, values: newValues };
      });

      // Update detailed datasets for individual metrics
      setPlcDetailedData(prev => {
        const newLabels = [...prev.labels, timeLabel];

        // Keep only last 20 data points for performance
        if (newLabels.length > 20) {
          newLabels.splice(0, newLabels.length - 20);
        }

        const newDatasets = [
          // Throughput metrics
          {
            name: 'Pellet1_TonHr',
            values: [...(prev.datasets.find(d => d.name === 'Pellet1_TonHr')?.values || []), data?.pellet1_ton_hr || 0],
            color: '#3b82f6',
            visible: plcChartControls.showThroughput
          },
          {
            name: 'Pellet2_TonHr',
            values: [...(prev.datasets.find(d => d.name === 'Pellet2_TonHr')?.values || []), data?.pellet2_ton_hr || 0],
            color: '#f97316',
            visible: plcChartControls.showThroughput
          },
          {
            name: 'Pellet3_TonHr',
            values: [...(prev.datasets.find(d => d.name === 'Pellet3_TonHr')?.values || []), data?.pellet3_ton_hr || 0],
            color: '#ef4444',
            visible: plcChartControls.showThroughput
          },
          // Temperature metrics
          {
            name: 'Pellet1_Temp',
            values: [...(prev.datasets.find(d => d.name === 'Pellet1_Temp')?.values || []), data?.pellet1_temp || 0],
            color: '#06b6d4',
            visible: plcChartControls.showTemperature
          },
          {
            name: 'Pellet2_Temp',
            values: [...(prev.datasets.find(d => d.name === 'Pellet2_Temp')?.values || []), data?.pellet2_temp || 0],
            color: '#10b981',
            visible: plcChartControls.showTemperature
          },
          {
            name: 'Pellet3_Temp',
            values: [...(prev.datasets.find(d => d.name === 'Pellet3_Temp')?.values || []), data?.pellet3_temp || 0],
            color: '#f59e0b',
            visible: plcChartControls.showTemperature
          },
          // Amps metrics
          {
            name: 'HammerMill_Amp',
            values: [...(prev.datasets.find(d => d.name === 'HammerMill_Amp')?.values || []), db3Data?.hammermill_amp || 0],
            color: '#8b5cf6',
            visible: plcChartControls.showAmps
          },
          {
            name: 'RollerMill_Amp',
            values: [...(prev.datasets.find(d => d.name === 'RollerMill_Amp')?.values || []), db3Data?.rollermill_amp || 0],
            color: '#ec4899',
            visible: plcChartControls.showAmps
          }
        ];

        // Trim all datasets to match labels length
        newDatasets.forEach(dataset => {
          if (dataset.values.length > newLabels.length) {
            dataset.values = dataset.values.slice(-newLabels.length);
          }
        });

        return {
          labels: newLabels,
          datasets: newDatasets
        };
      });
    };

    // Update trend data every 2 seconds when streaming
    if (status.streaming) {
      const interval = setInterval(updatePlcTrendData, 2000);
      return () => clearInterval(interval);
    }
  }, [data, db3Data, status.streaming, plcChartControls]);

  if (loading && !initialLoadComplete) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-cyan-400 text-xl">Loading...</div>;
  if (error) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-red-400 text-xl">Error: {error.message}</div>;

  return (
    <WaterSystemLayout>
      <div className="space-y-6">
        {/* <h1 className="text-3xl font-bold text-cyan-300 tracking-wide">
          Dashboard
        </h1> */}

        <Tabs defaultValue="kpi" className="space-y-6">
          <TabsList className="inline-flex bg-transparent border-none p-0 gap-3 mx-auto justify-center w-full">
            <TabsTrigger 
              value="kpi" 
              className="custom-tab-button data-[state=active]:bg-[#007b98] data-[state=active]:text-white px-6 py-3 rounded-xl transition-all duration-200 bg-[#0088a9] text-white border border-[#0088a9] hover:bg-[#007b98] hover:text-white hover:scale-105"
              style={{ color: 'white' }}
            >
              KPI Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="plc" 
              className="custom-tab-button data-[state=active]:bg-[#007b98] data-[state=active]:text-white px-6 py-3 rounded-xl transition-all duration-200 bg-[#0088a9] text-white border border-[#0088a9] hover:bg-[#007b98] hover:text-white hover:scale-105"
              style={{ color: 'white' }}
            >
              PLC Live Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kpi" className="space-y-6">
            <Card className="bg-white/95 dark:bg-slate-900/95 border-slate-300 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-700 dark:text-cyan-300 flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Dashboard Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 text-sm">Start Date</Label>
                    <Input
                      type="datetime-local"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 rounded-md px-2 cursor-pointer hover:border-cyan-400 focus:ring-2 focus:ring-cyan-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 text-sm">End Date</Label>
                    <Input
                      type="datetime-local"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 rounded-md px-2 cursor-pointer hover:border-cyan-400 focus:ring-2 focus:ring-cyan-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 text-sm">Product</Label>
                    <MultiSelect
                      options={productNames}
                      selectedValues={filters.product}
                      onChange={(values) => setFilters({ ...filters, product: values })}
                      placeholder="All Products"
                      allSelectedText="All Products Selected"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 text-sm">Batch</Label>
                    <MultiSelect
                      options={batchNames}
                      selectedValues={filters.batch}
                      onChange={(values) => setFilters({ ...filters, batch: values })}
                      placeholder="All Batches"
                      allSelectedText="All Batches Selected"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 text-sm">Material</Label>
                    <MultiSelect
                      options={materialNames}
                      selectedValues={filters.material}
                      onChange={(values) => setFilters({ ...filters, material: values })}
                      placeholder="All Materials"
                      allSelectedText="All Materials Selected"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleApplyFilters}
                      className="custom-apply-button flex items-center gap-2 bg-[#0088a9] hover:bg-[#007b98] text-white font-medium py-2 px-4 rounded-[8px] shadow-md transition-all duration-200"
                      style={{ color: 'white' }}
                    >
                      <FaSyncAlt className="text-sm" />
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <LoadingOverlay isLoading={dataLoading}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpiData.map((kpi) => {
                  const IconComponent = kpi.icon;
                  return (
                    <Card key={kpi.title} className={`group relative bg-white/95 dark:bg-slate-900/95 border-slate-300 dark:border-slate-700 ${kpi.glow} hover:scale-[1.02] transition-all duration-300 overflow-hidden`}>
                      <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-5 group-hover:opacity-10 transition-opacity`}></div>
                      <CardContent className="p-4 relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <p className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{kpi.title}</p>
                            <div className="flex items-baseline gap-1">
                              <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{kpi.value}</p>
                              {kpi.unit && <span className="text-slate-600 dark:text-slate-400 text-xs font-medium">{kpi.unit}</span>}
                            </div>
                          </div>
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${kpi.color} shadow-lg group-hover:shadow-xl transition-shadow`}>
                            <IconComponent className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </LoadingOverlay>

            <LoadingOverlay isLoading={dataLoading}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Row - 2 Charts */}
                <Card className="bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-cyan-500/30 dark:border-cyan-500/30 light:border-slate-300 shadow-[0_0_20px_rgba(0,255,255,0.1)]">
                  <CardContent className="pt-6">
                    <ChartComponent type="bar" data={barChartData} title="Material Weight per Day (tons)" colors={['#00bfff']} />
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-emerald-500/30 dark:border-emerald-500/30 light:border-slate-300 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  <CardContent className="pt-6">
                    <ChartComponent type="pie" data={pieChartData} title="Quantity by Tons" colors={['#10b981', '#3b82f6', '#ec4899']} />
                  </CardContent>
                </Card>
                
                {/* Second Row - 2 Charts */}
                <Card className="bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-purple-500/30 dark:border-purple-500/30 light:border-slate-300 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white" style={{
                          background: 'linear-gradient(135deg, #a855f7, #06b6d4)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}>
                          PLC Live Data Trend
                        </h3>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {/* Info Button for PLC Chart */}
                        <div className="relative">
                          <button
                            onMouseEnter={() => setShowInfo(true)}
                            onMouseLeave={() => setShowInfo(false)}
                            className="p-1.5 rounded-full bg-cyan-500 hover:bg-cyan-600 border border-cyan-400 transition-all duration-200 hover:scale-110 group"
                            aria-label="PLC chart information"
                          >
                            <Info className="h-4 w-4 text-white group-hover:text-white transition-colors" />
                          </button>
                          
                          {/* Info Tooltip */}
                          {showInfo && (
                            <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-slate-800/95 dark:bg-slate-800/95 border border-cyan-500/50 dark:border-cyan-500/50 rounded-lg shadow-xl z-50 backdrop-blur-sm chart-info-tooltip">
                              <div className="text-sm text-slate-200 dark:text-slate-200 leading-relaxed">
                                <div className="font-semibold text-cyan-400 dark:text-cyan-400 mb-2 flex items-center gap-2">
                                  <Info className="h-4 w-4" />
                                  PLC Chart Information
                                </div>
                                <p className="text-slate-300 dark:text-slate-300">
                                  Real-time production monitoring dashboard. Tracks live sensor readings including: • Throughput (tons/hour) - Production speed • Temperature (°C) - Equipment health • Electrical current (amps) - Power consumption. Use to detect anomalies, monitor trends, and ensure optimal production conditions.
                                </p>
                              </div>
                              
                              {/* Tooltip Arrow */}
                              <div className="absolute -top-2 right-4 w-4 h-4 bg-slate-800/95 dark:bg-slate-800/95 border-l border-t border-cyan-500/50 dark:border-cyan-500/50 transform rotate-45 tooltip-arrow"></div>
                            </div>
                          )}
                        </div>
                        
                        {status.streaming && (
                          <div className="flex items-center gap-2 text-xs text-purple-400">
                            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                            LIVE
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Chart Controls */}
                    <div className="mb-4 p-3 bg-slate-800/50 dark:bg-slate-800/50 rounded-lg border border-slate-600/30">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {/* Metric Type Toggles */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="showThroughput"
                            checked={plcChartControls.showThroughput}
                            onChange={(e) => setPlcChartControls(prev => ({ ...prev, showThroughput: e.target.checked }))}
                            className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
                          />
                          <label htmlFor="showThroughput" className="text-slate-300">Throughput</label>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="showTemperature"
                            checked={plcChartControls.showTemperature}
                            onChange={(e) => setPlcChartControls(prev => ({ ...prev, showTemperature: e.target.checked }))}
                            className="w-4 h-4 text-cyan-600 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500"
                          />
                          <label htmlFor="showTemperature" className="text-slate-300">Temperature</label>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="showAmps"
                            checked={plcChartControls.showAmps}
                            onChange={(e) => setPlcChartControls(prev => ({ ...prev, showAmps: e.target.checked }))}
                            className="w-4 h-4 text-pink-600 bg-slate-700 border-slate-600 rounded focus:ring-pink-500"
                          />
                          <label htmlFor="showAmps" className="text-slate-300">Amps</label>
                        </div>

                        {/* Zoom Controls */}
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            onClick={() => setPlcChartZoom(prev => ({
                              start: Math.max(0, prev.start - 10),
                              end: Math.min(100, prev.end + 10)
                            }))}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 transition-colors"
                          >
                            🔍+
                          </button>
                          <button
                            onClick={() => setPlcChartZoom(prev => ({
                              start: Math.min(90, prev.start + 10),
                              end: Math.max(10, prev.end - 10)
                            }))}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 transition-colors"
                          >
                            🔍-
                          </button>
                          <button
                            onClick={() => setPlcChartZoom({ start: 0, end: 100 })}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>

                    <ChartComponent
                      type="line"
                      data={plcDetailedData}
                      title=""
                      colors={['#a855f7', '#06b6d4', '#10b981']}
                      zoom={plcChartZoom}
                      isMultiLine={true}
                    />
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-blue-500/30 dark:border-blue-500/30 light:border-slate-300 shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                  <CardContent className="pt-6">
                    <ChartComponent type="bar" data={batchesByWeekdayData} title="No. Batches by Weekday" colors={['#3b82f6', '#f97316', '#ef4444', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6']} />
                  </CardContent>
                </Card>
              </div>
            </LoadingOverlay>
          </TabsContent>

          <TabsContent value="plc" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-cyan-300">PLC Live Data</h2>
              <div className="flex items-center gap-4">
                {/* Connection Status */}
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${status.connected
                    ? 'bg-green-500/20 light:bg-green-100 text-green-400 light:text-green-700 border border-green-500/30 light:border-green-300'
                    : 'bg-red-500/20 light:bg-red-100 text-red-400 light:text-red-700 border border-red-500/30 light:border-red-300'
                  }`}>
                  {status.connected ? '🟢 Connected' : '🔴 API Disconnected'}
                </div>

                {/* Streaming Status */}
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${status.streaming
                    ? 'bg-blue-500/20 light:bg-blue-100 text-blue-400 light:text-blue-700 border border-blue-500/30 light:border-blue-300'
                    : 'bg-gray-500/20 light:bg-gray-100 text-gray-400 light:text-gray-700 border border-gray-500/30 light:border-gray-300'
                  }`}>
                  {status.streaming ? '📡 Live Polling' : '⏸️ Polling Paused'}
                </div>

                {/* Control Buttons */}
                <Button
                  onClick={status.streaming ? stopStream : startStream}
                  variant="outline"
                  size="sm"
                  className="border-cyan-500 light:border-blue-600 text-cyan-400 light:text-blue-600 hover:bg-cyan-500/20 light:hover:bg-blue-100 bg-transparent light:bg-white"
                >
                  {status.streaming ? '⏹️ Stop' : '▶️ Start'} Polling
                </Button>

                <Button
                  onClick={getSingleReading}
                  variant="outline"
                  size="sm"
                  className="border-green-500 light:border-green-600 text-green-400 light:text-green-700 hover:bg-green-500/20 light:hover:bg-green-100 bg-transparent light:bg-white"
                >
                  🔄 Refresh Pallet Data
                </Button>

                <Button
                  onClick={fetchDB3Data}
                  variant="outline"
                  size="sm"
                  className="border-blue-500 light:border-blue-600 text-blue-400 light:text-blue-600 hover:bg-blue-500/20 light:hover:bg-blue-100 bg-transparent light:bg-white"
                >
                  🔄 Refresh Mill Amps Data
                </Button>
              </div>
            </div>

            {/* Error Display */}
            {status.error && (
              <div className="bg-red-500/20 light:bg-red-100 border border-red-500/30 light:border-red-300 rounded-lg p-4 text-red-400 light:text-red-700">
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span className="font-medium">Connection Error:</span>
                  <span>{status.error}</span>
                </div>
              </div>
            )}

            <Tabs defaultValue="db4" className="space-y-4 plc-tabs">
              <TabsList className="inline-flex bg-transparent border-none p-0 gap-3 mx-auto justify-center w-full">
                <TabsTrigger 
                  value="db4" 
                  className="custom-tab-button data-[state=active]:bg-[#007b98] data-[state=active]:text-white data-[state=inactive]:bg-[#0088a9] data-[state=inactive]:text-white px-6 py-3 rounded-xl transition-all duration-200 border border-[#0088a9] hover:bg-[#007b98] hover:text-white hover:scale-105 hover:shadow-lg"
                  style={{ color: 'white' }}
                >
                  Pellet Data
                </TabsTrigger>
                <TabsTrigger 
                  value="db3" 
                  className="custom-tab-button data-[state=active]:bg-[#007b98] data-[state=active]:text-white data-[state=inactive]:bg-[#0088a9] data-[state=inactive]:text-white px-6 py-3 rounded-xl transition-all duration-200 border border-[#0088a9] hover:bg-[#007b98] hover:text-white hover:scale-105 hover:shadow-lg"
                  style={{ color: 'white' }}
                >
                  Mill Amps Data
                </TabsTrigger>
              </TabsList>

              <TabsContent value="db4">
                <Card className="bg-white dark:bg-gradient-to-r dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-cyan-500 shadow-lg dark:shadow-[0_0_12px_rgba(34,211,238,0.6)]">
                  <CardHeader>
                    <CardTitle className="text-blue-600 dark:text-cyan-400">Pellet Data</CardTitle>
                    {status.lastUpdated && (
                      <p className="text-sm text-blue-500 dark:text-cyan-300 mt-2">
                        Last Updated: {new Date(status.lastUpdated).toLocaleString()}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveDB4Data.length > 0 ? (
                      liveDB4Data.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-cyan-500/30 
                                     shadow-md dark:shadow-[0_0_8px_rgba(34,211,238,0.4)] hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(34,211,238,0.7)]
                                     transition-shadow duration-300"
                        >
                          {/* Left side: label */}
                          <p className="text-sm font-medium text-blue-600 dark:text-cyan-300">{item.label}</p>

                          {/* Right side: value */}
                          <p className="text-lg font-semibold text-green-600 dark:text-green-400 animate-pulse">
                            {item.value}
                            <span className="ml-2 text-xs text-blue-500 dark:text-cyan-400">● LIVE</span>
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full flex items-center justify-center p-8">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-cyan-400 mx-auto mb-4"></div>
                          <p className="text-blue-600 dark:text-cyan-300">Loading live data...</p>
                          {status.error && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-2">{status.error}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="db3">
                <Card className="bg-white dark:bg-gradient-to-r dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-cyan-500 shadow-lg dark:shadow-[0_0_12px_rgba(34,211,238,0.6)]">
                  <CardHeader>
                    <CardTitle className="text-blue-600 dark:text-cyan-400">Mill Amps Data</CardTitle>
                    {db3Status.lastUpdated && (
                      <p className="text-sm text-blue-500 dark:text-cyan-300 mt-2">
                        Last Updated: {new Date(db3Status.lastUpdated).toLocaleString()}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveDB3Data.length > 0 ? (
                      liveDB3Data.map((item: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-cyan-500/30 
                                     shadow-md dark:shadow-[0_0_8px_rgba(34,211,238,0.4)] hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(34,211,238,0.7)]
                                     transition-shadow duration-300"
                        >
                          {/* Left side: label */}
                          <p className="text-sm font-medium text-blue-600 dark:text-cyan-300">{item.label}</p>

                          {/* Right side: value */}
                          <p className="text-lg font-semibold text-green-600 dark:text-green-400 animate-pulse">
                            {item.value}
                            <span className="ml-2 text-xs text-blue-500 dark:text-cyan-400">● LIVE</span>
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full flex items-center justify-center p-8">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-cyan-400 mx-auto mb-4"></div>
                          <p className="text-blue-600 dark:text-cyan-300">Loading DB3 data...</p>
                          {db3Status.error && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-2">{db3Status.error}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </WaterSystemLayout>
  );
}