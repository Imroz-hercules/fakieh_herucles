import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WaterSystemLayout } from "@/components/water-system/WaterSystemLayout";
import { FileText, Download, Calendar, Loader2, ChevronDown, Check, X } from "lucide-react";
import axios from "axios";
import { API_ENDPOINTS } from '@/config/api';
import { fetchAllKpiPages } from '@/utils/kpiFetchAll';

// MultiSelect Component
interface MultiSelectProps {
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  allSelectedText: string;
  onDeselectAll?: () => void;
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
    return `${selectedValues.length} Selected (${options.length} available)`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`w-full min-h-[2.25rem] px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white cursor-pointer hover:border-cyan-400 focus-within:border-cyan-500 transition-all duration-200 text-sm ${
          options.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={() => options.length > 0 && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm truncate">{getDisplayText()}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-xl max-h-64 overflow-y-auto">
          {/* Select All Option */}
          <div
            className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-200 dark:border-slate-600 text-cyan-600 dark:text-cyan-400 font-medium"
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
              className={`px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between ${
                selectedValues.includes(option) ? 'bg-slate-100 dark:bg-slate-700' : ''
              }`}
              onClick={() => handleOptionClick(option)}
            >
              <span className="text-sm text-slate-900 dark:text-white truncate">{option}</span>
              {selectedValues.includes(option) && (
                <Check className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Default dates: Last month with 7 AM time
const getDefaultDates = () => {
  const today = new Date();
  const lastMonth = new Date();
  lastMonth.setMonth(today.getMonth() - 1);

  const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1, 7, 0, 0);
  const endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 7, 0, 0);

  const formatForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return { startDate: formatForInput(startDate), endDate: formatForInput(endDate) };
};

// Format date and time for display
const formatToUTCCustom = (dateString: string, includeSeconds: boolean = false) => {
  if (!dateString || dateString === 'N/A') return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'UTC',
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
    
    return date.toLocaleString('en-US', options);
  } catch (error) {
    return 'Invalid Date';
  }
};

export function BatchRawDataPage() {
  const defaultDates = getDefaultDates();

  // Helper function to ensure negative values are displayed as zero
  const formatValue = (value: number | undefined): string => {
    const safeValue = Math.max(0, value || 0); // Ensure value is not negative
    return safeValue.toFixed(2);
  };
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter options
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [batchOptions, setBatchOptions] = useState<string[]>([]);
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);

  // Selected filters
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  // Total records for pagination
  const [totalRecords, setTotalRecords] = useState(0);
  const [csvExporting, setCsvExporting] = useState(false);

  // 4-hour offset function like in old code
  const getApiDateWithOffset = (displayDate: Date) => {
    if (!displayDate) return null;
    const apiDate = new Date(displayDate);
    apiDate.setHours(apiDate.getHours() - 4);
    return apiDate;
  };


  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
      const params = new URLSearchParams();
      const startDateOffset = getApiDateWithOffset(new Date(startDate));
      const endDateOffset = getApiDateWithOffset(new Date(endDate));

      if (startDateOffset && endDateOffset) {
        params.append("startDate", startDateOffset.toISOString());
        params.append("endDate", endDateOffset.toISOString());

        const response = await axios.get(`${API_ENDPOINTS.BATCH_FILTER_OPTIONS}?${params}`);
        const body = response.data || {};
        setProductOptions(Array.isArray(body.products) ? body.products : []);
        setBatchOptions(Array.isArray(body.batches) ? body.batches : []);
        setMaterialOptions(Array.isArray(body.materials) ? body.materials : []);
      }
    } catch (error) {
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      const startDateOffset = getApiDateWithOffset(new Date(startDate));
      const endDateOffset = getApiDateWithOffset(new Date(endDate));

      if (startDateOffset && endDateOffset) {
        params.append("startDate", startDateOffset.toISOString());
        params.append("endDate", endDateOffset.toISOString());
        params.append("page", currentPage.toString());
        params.append("limit", rowsPerPage.toString());
        params.append("includeTotal", "true");

        if (selectedProducts.length > 0) {
          selectedProducts.forEach(product => params.append("product", product));
        }
        if (selectedBatches.length > 0) {
          selectedBatches.forEach(batch => params.append("batch", batch));
        }
        if (selectedMaterials.length > 0) {
          selectedMaterials.forEach(material => params.append("material", material));
        }

        const response = await axios.get(`${API_ENDPOINTS.BATCH_KPI}/csv-format-report?${params}`);
        const payload = response.data || {};
        setRawData(Array.isArray(payload.data) ? payload.data : []);
        setTotalRecords(typeof payload.total === "number" ? payload.total : 0);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch data");
      setRawData([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  };

  // Load filter options on component mount and when date range changes
  useEffect(() => {
    fetchFilterOptions();
  }, [startDate, endDate]);

  // Fetch data when filters change
  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedProducts, selectedBatches, selectedMaterials, currentPage, rowsPerPage]);

  const applyFilters = () => {
    setCurrentPage(1);
    fetchData();
  };

  // CSV Export functionality - fetch all data
  const exportToCSV = async () => {
    try {
      setCsvExporting(true);

      // Fetch all data for export (not just current page)
      const params = new URLSearchParams();
      const startDateOffset = getApiDateWithOffset(new Date(startDate));
      const endDateOffset = getApiDateWithOffset(new Date(endDate));

      if (startDateOffset && endDateOffset) {
        params.append("startDate", startDateOffset.toISOString());
        params.append("endDate", endDateOffset.toISOString());

        // Apply same filters as current view
        if (selectedProducts.length > 0) {
          selectedProducts.forEach(product => params.append("product", product));
        }
        if (selectedBatches.length > 0) {
          selectedBatches.forEach(batch => params.append("batch", batch));
        }
        if (selectedMaterials.length > 0) {
          selectedMaterials.forEach(material => params.append("material", material));
        }

        const allData = (await fetchAllKpiPages(
          `${API_ENDPOINTS.BATCH_KPI}/csv-format-report`,
          params
        )) as Record<string, unknown>[];

        if (allData.length === 0) {
          return;
        }

        // Create CSV headers
        const headers = tableHeaders.join(',');
        
        // Create CSV rows
        const csvRows = allData.map((item: any) => 
          tableHeaders.map(header => {
            const value = item[header];
            // Handle values that might contain commas or quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value || '';
          }).join(',')
        );
        
        // Combine headers and rows
        const csvContent = [headers, ...csvRows].join('\n');
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        
        // Generate filename with current date range and record count
        const startDateStr = new Date(startDate).toISOString().split('T')[0];
        const endDateStr = new Date(endDate).toISOString().split('T')[0];
        const filename = `reports_${startDateStr}_to_${endDateStr}_${allData.length}_records.csv`;
        
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show success message (no popup)
      }
    } catch (error) {
    } finally {
      setCsvExporting(false);
    }
  };

  const totalPages = Math.ceil(totalRecords / rowsPerPage);

  const tableHeaders = [
    "Batch Name",
    "Product Name",
    "Batch Act Start",
    "Batch Act End",
    "Quantity",
    "Material Name",
    "Material Code",
    "SetPoint Float",
    "Actual Value Float",
    "OrderId",
    "EventID",
    "Batch Transfer Time",
  ];

  const renderTableRow = (item: any, index: number) => (
    <tr
      key={index}
      className={`
      border-b border-slate-300 dark:border-slate-700/50
      ${index % 2 === 0 ? "bg-slate-50 dark:bg-slate-900" : "bg-white dark:bg-slate-800"}
      hover:bg-slate-200 dark:hover:bg-slate-800/60
      text-sm text-slate-900 dark:text-slate-100
      py-2
    `}
    >
      {tableHeaders.map((header, i) => {
        let cellValue = item[header] || "-";
        
        // Apply special formatting for date/time columns
        if (header === "Batch Act Start" || header === "Batch Act End") {
          cellValue = formatToUTCCustom(item[header], true);
        } else if (header === "Batch Transfer Time") {
          cellValue = formatToUTCCustom(item[header], true);
        } else if (typeof item[header] === "number") {
          cellValue = item[header].toFixed(2);
        }
        
        return (
          <td
            key={i}
            className={`px-3 py-2 break-words text-sm
            ${i > 8 ? "hidden xl:table-cell" : ""} 
            ${i > 5 && i <= 8 ? "hidden lg:table-cell" : ""}`}
          >
            {cellValue}
          </td>
        );
      })}
    </tr>
  );


  return (
    <WaterSystemLayout
      title="Raw data"
      subtitle="Batch material rows from SQL Server (filters and CSV export)"
    >
      <div className="max-w-full px-4 md:px-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <FileText className="text-2xl text-slate-900 dark:text-cyan-400" />
          <h1 className="text-2xl font-bold tracking-wide text-slate-950 dark:text-cyan-300">
            Batch raw data
          </h1>
        </div>

        <div className="space-y-6">
            {/* Filters */}
            <Card className="bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-700 dark:text-cyan-300">
                  <Calendar className="h-5 w-5" /> Report Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 font-medium">Start Date:</Label>
                    <Input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 rounded-md px-2 cursor-pointer hover:border-cyan-400 focus:ring-2 focus:ring-cyan-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 font-medium">End Date:</Label>
                    <Input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 rounded-md px-2 cursor-pointer hover:border-cyan-400 focus:ring-2 focus:ring-cyan-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 font-medium">Select Product:</Label>
                    <MultiSelect
                      options={productOptions}
                      selectedValues={selectedProducts}
                      onChange={setSelectedProducts}
                      placeholder="Select Product"
                      allSelectedText="All Products"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 font-medium">Select Batch:</Label>
                    <MultiSelect
                      options={batchOptions}
                      selectedValues={selectedBatches}
                      onChange={setSelectedBatches}
                      placeholder="Select Batch"
                      allSelectedText="All Batches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300 font-medium">Select Material:</Label>
                    <MultiSelect
                      options={materialOptions}
                      selectedValues={selectedMaterials}
                      onChange={setSelectedMaterials}
                      placeholder="Select Material"
                      allSelectedText="All Materials"
                    />
                  </div>
                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="flex items-center gap-2 rounded-lg border border-cyan-800 bg-cyan-600 px-5 py-2 font-medium text-white shadow-md transition-colors hover:bg-cyan-700"
                      onClick={applyFilters}
                      disabled={loading}
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Apply filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-end gap-4">
              <Button
                type="button"
                onClick={exportToCSV}
                disabled={loading || csvExporting}
                className="rounded-lg border border-cyan-800 bg-cyan-600 px-4 py-2 font-medium text-white shadow-md transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {csvExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting…
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                  </>
                )}
              </Button>
            </div>

            {/* Data Table */}
            <Card className="bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                    <span className="ml-2 text-slate-500 dark:text-slate-300">Loading report data...</span>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-red-500">Error: {error}</span>
                  </div>
                ) : (
                  <div className="max-w-full">
                    <table className="reporting-table min-w-full table-fixed text-sm">
                      <thead className="reporting-table-head bg-gradient-to-r from-cyan-600 to-cyan-700 text-white uppercase text-sm shadow-sm">
                        <tr>
                          {tableHeaders.map((header, i) => (
                            <th
                              key={header}
                              className={`border border-cyan-800/40 px-3 py-3 break-words text-sm font-semibold text-white
                            ${i > 8 ? "hidden xl:table-cell" : ""} 
                            ${i > 5 && i <= 8 ? "hidden lg:table-cell" : ""}`}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawData.length === 0 ? (
                          <tr>
                            <td colSpan={tableHeaders.length} className="px-4 py-8 text-center text-slate-500">
                              No data found for the selected date range.
                            </td>
                          </tr>
                        ) : (
                          rawData.map(renderTableRow)
                        )}
                      </tbody>
                    </table>


                    {/* Pagination */}
                    <div className="flex flex-wrap justify-between items-center p-4 text-xs text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span>Rows per page:</span>
                        <select
                          value={rowsPerPage}
                          onChange={(e) => {
                            setRowsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-white"
                        >
                          {[5, 10, 20, 50].map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                          disabled={currentPage === 1}
                          className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white"
                        >
                          Prev
                        </Button>
                        <span>
                          Page {currentPage} of {totalPages || 1} ({totalRecords} total items)
                        </span>
                        <Button
                          onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white"
                        >
                          Next
                        </Button>
                      </div>
                    </div>

                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      </div>
    </WaterSystemLayout>
  );
}
