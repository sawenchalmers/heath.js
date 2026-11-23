/**
 * EnergyApiService
 * ----------------
 * Client for the engine's energy endpoint (v1 API): POST /v1/energy, which waits until the
 * EnergyPlus result is ready and returns it. Mirrors DaylightApiService.
 */

import { BuildingModel } from '../types/building';
import type { EngineEnergyResult } from '../types/engine';
import type { AdjacencyInput } from './BuildingAdjacency';
import { getBuildingFacadeParameters } from './FacadeGeometry';
import { buildSimulationFootprint, sharedFloorsByEdge } from './SimulationFootprint';
import { proxyUrl } from './proxyUrl';

// ── Config ────────────────────────────────────────────────────────────────

// The engine, forwarded under the app's own base path (see proxiedServices.ts).
const DEFAULT_BASE_URL = proxyUrl('daylight');

// ── Types ──────────────────────────────────────────────────────────────────

export interface EnergyStudyConstructions {
  wall: string;
  floor: string;
  roof: string;
  window: string;
}

export interface EnergyStudyOptions {
  constructions: EnergyStudyConstructions;
  building_program?: string;
  natural_ventilation?: boolean;
  /** Other buildings, used to find walls shared with the simulated building. */
  neighbours?: readonly AdjacencyInput[];
}

/** Body of POST /v1/energy. */
export interface EnergyStudyRequest {
  room: ReturnType<EnergyApiService['buildRoomFromBuilding']>;
  energy: {
    constructions: EnergyStudyConstructions;
    building_program: string;
    natural_ventilation: boolean;
  };
  /** Large arrays (the hourly loads, unused so far) as packed typed arrays. */
  pack: boolean;
}

export interface EnergyStudyStatus {
  /** Only on runs from the old engine API; v1 has no study ids. */
  study_id?: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  stage?: string;
  error?: string;
}

/** Monthly gains and losses, kWh/m² per month (positive values; the chart draws losses below zero). */
export interface MonthlyHeatBalance {
  months: string[];
  heating?: number[];
  cooling?: number[];
  people?: number[];
  lighting?: number[];
  equipment?: number[];
  solar?: number[];
  infiltration_gain?: number[];
  infiltration_loss?: number[];
}

/** An energy result in the shape the UI uses. */
export interface EnergyStudyResult {
  /** Only on results from the old engine API; v1 has no study ids. */
  study_id?: string;
  status: string;
  heating_energy_kwh?: number;
  cooling_energy_kwh?: number;
  total_energy_kwh?: number;
  /** Normalised by total floor area */
  heating_demand_kwh_m2?: number;
  cooling_demand_kwh_m2?: number;
  total_energy_kwh_m2?: number;
  monthly_heat_balance?: MonthlyHeatBalance;
}

export interface EnergyRunCallbacks {
  /** Not called since v1 (no queue ids); removed with the run flow in #25 step 25.4. */
  onQueued?: (studyId: string) => void;
  onStatusUpdate?: (status: EnergyStudyStatus) => void;
  onComplete?: (result: EnergyStudyResult) => void;
  onError?: (error: Error) => void;
}

// ── Service ────────────────────────────────────────────────────────────────

