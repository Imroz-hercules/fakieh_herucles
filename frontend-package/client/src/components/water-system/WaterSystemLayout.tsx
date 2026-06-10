import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { WaterTopNav } from './WaterTopNav'
import { PartnerLogosStrip } from './PartnerLogosStrip'
import { User, Settings, Bell, Sun, Moon } from 'lucide-react'
import { Link } from 'wouter'
import { useTheme } from '@/contexts/ThemeContext'
import { useNavLayout } from '@/contexts/NavLayoutContext'
import { cn } from '@/lib/utils'

interface WaterSystemLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
  /** When false, page renders its own title inside content. */
  showPageTitle?: boolean
}

export function WaterSystemLayout({
  children,
  title,
  subtitle,
  showPageTitle = true,
}: WaterSystemLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { navLayout } = useNavLayout()
  const isTopbar = navLayout === 'topbar'
  const isDarkMode = theme === 'dark'

  return (
    <div
      className={cn(
        'relative flex h-screen overflow-hidden',
        isTopbar
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white light:bg-white light:text-gray-900'
          : 'bg-gray-100 text-gray-900 dark:bg-slate-950 dark:text-white'
      )}
    >
      {/* Matrix Rain Background — topbar mode only */}
      {isTopbar && (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-5 light:opacity-0">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/20 via-slate-950/50 to-slate-950/80" />
        </div>
      )}

      {!isTopbar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            isTopbar ? 'px-3 pt-3 sm:px-5 sm:pt-4' : 'min-h-0'
          )}
        >
          {isTopbar ? (
            <WaterTopNav />
          ) : (
            <header
              className={cn(
                'water-page-header app-chrome-dark relative flex min-h-[120px] shrink-0 items-center gap-4 border-b px-5 py-3 sm:px-6',
                'border-slate-800 bg-[#0f172a] text-slate-100'
              )}
            >
              {showPageTitle && (
                <div className="relative z-10 min-w-0 flex-1">
                  <h1 className="truncate text-2xl font-bold text-white">{title}</h1>
                  <p className="truncate text-base text-slate-400">{subtitle}</p>
                </div>
              )}

              <div className="relative z-10 ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
                <PartnerLogosStrip variant="sidebar" />

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="hidden rounded-lg p-2.5 text-slate-300 transition-colors hover:bg-white/5 hover:text-white sm:block"
                  aria-label="Toggle theme"
                >
                  {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  className="rounded-lg p-2.5 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                </button>

                <Link href="/fakieh/admin">
                  <button
                    type="button"
                    className="rounded-lg p-2.5 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label="Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                </Link>

                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700"
                  title="Production Manager"
                  aria-label="Production Manager profile"
                >
                  <User className="h-5 w-5 text-white" />
                </div>
              </div>
            </header>
          )}

          <main
            className={cn(
              'relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto smooth-scroll',
              isTopbar
                ? 'rounded-b-2xl border border-t-0 p-6 dark:border-slate-600/70 light:border-gray-200 light:bg-gray-50'
                : 'bg-gray-100 p-6 dark:bg-slate-950'
            )}
          >
            {isTopbar && (
              <>
                <div className="pointer-events-none absolute inset-0 opacity-5 light:opacity-0">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage: `linear-gradient(rgba(0,188,212,0.1) 1px, transparent 1px),
                                        linear-gradient(90deg, rgba(0,188,212,0.1) 1px, transparent 1px)`,
                      backgroundSize: '50px 50px',
                    }}
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 overflow-hidden light:hidden">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute h-1 w-1 animate-float rounded-full bg-cyan-400/30"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 10}s`,
                        animationDuration: `${15 + Math.random() * 10}s`,
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="relative z-10 max-w-full page-transition page-transition-enter-active">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
