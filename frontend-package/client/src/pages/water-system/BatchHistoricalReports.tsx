import React, { useState, useMemo, useEffect, useRef } from "react";
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Printer, Calendar, Loader2, AlertCircle, CheckCircle, X, ChevronDown, Check } from 'lucide-react';
import axios from 'axios';
import { API_ENDPOINTS } from '@/config/api';
import { fetchAllKpiPages } from '@/utils/kpiFetchAll';
import asmLogo from '@/assets/Asm_Logo.png';
import fakiehBrandLogo from '@/assets/fakiehlogo.webp';
import herculesLogo from '@/assets/Hercules_New.png';

const tabs = [
  "Product Batch Summary",
  "Weekly",
  "Monthly",
  "Daily Report",
  "Detailed Report",
  "Material Consumption Report",
  "Total Material Consumption",
];

/** Axios ceiling for large historical payloads (server can exceed 30s on wide ranges). */
const LARGE_REPORT_TIMEOUT_MS = 120_000;

// Helper function to get default dates (yesterday like new system)
const getDefaultDates = () => {
  // Get current time in UTC
  const now = new Date();
  const utcTime = new Date(now.toLocaleString("en-US", {timeZone: "UTC"}));
  
  // Set start date to yesterday at 7 AM UTC
  const startDate = new Date(utcTime);
  startDate.setDate(utcTime.getDate() - 1);
  startDate.setHours(7, 0, 0, 0);

  // Set end date to today at 7 AM UTC (end of yesterday)
  const endDate = new Date(utcTime);
  endDate.setHours(7, 0, 0, 0);

  // Format for datetime-local input (YYYY-MM-DDTHH:MM)
  const formatForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const result = {
    startDate: formatForInput(startDate),
    endDate: formatForInput(endDate)
  };


  return result;
};

// Helper function to get specific date defaults for weekly, daily, monthly filters
// 4-hour offset function like in old code
const getApiDateWithOffset = (displayDate: Date) => {
  if (!displayDate) return null;
  // Create a new date object to avoid modifying the original
  const apiDate = new Date(displayDate);
  // Subtract 4 hours from the display date for API calls
  apiDate.setHours(apiDate.getHours() - 4);
  return apiDate;
};

// Helper function to format dates to UTC with 12-hour format
const formatToUTC = (dateString: string) => {
  if (!dateString || dateString === 'N/A') return 'N/A';
  
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    // Format to UTC with 12-hour format
    return date.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch (error) {
    return 'Invalid Date';
  }
};

// Helper function to format dates to local time with 4-hour offset applied
const formatToLocalCustom = (dateString: string, includeSeconds: boolean = false) => {
  if (!dateString || dateString === 'N/A') return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    // Apply 4-hour offset to the date (subtract 4 hours)
    const offsetDate = new Date(date.getTime() - (4 * 60 * 60 * 1000));
    
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    
    if (includeSeconds) {
      options.second = '2-digit';
    }
    
    return offsetDate.toLocaleString('en-US', options);
  } catch (error) {
    return 'Invalid Date';
  }
};

const getSpecificDateDefaults = () => {
  // Get current time in UTC
  const now = new Date();
  const utcTime = new Date(now.toLocaleString("en-US", {timeZone: "UTC"}));

  // Last day start date (yesterday at 7 AM UTC)
  const lastDay = new Date(utcTime);
  lastDay.setDate(utcTime.getDate() - 1);
  lastDay.setHours(7, 0, 0, 0);

  // Last week start date (last Monday at 7 AM UTC)
  const lastWeekStart = new Date(utcTime);
  const dayOfWeek = utcTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If today is Sunday, go back 6 days to last Monday
  lastWeekStart.setDate(utcTime.getDate() - daysToSubtract - 7); // Go back to last week's Monday
  lastWeekStart.setHours(7, 0, 0, 0);

  // Monthly start date (first day of previous month at 7 AM UTC)
  const lastMonthStart = new Date(utcTime.getFullYear(), utcTime.getMonth() - 1, 1, 7, 0, 0);

  // Format for datetime-local input (YYYY-MM-DDTHH:MM)
  const formatForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const result = {
    weeklyStart: formatForInput(lastWeekStart),
    dailyStart: formatForInput(lastDay),
    monthlyStart: formatForInput(lastMonthStart)
  };


  return result;
};


