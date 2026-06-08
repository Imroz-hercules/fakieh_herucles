import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'wouter'
import { ChevronDown } from 'lucide-react'
import { User, Settings, LogOut, Sun, Moon } from 'lucide-react'
import herculesLogo from '@/assets/Hercules_New.png'
import { PartnerLogosStrip } from './PartnerLogosStrip'
import { useTheme } from '@/contexts/ThemeContext'
import { topNavItems, type TopNavGroupItem } from './navConfig'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Top bar is always dark chrome (even when the app theme is light). */
function navItemClass(active: boolean) {
  return cn(
    'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-3 text-base font-bold transition-colors',
    active
      ? 'bg-slate-900/95 text-white ring-1 ring-cyan-500/40'
      : 'text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300'
  )
}

function isGroupActive(item: TopNavGroupItem, location: string) {
  return item.items.some((sub) => location === sub.path)
}

function slug(label: string) {
  return label.replace(/\s+/g, '-')
}

function TopNavDropdownGroup({
  item,
  location,
  openMenuLabel,
  setOpenMenuLabel,
}: {
  item: TopNavGroupItem
  location: string
  openMenuLabel: string | null
  setOpenMenuLabel: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = openMenuLabel === item.label
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number } | null>(null)

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, left: r.left, minWidth: Math.max(220, r.width) })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  const Icon = item.icon
  const groupActive = isGroupActive(item, location)
  const id = slug(item.label)

  const menuPanel = (
    <div className="topnav-menu-panel app-chrome-dark rounded-lg border border-slate-600/90 bg-slate-900 py-1 shadow-2xl">
      {item.items.map((sub) => {
        const subActive = location === sub.path
        return (
          <Link key={sub.path} href={sub.path} role="menuitem" onClick={() => setOpenMenuLabel(null)}>
            <div
              className={cn(
                'px-4 py-2.5 text-base font-semibold transition-colors',
                subActive
                  ? 'bg-cyan-600/20 text-cyan-300'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white'
              )}
            >
              {sub.label}
            </div>
          </Link>
        )
      })}
    </div>
  )

  return (
    <>
      <div className="relative shrink-0" data-topnav-dropdown-root>
        <button
          ref={triggerRef}
          type="button"
          data-topnav-item
          data-active={groupActive || open ? true : undefined}
          className={cn(navItemClass(groupActive || open), 'cursor-pointer')}
          aria-expanded={open}
          aria-haspopup="menu"
          id={`topnav-trigger-${id}`}
          aria-controls={`topnav-menu-${id}`}
          onClick={() => setOpenMenuLabel((prev) => (prev === item.label ? null : item.label))}
        >
          <Icon className="h-5 w-5 shrink-0 opacity-95" />
          {item.label}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-slate-300 opacity-80 transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </div>
      {open &&
        coords !== null &&
        createPortal(
          <div
            id={`topnav-menu-${id}`}
            role="menu"
            aria-labelledby={`topnav-trigger-${id}`}
            data-topnav-dropdown-portal
            className="fixed z-[300]"
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: coords.minWidth,
            }}
          >
            {menuPanel}
          </div>,
          document.body
        )}
    </>
  )
}

