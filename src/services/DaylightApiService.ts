import { BuildingModel } from '../types/building';
import { ensureHoneybeeCounterClockwise, getBuildingFacadeParameters } from './FacadeGeometry';
import { calculateSignedArea } from '../utils/geometry';
import {
  DaylightApiError,
  DaylightBuildRequestOptions,
  DaylightContextBuildingInput,
  DaylightLocationsResponse,
  DaylightRunOptions,
  DaylightRunSummary,
  DaylightSensorGridRange,
  DaylightSensorPoint,
  DaylightStudyQueued,
  DaylightStudyRequest,
  DaylightStudyResult,
  DaylightStudyStatusResponse,
  SensorGridConfig
} from '../types/daylight';

const DEFAULT_DEV_BASE_URL = '/api/daylight';
const DEFAULT_PROD_BASE_URL = '/api/daylight';
const DEFAULT_DIRECT_FALLBACK_URLS: string[] = [];
const DEFAULT_SENSOR_GRID: SensorGridConfig = { x_dim: 0.5, y_dim: 0.5, offset: 0.75 };

class DaylightApiService {
  private readonly baseUrl: string;
  private readonly directFallbackBaseUrls: string[];
  private defaultLocationId: string | null | undefined;

  constructor(baseUrl?: string) {
    const defaultBaseUrl = import.meta.env.DEV ? DEFAULT_DEV_BASE_URL : DEFAULT_PROD_BASE_URL;
    const configuredBaseUrl = baseUrl || import.meta.env.VITE_DAYLIGHT_API_BASE_URL || defaultBaseUrl;
    this.baseUrl = configuredBaseUrl.replace(/\/$/, '');

    const configuredFallbacks = (import.meta.env.VITE_DAYLIGHT_API_FALLBACK_URLS as string | undefined)
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    this.directFallbackBaseUrls = (configuredFallbacks && configuredFallbacks.length > 0)
      ? configuredFallbacks
      : DEFAULT_DIRECT_FALLBACK_URLS;

    this.defaultLocationId = undefined;
  }

  async listLocations(signal?: AbortSignal): Promise<DaylightLocationsResponse> {
    return this.request<DaylightLocationsResponse>('/v1/locations', {
      method: 'GET',
      signal
    });
  }

  async getDefaultLocation(signal?: AbortSignal): Promise<string | undefined> {
    if (this.defaultLocationId !== undefined) {
      return this.defaultLocationId || undefined;
    }

    try {
      const response = await this.listLocations(signal);
      this.defaultLocationId = response.locations[0]?.id || null;
    } catch {
      this.defaultLocationId = null;
    }

    return this.defaultLocationId || undefined;
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

    const footprint = this.buildValidatedFootprint(building);
    const facade = getBuildingFacadeParameters(building);

    return {
      room: {
        footprint_coordinates: footprint,
        orientation_offset: 0,
        floor_to_floor_height: building.floorHeight,
        floors: Math.max(1, building.floors),
        selected_floor_number: selectedFloor,
        simulate_all_floors: options.simulate_all_floors ?? true,
        wwr: facade.wwr,
        window_width: facade.windowWidth,
        window_height: facade.windowHeight,
        window_spacing: facade.windowSpacing,
        wall_thickness: facade.wallThickness,
        additional_horizontal_shading_depth: facade.additionalHorizontalShadingDepth,
        additional_vertical_shading_depth: facade.additionalVerticalShadingDepth,
        sensor_grid
      },
      context_buildings: options.context_buildings ?? [],
      run_sda: options.run_sda ?? false,
      location: options.location,
      quality: 'full',
      thresholds: options.thresholds ?? {
        da_lux: 300,
        sda_target_pct: 50
      }
    };
  }

  buildContextBuilding(building: BuildingModel): DaylightContextBuildingInput {
    return {
      footprint_coordinates: this.buildValidatedFootprint(building),
      floors: Math.max(1, building.floors),
      floor_to_floor_height: building.floorHeight
    };
  }

