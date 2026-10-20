import { BuildingModel } from './building';
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
  /** Window-to-wall ratio per footprint edge, overriding `wwr`. Only sent when a wall is shared on the simulated floor. */
  wwr_by_edge?: number[];
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

export interface DaylightStudyRequest {
  room: DaylightRoomInput;
  context_buildings: DaylightContextBuildingInput[];
  run_sda: boolean;
  location?: string;
  quality: 'full';
  thresholds: DaylightRunThresholds;
}

export interface DaylightStudyQueued {
  study_id: string;
  status: DaylightStudyStatus;
  sensor_count: number;
  links: {
    status: string;
    result: string;
  };
}

export interface DaylightStudyStatusResponse {
  study_id: string;
  status: DaylightStudyStatus;
  stage?: string;
  error?: string;
}

export interface DaylightDfSummary {
  mean_df: number;
  min_df: number;
  max_df: number;
}

export interface DaylightSdaSummary {
  sda_300_50: number;
  sensor_count: number;
  passing_sensors: number;
}

export interface DaylightSensorGridRange {
  identifier: string;
  full_identifier: string;
  room_identifier: string;
  floor_number: number | null;
  start_sensor_index: number;
  sensor_count: number;
}

export interface DaylightStudyResult {
  study_id: string;
  df: {
    summary: DaylightDfSummary;
    values: number[];
  };
  sda?: {
    summary: DaylightSdaSummary;
    values: number[];
    pass: boolean[];
  } | null;
  sensor_points?: [number, number, number][];
  sensor_grids?: DaylightSensorGridRange[];
}

export interface DaylightApiError {
  error: string;
  message: string;
}

export interface DaylightLocationItem {
  id: string;
  label: string;
}

export interface DaylightLocationsResponse {
  locations: DaylightLocationItem[];
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
  studyId: string;
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
  location?: string;
  quality?: 'full';
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
  pollMs?: number;
  onStatus?: (status: DaylightRunState) => void;
}

export interface DaylightBuildingSelection {
  building: BuildingModel;
  selectedFloor: number;
}
