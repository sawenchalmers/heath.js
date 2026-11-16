import { afterEach, describe, expect, it, vi } from 'vitest';
import { energyApiService, type EnergyStudyOptions } from '../EnergyApiService';
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
  location: 'Gothenburg',
};

/** Start an energy study with `fetch` stubbed out, and return the `room` part of the request body. */
const sentRoom = async (building: BuildingModel, neighbours?: EnergyStudyOptions['neighbours']) => {
  const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ study_id: 'study', status: 'queued' }) });
  vi.stubGlobal('fetch', fetchStub);
  await energyApiService.startStudy(building, { ...options, neighbours });
  return JSON.parse(fetchStub.mock.calls[0][1].body).room;
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
