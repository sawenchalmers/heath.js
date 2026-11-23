import { afterEach, describe, expect, it, vi } from 'vitest';
import { energyApiService, summariseEnergyResult, type EnergyStudyOptions } from '../EnergyApiService';
import type { EngineEnergyResult } from '../../types/engine';
import type { BuildingModel, Point3D } from '../../types/building';

const point = (x: number, z: number): Point3D => ({ x, y: 0, z });
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];

/** A 10 × 10 m, 3-storey building with 40 % glazing. */
const makeBuilding = (points = box(0, 0, 10, 10)): BuildingModel => ({
  id: 'building',
  points,
  footprintArea: 100,
  metrics: { footprintArea: 100, grossFloorArea: 300, perimeter: 40, totalHeight: 9 },
  floors: 3,
  floorHeight: 3,
  window_to_wall_ratio: 0.4,
  createdAt: new Date(),
});

/** A neighbour touching the middle of the east wall (x = 10, z = 4–6). */
const eastNeighbour = (floors: number) => ({ id: 'east', points: box(10, 4, 20, 6), floors, floorHeight: 3 });

const options: EnergyStudyOptions = {
  constructions: { wall: 'Wall', floor: 'Floor', roof: 'Roof', window: 'Window' },
};

/** The `room` part of the request the app would send for `building`. */
const sentRoom = async (building: BuildingModel, neighbours?: EnergyStudyOptions['neighbours']) =>
  energyApiService.buildEnergyRequest(building, { ...options, neighbours }).room;

/** A v1 energy result, trimmed from a real response of the local engine (10 × 5 m, 2 floors, Office). */
const engineResult: EngineEnergyResult = {
  weather: 'default:gothenburg_tmyx.epw',
  seconds: 2.5,
  floor_area_m2: 100,
  heating_energy_kwh: 7888.2,
  cooling_energy_kwh: 7502.3,
  total_energy_kwh: 22318.2,
  heating_demand_kwh_m2: 78.882,
  cooling_demand_kwh_m2: 75.023,
  total_energy_kwh_m2: 223.182,
  monthly_heat_balance: { months: ['Jan', 'Feb'], heating: [19.748, 13.0752], cooling: [0.0686, 1.1591], infiltration_loss: [5.8626, 5.1951] },
  heating_hourly_kwh: { dtype: 'float32', scale: 1, shape: [0], data: '' },
};

afterEach(() => vi.unstubAllGlobals());

// Visual explanation of the tests in this file:
// https://claude.ai/artifact/EkPEFoun6qgkNi8PVqQdvG (private Claude artifact; share it before others can open it)
describe('energy request footprint', () => {
  it('sends the footprint in Honeybee counter-clockwise order', async () => {
    const room = await sentRoom(makeBuilding([...box(0, 0, 10, 10)].reverse()));
    expect(room.footprint_coordinates).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it('removes points that lie on a straight wall', async () => {
    const room = await sentRoom(makeBuilding([point(0, 0), point(5, 0), point(10, 0), point(10, 10), point(0, 10)]));
    expect(room.footprint_coordinates).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it('sends no shared walls without neighbours', async () => {
    const room = await sentRoom(makeBuilding());
    expect(room).not.toHaveProperty('shared_floors_by_edge');
    expect(room.wwr).toBe(0.4);
  });
});

describe('energy request with neighbouring buildings', () => {
  it('splits the wall and sends the floors shared with an equally tall neighbour', async () => {
    const building = makeBuilding();
    const room = await sentRoom(building, [building, eastNeighbour(3)]);

    expect(room.footprint_coordinates).toEqual([[0, 0], [10, 0], [10, 4], [10, 6], [10, 10], [0, 10]]);
    expect(room.shared_floors_by_edge).toEqual([[], [], [1, 2, 3], [], [], []]);
    expect(room).not.toHaveProperty('wwr_by_edge');
  });

  it('sends only the floors a lower neighbour covers, so the backend keeps windows above it', async () => {
    const building = makeBuilding();
    const room = await sentRoom(building, [building, eastNeighbour(1)]);

    expect(room.shared_floors_by_edge).toEqual([[], [], [1], [], [], []]);
  });

  it('sends no shared walls when the neighbour only touches at a corner', async () => {
    const building = makeBuilding();
    const room = await sentRoom(building, [building, { id: 'corner', points: box(10, 10, 20, 20), floors: 3, floorHeight: 3 }]);

    expect(room.footprint_coordinates).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(room).not.toHaveProperty('shared_floors_by_edge');
  });
});

describe('energy request options', () => {
  it('sends the v1 energy block, packed arrays, and no HVAC system or location', () => {
    const request = energyApiService.buildEnergyRequest(makeBuilding(), { ...options, building_program: 'School' });
    expect(request.energy).toEqual({ constructions: options.constructions, building_program: 'School', natural_ventilation: false });
    expect(request.pack).toBe(true);
    expect(request).not.toHaveProperty('location');
    expect(request.energy).not.toHaveProperty('hvac_system');
  });

  it('falls back to the building\'s own constructions and program', () => {
    const building = { ...makeBuilding(), wall_construction: 'Brick', building_program: 'Retail' };
    const request = energyApiService.buildEnergyRequest(building, { constructions: { wall: '', floor: 'F', roof: 'R', window: 'W' } });
    expect(request.energy.constructions.wall).toBe('Brick');
    expect(request.energy.building_program).toBe('Retail');
  });
});

describe('summariseEnergyResult', () => {
  it('keeps the annual totals per m² and the monthly heat balance', () => {
    expect(summariseEnergyResult(engineResult)).toEqual({
      status: 'complete',
      heating_energy_kwh: 7888.2,
      cooling_energy_kwh: 7502.3,
      total_energy_kwh: 22318.2,
      heating_demand_kwh_m2: 78.882,
      cooling_demand_kwh_m2: 75.023,
      total_energy_kwh_m2: 223.182,
      monthly_heat_balance: engineResult.monthly_heat_balance,
    });
  });

  it('leaves out a monthly balance without months', () => {
    expect(summariseEnergyResult({ ...engineResult, monthly_heat_balance: { heating: [1] } }).monthly_heat_balance).toBeUndefined();
  });
});

describe('running an energy study', () => {
  it('posts to /v1/energy and reports running, then complete', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(engineResult), { status: 200 }));
    vi.stubGlobal('fetch', fetchStub);
    const statuses: string[] = [];
    const onComplete = vi.fn();

    const result = await energyApiService.runEnergyStudy(makeBuilding(), options, { onStatusUpdate: s => statuses.push(s.status), onComplete });

    expect(fetchStub.mock.calls[0][0]).toBe('/proxy/daylight/v1/energy');
    expect(fetchStub.mock.calls[0][1].method).toBe('POST');
    expect(statuses).toEqual(['running']);
    expect(onComplete).toHaveBeenCalledWith(result);
    expect(result.total_energy_kwh_m2).toBe(223.182);
  });

  it('passes the engine\'s message on when the study fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad_request', message: 'Unknown construction: Wall' }), { status: 400 })));
    const onError = vi.fn();

    await expect(energyApiService.runEnergyStudy(makeBuilding(), options, { onError })).rejects.toThrow('Unknown construction: Wall');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('says it was aborted when the request is cancelled', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => { controller.abort(); return Promise.reject(new DOMException('aborted', 'AbortError')); }));

    await expect(energyApiService.runEnergyStudy(makeBuilding(), options, {}, controller.signal)).rejects.toThrow('Energy study aborted');
  });
});
