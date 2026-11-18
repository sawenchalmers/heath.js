/**
 * EPSMService
 * -----------
 * Thin client for the public EPSM materials/construction database.
 * Base URL: https://epsm.chalmers.se
 *
 * All read endpoints are publicly accessible — no authentication required.
 * The browser calls it through <base path>api/epsm (/api/epsm in dev, /heath/api/epsm when deployed),
 * which the Vite proxy in dev and the container's nginx in production forward, to avoid CORS issues.
 *
 * Embodied carbon calculation is done client-side:
 *   GWP (kg CO₂e) = construction.gwp_kgco2e_per_m2 × surface_area_m2
 * No EnergyPlus run needed — EPSM pre-computes gwp_kgco2e_per_m2 per construction.
 */

import { DEFAULT_FACADE_PARAMETERS } from './FacadeGeometry';
import { calculateBuildingMetrics } from '../utils/buildingMetrics';

const EPSM_BASE = (import.meta.env.VITE_EPSM_BASE_URL as string | undefined) || `${import.meta.env.BASE_URL}api/epsm`;

// ── Types ──────────────────────────────────────────────────────────────────

/** A single construction record from GET /api/constructions/ */
export interface EPSMConstruction {
  id: string;
  name: string;
  /** 'wall' | 'roof' | 'floor' | 'ceiling' | 'window' */
  element_type: string;
  u_value_w_m2k: number;
  gwp_kgco2e_per_m2: number;
  cost_sek_per_m2: number;
}

/** Shape expected by the <select> options in BuildingEditPanel */
export interface ConstructionOption {
  label: string;
  value: string;
  /** GWP of this construction (kg CO₂e/m²) — used for live embodied carbon display */
  gwp: number;
  uValue: number;
}

export interface EPSMConstructionOptions {
  wall: ConstructionOption[];
  floor: ConstructionOption[];
  roof: ConstructionOption[];
  window: ConstructionOption[];
  /** Raw list for lookup by name */
  byName: Map<string, EPSMConstruction>;
}

export type EPSMElementType = 'wall' | 'floor' | 'roof' | 'window';
export type ResolvedEnergyConstructions = Record<EPSMElementType, string>;

const DEFAULT_SENTINELS: Record<EPSMElementType, string> = {
  wall: 'Default Wall',
  floor: 'Default Floor',
  roof: 'Default Roof',
  window: 'Default Window',
};

export function resolveEnergyConstructions(
  options: EPSMConstructionOptions | null,
  selections: Partial<ResolvedEnergyConstructions>
): ResolvedEnergyConstructions {
  if (!options) throw new Error('Energy constructions are unavailable. EPSM could not be loaded.');

  const resolve = (type: EPSMElementType): string => {
    const selected = selections[type];
    if (!selected || selected === DEFAULT_SENTINELS[type]) {
      const fallback = options[type][0]?.value;
      if (!fallback) throw new Error(`No EPSM ${type} constructions are available.`);
      return fallback;
    }
    if (!options[type].some(option => option.value === selected)) {
      throw new Error(`“${selected}” is not available in EPSM for ${type}. Choose another construction.`);
    }
    return selected;
  };

  return {
    wall: resolve('wall'),
    floor: resolve('floor'),
    roof: resolve('roof'),
    window: resolve('window'),
  };
}

/** Surface areas needed to calculate total embodied carbon */
export interface BuildingSurfaces {
  /** Total opaque wall area (m²) */
  wallArea: number;
  /** Total floor area (m²) — footprint × floors */
  floorArea: number;
  /** Roof area (m²) — same as footprint area */
  roofArea: number;
  /** Window area (m²) — wallArea × window_to_wall_ratio */
  windowArea: number;
}

/** Per-element GWP breakdown + total */
export interface EmbodiedCarbonResult {
  wall_gwp_kgco2e: number;
  floor_gwp_kgco2e: number;
  roof_gwp_kgco2e: number;
  window_gwp_kgco2e: number;
  total_gwp_kgco2e: number;
  /** Normalised by total floor area */
  gwp_kgco2e_per_m2_floor: number;
}

// ── Module-level cache (survives re-renders, cleared on page reload) ───────