// Custom MultiSelect Component
interface MultiSelectProps {
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  allSelectedText: string;
  onDeselectAll?: () => void; // Callback for when deselecting all
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder,
  allSelectedText,
  onDeselectAll
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
      // Deselect all — but keep dropdown open
      onChange([]);
      setIsOpen(true);
      // Call the callback to refresh options from backend
      if (onDeselectAll) {
        onDeselectAll();
      }
    } else {
      // Select all
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
    if (selectedValues.length === 0) return `${placeholder} (${options.length} available)`;
    if (selectedValues.length === options.length) return allSelectedText;
    if (selectedValues.length === 1) {
      const label = selectedValues[0];
      const short = label.length > 42 ? `${label.slice(0, 39)}…` : label;
      return `${short} (${options.length} available)`;
    }
    return `${selectedValues.length} Selected (${options.length} available)`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`w-full min-h-[1.75rem] px-2 py-1 rounded-md bg-slate-800 dark:bg-slate-800 bg-white border border-slate-600 dark:border-slate-600 border-slate-300 text-white dark:text-white text-slate-900 cursor-pointer hover:border-cyan-400 focus-within:border-cyan-500 transition-all duration-200 text-xs h-7 ${
          options.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={() => options.length > 0 && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs truncate">{getDisplayText()}</span>
          <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 bg-white border border-slate-600 dark:border-slate-600 border-slate-300 rounded-md shadow-xl max-h-48 overflow-y-auto">
          {/* Select All Option */}
          <div
            className="px-2 py-1 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-slate-100 cursor-pointer border-b border-slate-600 dark:border-slate-600 border-slate-300 text-cyan-400 dark:text-cyan-400 text-cyan-600 font-medium text-xs"
            onClick={handleSelectAll}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs">
                {selectedValues.length === options.length ? "Deselect All" : "Select All"}
              </span>
              {selectedValues.length === options.length ? (
                <X className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </div>
          </div>

          {/* Individual Options */}
          {options.map((option) => (
            <div
              key={option}
              className={`px-2 py-1 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-slate-100 cursor-pointer text-xs flex items-center justify-between ${selectedValues.includes(option) ? 'bg-slate-700 dark:bg-slate-700 bg-slate-100 text-cyan-300 dark:text-cyan-300 text-cyan-600' : 'text-white dark:text-white text-slate-900'
                }`}
              onClick={() => handleOptionClick(option)}
            >
              <span className="truncate flex-1 text-xs">{option}</span>
              {selectedValues.includes(option) && (
                <Check className="h-3 w-3 text-cyan-400 dark:text-cyan-400 text-cyan-600 ml-1 flex-shrink-0" />
              )}
            </div>
          ))}

          {options.length === 0 && (
            <div className="px-2 py-1 text-slate-400 dark:text-slate-400 text-slate-600 text-xs">
              No options available - try adjusting other filters
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export function BatchHistoricalReports() {
  const [defaultDates, setDefaultDates] = useState(getDefaultDates());
  const specificDefaults = getSpecificDateDefaults();
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [activeTab, setActiveTab] = useState("Product Batch Summary");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50); // Increased from 10 to 50 to show more data

  // Simple aggregation functions (defined at the top) - matching old system exactly
  const aggregateByProduct = (data: any[], period: string) => {
    const groups: { [key: string]: any } = {};

    data.forEach((item: any) => {
      const productName = item.productName || 'Unknown';
      if (!groups[productName]) {
        groups[productName] = {
          productName,
          noOfBatches: 0,
          sumSP: 0,
          sumAct: 0,
          errKg: 0,
          errPercent: 0,
          countedBatches: new Set() // Track unique batches like old system
        };
      }

      // Only increment batch count for unique batches (like old system)
      const batchKey = `${item.batchGuid}-${item.productName}`;
      if (!groups[productName].countedBatches.has(batchKey)) {
        groups[productName].countedBatches.add(batchKey);
        groups[productName].noOfBatches++;
      }

      // For Daily Report, sum ALL occurrences of materials (even duplicates in same batch)
      // This ensures proper aggregation when same material appears multiple times in one batch
      groups[productName].sumSP += Number(item.setPointFloat) || 0;
      groups[productName].sumAct += Number(item.actualValueFloat) || 0;
    });

    // Calculate error values
    Object.values(groups).forEach((group: any) => {
      delete group.countedBatches; // Remove the Set from final output
      group.errKg = Math.abs(group.sumAct - group.sumSP).toFixed(2);
      group.errPercent = group.sumSP !== 0 ? ((group.errKg / group.sumSP) * 100).toFixed(2) : "0.00";
    });

    return Object.values(groups);
  };

  const aggregateByMaterial = (data: any[]) => {
    const groups: { [key: string]: any } = {};

    data.forEach((item: any) => {
      const materialName = item.materialName || 'Unknown';
      if (!groups[materialName]) {
        groups[materialName] = {
          materialName,
          code: item.materialCode || '',
          plannedKG: 0,
          actualKG: 0,
          differencePercent: 0
        };
      }

      groups[materialName].plannedKG += item.setPointFloat || 0;
      groups[materialName].actualKG += item.actualValueFloat || 0;
    });

    // Calculate difference percentage (absolute value)
    Object.values(groups).forEach((group: any) => {
      group.differencePercent = group.plannedKG !== 0 ?
        (Math.abs(((group.actualKG - group.plannedKG) / group.plannedKG) * 100)).toFixed(2) : "0.00";
    });

    return Object.values(groups);
  };

  // Pending filter values (UI) - now arrays for multi-select
  const [pendingProduct, setPendingProduct] = useState<string[]>([]);
  const [pendingBatch, setPendingBatch] = useState<string[]>([]);
  const [pendingMaterial, setPendingMaterial] = useState<string[]>([]);
  const [pendingStartDate, setPendingStartDate] = useState(defaultDates.startDate);
  const [pendingEndDate, setPendingEndDate] = useState(defaultDates.endDate);

  // Applied filter values (used for filtering) - now arrays for multi-select
  const [selectedProduct, setSelectedProduct] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<string[]>([]);
  const [appliedStartDate, setAppliedStartDate] = useState(defaultDates.startDate);
  const [appliedEndDate, setAppliedEndDate] = useState(defaultDates.endDate);

  // Specific date filters for weekly, monthly, and daily reports
  const [weeklyStartDate, setWeeklyStartDate] = useState(specificDefaults.weeklyStart);

  // Report data state variables (like old TableView.jsx) - separate for each report type
  const [dailyReportData, setDailyReportData] = useState<any[]>([]);
  const [weeklyReportData, setWeeklyReportData] = useState<any[]>([]);
  const [monthlyReportData, setMonthlyReportData] = useState<any[]>([]);
  const [monthlyStartDate, setMonthlyStartDate] = useState(specificDefaults.monthlyStart);
  const [dailyStartDate, setDailyStartDate] = useState(specificDefaults.dailyStart);

  // Data and loading states
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  
  // Filter options from backend
  const [allProductOptions, setAllProductOptions] = useState<string[]>([]);
  const [allBatchOptions, setAllBatchOptions] = useState<string[]>([]);
  const [allMaterialOptions, setAllMaterialOptions] = useState<string[]>([]);
  
  // Toast notification state
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // Fetch filter options from backend
  const fetchFilterOptions = async () => {
    try {
      const apiUrl = API_ENDPOINTS.BATCH_FILTER_OPTIONS;
      const params = new URLSearchParams();
      
      // Use the applied filter dates for API call
      const startDate = new Date(appliedStartDate);
      const endDate = new Date(appliedEndDate);
      
      // Don't apply 4-hour offset for filter options - use exact dates as selected
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      
      const fullUrl = apiUrl + '?' + params.toString();
      
      const response = await axios.get(fullUrl, {
        timeout: LARGE_REPORT_TIMEOUT_MS,
      });
      
      const data = response.data;
      
      if (data.products) {
        setAllProductOptions(data.products);
      }
      if (data.batches) {
        setAllBatchOptions(data.batches);
      }
      if (data.materials) {
        setAllMaterialOptions(data.materials);
      }
      
      
    } catch (err) {
      // Don't show error toast for filter options as it's not critical
    }
  };

  // Fetch data from backend (using old integration logic)
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress('Connecting to server...');

    try {
      // Use /api/kpi endpoint with strictDateFilter like old system
      const apiUrl = API_ENDPOINTS.BATCH_KPI;
      const params = new URLSearchParams();

      // Use the applied filter dates for API call (more efficient)
      const startDate = new Date(appliedStartDate);
      const endDate = new Date(appliedEndDate);

      // Don't apply 4-hour offset for Reports - use exact dates as selected
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      params.append('strictDateFilter', 'true');

      // Apply filters if available - handle arrays
      if (selectedBatch.length > 0) {
        selectedBatch.forEach(batch => params.append('batch', batch));
      }

      if (selectedProduct.length > 0) {
        selectedProduct.forEach(product => params.append('product', product));
      }

      if (selectedMaterial.length > 0) {
        selectedMaterial.forEach(material => params.append('material', material));
      }

      setLoadingProgress('Fetching data from server...');
      const data = (await fetchAllKpiPages(apiUrl, params, {
        timeout: LARGE_REPORT_TIMEOUT_MS,
      })) as Record<string, unknown>[];

      setLoadingProgress('Processing data...');

      // Format the data to ensure all required properties are properly mapped (like old code)
      const formattedData = data.map((item: any) => ({
        // Map the API response fields to the expected property names
        batchName: item["Batch Name"] || item.batchName || "Unknown",
        batchGuid: item["Batch GUID"] || item.batchGuid || "Unknown",
        productName: item["Product Name"] || item.productName || "Unknown",
        materialName: item["Material Name"] || item.materialName || "Unknown",
        materialCode: item["Material Code"] || item.materialCode || "Unknown",
        batchStart: item["Batch Act Start"] || item.batchStart || "N/A",
        batchEnd: item["Batch Act End"] || item.batchEnd || "N/A",
        quantity: item["Batch Quantity"] || item["Quantity"] || item.quantity || 0,
        setPointFloat: parseFloat(item["SetPoint Float"] || item["SetPoint Material Usage"] || item.setPointFloat || 0),
        actualValueFloat: parseFloat(item["Actual Value Float"] || item["Actual Material Usage"] || item.actualValueFloat || 0),
        sourceServer: item["Source Server"] || item.sourceServer || "Unknown",
        orderId: item["OrderId"] || item.orderId || "Unknown",
        batchQuantity: item["Batch Quantity"] || item["Quantity"] || item.batchQuantity || 0,
      }));

      setLoadingProgress(`Loaded ${formattedData.length} records`);
      setRawData(formattedData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  // Initialize main filter dates only once on component mount
  useEffect(() => {
    // Set initial dates only once
    setPendingStartDate(defaultDates.startDate);
    setPendingEndDate(defaultDates.endDate);
    setAppliedStartDate(defaultDates.startDate);
    setAppliedEndDate(defaultDates.endDate);
    
    // Fetch initial filter options
    fetchFilterOptions();
  }, []); // Empty dependency array means this runs only once on mount


  // Fetch /api/kpi only for Product Batch Summary (Detailed Report uses /api/reports daily — avoids duplicate mega-requests).
  useEffect(() => {
    if (activeTab === "Product Batch Summary") {
      fetchData();
    }
  }, [appliedStartDate, appliedEndDate, selectedProduct, selectedBatch, selectedMaterial, activeTab]);

  // Avoid merging stale KPI rows into filter dropdowns when Detailed Report does not load /api/kpi.
  useEffect(() => {
    if (activeTab === "Detailed Report") {
      setRawData([]);
    }
  }, [activeTab]);

  // Fetch daily report data when Detailed Report or Material Consumption Report is active to ensure consistency
  useEffect(() => {
    if (activeTab === "Detailed Report" || activeTab === "Material Consumption Report" || activeTab === "Total Material Consumption") {
      const startDate = new Date(appliedStartDate);
      const endDate = new Date(appliedEndDate);
      fetchReportData('daily', startDate.toISOString(), endDate.toISOString());
    }
  }, [activeTab, appliedStartDate, appliedEndDate, selectedProduct, selectedBatch, selectedMaterial]);

  // Refetch filter options when dates change
  useEffect(() => {
    fetchFilterOptions();
  }, [appliedStartDate, appliedEndDate]);

  // Fetch report data when monthly/weekly/daily tabs are selected
  useEffect(() => {
    if (activeTab === "Monthly") {
      const monthEndDate = new Date(monthlyStartDate);
      monthEndDate.setMonth(monthEndDate.getMonth() + 1);
      fetchReportData('monthly', monthlyStartDate, monthEndDate.toISOString());
    }
  }, [activeTab, monthlyStartDate]);

  useEffect(() => {
    if (activeTab === "Weekly") {
      const weekEndDate = new Date(weeklyStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 7);
      fetchReportData('weekly', weeklyStartDate, weekEndDate.toISOString());
    }
  }, [activeTab, weeklyStartDate]);

  // Track if daily report has been manually triggered and if it's initial load
  const [dailyReportTriggered, setDailyReportTriggered] = useState(false);
  const [dailyReportInitialLoad, setDailyReportInitialLoad] = useState(false);

  useEffect(() => {
    if (activeTab === "Daily Report") {
      if (!dailyReportInitialLoad) {
        // First time loading Daily Report tab - auto-fetch data
        setDailyReportInitialLoad(true);
        applyDailyFilter();
      } else if (dailyReportTriggered) {
        // User has manually triggered the daily report, auto-fetch on date change
        applyDailyFilter();
      }
    }
  }, [dailyStartDate, activeTab, dailyReportTriggered, dailyReportInitialLoad]);

  // Auto-fetch is now handled by individual useEffects for each report type

  // Function to fetch report data specifically for monthly, weekly, daily reports
  const fetchReportData = async (reportType: string, startDate: string, endDate: string) => {
    setLoading(true);
    setError(null);
    setLoadingProgress(`Fetching ${reportType} report data...`);

    try {
      // Use /api/reports endpoint like old system
      const apiUrl = API_ENDPOINTS.BATCH_REPORTS_QUERY;
      const params = new URLSearchParams();

      // Don't apply 4-hour offset for reports - use exact dates as selected
      params.append('startDate', new Date(startDate).toISOString());
      params.append('endDate', new Date(endDate).toISOString());
      params.append('reportType', reportType);

      if (selectedBatch.length > 0) {
        selectedBatch.forEach((batch) => params.append('batch', batch));
      }
      if (selectedProduct.length > 0) {
        selectedProduct.forEach((product) => params.append('product', product));
      }
      if (selectedMaterial.length > 0) {
        selectedMaterial.forEach((material) => params.append('material', material));
      }

      const rows = (await fetchAllKpiPages(apiUrl, params, {
        timeout: LARGE_REPORT_TIMEOUT_MS,
      })) as Record<string, unknown>[];

      // Format the data for display - use same structure as old TableView.jsx
      if (rows && rows.length > 0) {
        const formattedData = rows.map((item: any) => ({
          batchGuid: item["Batch GUID"] || "Unknown",
          batchName: item["Batch Name"] || "Unknown",
          batchStart: item["Batch Act Start"] || "N/A",
          batchEnd: item["Batch Act End"] || "N/A",
          productName: item["Product Name"] || "Unknown",
          materialName: item["Material Name"] || "Unknown",
          materialCode: item["Material Code"] || "Unknown",
          quantity: item["Quantity"] || 0,
          batchQuantity: item["Quantity"] ?? item["Batch Quantity"] ?? 0,
          setPointFloat: item["SetPoint Float"] || 0,
          actualValueFloat: item["Actual Value Float"] || 0,
          sourceServer: item["Source Server"] || "Unknown",
          rootGuid: item["ROOTGUID"] || "Unknown",
          orderId: item["OrderId"] || "Unknown",
        }));

        // Store the formatted data in the appropriate state variable
        if (reportType === 'daily') {
          setDailyReportData(formattedData);
        } else if (reportType === 'weekly') {
          setWeeklyReportData(formattedData);
        } else if (reportType === 'monthly') {
          setMonthlyReportData(formattedData);
        }


      } else {
        if (reportType === 'daily') {
          setDailyReportData([]);
        } else if (reportType === 'weekly') {
          setWeeklyReportData([]);
        } else if (reportType === 'monthly') {
          setMonthlyReportData([]);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch report data';
      setError(msg);
      if (reportType === 'daily') {
        setDailyReportData([]);
      } else if (reportType === 'weekly') {
        setWeeklyReportData([]);
      } else if (reportType === 'monthly') {
        setMonthlyReportData([]);
      }
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  // Filter dropdown options: union API lists + rawData-derived names + pending selections.
  // Do not cross-filter by sibling pending fields (e.g. material on batch list), or the menus
  // collapse to a single batch/material and multi-select cannot add a second item.
  const productOptions = useMemo(() => {
    const set = new Set<string>();

    let filteredData = rawData;
    if (pendingBatch.length > 0) {
      filteredData = filteredData.filter((item) => pendingBatch.includes(item.batchName));
    }
    filteredData = filteredData.filter((item: any) => {
      if (!item.batchStart) return false;
      const itemDate = new Date(item.batchStart);
      const start = new Date(pendingStartDate);
      const end = new Date(pendingEndDate);
      return itemDate >= start && itemDate <= end;
    });
    filteredData.forEach((item: any) => {
      if (item.productName) set.add(item.productName);
    });
    allProductOptions.forEach((p) => set.add(p));
    pendingProduct.forEach((p) => set.add(p));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawData, pendingBatch, pendingStartDate, pendingEndDate, allProductOptions, pendingProduct]);

  const batchOptions = useMemo(() => {
    const set = new Set<string>();

    let filteredData = rawData;
    if (pendingProduct.length > 0) {
      filteredData = filteredData.filter((item) => pendingProduct.includes(item.productName));
    }
    filteredData = filteredData.filter((item: any) => {
      if (!item.batchStart) return false;
      const itemDate = new Date(item.batchStart);
      const start = new Date(pendingStartDate);
      const end = new Date(pendingEndDate);
      return itemDate >= start && itemDate <= end;
    });
    filteredData.forEach((item: any) => {
      if (item.batchName) set.add(item.batchName);
    });
    allBatchOptions.forEach((b) => set.add(b));
    pendingBatch.forEach((b) => set.add(b));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawData, pendingProduct, pendingStartDate, pendingEndDate, allBatchOptions, pendingBatch]);

  const materialOptions = useMemo(() => {
    const set = new Set<string>();

    let filteredData = rawData;
    if (pendingProduct.length > 0) {
      filteredData = filteredData.filter((item) => pendingProduct.includes(item.productName));
    }
    if (pendingBatch.length > 0) {
      filteredData = filteredData.filter((item) => pendingBatch.includes(item.batchName));
    }
    filteredData = filteredData.filter((item: any) => {
      if (!item.batchStart) return false;
      const itemDate = new Date(item.batchStart);
      const start = new Date(pendingStartDate);
      const end = new Date(pendingEndDate);
      return itemDate >= start && itemDate <= end;
    });
    filteredData.forEach((item: any) => {
      if (item.materialName) set.add(item.materialName);
    });
    allMaterialOptions.forEach((m) => set.add(m));
    pendingMaterial.forEach((m) => set.add(m));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawData, pendingProduct, pendingBatch, pendingStartDate, pendingEndDate, allMaterialOptions, pendingMaterial]);

  // Auto-clear selections that are no longer available
  useEffect(() => {
    // Clear products that are no longer available
    const availableProducts = new Set(productOptions);
    const validProducts = pendingProduct.filter(product => availableProducts.has(product));
    if (validProducts.length !== pendingProduct.length) {
      setPendingProduct(validProducts);
    }
  }, [productOptions, pendingProduct]);

  useEffect(() => {
    // Clear batches that are no longer available
    const availableBatches = new Set(batchOptions);
    const validBatches = pendingBatch.filter(batch => availableBatches.has(batch));
    if (validBatches.length !== pendingBatch.length) {
      setPendingBatch(validBatches);
    }
  }, [batchOptions, pendingBatch]);

  useEffect(() => {
    // Clear materials that are no longer available
    const availableMaterials = new Set(materialOptions);
    const validMaterials = pendingMaterial.filter(material => availableMaterials.has(material));
    if (validMaterials.length !== pendingMaterial.length) {
      setPendingMaterial(validMaterials);
    }
  }, [materialOptions, pendingMaterial]);

  // Filtering logic (use applied filter values) - matching old code logic
  const filteredData = useMemo(() => {
    // For Product Batch Summary, group by batch and product like old code
    if (activeTab === "Product Batch Summary") {
      // First filter by date range
      const dateFilteredData = rawData.filter((item: any) => {
        if (!item.batchStart) return false;
        const itemDate = new Date(item.batchStart);
        const start = new Date(appliedStartDate);
        const end = new Date(appliedEndDate);
        return itemDate >= start && itemDate <= end;
      });

      // Then group by batch and product (like old code)
      const groupedData = Object.entries(
        dateFilteredData.reduce((acc: any, item: any) => {
          const key = `${item.batchGuid?.trim()}___${item.productName?.trim()}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(item);
          return acc;
        }, {})
      );

      // Flatten the grouped data to show unique batch-product combinations
      const flattenedData = groupedData.map(([key, items]: [string, unknown]) => {
        const itemsArray = items as any[];
        // Take the first item from each group as representative
        const firstItem = itemsArray[0];
        return {
          ...firstItem,
          // Sum up quantities for this batch-product combination
          totalSetPoint: itemsArray.reduce((sum: number, item: any) => sum + (item.setPointFloat || 0), 0),
          totalActual: itemsArray.reduce((sum: number, item: any) => sum + (item.actualValueFloat || 0), 0),
          materialCount: itemsArray.length
        };
      });

      // Apply additional filters - handle arrays
      return flattenedData.filter((item: any) => {
        const productMatch = selectedProduct.length > 0 ? selectedProduct.includes(item.productName) : true;
        const batchMatch = selectedBatch.length > 0 ? selectedBatch.includes(item.batchName) : true;
        const materialMatch = selectedMaterial.length > 0 ? selectedMaterial.includes(item.materialName) : true;
        return productMatch && batchMatch && materialMatch;
      });
    }

    // For other tabs, use regular filtering
    return rawData.filter((item: any) => {
      // Date filtering (if item has batchStart or batchEnd or date)
      let dateMatch = true;
      if (item.batchStart || item.date) {
        const itemDate = new Date(item.batchStart || item.date);
        const start = new Date(appliedStartDate);
        const end = new Date(appliedEndDate);
        dateMatch = itemDate >= start && itemDate <= end;
      }
      // Product filter - handle arrays
      const productMatch = selectedProduct.length > 0 ? selectedProduct.includes(item.productName) : true;
      // Batch filter - handle arrays
      const batchMatch = selectedBatch.length > 0 ? selectedBatch.includes(item.batchName) : true;
      // Material filter - handle arrays
      const materialMatch = selectedMaterial.length > 0 ? selectedMaterial.includes(item.materialName) : true;
      return dateMatch && productMatch && batchMatch && materialMatch;
    });
  }, [rawData, appliedStartDate, appliedEndDate, selectedProduct, selectedBatch, selectedMaterial, activeTab]);



  // Generate aggregated data for summary reports - matching old system exactly
  const dailyData = useMemo(() => {
    if (activeTab !== "Daily Report") return [];
    // For daily reports, use dailyReportData from the /api/reports endpoint
    const aggregated = aggregateByProduct(dailyReportData, 'day');
    
    // Debug: Log batch count and material sums for each product
    aggregated.forEach(product => {
      console.log(`Daily Report - Product: ${product.productName}, Batches: ${product.noOfBatches}, Sum SP: ${product.sumSP}, Sum Act: ${product.sumAct}`);
    });
    
    return aggregated;
  }, [dailyReportData, activeTab]);

  const weeklyData = useMemo(() => {
    if (activeTab !== "Weekly") return [];
    // For weekly reports, use weeklyReportData from the /api/reports endpoint
    const aggregated = aggregateByProduct(weeklyReportData, 'week');
    return aggregated;
  }, [weeklyReportData, activeTab]);

  const monthlyData = useMemo(() => {
    if (activeTab !== "Monthly") return [];
    // For monthly reports, use monthlyReportData from the /api/reports endpoint
    const aggregated = aggregateByProduct(monthlyReportData, 'month');
    return aggregated;
  }, [monthlyReportData, activeTab]);

  const materialData = useMemo(() => {
    // For Material Consumption Report, use dailyReportData to ensure consistency with other reports
    // This ensures the 4-hour offset is applied consistently
    let sourceData = dailyReportData.length > 0 ? dailyReportData : filteredData;
    
    // Apply material filter to the data before aggregation
    if (selectedMaterial.length > 0) {
      sourceData = sourceData.filter((item: any) => selectedMaterial.includes(item.materialName));
    }
    
    // Debug: Log data source and sample data for Material Consumption Report
    console.log(`Material Consumption Report - Using data source: ${dailyReportData.length > 0 ? 'dailyReportData' : 'filteredData'}, dailyReportData.length: ${dailyReportData.length}, filteredData.length: ${filteredData.length}`);
    console.log(`Material Consumption Report - Material filter applied: ${selectedMaterial.length > 0 ? selectedMaterial.join(', ') : 'None'}, Filtered data length: ${sourceData.length}`);
    
    const aggregated = aggregateByMaterial(sourceData);
    
    // Debug: Log sample material data and verify quantities
    if (aggregated.length > 0) {
      console.log(`Material Consumption Report - Sample material: ${aggregated[0].materialName}, Planned: ${aggregated[0].plannedKG}, Actual: ${aggregated[0].actualKG}`);
      
      // Debug: Check AGR-Bulk Wheat Bran specifically
      const wheatBran = aggregated.find(item => item.materialName === 'AGR-Bulk Wheat Bran');
      if (wheatBran) {
        console.log(`Material Consumption Report - AGR-Bulk Wheat Bran: Planned: ${wheatBran.plannedKG}, Actual: ${wheatBran.actualKG}`);
      }
      
      // Debug: Count total records for this material in source data
      const wheatBranRecords = sourceData.filter((item: any) => item.materialName === 'AGR-Bulk Wheat Bran');
      console.log(`Material Consumption Report - AGR-Bulk Wheat Bran records in source data: ${wheatBranRecords.length}`);
    }
    
    return aggregated;
  }, [dailyReportData, filteredData, selectedMaterial]);

  // Group by batch for Detailed Report
  const detailedBatchGroups = useMemo(() => {
    if (activeTab !== "Detailed Report") return [];
    const groups: Record<string, any[]> = {};

    // For Detailed Report, always use dailyReportData to ensure consistency with Daily Report
    // This ensures consistent batch counts between Detailed Report and Daily Report
    let detailedData = dailyReportData;
    
    // Debug: Log which data source is being used
    console.log(`Detailed Report - Using data source: dailyReportData, dailyReportData.length: ${dailyReportData.length}, rawData.length: ${rawData.length}`);

    // If no dailyReportData available, return empty array to force loading
    if (dailyReportData.length === 0) {
      console.log('Detailed Report - No dailyReportData available, returning empty array');
      return [];
    }

    // Apply filters to the data
    detailedData = detailedData.filter((item: any) => {
      const productMatch = selectedProduct.length > 0 ? selectedProduct.includes(item.productName) : true;
      const batchMatch = selectedBatch.length > 0 ? selectedBatch.includes(item.batchName) : true;
      const materialMatch = selectedMaterial.length > 0 ? selectedMaterial.includes(item.materialName) : true;
      return productMatch && batchMatch && materialMatch;
    });

    // Group by batchGuid only to ensure each unique batch appears separately
    // This prevents merging batches with same name but different IDs
    detailedData.forEach((item: any) => {
      // Use only batchGuid as the unique key to prevent merging batches with same name
      const batchKey = item.batchGuid;
      if (!groups[batchKey]) groups[batchKey] = [];
      
      // Calculate Err Kg and Err % for each item
      const errKg = item.actualValueFloat && item.setPointFloat ? Math.abs(item.actualValueFloat - item.setPointFloat) : 0;
      const errPercent = item.setPointFloat && item.setPointFloat !== 0 ? (Math.abs((errKg / item.setPointFloat) * 100)) : 0;

      groups[batchKey].push({
        ...item,
        errKg: errKg.toFixed(2),
        errPercent: errPercent.toFixed(2)
      });
    });

    // Debug: Log batch count for selected product
    if (selectedProduct.length > 0) {
      const productBatches = Object.keys(groups).filter(batchKey => {
        const batchGroup = groups[batchKey];
        return batchGroup.some(item => selectedProduct.includes(item.productName));
      });
      
      // Debug: Check if batchGuid is available in the data
      const sampleItem = detailedData.find(item => selectedProduct.includes(item.productName));
      console.log(`Detailed Report - Sample item batchGuid: ${sampleItem?.batchGuid}, batchName: ${sampleItem?.batchName}`);
      console.log(`Detailed Report - Product: ${selectedProduct.join(', ')}, Batches: ${productBatches.length}, Unique Batch GUIDs: ${productBatches.slice(0, 5).join(', ')}...`);
    }

    // Add total row for each batch group
    const result = Object.values(groups).map(group => {
      const totalSetPoint = group.reduce((sum, item) => sum + (item.setPointFloat || 0), 0);
      const totalActual = group.reduce((sum, item) => sum + (item.actualValueFloat || 0), 0);
      const totalErrKg = Math.abs(totalActual - totalSetPoint);
      const totalErrPercent = totalSetPoint !== 0 ? (Math.abs((totalErrKg / totalSetPoint) * 100)) : 0;

      const totalRow = {
        ...group[0], // Copy batch info from first item
        materialName: "Total",
        materialCode: "",
        setPointFloat: totalSetPoint,
        actualValueFloat: totalActual,
        errKg: totalErrKg.toFixed(2),
        errPercent: totalErrPercent.toFixed(2),
        isTotal: true
      };

      return [...group, totalRow];
    });

    return result;
  }, [rawData, filteredData, selectedBatch, selectedProduct, selectedMaterial, activeTab, dailyReportData]);

  // Get current data based on active tab
  const getCurrentTabData = () => {
    if (activeTab === "Detailed Report") {
      return detailedBatchGroups.flat();
    } else if (activeTab === "Weekly") {
      return weeklyData;
    } else if (activeTab === "Monthly") {
      return monthlyData;
    } else if (activeTab === "Daily Report") {
      return dailyData;
    } else if (activeTab === "Material Consumption Report" || activeTab === "Total Material Consumption") {
      return materialData;
    } else {
      return filteredData;
    }
  };

  // Get paginated data for each specific tab type
  const paginatedFilteredData = useMemo(() => {
    if (activeTab !== "Product Batch Summary") return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, currentPage, rowsPerPage, activeTab]);

  const paginatedWeeklyData = useMemo(() => {
    if (activeTab !== "Weekly") return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return weeklyData.slice(startIndex, endIndex);
  }, [weeklyData, currentPage, rowsPerPage, activeTab]);

  const paginatedMonthlyData = useMemo(() => {
    if (activeTab !== "Monthly") return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return monthlyData.slice(startIndex, endIndex);
  }, [monthlyData, currentPage, rowsPerPage, activeTab]);

  const paginatedDailyData = useMemo(() => {
    if (activeTab !== "Daily Report") return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return dailyData.slice(startIndex, endIndex);
  }, [dailyData, currentPage, rowsPerPage, activeTab]);

  const paginatedMaterialData = useMemo(() => {
    if (activeTab !== "Material Consumption Report" && activeTab !== "Total Material Consumption") return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return materialData.slice(startIndex, endIndex);
  }, [materialData, currentPage, rowsPerPage, activeTab]);

  const paginatedDetailedBatchGroups = useMemo(() => {
    if (activeTab !== "Detailed Report") return [];

    // Calculate pagination based on complete batch groups
    // Show exactly the number of batches requested (not divided by materials per batch)
    const batchesPerPage = rowsPerPage === -1 ? detailedBatchGroups.length : rowsPerPage;
    const startIndex = (currentPage - 1) * batchesPerPage;
    const endIndex = startIndex + batchesPerPage;

    return detailedBatchGroups.slice(startIndex, endIndex);
  }, [detailedBatchGroups, currentPage, rowsPerPage, activeTab]);

  // Custom pagination info for Detailed Report
  const getDetailedReportPaginationInfo = () => {
    const batchesPerPage = rowsPerPage === -1 ? detailedBatchGroups.length : rowsPerPage;
    const totalBatches = detailedBatchGroups.length;
    const totalPages = Math.ceil(totalBatches / batchesPerPage);
    const hasNextPage = currentPage < totalPages;
    const totalItems = detailedBatchGroups.reduce((sum, group) => sum + group.length, 0);

    return {
      totalPages,
      hasNextPage,
      totalItems,
      totalBatches,
      batchesPerPage
    };
  };

  // Handler for VIEW button
  const applyFilters = () => {
    setSelectedProduct(pendingProduct);
    setSelectedBatch(pendingBatch);
    setSelectedMaterial(pendingMaterial);
    setAppliedStartDate(pendingStartDate);
    setAppliedEndDate(pendingEndDate);
    setCurrentPage(1); // Reset to first page when applying filters
  };

  // Callbacks for deselecting all
  const handleDeselectAllProducts = () => {
    fetchFilterOptions(); // Refresh options from backend
  };

  const handleDeselectAllBatches = () => {
    fetchFilterOptions(); // Refresh options from backend
  };

  const handleDeselectAllMaterials = () => {
    fetchFilterOptions(); // Refresh options from backend
  };

  // Function to reset to default dates
  const resetToDefaultDates = () => {
    const newDefaultDates = getDefaultDates();
    setDefaultDates(newDefaultDates);
    setPendingStartDate(newDefaultDates.startDate);
    setPendingEndDate(newDefaultDates.endDate);
    setAppliedStartDate(newDefaultDates.startDate);
    setAppliedEndDate(newDefaultDates.endDate);
  };

  // Function to manually reset main filter dates (for user convenience)
  const resetMainFilterDates = () => {
    const newDefaultDates = getDefaultDates();
    setPendingStartDate(newDefaultDates.startDate);
    setPendingEndDate(newDefaultDates.endDate);
    setAppliedStartDate(newDefaultDates.startDate);
    setAppliedEndDate(newDefaultDates.endDate);
  };

  // Handlers for specific tab date filters
  const applyWeeklyFilter = () => {
    // For weekly, calculate end date (7 days later)
    const startDate = new Date(weeklyStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // 7 days total
    endDate.setHours(7, 0, 0, 0); // Set to 7 AM like old system

    // Fetch data using the reports API
    fetchReportData('weekly', startDate.toISOString(), endDate.toISOString());
    setCurrentPage(1);
  };

  const applyMonthlyFilter = () => {
    // For monthly, calculate end date (1 month later)
    const startDate = new Date(monthlyStartDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setHours(7, 0, 0, 0); // Set to 7 AM like old system

    // Fetch data using the reports API
    fetchReportData('monthly', startDate.toISOString(), endDate.toISOString());
    setCurrentPage(1);
  };

  const applyDailyFilter = (isManualTrigger = false) => {
    // For daily, calculate end date (next day)
    const startDate = new Date(dailyStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(7, 0, 0, 0); // Set to 7 AM like old system


    // Only set trigger flag if this is a manual trigger (VIEW button click)
    if (isManualTrigger) {
      setDailyReportTriggered(true);
    }

    // Fetch data using the reports API
    fetchReportData('daily', startDate.toISOString(), endDate.toISOString());
    setCurrentPage(1);
  };



  // When tab changes, reset only the filters that should change, NOT the main dates
  useEffect(() => {
    setPendingProduct([]);
    setPendingBatch([]);
    setPendingMaterial([]);
    setSelectedProduct([]);
    setSelectedBatch([]);
    setSelectedMaterial([]);

    // DO NOT reset the main filter dates - they should persist across tab switches
    // Only reset specific tab date filters to their respective defaults
    setWeeklyStartDate(specificDefaults.weeklyStart);
    setMonthlyStartDate(specificDefaults.monthlyStart);
    // Don't reset dailyStartDate - let user's selection persist

    // View states removed - data will be fetched automatically when tab changes
    setDailyReportTriggered(false); // Reset daily report trigger
    setDailyReportInitialLoad(false); // Reset initial load flag so it auto-loads when returning to tab

    setCurrentPage(1); // Reset to first page when tab changes
  }, [activeTab, specificDefaults.weeklyStart, specificDefaults.monthlyStart, specificDefaults.dailyStart]);

  const getTableHeaders = (tabName: string) => {
    switch (tabName) {
      case "Product Batch Summary":
        return ["Batch Name", "Product Name", "Batch Start", "Batch End", "Batch Quantity", "Material Name", "Material Code", "SetPoint", "Actual", "Order ID"];
      case "Weekly":
      case "Monthly":
      case "Daily Report":
        return ["Product Name", "No Of Batches", "Sum SP", "Sum Act", "Err Kg", "Err %"];
      case "Detailed Report":
        return ["Batch", "Material Name", "Code", "Set Point", "Actual", "Err Kg", "Err %"];
      case "Material Consumption Report":
      case "Total Material Consumption":
        return ["Material Name", "Code", "Planned (kg)", "Actual (kg)", "Difference %"];
      default:
        return [];
    }
  };

  const getPercentClass = (value: any) => {
    // Convert to number if it's a string, handle both number and string inputs
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '';
    // For Err% column: green if < 5%, red if >= 5%
    // Since we now display absolute values, we can use direct comparison
    return numValue < 5 ? 'text-green-400' : 'text-red-400';
  };

  const renderTableRow = (item: any, tabName: string, index: string | number, batchGroup: any = null, isFirstMaterial = false, rowSpan = 1) => {
    const isTotalRow = item.isTotal;
    const isEvenRow = typeof index === 'number' ? index % 2 === 0 : false;

    // Base row classes with more pronounced alternating colors
    const baseRowClasses = `border-b border-slate-700/50 dark:border-slate-700/50 border-slate-200 dark:border-slate-700 transition-all duration-200 ${
      isEvenRow 
        ? 'bg-slate-100 dark:bg-slate-800/80' 
        : 'bg-white dark:bg-slate-800/20'
    } hover:bg-slate-200 dark:hover:bg-slate-700/90 hover:shadow-md hover:scale-[1.001]`;

    switch (tabName) {
      case "Product Batch Summary":
        return (
          <tr key={index} className={baseRowClasses}>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.batchName}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.productName}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{formatToLocalCustom(item.batchStart, true)}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{formatToLocalCustom(item.batchEnd, true)}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.batchQuantity}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.materialName}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.materialCode}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.setPointFloat?.toFixed(2) || '-'}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.actualValueFloat?.toFixed(2) || '-'}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm w-auto">{item.orderId}</td>
          </tr>
        );
      case "Weekly":
      case "Monthly":
      case "Daily Report":
        return (
          <tr key={index} className={baseRowClasses}>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.productName}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.noOfBatches}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.sumSP?.toFixed(2) || '-'}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.sumAct?.toFixed(2) || '-'}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm font-bold">{item.errKg || '-'}</td>
            <td className={`px-4 py-2 text-sm font-black ${getPercentClass(item.errPercent)}`}>{item.errPercent ? item.errPercent : '-'}</td>
          </tr>
        );
      case "Detailed Report":
        return (
          <tr key={index} className={`${baseRowClasses} ${isTotalRow ? 'bg-slate-200 dark:bg-slate-700 font-semibold' : ''}`}>
            {isFirstMaterial && batchGroup && !isTotalRow && (
              <td rowSpan={rowSpan - 1} className="px-4 py-2 align-top bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white text-sm font-semibold">
                <div className="space-y-2">
                  <div className="border-b border-slate-300 dark:border-slate-600 pb-1">
                    <div className="text-cyan-600 dark:text-cyan-300 font-bold text-xs uppercase tracking-wide">Batch</div>
                    <div className="text-slate-900 dark:text-white font-medium">{batchGroup?.batchName || 'N/A'}</div>
                  </div>
                  <div className="border-b border-slate-300 dark:border-slate-600 pb-1">
                    <div className="text-cyan-600 dark:text-cyan-300 font-bold text-xs uppercase tracking-wide">Product</div>
                    <div className="text-slate-900 dark:text-white font-medium">{batchGroup?.productName || 'N/A'}</div>
                  </div>
                  <div className="border-b border-slate-300 dark:border-slate-600 pb-1">
                    <div className="text-cyan-600 dark:text-cyan-300 font-bold text-xs uppercase tracking-wide">Started</div>
                    <div className="text-slate-900 dark:text-white font-medium">{formatToLocalCustom(batchGroup?.batchStart || 'N/A', true)}</div>
                  </div>
                  <div className="border-b border-slate-300 dark:border-slate-600 pb-1">
                    <div className="text-cyan-600 dark:text-cyan-300 font-bold text-xs uppercase tracking-wide">Ended</div>
                    <div className="text-slate-900 dark:text-white font-medium">{formatToLocalCustom(batchGroup?.batchEnd || 'N/A', true)}</div>
                  </div>
                  <div>
                    <div className="text-cyan-600 dark:text-cyan-300 font-bold text-xs uppercase tracking-wide">Quantity</div>
                    <div className="text-slate-900 dark:text-white font-medium">{batchGroup?.batchQuantity || 'N/A'}</div>
                  </div>
                </div>
              </td>
            )}
            {isTotalRow && <td className="px-4 py-2"></td>}
            <td className={`px-4 py-2 text-sm ${isTotalRow ? 'font-bold' : ''} text-slate-900 dark:text-white`}>
              {item.materialName}
            </td>
            <td className={`px-4 py-2 text-sm ${isTotalRow ? 'font-bold' : ''} text-slate-900 dark:text-white`}>
              {item.materialCode}
            </td>
            <td className={`px-4 py-2 text-sm ${isTotalRow ? 'font-bold' : ''} text-slate-900 dark:text-white`}>
              {item.setPointFloat?.toFixed(2) || '-'}
            </td>
            <td className={`px-4 py-2 text-sm ${isTotalRow ? 'font-bold' : ''} text-slate-900 dark:text-white`}>
              {item.actualValueFloat?.toFixed(2) || '-'}
            </td>
            <td className={`px-4 py-2 text-sm font-bold text-slate-900 dark:text-white`}>
              {item.errKg || '-'}
            </td>
            <td className={`px-4 py-2 text-sm font-black ${getPercentClass(item.errPercent)}`}>
              {item.errPercent ? item.errPercent : '-'}
            </td>
          </tr>
        );
      case "Material Consumption Report":
      case "Total Material Consumption":
        return (
          <tr key={index} className={baseRowClasses}>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.materialName}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.code}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.plannedKG?.toFixed(2) || '-'}</td>
            <td className="px-4 py-2 text-slate-900 dark:text-white text-sm">{item.actualKG?.toFixed(2) || '-'}</td>
            <td className={`px-4 py-2 text-sm font-bold ${getPercentClass(item.differencePercent)}`}>{item.differencePercent ? `${item.differencePercent}%` : '-'}</td>
          </tr>
        );
      default:
        return null;
    }
  };

  // Loading component
  const LoadingSpinner = () => (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      <div className="ml-2 text-slate-300">
        <div>Loading report data for {appliedStartDate} to {appliedEndDate}...</div>
        {loadingProgress && <div className="text-xs text-slate-400 mt-1">{loadingProgress}</div>}
      </div>
    </div>
  );

  // Error component
  const ErrorMessage = ({ message }: { message: string }) => (
    <div className="flex items-center justify-center py-8">
      <AlertCircle className="h-8 w-8 text-red-400 mr-2" />
      <span className="text-red-400">{message}</span>
    </div>
  );

  // Helper function to get date range string for CSV
  const getDateRangeString = () => {
    if (activeTab === "Weekly") {
      const start = new Date(weeklyStartDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `Weekly Production Period: ${start.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${start.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${end.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })}`;
    } else if (activeTab === "Monthly") {
      const start = new Date(monthlyStartDate);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      return `Monthly Production Period: ${start.toLocaleDateString('en-US', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })} ${start.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleDateString('en-US', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })} 11:59 PM`;
    } else if (activeTab === "Daily Report") {
      const startDate = new Date(dailyStartDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      return `Daily Production Period: ${startDate.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${endDate.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    } else {
      return `Date Range: ${appliedStartDate} to ${appliedEndDate}`;
    }
  };

  // CSV Export functionality
  const exportToCSV = () => {
    try {
      // Get current data based on active tab
      let currentData = getCurrentTabData();

      if (!currentData || currentData.length === 0) {
        showToast('No data available to export', 'error');
        return;
      }

      // Get headers based on active tab
      const headers = getTableHeaders(activeTab);

      // Convert data to CSV format
      let csvContent = '';

      // Add BOM for Excel compatibility
      csvContent += '\ufeff';

      // Add report title and metadata
      csvContent += `${activeTab} Report\n`;
      csvContent += `${getDateRangeString()}\n`;
      csvContent += `ASM Logo: ASM Company Logo\n`;
      // csvContent += `Aghtia Logo: Aghtia Company Logo\n`; // Agthia logo commented out
      if (selectedProduct.length > 0) {
        csvContent += `Product Filter: ${selectedProduct.join(', ')}\n`;
      }
      if (selectedBatch.length > 0) {
        csvContent += `Batch Filter: ${selectedBatch.join(', ')}\n`;
      }
      if (selectedMaterial.length > 0) {
        csvContent += `Material Filter: ${selectedMaterial.join(', ')}\n`;
      }
      csvContent += `Generated on: ${new Date().toLocaleString()}\n`;
      csvContent += `Total Records: ${currentData.length}\n`;
      csvContent += '\n'; // Empty line before headers

      // Add headers
      csvContent += headers.join(',') + '\n';

      // Add data rows
      currentData.forEach((item: any, index: number) => {
        const row = headers.map(header => {
          let value = '';

          switch (header) {
            case 'Batch Name':
              value = item.batchName || '';
              break;
            case 'Product Name':
              value = item.productName || '';
              break;
            case 'Batch Start':
              value = formatToLocalCustom(item.batchStart || '', true);
              break;
            case 'Batch End':
              value = formatToLocalCustom(item.batchEnd || '', true);
              break;
            case 'Batch Quantity':
              value = item.batchQuantity || item.quantity || '';
              break;
            case 'Material Name':
              value = item.materialName || '';
              break;
            case 'Material Code':
              value = item.materialCode || '';
              break;
            case 'SetPoint':
              value = item.setPointFloat?.toFixed(2) || item.setPoint || '';
              break;
            case 'Actual':
              value = item.actualValueFloat?.toFixed(2) || item.actual || '';
              break;
            case 'Order ID':
              value = item.orderId || '';
              break;
            case 'No Of Batches':
              value = item.noOfBatches || '';
              break;
            case 'Sum SP':
              value = item.sumSP?.toFixed(2) || '';
              break;
            case 'Sum Act':
              value = item.sumAct?.toFixed(2) || '';
              break;
            case 'Err Kg':
              value = item.errKg || '';
              break;
            case 'Err %':
              value = item.errPercent ? item.errPercent : '';
              break;
            case 'Code':
              value = item.code || item.materialCode || '';
              break;
            case 'Planned (kg)':
              value = item.plannedKG?.toFixed(2) || '';
              break;
            case 'Actual (kg)':
              value = item.actualKG?.toFixed(2) || '';
              break;
            case 'Difference %':
              value = item.differencePercent ? `${item.differencePercent}%` : '';
              break;
            case 'Batch':
              value = item.batchName || '';
              break;
            default:
              value = item[header.toLowerCase().replace(/\s+/g, '')] || '';
          }

          // Convert to string and escape commas and quotes in CSV
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }

          return stringValue;
        });

        csvContent += row.join(',') + '\n';
      });


      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      // Generate filename based on active tab and current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const tabName = activeTab.replace(/\s+/g, '_');
      const filename = `${tabName}_${dateStr}_${timeStr}.csv`;

      // Create download link
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL object
      setTimeout(() => URL.revokeObjectURL(url), 100);
      showToast(`CSV file "${filename}" downloaded successfully!`, 'success');
    } catch (error) {
      showToast('Error exporting CSV file. Please try again.', 'error');
    }
  };

  // Special CSV export for Detailed Report (handles batch groups)
  const exportDetailedReportToCSV = () => {
    try {

      if (!detailedBatchGroups || detailedBatchGroups.length === 0) {
        showToast('No data available to export', 'error');
        return;
      }

      const headers = ['Batch Name', 'Product Name', 'Batch Start', 'Batch End', 'Batch Quantity', 'Material Name', 'Material Code', 'Set Point', 'Actual', 'Err Kg', 'Err %'];
      let csvContent = '';

      // Add BOM for Excel compatibility
      csvContent += '\ufeff';

      // Add report title and metadata
      csvContent += `${activeTab} Report\n`;
      csvContent += `${getDateRangeString()}\n`;
      csvContent += `ASM Logo: ASM Company Logo\n`;
      // csvContent += `Aghtia Logo: Aghtia Company Logo\n`; // Agthia logo commented out
      if (selectedProduct.length > 0) {
        csvContent += `Product Filter: ${selectedProduct.join(', ')}\n`;
      }
      if (selectedBatch.length > 0) {
        csvContent += `Batch Filter: ${selectedBatch.join(', ')}\n`;
      }
      if (selectedMaterial.length > 0) {
        csvContent += `Material Filter: ${selectedMaterial.join(', ')}\n`;
      }
      csvContent += `Generated on: ${new Date().toLocaleString()}\n`;
      const totalItems = detailedBatchGroups.reduce((sum, group) => sum + group.length, 0);
      csvContent += `Total Batches: ${detailedBatchGroups.length}, Total Records: ${totalItems}\n`;
      csvContent += '\n'; // Empty line before headers

      // Add headers
      csvContent += headers.join(',') + '\n';

      // Add data rows for each batch group
      detailedBatchGroups.forEach((group: any[], groupIndex: number) => {

        group.forEach((item: any, itemIndex: number) => {
          const row = [
            item.batchName || '',
            item.productName || '',
            formatToLocalCustom(item.batchStart || '', true),
            formatToLocalCustom(item.batchEnd || '', true),
            item.batchQuantity || '',
            item.materialName || '',
            item.materialCode || '',
            item.setPointFloat?.toFixed(2) || '',
            item.actualValueFloat?.toFixed(2) || '',
            item.errKg || '',
            item.errPercent ? item.errPercent : ''
          ];

          // Escape commas and quotes in CSV
          const escapedRow = row.map(value => {
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          });

          csvContent += escapedRow.join(',') + '\n';
        });
      });


      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const filename = `Detailed_Report_${dateStr}_${timeStr}.csv`;

      // Create download link
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL object
      setTimeout(() => URL.revokeObjectURL(url), 100);
      showToast(`Detailed Report CSV file "${filename}" downloaded successfully!`, 'success');
    } catch (error) {
      showToast('Error exporting CSV file. Please try again.', 'error');
    }
  };

  // Handle export button click
  const handleExportClick = () => {
    if (activeTab === "Detailed Report") {
      exportDetailedReportToCSV();
    } else {
      exportToCSV();
    }
  };

  // Helper function to convert image to base64
  const imageToBase64 = (imagePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      // First try to fetch as blob (works better with Vite-processed images)
      fetch(imagePath)
        .then(response => response.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
        .catch(() => {
          // Fallback to canvas method
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              try {
                const base64 = canvas.toDataURL('image/png');
                resolve(base64);
              } catch (error) {
                reject(error);
              }
            } else {
              reject(new Error('Could not get canvas context'));
            }
          };
          img.onerror = reject;
          img.src = imagePath;
        });
    });
  };

  // Print functionality
  const handlePrint = async () => {
    try {
      
      // Get current data based on active tab
      let currentData = getCurrentTabData();
      
      if (!currentData || currentData.length === 0) {
        showToast('No data available to print', 'error');
        return;
      }

      // Get headers based on active tab
      const headers = getTableHeaders(activeTab);
      
      // Convert logos to base64
      let asmLogoBase64 = '';
      // let aghtiaLogoBase64 = ''; // Agthia logo commented out
      let fakiehLogoBase64 = '';
      let herculesLogoBase64 = '';
      
      try {
        asmLogoBase64 = await imageToBase64(asmLogo);
        // aghtiaLogoBase64 = await imageToBase64(aghtiaLogo); // Agthia logo commented out
        fakiehLogoBase64 = await imageToBase64(fakiehBrandLogo);
        herculesLogoBase64 = await imageToBase64(herculesLogo);
      } catch (error) {
        console.error('Error converting logos to base64:', error);
        // Fallback: use the image paths directly
        asmLogoBase64 = asmLogo;
        // aghtiaLogoBase64 = aghtiaLogo; // Agthia logo commented out
        fakiehLogoBase64 = fakiehBrandLogo;
        herculesLogoBase64 = herculesLogo;
      }
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        showToast('Please allow popups to print the report', 'error');
        return;
      }

      // Generate HTML content for printing
      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${activeTab} Report</title>
          <style>
            @page {
              margin: 100px 20px 60px 20px;
              size: A4;
            }
            .page-header {
              position: relative;
              width: 100%;
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 20px;
              border-bottom: 2px solid #0088a9;
              background-color: white;
              min-height: 90px;
              box-sizing: border-box;
              page-break-inside: avoid;
              page-break-after: avoid;
              margin-bottom: 20px;
            }
            .logo-container {
              display: flex;
              width: 100%;
              justify-content: space-between;
              align-items: center;
            }
            .logo-left {
              flex: 0 0 auto;
            }
            .logo-right {
              flex: 0 0 auto;
              display: flex;
              flex-direction: row;
              gap: 20px;
              align-items: center;
            }
            .logo-container img {
              max-height: 60px;
              max-width: 180px;
              object-fit: contain;
            }
            .logo-right img {
              max-height: 60px;
              max-width: 150px;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              color: #333;
            }
            .header {
              text-align: center;
              margin-top: 10px;
              margin-bottom: 30px;
              padding-bottom: 15px;
            }
            .header h1 {
              color: #0088a9;
              margin: 0;
              font-size: 24px;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .filters {
              margin-bottom: 20px;
              padding: 15px;
              background-color: #f5f5f5;
              border-radius: 5px;
            }
            .filters h3 {
              margin: 0 0 10px 0;
              color: #0088a9;
              font-size: 16px;
            }
            .filter-row {
              display: flex;
              gap: 20px;
              margin-bottom: 5px;
            }
            .filter-item {
              font-size: 12px;
            }
            .filter-label {
              font-weight: bold;
              color: #555;
            }
            table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              margin-top: 20px;
              font-size: 12px;
            }
            thead {
              display: table-header-group;
            }
            tbody {
              display: table-row-group;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
              word-wrap: break-word;
              overflow-wrap: break-word;
              vertical-align: top;
            }
            th {
              background-color: #0088a9;
              color: white;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 11px;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            tr:hover {
              background-color: #f5f5f5;
            }
            .total-row {
              background-color: #e8f4f8 !important;
              font-weight: bold;
            }
            .error-positive {
              color: #28a745;
            }
            .error-negative {
              color: #dc3545;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 10px;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
            @media print {
              @page {
                margin: 100px 20px 60px 20px;
                size: A4;
              }
              * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
              }
              body { 
                margin: 0;
                padding: 0;
              }
              .no-print { display: none; }
              .page-header {
                position: relative;
                width: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 20px;
                border-bottom: 2px solid #0088a9;
                background-color: white;
                min-height: 90px;
                box-sizing: border-box;
                page-break-after: avoid;
                page-break-inside: avoid;
                margin-bottom: 20px;
              }
              .logo-container {
                display: flex;
                width: 100%;
                justify-content: space-between;
                align-items: center;
              }
              .logo-left {
                flex: 0 0 auto;
              }
              .logo-right {
                flex: 0 0 auto;
                display: flex;
                flex-direction: row;
                gap: 20px;
                align-items: center;
              }
              .logo-container img {
                max-height: 60px;
                max-width: 180px;
                object-fit: contain;
              }
              .logo-right img {
                max-height: 60px;
                max-width: 150px;
              }
              .header {
                margin-top: 10px;
                margin-bottom: 20px;
                page-break-after: avoid;
              }
              .filters {
                page-break-after: avoid;
                margin-bottom: 15px;
              }
              thead {
                display: table-header-group;
              }
              tfoot {
                display: table-footer-group;
              }
              tr {
                page-break-inside: avoid;
              }
              thead tr {
                page-break-after: avoid;
                page-break-inside: avoid;
              }
              table {
                page-break-inside: auto;
                margin-top: 10px;
              }
              tbody tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              tbody {
                page-break-inside: auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="page-header">
            <div class="logo-container">
              <div class="logo-left">
                <img src="${herculesLogoBase64}" alt="Hercules" />
              </div>
              <div class="logo-right">
                <img src="${fakiehLogoBase64}" alt="Fakieh" />
                <img src="${asmLogoBase64}" alt="ASM Logo" />
              </div>
            </div>
          </div>
          <div class="header">
            <h1>${activeTab} Report</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
          </div>
          
          <div class="filters">
            <h3>Report Filters</h3>
            <div class="filter-row">
              <div class="filter-item">
                <span class="filter-label">Date Range:</span> 
                ${appliedStartDate} to ${appliedEndDate}
              </div>
            </div>
            ${selectedProduct.length > 0 ? `
              <div class="filter-row">
                <div class="filter-item">
                  <span class="filter-label">Product:</span> ${selectedProduct.join(', ')}
                </div>
              </div>
            ` : ''}
            ${selectedBatch.length > 0 ? `
              <div class="filter-row">
                <div class="filter-item">
                  <span class="filter-label">Batch:</span> ${selectedBatch.join(', ')}
                </div>
              </div>
            ` : ''}
            ${selectedMaterial.length > 0 ? `
              <div class="filter-row">
                <div class="filter-item">
                  <span class="filter-label">Material:</span> ${selectedMaterial.join(', ')}
                </div>
              </div>
            ` : ''}
          </div>

          <table>
            <thead>
              <tr>
                ${headers.map(header => `<th>${header}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
      `;

      // Add data rows
      if (activeTab === "Detailed Report") {
        // Handle detailed report with batch groups
        detailedBatchGroups.forEach((group: any[], groupIndex: number) => {
          group.forEach((item: any, itemIndex: number) => {
            const isTotalRow = item.isTotal;
            const rowClass = isTotalRow ? 'total-row' : '';
            
            htmlContent += `<tr class="${rowClass}">`;
            
            // For detailed report, we need to handle the batch info display
            if (itemIndex === 0 && !isTotalRow) {
              // First row of each batch group - show batch info (rowspan excludes total row — matches on-screen renderTableRow)
              const batchRowSpan = Math.max(1, group.length - 1);
              htmlContent += `
                <td rowspan="${batchRowSpan}">
                  <strong>Batch:</strong> ${item.batchName || 'N/A'}<br>
                  <strong>Product:</strong> ${item.productName || 'N/A'}<br>
                  <strong>Start:</strong> ${formatToLocalCustom(item.batchStart || 'N/A', true)}<br>
                  <strong>End:</strong> ${formatToLocalCustom(item.batchEnd || 'N/A', true)}<br>
                  <strong>Quantity:</strong> ${item.batchQuantity || 'N/A'}
                </td>
              `;
            } else if (isTotalRow) {
              htmlContent += '<td></td>'; // Empty cell for total row
            }
            
            // Add other columns
            htmlContent += `
              <td>${item.materialName || ''}</td>
              <td>${item.materialCode || ''}</td>
              <td>${item.setPointFloat?.toFixed(2) || '-'}</td>
              <td>${item.actualValueFloat?.toFixed(2) || '-'}</td>
              <td style="font-weight: bold;">${item.errKg || '-'}</td>
              <td class="${parseFloat(item.errPercent || '0') < 5 ? 'error-positive' : 'error-negative'}" style="font-weight: 900;">
                ${item.errPercent ? item.errPercent : '-'}
              </td>
            `;
            
            htmlContent += '</tr>';
          });
        });
      } else {
        // Handle other report types
        currentData.forEach((item: any, index: number) => {
          htmlContent += '<tr>';
          
          headers.forEach(header => {
            let value = '';
            let cellClass = '';
            
            switch (header) {
              case 'Batch Name':
                value = item.batchName || '';
                break;
              case 'Product Name':
                value = item.productName || '';
                break;
              case 'Batch Start':
                value = formatToLocalCustom(item.batchStart || '', true);
                break;
              case 'Batch End':
                value = formatToLocalCustom(item.batchEnd || '', true);
                break;
              case 'Batch Quantity':
                value = item.batchQuantity || item.quantity || '';
                break;
              case 'Material Name':
                value = item.materialName || '';
                break;
              case 'Material Code':
                value = item.materialCode || '';
                break;
              case 'SetPoint':
                value = item.setPointFloat?.toFixed(2) || item.setPoint || '';
                break;
              case 'Actual':
                value = item.actualValueFloat?.toFixed(2) || item.actual || '';
                break;
              case 'Order ID':
                value = item.orderId || '';
                break;
              case 'No Of Batches':
                value = item.noOfBatches || '';
                break;
              case 'Sum SP':
                value = item.sumSP?.toFixed(2) || '';
                break;
              case 'Sum Act':
                value = item.sumAct?.toFixed(2) || '';
                break;
              case 'Err Kg':
                value = item.errKg || '';
                cellClass = 'font-weight: bold;';
                break;
              case 'Err %':
                value = item.errPercent ? item.errPercent : '';
                cellClass = parseFloat(item.errPercent || '0') < 5 ? 'error-positive' : 'error-negative';
                cellClass += ' font-weight: 900;';
                break;
              case 'Code':
                value = item.code || item.materialCode || '';
                break;
              case 'Planned (kg)':
                value = item.plannedKG?.toFixed(2) || '';
                break;
              case 'Actual (kg)':
                value = item.actualKG?.toFixed(2) || '';
                break;
              case 'Difference %':
                value = item.differencePercent ? `${item.differencePercent}%` : '';
                cellClass = parseFloat(item.differencePercent || '0') < 5 ? 'error-positive' : 'error-negative';
                cellClass += ' font-weight: bold;';
                break;
              default:
                value = item[header.toLowerCase().replace(/\s+/g, '')] || '';
            }
            
            htmlContent += `<td class="${cellClass}">${value}</td>`;
          });
          
          htmlContent += '</tr>';
        });
      }

      htmlContent += `
            </tbody>
          </table>
          
          <div class="footer">
            <p>Total Records: ${currentData.length} | Generated by Khamis System</p>
          </div>
        </body>
        </html>
      `;

      // Write content to print window
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Wait for content to load, then trigger print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      };
      
    } catch (error) {
      showToast('Error printing report. Please try again.', 'error');
    }
  };

  return (
    <WaterSystemLayout
      title="Historical reports"
      subtitle="Batch production summaries, weekly, monthly, daily, and material consumption"
    >
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-full duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
            toast.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <FileText className="text-2xl text-slate-900 dark:text-cyan-400" />
          <h1 className="text-2xl font-bold tracking-wide text-slate-950 dark:text-cyan-300">
            Historical Reports
          </h1>
        </div>

        {/* Filter Section */}
        <Card className="bg-slate-900/95 dark:bg-slate-900/95 bg-white/95 border-slate-700 dark:border-slate-700 border-slate-300">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-cyan-300">
              <Calendar className="h-4 w-4" />
              Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-slate-600 dark:text-slate-300 font-medium text-xs">Start Date:</Label>
                <Input
                  type="datetime-local"
                  value={pendingStartDate}
                  onChange={(e) => setPendingStartDate(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 rounded-md px-2 cursor-pointer hover:border-cyan-400 focus:ring-2 focus:ring-cyan-400 transition-colors text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-600 dark:text-slate-300 font-medium text-xs">End Date:</Label>
                <Input
                  type="datetime-local"
                  value={pendingEndDate}
                  onChange={(e) => setPendingEndDate(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 rounded-md px-2 cursor-pointer hover:border-cyan-400 focus:ring-2 focus:ring-cyan-400 transition-colors text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300 dark:text-slate-300 text-slate-600 font-medium text-xs">Select Product:</Label>
                <MultiSelect
                  options={productOptions}
                  selectedValues={pendingProduct}
                  onChange={setPendingProduct}
                  placeholder="Select Product"
                  allSelectedText="All Products"
                  onDeselectAll={handleDeselectAllProducts}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300 dark:text-slate-300 text-slate-600 font-medium text-xs">Select Batch:</Label>
                <MultiSelect
                  options={batchOptions}
                  selectedValues={pendingBatch}
                  onChange={setPendingBatch}
                  placeholder="Select Batch"
                  allSelectedText="All Batches"
                  onDeselectAll={handleDeselectAllBatches}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300 dark:text-slate-300 text-slate-600 font-medium text-xs">Select Material:</Label>
                <MultiSelect
                  options={materialOptions}
                  selectedValues={pendingMaterial}
                  onChange={setPendingMaterial}
                  placeholder="Select Material"
                  allSelectedText="All Materials"
                  onDeselectAll={handleDeselectAllMaterials}
                />
              </div>
              <Button
                onClick={applyFilters}
                disabled={loading}
                className="flex h-7 items-center gap-2 rounded-lg border border-cyan-800 bg-cyan-600 px-3 py-1 text-sm font-medium text-white shadow-md transition-colors hover:bg-cyan-700"
              >
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                VIEW
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Report Type Tabs */}
        <Card className="bg-slate-900/95 dark:bg-slate-900/95 bg-white/95 border-slate-700 dark:border-slate-700 border-slate-300">
          <CardContent className="pt-3 pb-3">
            <div className="flex gap-3 justify-center overflow-x-auto pb-1 custom-tabs-container">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  data-state={activeTab === tab ? "active" : "inactive"}
                  className={`px-4 py-3 text-sm rounded-xl font-medium transition-all duration-300 border-2 whitespace-nowrap text-center flex-shrink-0 min-w-[160px] custom-tab-button
                    ${activeTab === tab
                      ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-white border-cyan-500 shadow-lg transform scale-105"
                      : "bg-slate-200 dark:bg-gray-800 border-slate-400 dark:border-gray-600 text-slate-900 dark:text-white hover:border-cyan-400 dark:hover:border-cyan-400 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-cyan-100 dark:hover:from-gray-700 dark:hover:to-gray-600 hover:shadow-md"
                    }`}
                  style={{
                    color: activeTab === tab ? 'white' : undefined,
                    WebkitTextFillColor: activeTab === tab ? 'white' : undefined,
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Specific Date Filters for Weekly, Monthly, Daily Reports */}
        {(activeTab === "Weekly" || activeTab === "Monthly" || activeTab === "Daily Report") && (
          <Card className="bg-slate-900/95 dark:bg-slate-900/95 bg-white/95 border-slate-700 dark:border-slate-700 border-slate-300">
            <CardContent className="pt-3 pb-3">
              <div className="flex flex-wrap gap-2 items-end">
                {activeTab === "Weekly" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-slate-800 dark:text-cyan-300 font-medium text-xs">Week Start Date:</Label>
                      <Input
                        type="datetime-local"
                        value={weeklyStartDate}
                        onChange={(e) => setWeeklyStartDate(e.target.value)}
                        className="bg-slate-800 dark:bg-slate-800 bg-white border-slate-600 dark:border-slate-600 border-slate-300 text-white dark:text-white text-slate-900 h-7 text-sm"
                      />
                    </div>
                    <Button
                      className="h-7 rounded-md border border-cyan-800 bg-cyan-600 px-3 py-1 text-sm font-medium text-white shadow-md transition-colors hover:bg-cyan-700"
                      onClick={applyFilters}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
                      VIEW
                    </Button>
                  </>
                )}

                {activeTab === "Monthly" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-slate-800 dark:text-cyan-300 font-medium text-xs">Month Start Date:</Label>
                      <Input
                        type="datetime-local"
                        value={monthlyStartDate}
                        onChange={(e) => setMonthlyStartDate(e.target.value)}
                        className="bg-slate-800 dark:bg-slate-800 bg-white border-slate-600 dark:border-slate-600 border-slate-300 text-white dark:text-white text-slate-900 h-7 text-sm"
                      />
                    </div>
                    <Button
                      className="h-7 rounded-md border border-cyan-800 bg-cyan-600 px-3 py-1 text-sm font-medium text-white shadow-md transition-colors hover:bg-cyan-700"
                      onClick={applyMonthlyFilter}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
                      VIEW
                    </Button>
                  </>
                )}

                {activeTab === "Daily Report" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-slate-800 dark:text-cyan-300 font-medium text-xs">Select Date:</Label>
                      <Input
                        type="datetime-local"
                        value={dailyStartDate}
                        onChange={(e) => setDailyStartDate(e.target.value)}
                        className="bg-slate-800 dark:bg-slate-800 bg-white border-slate-600 dark:border-slate-600 border-slate-300 text-white dark:text-white text-slate-900 h-7 text-sm"
                      />
                    </div>
                    <Button
                      className="h-7 rounded-md border border-cyan-800 bg-cyan-600 px-3 py-1 text-sm font-medium text-white shadow-md transition-colors hover:bg-cyan-700"
                      onClick={() => applyDailyFilter(true)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
                      VIEW
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 py-2">
          <Button 
            onClick={handlePrint}
            disabled={loading}
            className="rounded-md border border-cyan-800 bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4 mr-2" />
            PRINT
          </Button>
          <Button
            className="rounded-md border border-cyan-800 bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-cyan-700"
            onClick={() => {
              // Force a small delay to ensure data is ready
              setTimeout(() => {
                if (activeTab === "Detailed Report") {
                  exportDetailedReportToCSV();
                } else {
                  exportToCSV();
                }
              }, 100);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            EXPORT TO CSV
          </Button>
        </div>

        {/* Report Period Summary */}
        {(activeTab === "Weekly" || activeTab === "Monthly" || activeTab === "Daily Report") && (
          <div className="text-center py-2">
            <h3 className="text-base font-semibold text-slate-700 dark:text-cyan-300 mb-1">
              {activeTab === "Weekly" && "Weekly Summary"}
              {activeTab === "Monthly" && "Monthly Summary"}
              {activeTab === "Daily Report" && "Daily Report Summary"}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 font-medium text-sm">
              {activeTab === "Weekly" && (() => {
                const start = new Date(weeklyStartDate);
                const end = new Date(start);
                end.setDate(end.getDate() + 6);
                return `Weekly Production Period: ${start.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${start.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${end.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })}`;
              })()}
              {activeTab === "Monthly" && (() => {
                const start = new Date(monthlyStartDate);
                const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                return `Monthly Production Period: ${start.toLocaleDateString('en-US', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })} ${start.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleDateString('en-US', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })} 11:59 PM`;
              })()}
              {activeTab === "Daily Report" && (() => {
                const startDate = new Date(dailyStartDate);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
                // For Daily Report, display the exact selected time without timezone conversion
                return `Daily Production Period: ${startDate.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${endDate.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
              })()}
            </p>
          </div>
        )}

        {/* Data Table */}
        <Card className="bg-slate-900/95 dark:bg-slate-900/95 bg-white/95 border-slate-700 dark:border-slate-700 border-slate-300">
          <CardContent className="p-0">
            {loading ? (
              <LoadingSpinner />
            ) : error ? (
              <ErrorMessage message={error} />
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="reporting-table w-full text-sm text-slate-900 dark:text-white border-collapse">
                  <thead className="reporting-table-head bg-gradient-to-r from-cyan-600 to-cyan-700 text-white uppercase text-sm shadow-sm">
                    <tr>
                      {getTableHeaders(activeTab).map((header) => (
                        <th key={header} className="border border-cyan-800/40 px-4 py-3 text-left w-auto font-semibold text-white">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTab === "Detailed Report"
                      ? paginatedDetailedBatchGroups.flatMap((group, groupIdx) =>
                        group.map((item: any, i: number) =>
                          renderTableRow(
                            item,
                            activeTab,
                            `${groupIdx}-${i}`,
                            group[0],
                            i === 0,
                            group.length
                          )
                        )
                      )
                      : activeTab === "Weekly"
                        ? paginatedWeeklyData.map((item: any, i: number) =>
                          renderTableRow(item, activeTab, i)
                        )
                        : activeTab === "Monthly"
                          ? paginatedMonthlyData.map((item: any, i: number) =>
                            renderTableRow(item, activeTab, i)
                          )
                          : activeTab === "Daily Report"
                            ? paginatedDailyData.map((item: any, i: number) =>
                              renderTableRow(item, activeTab, i)
                            )
                            : activeTab === "Material Consumption Report" ||
                              activeTab === "Total Material Consumption"
                              ? paginatedMaterialData.map((item: any, i: number) =>
                                renderTableRow(item, activeTab, i)
                              )
                              : paginatedFilteredData.map((item: any, i: number) =>
                                renderTableRow(item, activeTab, i)
                              )}
                  </tbody>

                </table>
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                      {activeTab === "Detailed Report" ? "Batches per page:" : "Rows per page:"}
                    </span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1); // reset to first page
                      }}
                      className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-1 text-slate-700 dark:text-white text-sm"
                    >
                      {[10, 25, 50, 100, 200, 500, 1000, -1].map(size => (
                        <option key={size} value={size}>
                          {size === -1 ? 'Show All' : size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    {(() => {
                      if (activeTab === "Detailed Report") {
                        const { totalPages, hasNextPage, totalItems, totalBatches } = getDetailedReportPaginationInfo();

                        return (
                          <>
                            <Button
                              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 transition-colors"
                            >
                              Previous
                            </Button>
                            <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                              Page {currentPage} of {totalPages || 1} ({totalBatches} total batches, {totalItems} materials)
                            </span>
                            <Button
                              onClick={() => setCurrentPage((prev) => prev + 1)}
                              disabled={!hasNextPage}
                              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 transition-colors"
                            >
                              Next
                            </Button>
                          </>
                        );
                      } else {
                        const totalData = getCurrentTabData();
                        const totalPages = Math.ceil(totalData.length / rowsPerPage);
                        const hasNextPage = currentPage < totalPages;

                        // For monthly/weekly/daily reports, show raw record count from respective report data
                        let displayCount = totalData.length;
                        let displayText = `${totalData.length} total items`;

                        if (activeTab === "Monthly" && monthlyReportData.length > 0) {
                          displayCount = monthlyReportData.length;
                          displayText = `${monthlyReportData.length} total records (${totalData.length} products)`;
                        } else if (activeTab === "Weekly" && weeklyReportData.length > 0) {
                          displayCount = weeklyReportData.length;
                          displayText = `${weeklyReportData.length} total records (${totalData.length} products)`;
                        } else if (activeTab === "Daily Report" && dailyReportData.length > 0) {
                          displayCount = dailyReportData.length;
                          displayText = `${dailyReportData.length} total records (${totalData.length} products)`;
                        }

                        return (
                          <>
                            <Button
                              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 transition-colors"
                            >
                              Previous
                            </Button>
                            <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                              Page {currentPage} of {totalPages || 1} ({displayText})
                            </span>
                            <Button
                              onClick={() => setCurrentPage((prev) => prev + 1)}
                              disabled={!hasNextPage}
                              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 transition-colors"
                            >
                              Next
                            </Button>
                          </>
                        );
                      }
                    })()}
                  </div>
                </div>

              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </WaterSystemLayout>
  );
}