export function WaterTopNav() {
  const [location] = useLocation()
  const { theme, toggleTheme } = useTheme()
  const isDarkMode = theme === 'dark'

  const [openMenuLabel, setOpenMenuLabel] = useState<string | null>(null)

  useEffect(() => {
    setOpenMenuLabel(null)
  }, [location])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const inside =
        t.closest('[data-topnav-dropdown-root]') || t.closest('[data-topnav-dropdown-portal]')
      if (inside) return
      setOpenMenuLabel(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  return (
    <header
      className={cn(
        'water-top-nav app-chrome-dark mb-2 flex w-full min-h-[132px] shrink-0 items-center gap-4 rounded-2xl border px-5 py-2 shadow-lg backdrop-blur-sm sm:mb-3',
        'border-slate-600/70 bg-slate-950/95 text-slate-100'
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-lg border-l border-slate-600/80 bg-slate-900/35 py-0 pl-3 pr-3 sm:pl-4 sm:pr-4'
        )}
      >
        <Link href="/fakieh/fakieh-dashboard" className="flex shrink-0 items-center">
          <span className="inline-flex shrink-0 rounded-md bg-white p-0.5 shadow-sm ring-1 ring-slate-600/25">
            <img
              src={herculesLogo}
              alt="Hercules"
              className="h-28 w-auto max-w-[420px] shrink-0 rounded object-contain"
            />
          </span>
        </Link>
      </div>

      <div className="h-28 w-px shrink-0 self-center bg-slate-400/60" aria-hidden />

      <nav
        className={cn(
          'flex min-h-0 min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-visible py-1 pl-3 sm:gap-2 sm:pl-4',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
        )}
        aria-label="Main"
      >
        {topNavItems.map((item) => {
          if (item.kind === 'link') {
            const Icon = item.icon
            const active = location === item.path
            return (
              <Link key={item.path} href={item.path}>
                <span className={navItemClass(active)}>
                  <Icon className="h-5 w-5 shrink-0 opacity-95" />
                  {item.label}
                </span>
              </Link>
            )
          }

          return (
            <TopNavDropdownGroup
              key={item.label}
              item={item}
              location={location}
              openMenuLabel={openMenuLabel}
              setOpenMenuLabel={setOpenMenuLabel}
            />
          )
        })}
      </nav>

      <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 border-l border-slate-600/80 pl-3 sm:gap-3 sm:pl-4">
        <PartnerLogosStrip variant="topnav" />

        <button
          type="button"
          data-topnav-tool="theme"
          onClick={toggleTheme}
          className="relative rounded-lg border border-slate-600 bg-slate-800/50 p-2 transition-colors hover:bg-slate-700/50"
          aria-label="Toggle theme"
        >
          <div
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              isDarkMode ? 'bg-slate-600' : 'bg-blue-400'
            )}
          >
            <div
              className={cn(
                'absolute left-1 top-1/2 -translate-y-1/2 transition-opacity',
                isDarkMode ? 'opacity-40' : 'opacity-100'
              )}
            >
              <Sun className={cn('h-3 w-3', isDarkMode ? 'text-yellow-400' : 'text-yellow-600')} />
            </div>
            <div
              className={cn(
                'absolute right-1 top-1/2 -translate-y-1/2 transition-opacity',
                isDarkMode ? 'opacity-100' : 'opacity-40'
              )}
            >
              <Moon className={cn('h-3 w-3', isDarkMode ? 'text-white' : 'text-slate-600')} />
            </div>
            <div
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full border border-gray-200 bg-white shadow-md transition-transform',
                isDarkMode ? 'translate-x-6' : 'translate-x-0.5'
              )}
            />
          </div>
        </button>

        <Link href="/fakieh/admin">
          <button
            type="button"
            data-topnav-tool="settings"
            className="rounded-lg bg-slate-800/50 p-2.5 text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-cyan-400"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </Link>

        <div className="ml-1 shrink-0 border-l border-slate-600/80 pl-2 sm:ml-2 sm:pl-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-topnav-tool="profile"
                className="rounded-full bg-transparent outline-none ring-offset-2 ring-offset-transparent transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-cyan-400 dark:ring-offset-slate-950"
                aria-label="Open profile menu"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 sm:h-10 sm:w-10">
                  <User className="h-4 w-4 text-white sm:h-[18px] sm:w-[18px]" />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="min-w-[12rem] border-slate-600 bg-slate-900 text-slate-100"
            >
              <DropdownMenuLabel className="text-base font-bold text-slate-100">
                Production Manager
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-600" />
              <DropdownMenuItem className="cursor-pointer text-red-400 focus:bg-slate-800 focus:text-red-300">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
