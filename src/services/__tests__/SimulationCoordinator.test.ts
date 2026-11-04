import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulationCoordinator } from '../SimulationCoordinator';
import { energyApiService, type EnergyStudyResult } from '../EnergyApiService';
import type { EPSMConstructionOptions } from '../EPSMService';
import type { BuildingModel, Point3D } from '../../types/building';

const point = (x: number, z: number): Point3D => ({ x, y: 0, z });
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];

/** A 10 × 10 m, 3-storey building with its south-west corner at (x, 0). */
const makeBuilding = (id: string, x: number): BuildingModel => ({
  id,
  points: box(x, 0, x + 10, 10),
  footprintArea: 100,
  metrics: { footprintArea: 100, grossFloorArea: 300, perimeter: 40, totalHeight: 9 },
  floors: 3,
  floorHeight: 3,
  window_to_wall_ratio: 0.4,
  createdAt: new Date(),
});

/** One EPSM construction per element type, enough to resolve the defaults. */
const epsm: EPSMConstructionOptions = {
  wall: [{ value: 'Wall', label: 'Wall' }],
  floor: [{ value: 'Floor', label: 'Floor' }],
  roof: [{ value: 'Roof', label: 'Roof' }],
  window: [{ value: 'Window', label: 'Window' }],
} as EPSMConstructionOptions;

afterEach(() => vi.restoreAllMocks());

// Visual explanation of the tests in this file:
// https://claude.ai/artifact/2NAGj5rh7qR6GJ1dRVqtRf (private Claude artifact; share it before others can open it)
describe('energy study coordination', () => {
  it('passes the other buildings to the energy request as neighbours', async () => {
    const run = vi.spyOn(energyApiService, 'runEnergyStudy').mockResolvedValue({} as EnergyStudyResult);
    const building = makeBuilding('a', 0);
    const buildings = [building, makeBuilding('b', 10)];

    await simulationCoordinator.runEnergyStudy({
      building,
      buildings,
      location: 'Gothenburg',
      epsm,
      signal: new AbortController().signal,
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][1].neighbours).toBe(buildings);
  });
});
