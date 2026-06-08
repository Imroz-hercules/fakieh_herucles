/** Outloading DB2 silos 801-848: high tier 801-824, low tier 825-848 (pair N <-> N+24). */

export const OUTLOADING_HIGH_MIN = 801;
export const OUTLOADING_HIGH_MAX = 824;
export const OUTLOADING_LOW_OFFSET = 24;

export type SiloLike = {
  bin_name: string;
  silo_no?: number;
  hl_active: boolean;
  lock_active: boolean;
};

export function isOutloadingTab(tab: string): boolean {
  return tab === 'outloading-1' || tab === 'outloading-2' || tab === 'outloading-3';
}

export function getSiloNo(silo: SiloLike): number {
  if (silo.silo_no != null && silo.silo_no > 0) return silo.silo_no;
  const m = silo.bin_name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function isOutloadingHighSilo(silo: SiloLike): boolean {
  const n = getSiloNo(silo);
  return n >= OUTLOADING_HIGH_MIN && n <= OUTLOADING_HIGH_MAX;
}

export function getPairedLowSiloNo(highSiloNo: number): number {
  return highSiloNo + OUTLOADING_LOW_OFFSET;
}

export function findSiloByNo(allSilos: SiloLike[], siloNo: number): SiloLike | undefined {
  return allSilos.find((s) => getSiloNo(s) === siloNo);
}

/** True when paired low bin (N+24) has hl_active (low level active on PLC). */
export function isPairedLowLevelActive(silo: SiloLike, allSilos: SiloLike[]): boolean {
  const highNo = getSiloNo(silo);
  if (!isOutloadingHighSilo(silo)) return false;
  const low = findSiloByNo(allSilos, getPairedLowSiloNo(highNo));
  return low?.hl_active === true;
}

export function isOutloadingSiloSelectable(silo: SiloLike, allSilos: SiloLike[]): boolean {
  if (silo.lock_active) return false;
  if (!isOutloadingHighSilo(silo)) return false;
  if (isPairedLowLevelActive(silo, allSilos)) return false;
  return true;
}

export function isSiloSelectableForOrder(
  silo: SiloLike,
  orderType: string,
  allSilos: SiloLike[]
): boolean {
  if (orderType === 'outloading') {
    return isOutloadingSiloSelectable(silo, allSilos);
  }
  return !silo.lock_active && !silo.hl_active;
}

export function getOutloadingSiloStatusSuffix(silo: SiloLike, allSilos: SiloLike[]): string {
  if (silo.lock_active) return ' (Locked)';
  if (isPairedLowLevelActive(silo, allSilos)) return ' (Low level active)';
  return ' (Available)';
}

export function formatDestSelLabel(destSel: string | number | undefined | null): string {
  const n = destSel === '' || destSel == null ? null : Number(destSel);
  if (n === 0) return 'Bulk';
  if (n === 1) return 'Packing';
  return destSel != null && destSel !== '' ? String(destSel) : '-';
}
