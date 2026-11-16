/**
 * EnergyApiService
 * ----------------
 * Client for the heath-engine backend's energy simulation endpoints.
 * Mirrors the DaylightApiService pattern.
 *
 * Backend endpoints (to be implemented — see ENERGY_SIMULATION.md):
 *   POST   /v1/energy/studies
 *   GET    /v1/energy/studies/{study_id}
 *   GET    /v1/energy/studies/{study_id}/result
 */

import { BuildingModel } from '../types/building';
import type { AdjacencyInput } from './BuildingAdjacency';
import { getBuildingFacadeParameters } from './FacadeGeometry';
import { buildSimulationFootprint, sharedFloorsByEdge } from './SimulationFootprint';

// ── Config ────────────────────────────────────────────────────────────────

const DEFAULT_DEV_BASE_URL = '/api/daylight';
const DEFAULT_PROD_BASE_URL = '/api/daylight';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 120; // 6 minutes max

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
  hvac_system?: string;
  natural_ventilation?: boolean;
  location: string;
  /** Other buildings, used to find walls shared with the simulated building. */
  neighbours?: readonly AdjacencyInput[];
}

export interface EnergyStudyQueued {
  study_id: string;
  status: string;
}

export interface EnergyStudyStatus {
  study_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  stage?: string;
  error?: string;
}

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

export interface EnergyStudyResult {
  study_id: string;
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
  onQueued?: (studyId: string) => void;
  onStatusUpdate?: (status: EnergyStudyStatus) => void;
  onComplete?: (result: EnergyStudyResult) => void;
  onError?: (error: Error) => void;
}

// ── Service ────────────────────────────────────────────────────────────────

class EnergyApiService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const defaultBaseUrl = import.meta.env.DEV ? DEFAULT_DEV_BASE_URL : DEFAULT_PROD_BASE_URL;
    const configured = baseUrl || import.meta.env.VITE_DAYLIGHT_API_BASE_URL || defaultBaseUrl;
    this.baseUrl = configured.replace(/\/$/, '');
  }

  // ── Request helpers ──────────────────────────────────────────────────────

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Energy API ${res.status} ${path}: ${body}`);
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

  // ── API calls ────────────────────────────────────────────────────────────

  async startStudy(
    building: BuildingModel,
    options: EnergyStudyOptions,
    signal?: AbortSignal
  ): Promise<EnergyStudyQueued> {
    const room = this.buildRoomFromBuilding(building, options.neighbours ?? []);

    // Resolve constructions: prefer explicitly passed options, fall back to building fields
    const constructions: EnergyStudyConstructions = {
      wall:   options.constructions?.wall   || building.wall_construction   || 'Default Wall',
      floor:  options.constructions?.floor  || building.floor_construction  || 'Default Floor',
      roof:   options.constructions?.roof   || building.roof_construction   || 'Default Roof',
      window: options.constructions?.window || building.window_construction || 'Default Window',
    };

    const body = {
      room,
      constructions,
      building_program: options.building_program ?? building.building_program ?? 'Office',
      hvac_system:      options.hvac_system      ?? building.hvac_system      ?? 'Default HVAC',
      natural_ventilation: options.natural_ventilation ?? building.natural_ventilation ?? false,
      location: options.location,
    };

    return this.request<EnergyStudyQueued>('/v1/energy/studies', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
  }

  async getStatus(studyId: string, signal?: AbortSignal): Promise<EnergyStudyStatus> {
    return this.request<EnergyStudyStatus>(`/v1/energy/studies/${studyId}`, { signal });
  }

  async getResult(studyId: string, signal?: AbortSignal): Promise<EnergyStudyResult> {
    return this.request<EnergyStudyResult>(`/v1/energy/studies/${studyId}/result`, { signal });
  }

  // ── Polling wrapper ──────────────────────────────────────────────────────

  /**
   * Submit an energy study and poll until complete or failed.
   * Mirrors DaylightApiService.runStudyForBuilding() pattern.
   */
  async runEnergyStudy(
    building: BuildingModel,
    options: EnergyStudyOptions,
    callbacks: EnergyRunCallbacks = {},
    signal?: AbortSignal
  ): Promise<EnergyStudyResult> {
    const queued = await this.startStudy(building, options, signal);
    callbacks.onQueued?.(queued.study_id);

    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      if (signal?.aborted) throw new Error('Energy study aborted');

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      const status = await this.getStatus(queued.study_id, signal);
      callbacks.onStatusUpdate?.(status);

      if (status.status === 'complete') {
        const result = await this.getResult(queued.study_id, signal);
        callbacks.onComplete?.(result);
        return result;
      }

      if (status.status === 'failed') {
        const err = new Error(status.error ?? 'Energy simulation failed');
        callbacks.onError?.(err);
        throw err;
      }

      attempts++;
    }

    throw new Error('Energy study timed out after polling limit');
  }
}

export const energyApiService = new EnergyApiService();
