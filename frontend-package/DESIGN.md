# DESIGN.md — Plant 3D visual world

Durable visual decisions for `/fakieh/plant-3d`. Written 2026-09-01 at the start of the visual overhaul. Provisional tokens are marked; they are settled by the first build and updated here.

## World
**A clean daylight scale model of the plant.** The structure is neutral and detailed; the data is the only colour. Reads like a premium architectural model on a drawing board, with the silo list as the schedule beside it. It refuses the dark-glow "digital twin" arrangement and the murky sunset.

## Scene palette (day look)
| Role | Value | Note |
|---|---|---|
| Sky zenith / mid / horizon | `#3d7cc0` / `#8fb8dd` / `#dfe8f0` | gradient dome, art-directed, not scattering |
| Sun | `#fff6e8` | elevation ~50°, 45–80° off every camera direction |
| Fog | `#dfe8f0` from 450 m | horizon dissolve only |
| Apron / yard / road / terrain | `#b9b5ad` / `#a8a49b` / `#4a4d52` / `#c9bfae` | provisional |
| Galvanised steel | base `#aab3ba`, metalness 0.6, roughness 0.35 | corrugated via normal map at 0.28 m pitch |
| Painted steel | base per group, metalness 0.05, roughness 0.55 | 400/900 pale green-grey `#a9b9b0`, 800 pale grey `#c4c9cd` |
| Concrete | `#c8c3b8`, metalness 0, roughness 0.9 | 100/200 bulk silos |
| Structure steel | `#5a636c` (was `#3b4249`), metalness 0.5, roughness 0.6 | legs, rings, ladders, trusses |
| Accents (hatches) | structure steel | no safety-yellow: cyan is the only accent and it means selection (PRODUCT.md rule 4; caught by the Codex audit) |
| Building cladding / roof / office | `#cfd3d6` / `#b7bcc1` / `#d8d4cc` | ribbed via shader stripe |
| Selection accent | `#22d3ee` | the only meaning of cyan |
| Alarm | HL `#ef4444` pulsing beacon; lock static padlock glyph | never on the shell colour |
| Material colours | `MATERIAL_PALETTE` in `siloData.ts`, roster-anchored | matte contents; unchanged |
| Fill-status mode | low `#c9a86a`, normal `#7f95a8`, high `#e0a030`, alarm `#ef4444` | mutually exclusive with material mode |

**Daylight is the default look** (client decision, 2026-09-02, final after briefly choosing dusk: "it looks better"). Floors for day: mid-tones ≥ 30% whole-site, ≥ 35% per zone, material separability passing. Dusk is the first alternate and is rebuilt to the same floors minus 5 points — a clean low warm sun on neutral steel with a blue-to-warm gradient sky, not a sunset filter. Night: ≥ 15% mid-tones with masts on. All three share materials; only sky, sun, exposure and mast light change.

## Silo proportions (client decision, 2026-09-02)
Vertical stretch 1.25× (was 1.55×). Assumed base diameters after the client's "go further, buildings may exceed the aerial" instruction: 100/200 11 m (pitch 12/13), 500 6.5 m, 300 4.45 m (pitch 4.8), 400 2.7 m (pitch 2.9), 600 small 2.7 m (pitch 5x7), 600 large 4.5 m, 800 2.65 m (pitch 2.94), 900 unchanged (their group spacing binds at 1.38 m). Drawn aspect (height ÷ diameter): 100 2.9, 300 5.3, 800 6.3, 600 large 2.1, 400/600 small 1.6. A 5 t bin cannot exceed 2.7 m: its 60-degree hopper would hold more than its capacity (the capacity check refused 3.2 m). Buildings grown to hold them: mill-a 61.5 m (x −46..15.5), mill-b 44 m (16..60), press house 18 m (60.5..78.5), finished store 59 m (79..138); fence line z −69..109. The 300 and 800 rows are at their maximum: the process spine's buildings are contiguous, so each can only grow into space its neighbour does not need. Group centres and row counts never change; pitch opens with the drawn size. The 400 series stands on its own mezzanine (`mineral-floor`, in mill-a) so it no longer hangs in the air.

## Silo grammar
- Shell: clean acrylic. Fresnel alpha `mix(0.10, 0.85, rim²)`, no shade-driven solidifying, no dark flank. Uncoded bins floor at 0.18.
- Contents: matte, material colour, subtle darkening into the hopper; surface disc +12%.
- Level: a thin bright ring at the surface on both passes.
- Structure: parts by `aPart` (wall, roof, hopper, structure, rings, accents); archetype per series.
- No data: 0.35 alpha shell, 45° hatch, dashed rim.
- Selection: a proxy mesh (the bin's own geometry at its transform, one non-instanced mesh) drawn as an accent fresnel shell, plus the number pill. Not a post-process outline: the pinned `Outline` selects whole `Object3D`s, so on an InstancedMesh it would outline the entire group, and it costs a full-scene depth pass. No floor ring, no beam.
- Corrugation pitch is normalised by the instance's draw scale (read from `instanceMatrix`), so the ridge spacing is constant in world metres rather than stretching with the capacity compression.

## Page grammar
- Immersive on this route: 68 px icon rail, 44 px header strip, zero page padding.
- Split view: canvas `minmax(0,1fr)` + list `clamp(280px, 28%, 360px)`; under 1100 px the list becomes a bottom sheet.
- Nothing floats over the plant except the 32 px legend dock along the canvas bottom and the silo-number pills.
- Cards: hairline border, soft offset shadow, near-white in light theme (`bg-white/95`), near-black in dark (`bg-slate-950/90`). No glass as decoration.
- Header: title left, zone segmented control centre, look controls right. Breadcrumb replaces the segmented label when a bin is focused.

## Type
System sans stack. Sizes 11 / 12 / 13 / 15 / 22 px, weights 400 / 500 / 600. `font-variant-numeric: tabular-nums` on every number. Monospace only for silo numbers.

## Motion
150–250 ms, exponential ease-out, state-conveying only: fly-to, fill easing, beacon pulse (1.2 s), list expand, sheet drag. Respects `prefers-reduced-motion`.

## Touch and access
Targets ≥ 24 px everywhere, ≥ 44 px on tablet; 8 px gutter from the canvas edge; every control has `aria-label`/`aria-pressed`; light and dark both pass 4.5:1 on body text.

## Performance envelope
≤ 350 k tris whole site, ≤ 420 k in a zone, ≤ 120 draw calls; ≥ 40 fps static / ≥ 35 orbiting on the Iris Xe at the immersive canvas size, dpr 1.5. Data-URI textures only; no runtime network fetches.
