import React from 'react'
import { Link, useLocation } from 'wouter'
import { 
  LayoutDashboard, 
  Package, 
  Database, 
  Factory, 
  Truck, 
  Radio, 
  Scale, 
  Bell,
  ChevronLeft,
  ChevronRight,
  Settings,
  History
} from 'lucide-react'
import herculesLogo from "../../assets/Herculeslight.png"
import { useTheme } from '../../contexts/ThemeContext'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const menuItems = [
  { 
    path: '/fakieh/fakieh-dashboard', 
    icon: LayoutDashboard, 
    label: 'Fakieh Dashboard',
    description: 'Main Production Dashboard'
  },
  // { 
  //   path: '/fakieh/dashboard', 
  //   icon: LayoutDashboard, 
  //   label: 'Dashboard',
  //   description: 'Production Intelligence Dashboard'
  // },

  // { 
  //   path: '/fakieh/material', 
  //   icon: Package, 
  //   label: 'Material',
  //   description: 'Material Management'
  // },
  { 
    path: '/fakieh/storage', 
    icon: Database, 
    label: 'Storage',
    description: 'Storage Management'
  },
  // { 
  //   path: '/fakieh/production', 
  //   icon: Factory, 
  //   label: 'Production',
  //   description: 'Production Management'
  // },
  { 
    path: '/fakieh/live_orders', 
    icon: Truck, 
    label: 'Live orders',
    description: 'Real-time Orders from SCADA'
  },
  { 
    path: '/fakieh/order-history', 
    icon: History, 
    label: 'Order History',
    description: 'Complete Order History from Database'
  },
  { 
    path: '/fakieh/rfid', 
    icon: Radio, 
    label: 'RFID',
    description: 'RFID Tracking System'
  },
  { 
    path: '/fakieh/weighbridge', 
    icon: Scale, 
    label: 'Weighbridge Log',
    description: 'Weighbridge Management'
  },
  { 
    path: '/fakieh/truck-entry', 
    icon: Truck, 
    label: 'Truck Weighbridge',
    description: 'Live Weighbridge & Entry Management'
  },
  { 
    path: '/fakieh/truck-management', 
    icon: Truck, 
    label: 'Truck Management',
    description: 'Manage Trucks & Fleet'
  },
  // { 
  //   path: '/fakieh/alarms', 
  //   icon: Bell, 
  //   label: 'Alarms',
  //   description: 'Alarms & Notifications'
  // },
  
  // {
  //   path: '/fakieh/engineering',
  //   icon: Settings,
  //   label: 'PLC Configuration',
  //   description: 'PLC Configuration & Field Management'
  // },
  // { 
  //   path: '/fakieh/plc-reports', 
  //   icon: Database, 
  //   label: 'PLC Reports',
  //   description: 'Production Line Reports & Analytics'
  // },
  { 
    path: '/fakieh/admin', 
    icon: Settings, 
    label: 'Admin',
    description: 'System Administration & Configuration'
  }
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation()
  const { theme } = useTheme()

  return (
    <div className={`bg-slate-900/95 light:bg-white border-r border-slate-700/50 light:border-gray-200 backdrop-blur-sm 
                     transition-all duration-300 flex flex-col relative h-screen shadow-lg light:shadow-xl
                     ${collapsed ? 'w-16' : 'w-64'}`}>
      
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 light:border-gray-200">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center space-x-3">
              <img
                src={herculesLogo}
                alt="Hercules v2.0"
                className="h-12 w-auto object-contain dark:brightness-0 dark:invert"
                style={{
                  opacity: 1,
                  imageRendering: 'auto'
                }}
              />
            </div>
          )}
          {collapsed && (
            <img
              src={herculesLogo}
              alt="Hercules v2.0"
              className="h-10 w-auto object-contain mx-auto dark:brightness-0 dark:invert"
              style={{
                opacity: 1,
                imageRendering: 'auto'
              }}
            />
          )}
          <button
            onClick={onToggle}
            data-toggle-button="true"
            className="sidebar-toggle-button p-2 rounded-lg text-slate-400 light:text-gray-800 hover:text-cyan-400 light:hover:text-gray-900 transition-colors"
            style={{
              backgroundColor: 'transparent !important',
              background: 'transparent !important',
              border: 'none !important',
              boxShadow: 'none !important',
              '--tw-bg-opacity': '0 !important'
            } as React.CSSProperties}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location === item.path
          
          return (
            <Link key={item.path} href={item.path}>
              <div className={`flex items-center p-3 rounded-lg transition-all duration-200 group cursor-pointer
                             ${isActive 
                               ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400' 
                               : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/50'
                             }`}>
                <Icon className={`h-5 w-5 ${collapsed ? 'mx-auto' : 'mr-3'} flex-shrink-0`} />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.label}</div>
                    {isActive && (
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </div>
                )}
                {!collapsed && isActive && (
                  <div className="w-2 h-2 bg-cyan-400 rounded-full flex-shrink-0"></div>
                )}
              </div>
            </Link>
          )
        })}
      </nav>
      
      {/* Scanning Line Animation */}
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent 
                      via-cyan-500/50 to-transparent opacity-30">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/0 via-cyan-400/80 to-cyan-400/0 
                        h-8 animate-pulse"></div>
      </div>
    </div>
  )
}