let _cache: EPSMConstructionOptions | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLabel(c: EPSMConstruction): string {
  const parts: string[] = [c.name];
  if (c.u_value_w_m2k > 0) parts.push(`U: ${c.u_value_w_m2k.toFixed(2)} W/m²K`);
  if (c.gwp_kgco2e_per_m2 > 0) parts.push(`GWP: ${c.gwp_kgco2e_per_m2.toFixed(1)} kg CO₂e/m²`);
  return parts.join(' – ');
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch all constructions from GET /api/constructions/ and group by element_type.
 * Labels include U-value and GWP so users can compare at a glance.
 *
 * Results are cached in memory after the first successful call.
 * Throws if the network request fails so callers can fall back gracefully.
 */
export async function getEPSMConstructionOptions(
  signal?: AbortSignal
): Promise<EPSMConstructionOptions> {
  if (_cache) return _cache;

  const res = await fetch(`${EPSM_BASE}/api/constructions/`, { signal });
  if (!res.ok) throw new Error(`EPSM API responded with ${res.status}`);

  const constructions: EPSMConstruction[] = await res.json();

  const byType = (type: string): ConstructionOption[] =>
    constructions
      .filter(c => c.element_type === type)
      .map(c => ({
        label: formatLabel(c),
        value: c.name,
        gwp: c.gwp_kgco2e_per_m2 ?? 0,
        uValue: c.u_value_w_m2k ?? 0,
      }));

  const byName = new Map(constructions.map(c => [c.name, c]));

  _cache = {
    wall:   byType('wall'),
    floor:  byType('floor'),
    roof:   byType('roof'),
    window: byType('window'),
    byName,
  };

  return _cache;
}

/**
 * Calculate embodied carbon client-side from selected construction names
 * and building surface areas.
 *
 * Uses the pre-computed gwp_kgco2e_per_m2 field on each EPSM Construction.
 * Returns null if EPSM data hasn't loaded yet.
 */
export function calculateEmbodiedCarbon(
  options: EPSMConstructionOptions,
  constructions: { wall: string; floor: string; roof: string; window: string },
  surfaces: BuildingSurfaces
): EmbodiedCarbonResult | null {
  const { byName } = options;

  const gwp = (name: string, area: number): number => {
    const c = byName.get(name);
    return c ? (c.gwp_kgco2e_per_m2 ?? 0) * area : 0;
  };

  const wall_gwp   = gwp(constructions.wall,   surfaces.wallArea - surfaces.windowArea);
  const floor_gwp  = gwp(constructions.floor,  surfaces.floorArea);
  const roof_gwp   = gwp(constructions.roof,   surfaces.roofArea);
  const window_gwp = gwp(constructions.window, surfaces.windowArea);
  const total      = wall_gwp + floor_gwp + roof_gwp + window_gwp;

  return {
    wall_gwp_kgco2e:    wall_gwp,
    floor_gwp_kgco2e:   floor_gwp,
    roof_gwp_kgco2e:    roof_gwp,
    window_gwp_kgco2e:  window_gwp,
    total_gwp_kgco2e:   total,
    gwp_kgco2e_per_m2_floor:
      surfaces.floorArea > 0 ? total / surfaces.floorArea : 0,
  };
}

/**
 * Compute total embodied carbon for a portfolio of buildings.
 * Sums GWP across all buildings and normalises by total floor area.
 *
 * Returns kg CO₂e/m² (floor area), or null if EPSM data isn't loaded yet.
 */
export function computePortfolioEmbodiedCarbon(
  options: EPSMConstructionOptions,
  buildings: Array<{
    footprintArea?: number;
    area?: number;
    floors?: number;
    floorHeight?: number;
    points?: Array<{ x: number; z: number }>;
    window_to_wall_ratio?: number;
    wall_construction?: string;
    floor_construction?: string;
    roof_construction?: string;
    window_construction?: string;
  }>
): number | null {
  if (!options || buildings.length === 0) return null;

  let totalGwp = 0;
  let totalFloorArea = 0;

  for (const b of buildings) {
    const floors        = b.floors ?? 1;
    const floorHeight   = b.floorHeight ?? 3.2;
    const derivedMetrics = b.points && b.points.length >= 3
      ? calculateBuildingMetrics(b.points.map(point => ({ ...point, y: 0 })), floors, floorHeight)
      : null;
    const footprintArea = derivedMetrics?.footprintArea ?? b.footprintArea ?? b.area ?? 0;
    const wwr           = b.window_to_wall_ratio ?? DEFAULT_FACADE_PARAMETERS.wwr;

    const perimeter = derivedMetrics?.perimeter ?? Math.sqrt(footprintArea) * 4;

    const wallArea   = perimeter * floors * floorHeight;
    const windowArea = wallArea * wwr;
    const floorArea  = footprintArea * floors;
    const roofArea   = footprintArea;

    const result = calculateEmbodiedCarbon(
      options,
      {
        wall:   b.wall_construction   ?? '',
        floor:  b.floor_construction  ?? '',
        roof:   b.roof_construction   ?? '',
        window: b.window_construction ?? '',
      },
      { wallArea, floorArea, roofArea, windowArea }
    );

    if (result) {
      totalGwp       += result.total_gwp_kgco2e;
      totalFloorArea += floorArea;
    }
  }

  return totalFloorArea > 0 ? totalGwp / totalFloorArea : 0;
}

/** Return the cached options synchronously (null if not yet loaded). */
export function getCachedEPSMOptions(): EPSMConstructionOptions | null {
  return _cache;
}

/**
 * Return the name of the first available construction for a given element type.
 * Uses the in-memory cache — returns null if cache is not yet populated.
 */
export function getDefaultConstructionName(
  options: EPSMConstructionOptions,
  type: 'wall' | 'floor' | 'roof' | 'window'
): string | null {
  return options[type][0]?.value ?? null;
}

/** Clear the in-memory cache (useful in tests). */
export function clearEPSMCache(): void {
  _cache = null;
}
