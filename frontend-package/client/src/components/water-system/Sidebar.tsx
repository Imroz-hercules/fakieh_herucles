import React from 'react'
import { Link, useLocation } from 'wouter'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import herculesLogo from "../../assets/Hercules_New.png"
import { sidebarNavItems } from './navConfig'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation()

  return (
    <div className={`app-chrome-dark bg-slate-900/95 border-r border-slate-700/50 backdrop-blur-sm 
                     transition-all duration-300 flex flex-col relative h-screen shadow-lg
                     ${collapsed ? 'w-16' : 'w-64'}`}>
      
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center space-x-3">
              <span className="inline-flex rounded-md bg-white p-1.5 shadow-sm ring-1 ring-slate-600/30">
                <img
                  src={herculesLogo}
                  alt="Hercules"
                  className="h-10 w-auto max-w-[160px] rounded object-contain"
                />
              </span>
            </div>
          )}
          {collapsed && (
            <span className="mx-auto inline-flex rounded-md bg-white p-1 shadow-sm ring-1 ring-slate-600/30">
              <img
                src={herculesLogo}
                alt="Hercules"
                className="h-8 w-auto max-w-[44px] rounded object-contain"
              />
            </span>
          )}
          <button
            onClick={onToggle}
            data-toggle-button="true"
            className="sidebar-toggle-button p-2 rounded-lg font-bold text-white hover:text-cyan-400 transition-colors"
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
        {sidebarNavItems.map((item) => {
          const Icon = item.icon
          const isActive = location === item.path
          
          return (
            <Link key={item.path} href={item.path}>
              <div className={`flex items-center p-3 rounded-lg transition-all duration-200 group cursor-pointer
                             ${isActive 
                               ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 font-bold' 
                               : 'text-white font-bold hover:text-cyan-400 hover:bg-slate-800/50'
                             }`}>
                <Icon className={`h-5 w-5 ${collapsed ? 'mx-auto' : 'mr-3'} flex-shrink-0`} />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{item.label}</div>
                    {isActive && (
                      <div className="text-xs font-bold text-white/80 truncate mt-0.5">
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