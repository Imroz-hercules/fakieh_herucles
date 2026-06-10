import React, { useState, useEffect } from "react";
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout';
import { Calendar, Package, BarChart3, Loader2, AlertCircle } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from "axios";
import DetailsPopup from "@/components/batch-material/DetailsPopup";
import { API_ENDPOINTS } from '@/config/api';

interface CalendarData {
  date: string;
  total_actual_ton: number;
  product_count: number;
  batch_count: number;
  total_actual_kg: number;
}

interface DetailsData {
    product_name: string;
    quantity_kg: number;
}

export function BatchCalendarPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calendarData, setCalendarData] = useState<CalendarData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDayData, setSelectedDayData] = useState<CalendarData | null>(null);
  const [detailsData, setDetailsData] = useState<DetailsData[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Set default date range (current month)
  useEffect(() => {
    const now = new Date();
    
    // Set start date to first day of current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Set end date to last day of current month
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Format dates as YYYY-MM-DD without timezone conversion
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  }, []);

  // Fetch calendar data when dates change
  useEffect(() => {
    if (startDate && endDate) {
      fetchCalendarData();
    }
  }, [startDate, endDate]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(API_ENDPOINTS.BATCH_KPI_CALENDAR, {
        params: {
          startDate,
          endDate,
        },
      });

      let data = response.data;
      
      if (typeof data === "string") {
        data = JSON.parse(data.replace(/NaN/g, "null"));
      }
      setCalendarData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch calendar data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailsData = async (date: string) => {
    try {
        setDetailsLoading(true);
        setDetailsError(null);
        const response = await axios.get(API_ENDPOINTS.BATCH_KPI_CALENDAR_DETAILS, {
            params: { date },
        });
        setDetailsData(response.data);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch details';
        setDetailsError(errorMessage);
    } finally {
        setDetailsLoading(false);
    }
  };

  const handleCardClick = (date: string, dayData: CalendarData) => {
    // Allow opening dialog if there's any meaningful data (tons, products, or batches)
    const hasData = dayData.total_actual_ton > 0 || dayData.product_count > 0 || dayData.batch_count > 0;
    
    if (hasData) {
        setSelectedDate(date);
        setSelectedDayData(dayData);
        setIsPopupOpen(true);
        fetchDetailsData(date);
    }
  };

  // Generate date range array like the old working code
  const getDateRangeArray = (start: string, end: string) => {
    if (!start || !end) return [];
    const arr = [];
    // Parse dates as local time (YYYY-MM-DD format)
    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    const [endYear, endMonth, endDay] = end.split('-').map(Number);
    
    let dt = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const endDate = new Date(endYear, endMonth - 1, endDay, 0, 0, 0, 0);
    
    while (dt <= endDate) {
      arr.push(new Date(dt));
      dt.setDate(dt.getDate() + 1);
    }
    return arr;
  };

  // Generate calendar grid data from API response (matching old working logic)
  const generateCalendarGrid = () => {
    if (!startDate || !endDate) return [];

    // Build calendarData: key = full date string, value = data (fix for multi-month ranges)
    const calendarDataByDate: { [key: string]: CalendarData } = {};
    calendarData.forEach((item) => {
      // Use the full date string as key instead of just day number
      const dateStr = item.date;
      calendarDataByDate[dateStr] = item;
    });


    const dateRange = getDateRangeArray(startDate, endDate);
    const grid: Array<{
      fullDate: string;
      day: string;
      date: string;
      data: CalendarData;
    }> = [];

    dateRange.forEach((dateObj) => {
      const day = dateObj.getDate();
      const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const dayOfMonth = dateObj.getDate();
      const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
      
      // Format date as YYYY-MM-DD without timezone conversion (use local time)
      const year = dateObj.getFullYear();
      const monthNum = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dayNum = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${monthNum}-${dayNum}`;
      
      // Use full date string to get data, fallback to empty data if none exists
      const data = calendarDataByDate[dateStr] || { 
        date: dateStr,
        total_actual_ton: 0, 
        product_count: 0, 
        batch_count: 0, 
        total_actual_kg: 0 
      };

      // Debug: Log data for each day
      if (data.total_actual_ton > 0 || data.product_count > 0 || data.batch_count > 0) {
      }

      grid.push({
        fullDate: dateStr,
        day: dayOfWeek,
        date: `${dayOfMonth} ${month}`,
        data: data
      });
    });

    return grid;
  };

  const filteredData = generateCalendarGrid();

  // Today as YYYY-MM-DD (local), matching the grid's fullDate format.
  // Future days (strictly after today) are blanked with "—" so they aren't
  // mistaken for zero-production days.
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  return (
    <>
      <WaterSystemLayout
        title="Batch calendar"
        subtitle="Daily production totals, batches, and products from batch materials"
      >
        <div className="space-y-6">
          {/* Header with Filters */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Title with Icon */}
            <div className="flex items-center gap-3">
              <Calendar className="text-2xl text-slate-900 dark:text-cyan-400" />
              <h1 className="text-2xl font-bold tracking-wide text-slate-950 dark:text-cyan-300">
                Batch Calendar
              </h1>
            </div>

            {/* Date Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col">
                <Label className="mb-1 text-sm font-medium text-slate-800 dark:text-cyan-300">
                  Start Date
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-800 dark:bg-slate-800 light:bg-white border-slate-600 dark:border-slate-600 light:border-slate-300 text-white dark:text-white light:text-slate-900 cursor-pointer hover:border-cyan-400 transition-colors"
                  onClick={(e) => e.currentTarget.showPicker?.()}
                />
              </div>

              <div className="flex flex-col">
                <Label className="mb-1 text-sm font-medium text-slate-800 dark:text-cyan-300">
                  End Date
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-800 dark:bg-slate-800 light:bg-white border-slate-600 dark:border-slate-600 light:border-slate-300 text-white dark:text-white light:text-slate-900 cursor-pointer hover:border-cyan-400 transition-colors"
                  onClick={(e) => e.currentTarget.showPicker?.()}
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-900/20 border border-red-500 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
              <span className="ml-2 text-cyan-400">Loading calendar data...</span>
            </div>
          )}

          {/* Calendar Grid */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
              {filteredData.map((item, index) => {
                const isFuture = item.fullDate > todayStr;
                return (
                <div
                  key={index}
                  onClick={() => handleCardClick(item.fullDate, item.data)}
                  className={`p-4 rounded-xl bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border border-slate-700 dark:border-slate-700 light:border-slate-300 shadow-md transition-all
                    ${item.data.total_actual_ton > 0 ? "cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] hover:border-cyan-400" : isFuture ? "opacity-50" : "opacity-60"}
                  `}
                >
                  {/* Day & Date */}
                  <div className="text-white dark:text-white light:text-slate-900 font-bold border-b border-slate-500 dark:border-slate-500 light:border-slate-300 pb-1 mb-3 text-center">
                    <div className="text-sm font-bold">{item.day}</div>
                    <div className="text-base font-bold">{item.date}</div>
                  </div>

                  {/* Tons - Bigger and Centered */}
                  <div className="flex items-center justify-center gap-2 mb-3 text-center">
                    <BarChart3
                      className={`text-xl ${
                        isFuture
                          ? "text-slate-500"
                          : item.data.total_actual_ton === 0
                          ? "text-red-500"
                          : "text-green-400"
                      }`}
                    />
                    <span
                      className={`text-lg font-bold ${
                        isFuture
                          ? "text-slate-500"
                          : item.data.total_actual_ton === 0
                          ? "text-red-500"
                          : "text-green-400"
                      }`}
                    >
                      {isFuture ? "—" : `${item.data.total_actual_ton.toFixed(2)} ton`}
                    </span>
                  </div>

                  {/* Products */}
                  <div className="flex items-center justify-center gap-2 mb-2 text-center">
                    <Package className={isFuture ? "text-slate-500 text-md" : "text-blue-400 text-md"} />
                    <span className={`text-sm font-bold ${isFuture ? "text-slate-500" : "text-blue-400"}`}>
                      {isFuture ? "—" : `${item.data.product_count} products`}
                    </span>
                  </div>

                  {/* Batches */}
                  <div className="flex items-center justify-center gap-2 mb-2 text-center">
                    <Calendar className={isFuture ? "text-slate-500 text-md" : "text-purple-400 text-md"} />
                    <span className={`text-sm font-bold ${isFuture ? "text-slate-500" : "text-purple-400"}`}>
                      {isFuture ? "—" : `${item.data.batch_count} batches`}
                    </span>
                  </div>

                  {/* Actual KG (small text) */}
                  <div className="mt-2 text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 text-center font-bold">
                    {isFuture ? "—" : `${item.data.total_actual_kg.toFixed(0)} kg`}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* No Data Message */}
          {!loading && !error && filteredData.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">No calendar data available for the selected date range.</p>
            </div>
          )}
        </div>
      </WaterSystemLayout>

      {isPopupOpen && selectedDate && selectedDayData && (
        detailsLoading ? (
            <div className="fixed inset-0 bg-white/30 dark:bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700">
                    <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mx-auto mb-4" />
                    <p className="text-slate-700 dark:text-slate-300 text-center">Loading details...</p>
                </div>
            </div>
        ) : detailsError ? (
            <div className="fixed inset-0 bg-white/30 dark:bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700">
                    <p className="text-red-500 mb-4">{detailsError}</p>
                    <button 
                        onClick={() => setIsPopupOpen(false)}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        ) : (
            <DetailsPopup
                date={selectedDate}
                data={detailsData}
                onClose={() => setIsPopupOpen(false)}
                totalProduction={selectedDayData.total_actual_kg}
                totalBatches={selectedDayData.batch_count}
                totalProducts={selectedDayData.product_count}
            />
        )
      )}
    </>
  );
}
