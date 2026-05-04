import React, { useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
  ChartOptions
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement
)

interface ChartComponentProps {
  type: 'line' | 'bar' | 'doughnut'
  data: any
  title: string
  height?: number
}

const chartOptions: ChartOptions<any> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 15,
        font: {
          size: 11
        }
      }
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: '#f1f5f9',
      bodyColor: '#cbd5e1',
      borderColor: '#0891b2',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
        drawBorder: false
      },
      ticks: {
        color: '#64748b',
        font: {
          size: 10
        }
      }
    },
    y: {
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
        drawBorder: false
      },
      ticks: {
        color: '#64748b',
        font: {
          size: 10
        }
      }
    }
  }
}

const doughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 15,
        font: {
          size: 11
        }
      }
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: '#f1f5f9',
      bodyColor: '#cbd5e1',
      borderColor: '#0891b2',
      borderWidth: 1
    }
  }
}

export function ChartComponent({ type, data, title, height = 200 }: ChartComponentProps) {
  const chartRef = useRef<any>(null)

  useEffect(() => {
    // Add glow effect and animations to chart canvas
    if (chartRef.current?.canvas) {
      chartRef.current.canvas.style.filter = 'drop-shadow(0 0 15px rgba(8, 145, 178, 0.4))'
      chartRef.current.canvas.style.transition = 'all 0.3s ease'
    }
  }, [])

  useEffect(() => {
    // Animate chart on mount
    if (chartRef.current) {
      chartRef.current.update('active')
    }
  }, [data])

  return (
    <div className="bg-slate-950/50 border border-slate-700/30 rounded-lg p-4 
                    backdrop-blur-sm hover:shadow-lg hover:shadow-cyan-500/20 
                    transition-all duration-300 group">
      
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-300">{title}</h3>
        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
      </div>
      
      {/* Chart Container */}
      <div style={{ height: `${height}px` }} className="relative">
        {type === 'line' && (
          <Line 
            ref={chartRef}
            data={data} 
            options={chartOptions} 
          />
        )}
        {type === 'bar' && (
          <Bar 
            ref={chartRef}
            data={data} 
            options={chartOptions} 
          />
        )}
        {type === 'doughnut' && (
          <Doughnut 
            ref={chartRef}
            data={data} 
            options={doughnutOptions} 
          />
        )}
        
        {/* Scanning Line Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 
                        transition-opacity duration-500">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent 
                          via-cyan-400/60 to-transparent animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}