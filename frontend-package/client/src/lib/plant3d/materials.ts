/**
 * The plant's material roster, and a stable colour slot for each.
 *
 * WHERE THIS COMES FROM
 * ---------------------
 * `client/src/constants/materialCodes.ts` — the app's own table, mirrored from
 * the PLC's XML and already used by the Orders and Truck Weighbridge screens.
 * That is the authoritative list, it was here all along, and this view was not
 * using it: the 3D view knew a material only by whatever name the silo feed
 * happened to attach to a row.
 *
 * Supplemented by `Documents/Fakieh_BatchData/One_batch_data.csv`, a batch
 * export from the machine that hosted this application previously. It names ten
 * materials the PLC table does not carry — the ones dosed by recipe rather than
 * selected on a truck. It is production HISTORY and is used only as a
 * dictionary: it says which codes exist and what the plant calls them. It says
 * nothing about what is in any bin today, and using it that way would be
 * inventing live plant state.
 *
 * PADDING
 * -------
 * The two sources disagree with each other, which is the whole reason this
 * normalises. The PLC table zero-pads some codes (`002`, `012`, `035`, `060`,
 * `072`, `073`) while the batch export writes the same materials unpadded
 * (`2`, `12`, `35`, `60`, `72`, `73`). Either lookup on its own silently misses
 * the other's spelling and the bin falls back to showing a bare number. Both
 * sides are normalised before matching.
 *
 * WHY THE ORDER IS LOAD-BEARING
 * -----------------------------
 * Colour used to be assigned by position among the codes PRESENT in the current
 * feed, so a material's colour depended on what else was loaded that day: put
 * code 8 in any bin and it sorts to the front, takes the first colour, and every
 * other material shifts one along. Maize would change colour between shifts.
 *
 * On an operations screen that is a defect, not a cosmetic issue — the point of
 * colour is that an operator learns it. Anchoring to a fixed roster makes the
 * mapping stable for every code the plant is known to use. APPEND new codes at
 * the end rather than inserting them, or everything after the insertion moves.
 */
import { MATERIAL_CODES } from '../../constants/materialCodes';

/**
 * Codes the plant's batch records use that the PLC table does not list — the
 * recipe-dosed materials. Names cleaned up from the export's own spelling.
 */
const BATCH_ONLY: readonly (readonly [string, string])[] = [
  ['30', 'Lysoforte Dry'],
  ['33', 'TermiN-8'],
  ['74', 'Rovabio Advance'],
  ['75', 'Rovabio PhyPlus'],
  ['77', 'Kenzyme Pro'],
  ['111', 'HY-Bond'],
  ['124', 'Solis'],
  ['140', 'Biostrong 510'],
  ['142', 'Betaine HCL'],
  ['149', 'Herbin'],
] as const;

/**
 * One spelling for a code, whatever spelling it arrived in.
 *
 * Leading zeros only — `035` and `35` are the same material. Anything that is
 * not a plain number is left exactly as it is rather than guessed at.
 */
export function normaliseCode(code: string | null | undefined): string {
  const c = String(code ?? '').trim();
  return /^\d+$/.test(c) ? String(Number(c)) : c;
}

/** Placeholders in the PLC table that are not materials. */
const NOT_A_MATERIAL = new Set(['None', 'Empty']);

/**
 * The roster: the PLC table in its own order, then the batch-only codes.
 *
 * Its ORDER fixes every material's colour, so it must stay stable.
 */
export const MATERIAL_ROSTER: readonly (readonly [string, string])[] = (() => {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const { code, name } of MATERIAL_CODES) {
    const key = normaliseCode(code);
    /*
     * `None` and `000`/Empty are placeholders, not materials a bin holds, so
     * they get no colour slot.
     *
     * `5000`/PRODUCT1 is NOT excluded, and this comment used to claim it was.
     * An audit caught the contradiction. Leaving it in is the deliberate
     * choice, for the reason stated just above: this roster's ORDER fixes
     * every material's colour, and 5000 is the fourth of the PLC table's 31
     * entries — dropping it would shift the colour of 27 real materials to
     * tidy away one that has never appeared. Checked against the live feed:
     * the codes actually in use are 100, 105, 112, 113, 202 and 210.
     *
     * The cost of keeping it is bounded and worth stating: if a bin ever does
     * report 5000, it will be drawn and named PRODUCT1 like any other
     * material. That is what the plant's own PLC table says it is, so it is
     * not a lie — it is simply a test product being reported as one.
     */
    if (!/^\d+$/.test(key) || NOT_A_MATERIAL.has(name) || Number(key) === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([key, name]);
  }
  for (const [code, name] of BATCH_ONLY) {
    const key = normaliseCode(code);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([key, name]);
  }
  return out;
})();

const ROSTER_INDEX: ReadonlyMap<string, number> = new Map(
  MATERIAL_ROSTER.map(([code], i) => [code, i]),
);
const ROSTER_NAME: ReadonlyMap<string, string> = new Map(MATERIAL_ROSTER);

/** How many colour slots the roster reserves before unknown codes begin. */
export const ROSTER_SIZE = MATERIAL_ROSTER.length;

/** The fixed colour slot for a code, or `null` if the plant has never named it. */
export function rosterSlot(code: string): number | null {
  return ROSTER_INDEX.get(normaliseCode(code)) ?? null;
}

/**
 * The plant's own name for a code.
 *
 * A FALLBACK. The live feed's name wins when it has one — it says "Yellow Maize
 * 7.8%" where this says the same thing, but it is the fresher source. This is
 * what stops a bin showing a bare number for a material the feed did not name.
 */
export function rosterName(code: string): string | null {
  return ROSTER_NAME.get(normaliseCode(code)) ?? null;
}
