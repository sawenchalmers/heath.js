import { BuildingModel, Point3D } from '../types/building';
import { ensureHoneybeeCounterClockwise, getBuildingFacadeParameters } from './FacadeGeometry';
import { buildSimulationFootprint, sharedFloorsByEdge, simplifyFootprint } from './SimulationFootprint';
import { calculateSignedArea } from '../utils/geometry';
import { probeEngine, type EngineStatus } from './EngineStatus';
import { proxyUrl } from './proxyUrl';
import { unpackPoints, unpackValues } from './EngineArrayUnpacking';
import type { EngineDaylightResult } from '../types/engine';
import {
  DaylightApiError,
  DaylightBuildRequestOptions,
  DaylightContextBuildingInput,
  DaylightQuality,
  DaylightRunOptions,
  DaylightRunSummary,
  DaylightSensorPoint,
  DaylightStudyRequest,
  SensorGridConfig
} from '../types/daylight';

// The engine, forwarded under the app's own base path (see proxiedServices.ts).
const DEFAULT_BASE_URL = proxyUrl('engine');
const DEFAULT_SENSOR_GRID: SensorGridConfig = { x_dim: 0.5, y_dim: 0.5, offset: 0.75 };
// "final" on the deployed engine (GPU); .env.development sets "preview", since final takes minutes on a CPU.
const DAYLIGHT_QUALITY: DaylightQuality = import.meta.env.VITE_DAYLIGHT_QUALITY === 'preview' ? 'preview' : 'final';

