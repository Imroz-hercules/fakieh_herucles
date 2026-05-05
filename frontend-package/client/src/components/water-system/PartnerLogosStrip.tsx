import React from 'react'
import AsmLogo from '@/assets/Asm_Logo.png'
import FakiehLogo from '@/assets/fakiehlogo.webp'
import { cn } from '@/lib/utils'

type PartnerLogosVariant = 'topnav' | 'sidebar'

interface PartnerLogosStripProps {
  /** `topnav`: larger chips, can hide below `sm`. `sidebar`: compact, always visible in header. */
  variant?: PartnerLogosVariant
}

export function PartnerLogosStrip({ variant = 'topnav' }: PartnerLogosStripProps) {
  const isSidebar = variant === 'sidebar'

  return (
    <div
      className={cn(
        'shrink-0 items-center gap-2.5 border-r border-slate-600/70 pr-4 md:gap-3 md:pr-5',
        isSidebar ? 'flex' : 'hidden sm:flex'
      )}
      aria-label="Fakieh and ASM"
    >
      {/* Fakieh — left */}
      <div
        className={cn(
          'flex items-center justify-center rounded-md bg-white/5 px-2.5 ring-1 ring-white/10 sm:px-3',
          isSidebar
            ? 'h-11 max-w-[120px] sm:h-12 sm:max-w-[140px]'
            : 'h-12 max-w-[140px] sm:h-14 sm:max-w-[170px] md:h-[3.75rem] md:max-w-[200px]'
        )}
      >
        <img
          src={FakiehLogo}
          alt="Fakieh"
          className={cn(
            'w-auto max-w-full object-contain',
            isSidebar ? 'max-h-9 sm:max-h-10' : 'max-h-10 sm:max-h-11 md:max-h-12'
          )}
        />
      </div>
      {/* ASM — right */}
      <div
        className={cn(
          'flex items-center rounded-md bg-white/5 px-2.5 ring-1 ring-white/10 sm:px-3',
          isSidebar
            ? 'h-11 max-w-[160px] sm:h-12 sm:max-w-[200px]'
            : 'h-12 max-w-[220px] sm:h-14 sm:max-w-[260px] md:h-[3.75rem] md:max-w-[300px]'
        )}
      >
        <img
          src={AsmLogo}
          alt="ASM Process Automation"
          className={cn(
            'w-auto max-w-full object-contain object-left',
            isSidebar ? 'max-h-9 sm:max-h-10' : 'max-h-10 sm:max-h-11 md:max-h-12'
          )}
        />
      </div>
    </div>
  )
}
