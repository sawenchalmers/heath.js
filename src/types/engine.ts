/**
 * Responses of the simulation engine's v1 API (ace-sim-api; heath-engine follows it, #97).
 * Mirrors the response models of the engine's v1 API (`api/schemas.py` in heath-engine). Large arrays
 * arrive packed unless the request sends `pack: false`.
 */

/** A base64-encoded little-endian typed array: value = raw / scale. */
export interface PackedArray {
  dtype: 'uint8' | 'uint16' | 'float32';
  scale: number;
  shape: number[];
  data: string;
}

/** An array field: packed by default, or plain numbers when the request sent `pack: false`. */
export type ArrayField = PackedArray | number[] | number[][];

/** One floor's slice of the flat sensor arrays. */
export interface EngineSensorGrid {
  identifier: string;
  full_identifier: string;
  room_identifier: string;
  floor_number: number | null;
  start_sensor_index: number;
  sensor_count: number;
}

/** Response of POST /v1/daylight. */
export interface EngineDaylightResult {
  weather: string;
  seconds: number;
  worker?: string | null;
  started_at?: number | null;
  sensor_count: number;
  sensor_grids: EngineSensorGrid[];
  /** [x, y, z] per sensor, shape (n, 3), in the engine's axes (z up). */
  sensor_points: ArrayField;
  df_summary: { mean_df: number; min_df: number; max_df: number };
  /** Daylight factor (%) per sensor. */
  df: ArrayField;
  sda_summary?: { sda: number; da_lux: number; sda_target_pct: number; sensor_count: number; passing_sensors: number } | null;
  /** Daylight autonomy (%) per sensor; a sensor passes sDA when da >= sda_target_pct. */
  da?: ArrayField | null;
}

/** Response of POST /v1/energy (kWh, and kWh/m² of floor area). */
export interface EngineEnergyResult {
  weather: string;
  seconds: number;
  worker?: string | null;
  started_at?: number | null;
  floor_area_m2: number;
  heating_energy_kwh: number;
  cooling_energy_kwh: number;
  total_energy_kwh: number;
  heating_demand_kwh_m2: number;
  cooling_demand_kwh_m2: number;
  total_energy_kwh_m2: number;
  monthly_heat_balance?: Record<string, unknown> | null;
  heating_hourly_kwh?: ArrayField | null;
  cooling_hourly_kwh?: ArrayField | null;
}

/** The body of an error response, with a message meant for the user. */
export interface EngineError {
  error: string;
  message: string;
}
