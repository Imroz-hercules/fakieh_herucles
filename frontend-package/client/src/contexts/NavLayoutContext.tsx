import React, { createContext, useContext, useState, useCallback } from 'react'

export type NavLayoutMode = 'sidebar' | 'topbar'

interface NavLayoutContextType {
  navLayout: NavLayoutMode
  setNavLayout: (layout: NavLayoutMode) => void
}

const STORAGE_KEY = 'fakieh-nav-layout'

const NavLayoutContext = createContext<NavLayoutContextType | undefined>(undefined)

function readStoredLayout(): NavLayoutMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'topbar' ? 'topbar' : 'sidebar'
  } catch {
    return 'sidebar'
  }
}

export function NavLayoutProvider({ children }: { children: React.ReactNode }) {
  const [navLayout, setNavLayoutState] = useState<NavLayoutMode>(readStoredLayout)

  const setNavLayout = useCallback((layout: NavLayoutMode) => {
    setNavLayoutState(layout)
    try {
      localStorage.setItem(STORAGE_KEY, layout)
    } catch {
      /* ignore quota */
    }
  }, [])

  return (
    <NavLayoutContext.Provider value={{ navLayout, setNavLayout }}>
      {children}
    </NavLayoutContext.Provider>
  )
}

export function useNavLayout() {
  const ctx = useContext(NavLayoutContext)
  if (ctx === undefined) {
    throw new Error('useNavLayout must be used within a NavLayoutProvider')
  }
  return ctx
}
