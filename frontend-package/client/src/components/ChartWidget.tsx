import React from 'react';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { DashboardWidget } from '@shared/schema';
// Removed Advanced3DGauge import - using local implementation
import { Settings, X, Grip } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ChartWidgetProps {
  widget: DashboardWidget;
  onEdit?: (widget: DashboardWidget) => void;
  onDelete?: (widgetId: number) => void;
  isDragging?: boolean;
  dragHandleProps?: any;
}

// Mock data generator based on metric type
const generateMockData = (metricType: string) => {
  const labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
  const baseValue = {
    pressure: 85,
    flow: 2400,
    quality: 94,
    energy: 340
  }[metricType] || 100;

  return {
    labels,
    datasets: [{
      label: metricType.charAt(0).toUpperCase() + metricType.slice(1),
      data: labels.map(() => baseValue + (Math.random() - 0.5) * 20),
      borderColor: {
        pressure: '#f59e0b',
        flow: '#3b82f6',
        quality: '#10b981',
        energy: '#8b5cf6'
      }[metricType] || '#06b6d4',
      backgroundColor: {
        pressure: 'rgba(245, 158, 11, 0.1)',
        flow: 'rgba(59, 130, 246, 0.1)',
        quality: 'rgba(16, 185, 129, 0.1)',
        energy: 'rgba(139, 92, 246, 0.1)'
      }[metricType] || 'rgba(6, 182, 212, 0.1)',
      fill: true,
      tension: 0.4,
    }]
  };
};

const generatePieData = (metricType: string) => {
  const categories = {
    pressure: ['Normal', 'High', 'Critical'],
    flow: ['Optimal', 'Reduced', 'Blocked'],
    quality: ['Excellent', 'Good', 'Fair', 'Poor'],
    energy: ['Efficient', 'Standard', 'High Consumption']
  }[metricType] || ['Good', 'Warning', 'Critical'];

  return {
    labels: categories,
    datasets: [{
      data: categories.map(() => Math.random() * 100 + 10),
      backgroundColor: [
        '#10b981',
        '#f59e0b', 
        '#ef4444',
        '#8b5cf6'
      ].slice(0, categories.length),
      borderWidth: 2,
      borderColor: '#1f2937',
    }]
  };
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: '#e2e8f0',
        font: {
          size: 10,
        }
      }
    },
    tooltip: {
      backgroundColor: '#1f2937',
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      borderColor: '#374151',
      borderWidth: 1,
    }
  },
  scales: {
    x: {
      ticks: {
        color: '#94a3b8',
        font: {
          size: 10,
        }
      },
      grid: {
        color: '#374151',
      }
    },
    y: {
      ticks: {
        color: '#94a3b8',
        font: {
          size: 10,
        }
      },
      grid: {
        color: '#374151',
      }
    }
  }
};

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#e2e8f0',
        font: {
          size: 10,
        },
        boxWidth: 12,
      }
    },
    tooltip: {
      backgroundColor: '#1f2937',
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      borderColor: '#374151',
      borderWidth: 1,
    }
  }
};

export function ChartWidget({ widget, onEdit, onDelete, isDragging, dragHandleProps }: ChartWidgetProps) {
  const data = widget.chartType === 'pie' || widget.chartType === 'donut' 
    ? generatePieData(widget.metricType) 
    : generateMockData(widget.metricType);

  const renderChart = () => {
    switch (widget.chartType) {
      case 'line':
        return <Line data={data} options={chartOptions} />;
      case 'bar':
        return <Bar data={data} options={chartOptions} />;
      case 'pie':
        return <Pie data={data} options={pieOptions} />;
      case 'donut':
        return <Doughnut data={data} options={pieOptions} />;
      case 'gauge':
        const gaugeValue = data.datasets[0].data[data.datasets[0].data.length - 1] as number;
        const maxValue = Math.max(...(data.datasets[0].data as number[])) * 1.2;
        const percentage = (gaugeValue / maxValue) * 100;
        return (
          <div className="flex flex-col justify-center items-center h-full gap-2">
            <div className="relative">
              <div className="w-32 h-32 rounded-full border-4 border-slate-700 relative flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(${data.datasets[0].borderColor} ${percentage * 3.6}deg, transparent 0deg)`,
                    mask: 'radial-gradient(circle at center, transparent 60%, black 60%)',
                  }}
                />
                <div className="text-white text-sm font-bold">{Math.round(gaugeValue)}</div>
              </div>
            </div>
            <div className="text-xs text-slate-300 text-center">
              {widget.metricType}
            </div>
          </div>
        );
      default:
        return <Line data={data} options={chartOptions} />;
    }
  };

  const getMetricColor = (metricType: string) => {
    return {
      pressure: '#f59e0b',
      flow: '#3b82f6',
      quality: '#10b981',
      energy: '#8b5cf6'
    }[metricType] || '#06b6d4';
  };

  const color = getMetricColor(widget.metricType);

  return (
    <div
      className={`
        cyberpunk-card rounded-xl p-4 relative overflow-hidden
        transition-all duration-300 group
        ${isDragging ? 'opacity-50 scale-105 z-50' : ''}
        hover:border-opacity-80
      `}
      style={{
        gridColumn: `span ${widget.width}`,
        gridRow: `span ${widget.height}`,
        borderColor: `${color}30`,
        boxShadow: isDragging ? `0 20px 40px rgba(0,0,0,0.5)` : `0 4px 15px ${color}15`,
      }}
    >
      {/* Background Effects */}
      <div 
        className="absolute inset-0 opacity-10 rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${color}20 0%, transparent 50%, ${color}10 100%)`
        }}
      />
      <div 
        className="absolute top-0 left-0 w-full h-0.5 animate-pulse rounded-t-xl"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <div 
            className="w-2 h-2 rounded-full animate-ping"
            style={{ backgroundColor: color }}
          />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            {widget.title}
          </h3>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            {...dragHandleProps}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <Grip size={14} />
          </button>
          {onEdit && (
            <button
              onClick={() => onEdit(widget)}
              className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
              title="Edit widget"
            >
              <Settings size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(widget.id)}
              className="p-1 text-slate-400 hover:text-red-400 transition-colors"
              title="Delete widget"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Chart Content */}
      <div className="relative z-10 h-full" style={{ height: 'calc(100% - 2.5rem)' }}>
        {renderChart()}
      </div>

      {/* Data Flow Animation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div 
          className="absolute w-px h-full opacity-30 animate-data-flow"
          style={{
            background: `linear-gradient(to bottom, transparent, ${color}, transparent)`,
            left: '10%',
            animationDelay: '0s'
          }}
        />
        <div 
          className="absolute w-px h-full opacity-20 animate-data-flow"
          style={{
            background: `linear-gradient(to bottom, transparent, ${color}, transparent)`,
            right: '15%',
            animationDelay: '1.5s'
          }}
        />
      </div>
    </div>
  );
}