class DaylightApiService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const configuredBaseUrl = baseUrl || import.meta.env.VITE_ENGINE_API_BASE_URL || DEFAULT_BASE_URL;
    this.baseUrl = configuredBaseUrl.replace(/\/$/, '');
  }

  /** Check whether the engine answers: v1's health check, which needs no key and also checks the job queue. */
  checkEngineStatus(): Promise<EngineStatus> {
    return probeEngine(`${this.baseUrl}/health`);
  }

  buildRequestFromBuilding(
    building: BuildingModel,
    options: DaylightBuildRequestOptions = {}
  ): DaylightStudyRequest {
    const sensor_grid: SensorGridConfig = {
      ...DEFAULT_SENSOR_GRID,
      ...(options.sensor_grid || {})
    };

    const selectedFloor = Math.min(
      Math.max(options.selected_floor_number || 1, 1),
      Math.max(1, building.floors)
    );

    // Same simplified, split footprint as the window preview, so edge n is the same wall in both.
    const simulationFootprint = buildSimulationFootprint(building, options.neighbours ?? []);
    const footprint = this.toValidatedCoordinates(simulationFootprint.footprint);
    const facade = getBuildingFacadeParameters(building);
    // The backend makes shared walls adiabatic and leaves out their windows; undefined when nothing is shared.
    const sharedFloors = sharedFloorsByEdge(simulationFootprint);

    return {
      room: {
        footprint_coordinates: footprint,
        orientation_offset: 0,
        floor_to_floor_height: building.floorHeight,
        floors: Math.max(1, building.floors),
        selected_floor_number: selectedFloor,
        simulate_all_floors: options.simulate_all_floors ?? true,
        wwr: facade.wwr,
        ...(sharedFloors ? { shared_floors_by_edge: sharedFloors } : {}),
        window_width: facade.windowWidth,
        window_height: facade.windowHeight,
        window_spacing: facade.windowSpacing,
        wall_thickness: facade.wallThickness,
        additional_horizontal_shading_depth: facade.additionalHorizontalShadingDepth,
        additional_vertical_shading_depth: facade.additionalVerticalShadingDepth,
        sensor_grid
      },
      context_buildings: options.context_buildings ?? [],
      daylight: {
        run_sda: options.run_sda ?? false,
        da_lux: options.thresholds?.da_lux ?? 300,
        sda_target_pct: options.thresholds?.sda_target_pct ?? 50,
        quality: options.quality ?? DAYLIGHT_QUALITY
      },
      pack: true
    };
  }

  buildContextBuilding(building: BuildingModel): DaylightContextBuildingInput {
    return {
      footprint_coordinates: this.toValidatedCoordinates(ensureHoneybeeCounterClockwise(simplifyFootprint(building.points))),
      floors: Math.max(1, building.floors),
      floor_to_floor_height: building.floorHeight
    };
  }

  /** Convert an already simplified, counter-clockwise footprint to [x, z] pairs, rejecting footprints the backend can't use. */
  private toValidatedCoordinates(points: readonly Point3D[]): [number, number][] {
    const footprint = points.map((point) => [point.x, point.z] as [number, number]);

    if (footprint.length < 3) {
      throw new Error('Building footprint must contain at least 3 unique points for daylight analysis.');
    }

    const outOfBoundsPoint = footprint.find(([x, z]) => Math.abs(x) > 1_000_000 || Math.abs(z) > 1_000_000);
    if (outOfBoundsPoint) {
      throw new Error('Building footprint coordinates are outside expected range for daylight analysis.');
    }

    if (this.isSelfIntersecting(footprint)) {
      throw new Error('Building footprint is self-intersecting. Please simplify/redraw the polygon before running daylight analysis.');
    }

    const polygon3D = footprint.map(([x, z]) => ({ x, y: 0, z }));
    const area = Math.abs(calculateSignedArea(polygon3D));

    if (area < 0.0001) {
      throw new Error('Building footprint area is too small or invalid for daylight analysis.');
    }

    return footprint;
  }

  private isSelfIntersecting(footprint: [number, number][]): boolean {
    const edges = footprint.map((point, index) => {
      const next = footprint[(index + 1) % footprint.length];
      return { a: point, b: next, index };
    });

    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 1; j < edges.length; j += 1) {
        const edgeA = edges[i];
        const edgeB = edges[j];

        const areAdjacent =
          edgeA.index === edgeB.index ||
          (edgeA.index + 1) % edges.length === edgeB.index ||
          (edgeB.index + 1) % edges.length === edgeA.index;

        if (areAdjacent) {
          continue;
        }

        if (this.segmentsIntersect(edgeA.a, edgeA.b, edgeB.a, edgeB.b)) {
          return true;
        }
      }
    }

    return false;
  }

  private segmentsIntersect(
    a1: [number, number],
    a2: [number, number],
    b1: [number, number],
    b2: [number, number]
  ): boolean {
    const o1 = this.orientation(a1, a2, b1);
    const o2 = this.orientation(a1, a2, b2);
    const o3 = this.orientation(b1, b2, a1);
    const o4 = this.orientation(b1, b2, a2);

    return o1 * o2 < 0 && o3 * o4 < 0;
  }

  private orientation(a: [number, number], b: [number, number], c: [number, number]): number {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  /** Run one daylight study: a single request that waits for the result (v1), then mapped to the UI's shape. */
  async runStudyForBuilding(
    building: BuildingModel,
    options: DaylightBuildRequestOptions = {},
    runOptions: DaylightRunOptions = {}
  ): Promise<DaylightRunSummary> {
    const request = this.buildRequestFromBuilding(building, options);
    const startedAt = new Date().toISOString();
    runOptions.onStatus?.({ status: 'running' });
    const result = await this.postDaylight(request, runOptions.signal);

    return { ...summariseDaylightResult(result, request), startedAt, completedAt: new Date().toISOString() };
  }

  /** POST /v1/daylight: waits until the engine has the result; aborting the signal also cancels the job there if it hasn't started yet; a running job finishes anyway. */
  async postDaylight(request: DaylightStudyRequest, signal?: AbortSignal): Promise<EngineDaylightResult> {
    return this.request<EngineDaylightResult>('/v1/daylight', {
      method: 'POST',
      body: JSON.stringify(request),
      signal
    });
  }

  /** Send a request to the engine; failures become errors carrying the engine's message for the user. */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const requestUrl = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(requestUrl, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {})
        }
      });
    } catch (error) {
      if (init.signal?.aborted) {
        throw new Error('Daylight run cancelled');
      }
      if (error instanceof TypeError) {
        throw new Error(
          `Unable to reach daylight API at ${this.baseUrl}. In dev, ensure Vite proxy is active and backend is reachable.`
        );
      }

      throw error;
    }

    if (!response.ok) {
      const method = (init.method || 'GET').toUpperCase();
      const fallbackError: DaylightApiError = {
        error: 'request_failed',
        message: `HTTP ${response.status} ${response.statusText}`
      };

      let parsedError = fallbackError;
      let responseBody = '';

      try {
        responseBody = await response.text();
        // v1 answers { error, message }; FastAPI's own errors wrap that (or a string) in `detail`.
        const asJson = JSON.parse(responseBody) as {
          error?: string;
          message?: string;
          detail?: string | { error?: string; message?: string };
        };

        if (typeof asJson.detail === 'object' && asJson.detail !== null) {
          parsedError = {
            error: asJson.detail.error || asJson.error || fallbackError.error,
            message: asJson.detail.message || asJson.message || fallbackError.message
          };
        } else if (typeof asJson.detail === 'string') {
          parsedError = {
            error: asJson.error || fallbackError.error,
            message: asJson.detail
          };
        } else {
          parsedError = {
            error: asJson.error || fallbackError.error,
            message: asJson.message || fallbackError.message
          };
        }
      } catch {
        parsedError = fallbackError;
      }

      const composedMessage = parsedError.message || parsedError.error || fallbackError.message;
      const debugTail = responseBody && !composedMessage.includes(responseBody)
        ? ` | Response: ${responseBody.slice(0, 300)}`
        : '';

      throw new Error(`Daylight API request failed (${method} ${requestUrl}): ${composedMessage}${debugTail}`);
    }

    return response.json() as Promise<T>;
  }
}

