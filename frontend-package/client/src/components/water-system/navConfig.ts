import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Database,
  Truck,
  History,
  Radio,
  Scale,
  Settings,
  ShoppingCart,
} from 'lucide-react'

export interface SidebarNavItem {
  path: string
  icon: LucideIcon
  label: string
  description: string
}

/** Sidebar + Admin: single list used by `Sidebar`. */
export const sidebarNavItems: SidebarNavItem[] = [
  {
    path: '/fakieh/fakieh-dashboard',
    icon: LayoutDashboard,
    label: 'Fakieh Dashboard',
    description: 'Main Production Dashboard',
  },
  {
    path: '/fakieh/storage',
    icon: Database,
    label: 'Storage',
    description: 'Storage Management',
  },
  {
    path: '/fakieh/live_orders',
    icon: Truck,
    label: 'Live orders',
    description: 'Real-time Orders from SCADA',
  },
  {
    path: '/fakieh/order-history',
    icon: History,
    label: 'Order History',
    description: 'Complete Order History from Database',
  },
  {
    path: '/fakieh/rfid',
    icon: Radio,
    label: 'RFID',
    description: 'RFID Tracking System',
  },
  {
    path: '/fakieh/weighbridge',
    icon: Scale,
    label: 'Weighbridge Log',
    description: 'Weighbridge Management',
  },
  {
    path: '/fakieh/truck-entry',
    icon: Truck,
    label: 'Truck Weighbridge',
    description: 'Live Weighbridge & Entry Management',
  },
  {
    path: '/fakieh/truck-management',
    icon: Truck,
    label: 'Truck Management',
    description: 'Manage Trucks & Fleet',
  },
  {
    path: '/fakieh/admin',
    icon: Settings,
    label: 'Admin',
    description: 'System Administration & Configuration',
  },
]

export type TopNavLinkItem = {
  kind: 'link'
  path: string
  label: string
  icon: LucideIcon
}

export type TopNavGroupItem = {
  kind: 'group'
  label: string
  icon: LucideIcon
  items: { path: string; label: string }[]
}

export type TopNavItem = TopNavLinkItem | TopNavGroupItem

/** Top bar: Admin omitted (gear in chrome). Orders / Truck are hover groups. */
export const topNavItems: TopNavItem[] = [
  {
    kind: 'link',
    path: '/fakieh/fakieh-dashboard',
    label: 'Fakieh Dashboard',
    icon: LayoutDashboard,
  },
  {
    kind: 'link',
    path: '/fakieh/storage',
    label: 'Storage',
    icon: Database,
  },
  {
    kind: 'group',
    label: 'Orders',
    icon: ShoppingCart,
    items: [
      { path: '/fakieh/live_orders', label: 'Live orders' },
      { path: '/fakieh/order-history', label: 'Order history' },
    ],
  },
  {
    kind: 'link',
    path: '/fakieh/rfid',
    label: 'RFID',
    icon: Radio,
  },
  {
    kind: 'link',
    path: '/fakieh/weighbridge',
    label: 'Weighbridge Log',
    icon: Scale,
  },
  {
    kind: 'group',
    label: 'Truck',
    icon: Truck,
    items: [
      { path: '/fakieh/truck-management', label: 'Truck management' },
      { path: '/fakieh/truck-entry', label: 'Truck weighbridge' },
    ],
  },
]
