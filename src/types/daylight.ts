import { BuildingModel } from './building';
import type { EngineSensorGrid } from './engine';
import type { AdjacencyInput } from '../services/BuildingAdjacency';

export type DaylightStudyStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface SensorGridConfig {
  x_dim: number;
  y_dim: number;
  offset: number;
}

export interface DaylightRunThresholds {
  da_lux: number;
  sda_target_pct: number;
}

export interface DaylightRoomInput {
  footprint_coordinates: [number, number][];
  orientation_offset: number;
  floor_to_floor_height: number;
  floors: number;
  selected_floor_number: number;
  simulate_all_floors: boolean;
  wwr?: number;
  /** Per footprint edge, the floors whose wall is shared with a neighbour (adiabatic, no windows). Only sent when a wall is shared. */
  shared_floors_by_edge?: number[][];
  window_width: number;
  window_height: number;
  window_spacing: number;
  wall_thickness: number;
  additional_horizontal_shading_depth: number;
  additional_vertical_shading_depth: number;
  sensor_grid: SensorGridConfig;
}

export interface DaylightContextBuildingInput {
  footprint_coordinates: [number, number][];
  floors: number;
  floor_to_floor_height: number;
}

/** What a daylight job computes (the v1 API's `daylight` block). */
export interface DaylightOptions {
  run_sda: boolean;
  da_lux: number;
  sda_target_pct: number;
  /** "final" for real results (needs the engine's GPU to be quick); "preview" is much faster. */
  quality: DaylightQuality;
}

export type DaylightQuality = 'final' | 'preview';

/** Body of POST /v1/daylight. */
export interface DaylightStudyRequest {
  room: DaylightRoomInput;
  context_buildings: DaylightContextBuildingInput[];
  daylight: DaylightOptions;
  /** Large arrays as packed typed arrays (see EngineArrayUnpacking.ts). */
  pack: boolean;
}

/** One floor's slice of the flat sensor arrays, as the engine returns it. */
export type DaylightSensorGridRange = EngineSensorGrid;

export interface DaylightApiError {
  error: string;
  message: string;
}

export interface DaylightSensorPoint {
  x: number;
  y: number;
  z: number;
  value: number;
}

export interface DaylightOverlayDataset {
  points: DaylightSensorPoint[];
  cellSizeX: number;
  cellSizeZ: number;
}

export interface DaylightRunSummary {
  inputFingerprint?: string;
  /** Only on results from the old engine API; v1 has no study ids. */
  studyId?: string;
  status: DaylightStudyStatus;
  stage?: string;
  sensorCount: number;
  meanDF: number;
  sda: number;
  minDF?: number;
  maxDF?: number;
  points: DaylightSensorPoint[];
  sdaPoints?: DaylightSensorPoint[];
  sdaPassMask?: boolean[];
  sensorGrids: DaylightSensorGridRange[];
  /** Grid used by the submitted request. Historical results fall back to 0.5 m cells. */
  sensorGrid?: SensorGridConfig;
  startedAt: string;
  completedAt?: string;
}

export interface DaylightRunState {
  status: DaylightStudyStatus;
  studyId?: string;
  stage?: string;
  error?: string;
}

export interface DaylightBuildRequestOptions {
  run_sda?: boolean;
  /** Defaults to the VITE_DAYLIGHT_QUALITY setting, else "final". */
  quality?: DaylightQuality;
  thresholds?: DaylightRunThresholds;
  sensor_grid?: Partial<SensorGridConfig>;
  selected_floor_number?: number;
  simulate_all_floors?: boolean;
  context_buildings?: DaylightContextBuildingInput[];
  /** Other buildings, used to find walls shared with the simulated building. */
  neighbours?: readonly AdjacencyInput[];
}

export interface DaylightRunOptions {
  signal?: AbortSignal;
  onStatus?: (status: DaylightRunState) => void;
}

export interface DaylightBuildingSelection {
  building: BuildingModel;
  selectedFloor: number;
}
