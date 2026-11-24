import { describe, expect, it, vi } from 'vitest';
import { daylightApiService, summariseDaylightResult } from '../DaylightApiService';
import type { BuildingData } from '../../types/building';
import type { DaylightStudyRequest } from '../../types/daylight';
import type { EngineDaylightResult } from '../../types/engine';
import { unpackPoints, unpackValues } from '../EngineArrayUnpacking';
import fixture from './fixtures/v1-daylight-two-floors.json';

const makeBuilding = (): BuildingData => ({
  id: 'building-1',
  mesh: {} as BuildingData['mesh'],
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 4 },
    { x: 0, y: 0, z: 4 }
  ],
  footprintArea: 16,
  metrics: { footprintArea: 16, grossFloorArea: 32, perimeter: 16, totalHeight: 6 },
  floors: 3,
  floorHeight: 3,
  createdAt: new Date()
});

describe('DaylightApiService requests', () => {
  it('requests final quality, packed arrays and a sensor grid on every building floor', () => {
    const request = daylightApiService.buildRequestFromBuilding(makeBuilding());

    // Tests run without .env.development, so the default applies.
    expect(request.daylight).toEqual({ run_sda: false, da_lux: 300, sda_target_pct: 50, quality: 'final' });
    expect(request.pack).toBe(true);
    expect(request).not.toHaveProperty('location');
    expect(request.room.floors).toBe(3);
    expect(request.room.simulate_all_floors).toBe(true);
    expect(request.room.sensor_grid).toEqual({ x_dim: 0.5, y_dim: 0.5, offset: 0.75 });
    expect(request.room).toMatchObject({
      wwr: 0.4,
      window_width: 1.2,
      window_height: 1.5,
      window_spacing: 0,
      wall_thickness: 0.3,
      additional_horizontal_shading_depth: 0,
      additional_vertical_shading_depth: 0
    });
  });

  it('preserves zero WWR and stored overhang depth while ignoring a disabled addition', () => {
    const building = {
      ...makeBuilding(),
      window_to_wall_ratio: 0,
      window_overhang: false,
      window_overhang_depth: 0.5
    };
    const request = daylightApiService.buildRequestFromBuilding(building);

    expect(request.room.wwr).toBe(0);
    expect(request.room.additional_horizontal_shading_depth).toBe(0);
  });

  it('only uses selected-floor mode when it is explicitly requested', () => {
    const request = daylightApiService.buildRequestFromBuilding(makeBuilding(), {
      selected_floor_number: 2,
      simulate_all_floors: false
    });

    expect(request.room.selected_floor_number).toBe(2);
    expect(request.room.simulate_all_floors).toBe(false);
  });

  it('normalizes a browser-wound footprint to the valid Honeybee XY orientation', () => {
    const building = makeBuilding();
    building.points = [...building.points].reverse();
    const request = daylightApiService.buildRequestFromBuilding(building);
    const signedArea = request.room.footprint_coordinates.reduce((area, point, index, points) => {
      const next = points[(index + 1) % points.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2;

    expect(signedArea).toBeGreaterThan(0);
  });

  // Visual explanation of these tests (group 6):
  // https://claude.ai/artifact/G3TizxVrAig6HLK3U61E8Y (private Claude artifact; share it before others can open it)
  describe('walls shared with neighbouring buildings', () => {
    // A 3-storey neighbour touching the middle of the east wall (x = 4, z = 1–3), and a 1-storey one.
    const neighbour = (floors: number) => ({
      id: 'neighbour',
      points: [{ x: 4, y: 0, z: 1 }, { x: 8, y: 0, z: 1 }, { x: 8, y: 0, z: 3 }, { x: 4, y: 0, z: 3 }],
      floors,
      floorHeight: 3,
    });

    it('splits the footprint and sends the shared floors of the shared piece of wall', () => {
      const building = makeBuilding();
      const request = daylightApiService.buildRequestFromBuilding(building, { neighbours: [building, neighbour(3)] });

      expect(request.room.footprint_coordinates).toEqual([[0, 0], [4, 0], [4, 1], [4, 3], [4, 4], [0, 4]]);
      expect(request.room.shared_floors_by_edge).toEqual([[], [], [1, 2, 3], [], [], []]);
      expect(request.room).not.toHaveProperty('wwr_by_edge');
    });

    it('sends only the floors a lower neighbour covers, so the backend keeps windows above it', () => {
      const building = makeBuilding();
      const request = daylightApiService.buildRequestFromBuilding(building, {
        neighbours: [building, neighbour(1)],
        selected_floor_number: 3,
      });

      expect(request.room.shared_floors_by_edge).toEqual([[], [], [1], [], [], []]);
    });

    it('leaves requests without shared walls unchanged', () => {
      const request = daylightApiService.buildRequestFromBuilding(makeBuilding(), { neighbours: [] });

      expect(request.room.footprint_coordinates).toEqual([[0, 0], [4, 0], [4, 4], [0, 4]]);
      expect(request.room).not.toHaveProperty('shared_floors_by_edge');
    });
  });

  it('checks the engine through v1\'s health check', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(daylightApiService.checkEngineStatus()).resolves.toBe('available');
    expect(String(fetchMock.mock.calls[0][0])).toBe('/proxy/engine/health');
    fetchMock.mockRestore();
  });

  it('passes the engine\'s message on when a study fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'simulation_failed', message: 'TimeLimitExceeded(1200,)' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    ));
    await expect(daylightApiService.runStudyForBuilding(makeBuilding())).rejects.toThrow(/TimeLimitExceeded/);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/proxy/engine/v1/daylight');
    fetchMock.mockRestore();
  });

  it('says it was cancelled when the request is aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    await expect(daylightApiService.runStudyForBuilding(makeBuilding(), {}, { signal: controller.signal })).rejects.toThrow('Daylight run cancelled');
    fetchMock.mockRestore();
  });
});

