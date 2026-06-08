import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { WaterTopNav } from './WaterTopNav'
import { PartnerLogosStrip } from './PartnerLogosStrip'
import { User, Settings, LogOut, Sun, Moon } from 'lucide-react'
import { Link } from 'wouter'
import { useTheme } from '@/contexts/ThemeContext'
import { useNavLayout } from '@/contexts/NavLayoutContext'
import { cn } from '@/lib/utils'

interface WaterSystemLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export function WaterSystemLayout({ children, title, subtitle }: WaterSystemLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { navLayout } = useNavLayout()
  const isTopbar = navLayout === 'topbar'

  const isDarkMode = theme === 'dark'

  return (
    <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 
                    light:bg-white
                    text-white light:text-gray-900 flex relative overflow-hidden">
      
      {/* Matrix Rain Background */}
      <div className="fixed inset-0 pointer-events-none opacity-5 light:opacity-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/20 via-slate-950/50 to-slate-950/80"></div>
      </div>
      
      {!isTopbar && (
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        />
      )}
      
      {/* Main Content — shared inset matches topbar / header width in both nav modes */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            isTopbar ? 'px-3 pt-3 sm:px-5 sm:pt-4' : 'pl-0 pr-3 pt-0 sm:pr-5'
          )}
        >
        {isTopbar ? (
          <WaterTopNav />
        ) : (
          <header
            className={cn(
              'app-chrome-dark flex min-h-[108px] min-w-0 shrink-0 flex-wrap items-center justify-between gap-3',
              'border border-l-0 border-slate-700/50 bg-slate-900/95 px-6 py-4 backdrop-blur-sm',
              'rounded-none rounded-tr-2xl shadow-none'
            )}
          >
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">{title}</h1>
              <p className="text-sm font-bold text-white">{subtitle}</p>
            </div>
            
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <PartnerLogosStrip variant="sidebar" />
              <div className="flex items-center text-sm font-bold">
                <span className="text-white">Production Manager</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <button 
                  type="button"
                  onClick={toggleTheme}
                  className="relative p-2 rounded-lg transition-all duration-300 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600">
                  <div className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    isDarkMode ? 'bg-slate-600' : 'bg-blue-400'
                  }`}>
                    <div className={`absolute left-1 top-1/2 transform -translate-y-1/2 transition-opacity duration-300 ${
                      isDarkMode ? 'opacity-40' : 'opacity-100'
                    }`}>
                      <Sun className={`h-3 w-3 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                    </div>
                    
                    <div className={`absolute right-1 top-1/2 transform -translate-y-1/2 transition-opacity duration-300 ${
                      isDarkMode ? 'opacity-100' : 'opacity-40'
                    }`}>
                      <Moon className={`h-3 w-3 ${isDarkMode ? 'text-white' : 'text-slate-600'}`} />
                    </div>
                    
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-lg border border-gray-200 ${
                      isDarkMode 
                        ? 'translate-x-6' 
                        : 'translate-x-0.5'
                    }`}>
                      <div className="flex items-center justify-center h-full">
                        {isDarkMode ? (
                          <Moon className="h-3 w-3 text-slate-700" />
                        ) : (
                          <Sun className="h-3 w-3 text-yellow-600" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                <Link href="/fakieh/admin">
                  <button type="button" className="p-1 transition-colors rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-cyan-400">
                    <Settings className="h-4 w-4" />
                  </button>
                </Link>
                <button type="button" className="p-1 transition-colors rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-red-400">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
              
              <div className="text-xs font-bold text-white border-l border-slate-700 pl-4">
                <div>Thursday, July 24, 2025</div>
                <div className="text-cyan-400">11:42 AM +03</div>
              </div>

              <div
                className="flex shrink-0 items-center border-l border-slate-700 pl-3"
                title="Production Manager"
                aria-label="Production Manager profile"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                  <User className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main
          className={cn(
            'relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 smooth-scroll bg-transparent light:bg-gray-50',
            'border dark:border-slate-600/70 light:border-gray-200',
            isTopbar
              ? 'rounded-b-2xl border-t-0'
              : 'rounded-none rounded-br-2xl border-l-0 border-t-0 app-chrome-dark bg-slate-900/95 backdrop-blur-sm light:bg-gray-50'
          )}
        >
          
          {/* Background Grid Pattern - Hidden in light mode */}
          <div className="absolute inset-0 pointer-events-none opacity-5 light:opacity-0">
            <div className="w-full h-full" 
                 style={{
                   backgroundImage: `linear-gradient(rgba(0,188,212,0.1) 1px, transparent 1px),
                                    linear-gradient(90deg, rgba(0,188,212,0.1) 1px, transparent 1px)`,
                   backgroundSize: '50px 50px'
                 }}>
            </div>
          </div>
          
          <div className="relative z-10 max-w-full page-transition page-transition-enter-active">
            {children}
          </div>
          
          <div className="absolute inset-0 pointer-events-none overflow-hidden light:hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-cyan-400/30 rounded-full animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 10}s`,
                  animationDuration: `${15 + Math.random() * 10}s`
                }}
              />
            ))}
          </div>
        </main>
        </div>
      </div>
    </div>
  )
}
