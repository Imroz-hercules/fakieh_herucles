import React, { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { User, Settings, LogOut, LayoutDashboard, ToggleLeft, ToggleRight, Sun, Moon } from 'lucide-react'
import { Link } from 'wouter'
import AsmLogo from '@/assets/Asm_Logo.png'
import FakiehLogo from '@/assets/fakiehlogo.webp'
import { useTheme } from '@/contexts/ThemeContext'


interface WaterSystemLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export function WaterSystemLayout({ children, title, subtitle }: WaterSystemLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()
  
  const isDarkMode = theme === 'dark'

  return (
    <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 
                    light:bg-white
                    text-white light:text-gray-900 flex relative overflow-hidden">
      
      {/* Matrix Rain Background */}
      <div className="fixed inset-0 pointer-events-none opacity-5 light:opacity-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/20 via-slate-950/50 to-slate-950/80"></div>
      </div>
      
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10">
        
        {/* Top Header */}
        <header className="bg-slate-900/95 light:bg-white border-b border-slate-700/50 light:border-gray-200 backdrop-blur-sm 
                          px-6 py-4 flex items-center justify-between shadow-lg light:shadow-xl">
          <div>
            <h1 className="text-xl font-bold text-white light:text-gray-900">{title}</h1>
            <p className="text-sm text-slate-400 light:text-gray-600">{subtitle}</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* User Info */}
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-slate-300 light:text-gray-700">Production Manager</span>
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 
                              rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button 
                onClick={toggleTheme}
                className={`relative p-2 rounded-lg transition-all duration-300 ${
                  isDarkMode 
                    ? 'bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600' 
                    : 'bg-gray-100 hover:bg-gray-200 border border-gray-300'
                }`}>
                <div className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                  isDarkMode 
                    ? 'bg-slate-600' 
                    : 'bg-blue-400'
                }`}>
                  {/* Sun Icon - Left side */}
                  <div className={`absolute left-1 top-1/2 transform -translate-y-1/2 transition-opacity duration-300 ${
                    isDarkMode ? 'opacity-40' : 'opacity-100'
                  }`}>
                    <Sun className={`h-3 w-3 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                  </div>
                  
                  {/* Moon Icon - Right side */}
                  <div className={`absolute right-1 top-1/2 transform -translate-y-1/2 transition-opacity duration-300 ${
                    isDarkMode ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <Moon className={`h-3 w-3 ${isDarkMode ? 'text-white' : 'text-slate-600'}`} />
                  </div>
                  
                  {/* Toggle Circle */}
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-lg border border-gray-200 ${
                    isDarkMode 
                      ? 'translate-x-6' 
                      : 'translate-x-0.5'
                  }`}>
                    {/* Icon inside the circle */}
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
              <Link href="/water-system/admin">
                <button className={`p-1 transition-colors ${
                  isDarkMode 
                    ? 'rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-cyan-400' 
                    : 'bg-transparent hover:bg-transparent text-gray-600 hover:text-blue-600'
                }`}>
                  <Settings className="h-4 w-4" />
                </button>
              </Link>
              <button className={`p-1 transition-colors ${
                isDarkMode 
                  ? 'rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-red-400' 
                  : 'bg-transparent hover:bg-transparent text-gray-600 hover:text-red-600'
              }`}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            
            {/* Timestamp */}
            <div className="text-xs text-slate-500 light:text-gray-500 border-l border-slate-700 light:border-gray-300 pl-4">
              <div>Thursday, July 24, 2025</div>
              <div className="text-cyan-400 light:text-blue-600">11:42 AM +03</div>
            </div>
            
            {/* Company Logos - Hidden */}
            {/* <div className="flex items-center space-x-4 border-l border-slate-700 light:border-gray-300 pl-4">
              <div className="h-14 w-auto flex items-center p-2 rounded-lg bg-white/10 light:bg-gray-100/50 backdrop-blur-sm border border-white/20 light:border-gray-200">
                <img 
                  src={AsmLogo} 
                  alt="ASM Process Automation" 
                  className="h-12 w-auto object-contain hover:opacity-80 transition-all duration-200"
                  style={{
                    filter: isDarkMode ? 'brightness(1.2) contrast(1.1) drop-shadow(0 0 4px rgba(255,255,255,0.3))' : 'brightness(1) contrast(1.1) drop-shadow(0 0 2px rgba(0,0,0,0.2))',
                  }}
                />
              </div>
              <div className="h-14 w-auto flex items-center p-2 rounded-lg bg-white/10 light:bg-gray-100/50 backdrop-blur-sm border border-white/20 light:border-gray-200">
                <img 
                  src={FakiehLogo} 
                  alt="Fakieh Chicken" 
                  className="h-12 w-auto object-contain hover:opacity-80 transition-all duration-200"
                  style={{
                    filter: isDarkMode ? 'brightness(1.2) contrast(1.1) drop-shadow(0 0 4px rgba(255,255,255,0.3))' : 'brightness(1) contrast(1.1) drop-shadow(0 0 2px rgba(0,0,0,0.2))',
                  }}
                />
              </div>
            </div> */}
          </div>
        </header>
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative h-full smooth-scroll
                         bg-transparent light:bg-gray-50" 
              style={{ height: 'calc(100vh - 88px)' }}>
          
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
          
          {/* Content Container */}
          <div className="relative z-10 max-w-full page-transition page-transition-enter-active">
            {children}
          </div>
          
          {/* Floating Particles - Hidden in light mode */}
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
  )
}