  private buildValidatedFootprint(building: BuildingModel): [number, number][] {
    const dedupedPoints = building.points.filter((point, index, points) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        return false;
      }

      if (index === 0) {
        return true;
      }

      const previous = points[index - 1];
      return Math.abs(point.x - previous.x) > 1e-6 || Math.abs(point.z - previous.z) > 1e-6;
    });

    if (dedupedPoints.length > 2) {
      const first = dedupedPoints[0];
      const last = dedupedPoints[dedupedPoints.length - 1];
      if (first.x === last.x && first.z === last.z) {
        dedupedPoints.pop();
      }
    }

    const simplifiedPoints = this.removeCollinearVertices(dedupedPoints);
    const ccwPoints = ensureHoneybeeCounterClockwise(simplifiedPoints);
    const footprint = ccwPoints.map((point) => [point.x, point.z] as [number, number]);

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

  private removeCollinearVertices(points: BuildingModel['points']): BuildingModel['points'] {
    if (points.length < 4) {
      return [...points];
    }

    const epsilon = 1e-9;
    const cleaned: BuildingModel['points'] = [];

    for (let i = 0; i < points.length; i += 1) {
      const prev = points[(i - 1 + points.length) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];

      const cross = (current.x - prev.x) * (next.z - current.z) - (current.z - prev.z) * (next.x - current.x);
      if (Math.abs(cross) > epsilon) {
        cleaned.push(current);
      }
    }

    return cleaned.length >= 3 ? cleaned : [...points];
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

  async runStudyForBuilding(
    building: BuildingModel,
    options: DaylightBuildRequestOptions = {},
    runOptions: DaylightRunOptions = {}
  ): Promise<DaylightRunSummary> {
    const request = this.buildRequestFromBuilding(building, options);
    let queued: DaylightStudyQueued;

    try {
      queued = await this.startStudy(request, runOptions.signal);
    } catch (error) {
      if (!this.shouldRetryWithReversedFootprint(error)) {
        throw error;
      }

      const retryRequest: DaylightStudyRequest = {
        ...request,
        room: {
          ...request.room,
          footprint_coordinates: [...request.room.footprint_coordinates].reverse()
        }
      };

      console.warn('[DaylightApiService] Retrying study with reversed footprint winding after ground-boundary aperture error.');
      queued = await this.startStudy(retryRequest, runOptions.signal);
    }

    runOptions.onStatus?.({ status: queued.status, studyId: queued.study_id });

    const status = await this.pollUntilComplete(queued.study_id, runOptions);

    if (status.status !== 'complete') {
      throw new Error(status.error || `Daylight study ended with status: ${status.status}`);
    }

    const result = await this.getResult(queued.study_id, runOptions.signal);
    this.validateResultArrays(result, request);

    const points =
      result.sensor_points
        ? this.mapBackendSensorPoints(result.sensor_points, result.df.values)
        : this.reconstructSensorPoints(request, result.df.values);

    const sdaPoints = result.sda
      ? points.map((point, index) => ({
          ...point,
          value: result.sda!.values[index],
        }))
      : undefined;

    const sensorGrids: DaylightSensorGridRange[] = result.sensor_grids ?? [{
      identifier: `floor-${request.room.selected_floor_number}`,
      full_identifier: `floor-${request.room.selected_floor_number}`,
      room_identifier: 'room',
      floor_number: request.room.selected_floor_number,
      start_sensor_index: 0,
      sensor_count: points.length
    }];

    return {
      studyId: queued.study_id,
      status: 'complete',
      stage: status.stage,
      sensorCount: points.length,
      meanDF: result.df.summary.mean_df,
      sda: result.sda?.summary.sda_300_50 ?? 0,
      minDF: result.df.summary.min_df,
      maxDF: result.df.summary.max_df,
      points,
      sdaPoints,
      sdaPassMask: result.sda?.pass,
      sensorGrids,
      sensorGrid: { ...request.room.sensor_grid },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }

  async startStudy(request: DaylightStudyRequest, signal?: AbortSignal): Promise<DaylightStudyQueued> {
    return this.request<DaylightStudyQueued>('/v1/studies', {
      method: 'POST',
      body: JSON.stringify(request),
      signal
    });
  }

  async getStatus(studyId: string, signal?: AbortSignal): Promise<DaylightStudyStatusResponse> {
    return this.request<DaylightStudyStatusResponse>(`/v1/studies/${studyId}`, {
      method: 'GET',
      signal
    });
  }

  async getResult(studyId: string, signal?: AbortSignal): Promise<DaylightStudyResult> {
    return this.request<DaylightStudyResult>(`/v1/studies/${studyId}/result`, {
      method: 'GET',
      signal
    });
  }

  getStudyModelDownloadUrl(studyId: string): string {
    return `${this.baseUrl}/v1/studies/${encodeURIComponent(studyId)}/model.hbjson`;
  }

  private async pollUntilComplete(studyId: string, runOptions: DaylightRunOptions): Promise<DaylightStudyStatusResponse> {
    const pollMs = runOptions.pollMs ?? 2000;

    while (true) {
      if (runOptions.signal?.aborted) {
        throw new Error('Daylight run cancelled');
      }

      const status = await this.getStatus(studyId, runOptions.signal);
      runOptions.onStatus?.({
        status: status.status,
        studyId: status.study_id,
        stage: status.stage,
        error: status.error
      });

      if (status.status === 'complete' || status.status === 'failed') {
        return status;
      }

      await this.delay(pollMs, runOptions.signal);
    }
  }

  reconstructSensorPoints(request: DaylightStudyRequest, values: number[]): DaylightSensorPoint[] {
    const footprint = request.room.footprint_coordinates;
    const sensorGrid = request.room.sensor_grid;
    const selectedFloor = request.room.selected_floor_number;

    if (footprint.length < 3) {
      return [];
    }

    const origin = footprint[0];
    const second = footprint[1];
    const axisXRaw: [number, number] = [second[0] - origin[0], second[1] - origin[1]];
    const axisXLen = Math.hypot(axisXRaw[0], axisXRaw[1]) || 1;
    const axisX: [number, number] = [axisXRaw[0] / axisXLen, axisXRaw[1] / axisXLen];
    const axisY: [number, number] = [-axisX[1], axisX[0]];

    const toLocal = (point: [number, number]): [number, number] => {
      const dx = point[0] - origin[0];
      const dz = point[1] - origin[1];
      return [dx * axisX[0] + dz * axisX[1], dx * axisY[0] + dz * axisY[1]];
    };

    const toWorld = (localX: number, localY: number): [number, number] => {
      return [
        origin[0] + axisX[0] * localX + axisY[0] * localY,
        origin[1] + axisX[1] * localX + axisY[1] * localY
      ];
    };

    const localFootprint = footprint.map(toLocal);
    const minLocalX = Math.min(...localFootprint.map(([x]) => x));
    const maxLocalX = Math.max(...localFootprint.map(([x]) => x));
    const minLocalY = Math.min(...localFootprint.map(([, y]) => y));
    const maxLocalY = Math.max(...localFootprint.map(([, y]) => y));

    const y = (selectedFloor - 1) * request.room.floor_to_floor_height + sensorGrid.offset;
    const epsilon = 1e-6;

    const positions: Omit<DaylightSensorPoint, 'value'>[] = [];

    for (let localX = minLocalX + sensorGrid.x_dim / 2; localX < maxLocalX - sensorGrid.x_dim / 2 + epsilon; localX += sensorGrid.x_dim) {
      for (let localY = minLocalY + sensorGrid.y_dim / 2; localY < maxLocalY - sensorGrid.y_dim / 2 + epsilon; localY += sensorGrid.y_dim) {
        const [worldX, worldZ] = toWorld(localX, localY);
        if (this.isPointInPolygon(worldX, worldZ, footprint)) {
          positions.push({ x: worldX, y, z: worldZ });
        }
      }
    }

    const pointCount = Math.min(positions.length, values.length);
    const points: DaylightSensorPoint[] = [];

    for (let i = 0; i < pointCount; i += 1) {
      points.push({
        ...positions[i],
        value: values[i]
      });
    }

    return points;
  }

  private mapBackendSensorPoints(sensorPoints: [number, number, number][], values: number[]): DaylightSensorPoint[] {
    if (sensorPoints.length !== values.length) {
      throw new Error(
        `Daylight API returned mismatched sensor points (${sensorPoints.length}) and values (${values.length}).`
      );
    }

    return sensorPoints.map(([x, y, z], index) => ({
      x,
      y: z,
      z: y,
      value: values[index]
    }));
  }

  private validateResultArrays(result: DaylightStudyResult, request: DaylightStudyRequest): void {
    const resultLength = result.df.values.length;

    if (!result.sensor_points) {
      if (request.room.simulate_all_floors || request.run_sda) {
        throw new Error('Daylight API did not return sensor points for a study that requires ordered result arrays.');
      }
    } else if (result.sensor_points.length !== resultLength) {
      throw new Error(
        `Daylight API returned mismatched sensor points (${result.sensor_points.length}) and DF values (${resultLength}).`
      );
    }

    if (request.run_sda && !result.sda) {
      throw new Error('Daylight API did not return sDA arrays for a study that requested sDA.');
    }

    if (result.sda) {
      if (result.sda.values.length !== resultLength || result.sda.pass.length !== resultLength) {
        throw new Error(
          `Daylight API returned misaligned result arrays: DF (${resultLength}), sDA values (${result.sda.values.length}), sDA pass (${result.sda.pass.length}).`
        );
      }
    }

    // From what I can tell in the API, result never includes `sensor_grids`...?
    if (request.room.simulate_all_floors && resultLength > 0 && !result.sensor_grids?.length) {
      throw new Error('Daylight API did not return sensor grid ranges for an all-floor study.');
    }

    if (result.sensor_grids?.length) {
      for (const grid of result.sensor_grids) {
        const { start_sensor_index: start, sensor_count: count } = grid;
        if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 0) {
          throw new Error(`Daylight API returned an invalid sensor grid range for ${grid.full_identifier}.`);
        }

        if (start + count > resultLength) {
          throw new Error(`Daylight API sensor grid range exceeds the result arrays for ${grid.full_identifier}.`);
        }
      }
    }
  }

  private isPointInPolygon(x: number, z: number, polygon: [number, number][]): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const zi = polygon[i][1];
      const xj = polygon[j][0];
      const zj = polygon[j][1];

      const intersects =
        zi > z !== zj > z &&
        x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

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
      if (error instanceof TypeError) {
        throw new Error(
          `Unable to reach daylight API at ${this.baseUrl}. In dev, ensure Vite proxy is active and backend is reachable.`
        );
      }

      throw error;
    }

    if (!response.ok) {
      const method = (init.method || 'GET').toUpperCase();

      // In dev, if proxy returns 5xx, retry direct API targets to bypass proxy-layer failures.
      if (import.meta.env.DEV && this.baseUrl === DEFAULT_DEV_BASE_URL && response.status >= 500) {
        for (const fallbackBaseUrl of this.directFallbackBaseUrls) {
          const normalizedFallback = fallbackBaseUrl.replace(/\/$/, '');
          const fallbackUrl = `${normalizedFallback}${path}`;

          try {
            const fallbackResponse = await fetch(fallbackUrl, {
              ...init,
              headers: {
                'Content-Type': 'application/json',
                ...(init.headers || {})
              }
            });

            if (fallbackResponse.ok) {
              console.warn(
                `[DaylightApiService] Proxy request ${method} ${requestUrl} failed with ${response.status}; recovered via direct fallback ${fallbackUrl}.`
              );
              return fallbackResponse.json() as Promise<T>;
            }
          } catch {
            // Ignore fallback connectivity errors and continue to parse original failure.
          }
        }
      }

      const fallbackError: DaylightApiError = {
        error: 'request_failed',
        message: `HTTP ${response.status} ${response.statusText}`
      };

      let parsedError = fallbackError;
      let responseBody = '';

      try {
        responseBody = await response.text();
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

  private shouldRetryWithReversedFootprint(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('ground boundary condition') && message.includes('aperture');
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        window.clearTimeout(id);
        reject(new Error('Daylight run cancelled'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

export const daylightApiService = new DaylightApiService();