export class EnergyApiService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const configured = baseUrl || import.meta.env.VITE_DAYLIGHT_API_BASE_URL || DEFAULT_BASE_URL;
    this.baseUrl = configured.replace(/\/$/, '');
  }

  // ── Request helpers ──────────────────────────────────────────────────────

  /** Send a request to the engine; failures become errors carrying the engine's message for the user. */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
    } catch (error) {
      if (init?.signal?.aborted) throw new Error('Energy study aborted');
      throw error;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Energy API ${res.status} ${path}: ${engineMessage(body)}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Room geometry builder ────────────────────────────────────────────────

  private buildRoomFromBuilding(building: BuildingModel, neighbours: readonly AdjacencyInput[]) {
    // Same simplified, split footprint as the window preview and daylight, so edge n is the same wall everywhere.
    const simulationFootprint = buildSimulationFootprint(building, neighbours);
    const coords = simulationFootprint.footprint.map(point => [point.x, point.z] as [number, number]);
    const facade = getBuildingFacadeParameters(building);
    // The backend makes shared walls adiabatic and leaves out their windows, storey by storey;
    // undefined when nothing is shared, so other requests stay unchanged.
    const sharedFloors = sharedFloorsByEdge(simulationFootprint);

    return {
      footprint_coordinates: coords,
      floor_to_floor_height: building.floorHeight ?? 3.2,
      floors: building.floors ?? 1,
      orientation_offset: 0,
      wwr: facade.wwr,
      ...(sharedFloors ? { shared_floors_by_edge: sharedFloors } : {}),
      window_width: facade.windowWidth,
      window_height: facade.windowHeight,
      window_spacing: facade.windowSpacing,
      wall_thickness: facade.wallThickness,
      additional_horizontal_shading_depth: facade.additionalHorizontalShadingDepth,
      additional_vertical_shading_depth: facade.additionalVerticalShadingDepth,
    };
  }

  /** The v1 request for one building: its room, and the energy options (constructions fall back to the building's own). */
  buildEnergyRequest(building: BuildingModel, options: EnergyStudyOptions): EnergyStudyRequest {
    return {
      room: this.buildRoomFromBuilding(building, options.neighbours ?? []),
      energy: {
        constructions: {
          wall:   options.constructions?.wall   || building.wall_construction   || 'Default Wall',
          floor:  options.constructions?.floor  || building.floor_construction  || 'Default Floor',
          roof:   options.constructions?.roof   || building.roof_construction   || 'Default Roof',
          window: options.constructions?.window || building.window_construction || 'Default Window',
        },
        building_program: options.building_program ?? building.building_program ?? 'Office',
        natural_ventilation: options.natural_ventilation ?? building.natural_ventilation ?? false,
      },
      pack: true,
    };
  }

  // ── API call ─────────────────────────────────────────────────────────────

  /** POST /v1/energy: waits until the engine has the result; aborting the signal also cancels the job there. */
  async postEnergy(request: EnergyStudyRequest, signal?: AbortSignal): Promise<EngineEnergyResult> {
    return this.request<EngineEnergyResult>('/v1/energy', {
      method: 'POST',
      body: JSON.stringify(request),
      signal,
    });
  }

  /** Run one energy study and report its progress: running, then complete or failed. */
  async runEnergyStudy(
    building: BuildingModel,
    options: EnergyStudyOptions,
    callbacks: EnergyRunCallbacks = {},
    signal?: AbortSignal
  ): Promise<EnergyStudyResult> {
    callbacks.onStatusUpdate?.({ status: 'running' });
    try {
      const result = summariseEnergyResult(await this.postEnergy(this.buildEnergyRequest(building, options), signal));
      callbacks.onComplete?.(result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(err);
      throw err;
    }
  }
}

/** The engine's message for the user from an error body ({ error, message }, possibly wrapped in `detail`), else the body. */
const engineMessage = (body: string): string => {
  try {
    const json = JSON.parse(body) as { message?: string; detail?: string | { message?: string } };
    const detail = typeof json.detail === 'object' ? json.detail?.message : json.detail;
    return json.message || detail || body;
  } catch {
    return body;
  }
};

/** Turns a v1 energy result into the shape the UI uses: annual totals, per m², and the monthly heat balance. */
export function summariseEnergyResult(result: EngineEnergyResult): EnergyStudyResult {
  const monthly = result.monthly_heat_balance as MonthlyHeatBalance | null | undefined;
  return {
    status: 'complete',
    heating_energy_kwh: result.heating_energy_kwh,
    cooling_energy_kwh: result.cooling_energy_kwh,
    total_energy_kwh: result.total_energy_kwh,
    heating_demand_kwh_m2: result.heating_demand_kwh_m2,
    cooling_demand_kwh_m2: result.cooling_demand_kwh_m2,
    total_energy_kwh_m2: result.total_energy_kwh_m2,
    monthly_heat_balance: Array.isArray(monthly?.months) ? monthly! : undefined,
  };
}

export const energyApiService = new EnergyApiService();