// A real v1 result (two floors, 24 sensors, with sDA), see fixtures/v1-daylight-two-floors.json.
describe('summariseDaylightResult', () => {
  const result = fixture.packed as unknown as EngineDaylightResult;
  const request = { room: { sensor_grid: fixture.request.room.sensor_grid }, daylight: { run_sda: true, da_lux: 300, sda_target_pct: 50, quality: 'preview' } } as unknown as DaylightStudyRequest;

  it('places each sensor in the scene with y up, carrying its daylight factor', () => {
    const summary = summariseDaylightResult(result, request);
    const engine = unpackPoints(result.sensor_points);
    const df = unpackValues(result.df);
    expect(summary.points).toHaveLength(24);
    expect(summary.points[0]).toEqual({ x: engine[0][0], y: engine[0][2], z: engine[0][1], value: df[0] });
  });

  it('keeps the summary figures and the per-floor slices', () => {
    const summary = summariseDaylightResult(result, request);
    expect(summary).toMatchObject({ status: 'complete', sensorCount: 24, meanDF: result.df_summary.mean_df, minDF: result.df_summary.min_df, maxDF: result.df_summary.max_df, sda: result.sda_summary!.sda });
    expect(summary.sensorGrids.map(grid => grid.floor_number)).toEqual([1, 2]);
    expect(summary.sensorGrid).toEqual(fixture.request.room.sensor_grid);
  });

  it('marks a sensor as passing sDA when its daylight autonomy reaches the target', () => {
    const summary = summariseDaylightResult(result, request);
    const da = unpackValues(result.da!);
    expect(summary.sdaPoints!.map(point => point.value)).toEqual(da);
    expect(summary.sdaPassMask).toEqual(da.map(value => value >= 50));
    expect(summary.sdaPassMask!.filter(Boolean)).toHaveLength(result.sda_summary!.passing_sensors);
  });

  it('rejects a result without daylight autonomy when sDA was requested', () => {
    expect(() => summariseDaylightResult({ ...result, da: null }, request)).toThrow(/daylight autonomy/);
  });

  it('rejects sensor points and values that do not line up', () => {
    const plain = fixture.plain as unknown as EngineDaylightResult;
    expect(() => summariseDaylightResult({ ...plain, df: (plain.df as number[]).slice(1) }, request)).toThrow(/mismatched/);
  });

  it('rejects a floor slice that reaches past the arrays', () => {
    const grids = result.sensor_grids.map((grid, i) => (i === 1 ? { ...grid, sensor_count: grid.sensor_count + 1 } : grid));
    expect(() => summariseDaylightResult({ ...result, sensor_grids: grids }, request)).toThrow(/exceeds/);
  });
});