export const daylightApiService = new DaylightApiService();

/**
 * Turns a v1 daylight result into the shape the UI uses (heatmap, per-floor view, results dialog),
 * after checking that its arrays line up. Engine points are [x, y, z] with z up; the scene's y is up.
 */
export function summariseDaylightResult(
  result: EngineDaylightResult,
  request: DaylightStudyRequest
): Omit<DaylightRunSummary, 'startedAt'> {
  const df = unpackValues(result.df);
  const positions = unpackPoints(result.sensor_points);
  const da = result.da ? unpackValues(result.da) : undefined;

  if (positions.length !== df.length) {
    throw new Error(`Daylight API returned mismatched sensor points (${positions.length}) and values (${df.length}).`);
  }
  if (request.daylight.run_sda && !da) {
    throw new Error('Daylight API did not return daylight autonomy for a study that requested sDA.');
  }
  if (da && da.length !== df.length) {
    throw new Error(`Daylight API returned misaligned result arrays: DF (${df.length}), DA (${da.length}).`);
  }
  if (!result.sensor_grids?.length && df.length > 0) {
    throw new Error('Daylight API did not return sensor grid ranges.');
  }
  for (const grid of result.sensor_grids ?? []) {
    const { start_sensor_index: start, sensor_count: count } = grid;
    if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 0) {
      throw new Error(`Daylight API returned an invalid sensor grid range for ${grid.full_identifier}.`);
    }
    if (start + count > df.length) {
      throw new Error(`Daylight API sensor grid range exceeds the result arrays for ${grid.full_identifier}.`);
    }
  }

  const toScene = (values: number[]): DaylightSensorPoint[] =>
    positions.map(([x, y, z], index) => ({ x, y: z, z: y, value: values[index] }));
  const sdaTargetPct = request.daylight.sda_target_pct;

  return {
    status: 'complete',
    sensorCount: df.length,
    meanDF: result.df_summary.mean_df,
    sda: result.sda_summary?.sda ?? 0,
    minDF: result.df_summary.min_df,
    maxDF: result.df_summary.max_df,
    points: toScene(df),
    sdaPoints: da ? toScene(da) : undefined,
    sdaPassMask: da?.map(value => value >= sdaTargetPct),
    sensorGrids: result.sensor_grids,
    sensorGrid: { ...request.room.sensor_grid }
  };
}
