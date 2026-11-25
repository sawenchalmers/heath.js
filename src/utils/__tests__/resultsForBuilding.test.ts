import { describe, expect, it } from 'vitest';
import { createEnergyInputFingerprint } from '../../services/SimulationFingerprint';
import type { BuildingData } from '../../types/building';
import type { DaylightRunSummary } from '../../types/daylight';
import type { DesignNode, EnergyRunMetadata } from '../../types/designExploration';
import { energyResultsForBuilding } from '../resultsForBuilding';

const point = (x: number, z: number) => ({ x, y: 0, z });
/** A 10 × 8 m building with its corner at (x, 0); far enough apart that they share no walls. */
const building = (id: string, name: string, x: number): BuildingData => ({
  id,
  mesh: {} as BuildingData['mesh'],
  points: [point(x, 0), point(x + 10, 0), point(x + 10, 8), point(x, 8)],
  footprintArea: 80,
  metrics: { footprintArea: 80, grossFloorArea: 240, perimeter: 36, totalHeight: 9 },
  floors: 3,
  floorHeight: 3,
  createdAt: new Date(),
  name,
  color: 0x111111,
  window_to_wall_ratio: 0.4,
});

const first = building('first', 'Building 1', -40);
const second = building('second', 'Building 2', 0);
const scene = [first, second];

/** The current node after a run whose energy study simulated the second building. */
const nodeWith = (energyRun: EnergyRunMetadata | undefined): DesignNode => ({
  id: 'run-3',
  name: 'Run 3',
  timestamp: new Date(),
  buildings: scene,
  metrics: { globalWarmingPotential: 120, spatialDaylightAutonomy: 0, heatingDemand: 40, coolingDemand: 5, totalEnergy: 45 },
  energyRun,
  daylightResultsByBuildingId: { first: {} as DaylightRunSummary, second: {} as DaylightRunSummary },
});
const completeRun = { status: 'complete' as const, buildingId: second.id, inputFingerprint: createEnergyInputFingerprint(second, scene) };

describe('energyResultsForBuilding', () => {
  it("shows the figures in the simulated building's results", () => {
    expect(energyResultsForBuilding(nodeWith(completeRun), scene, second.id))
      .toMatchObject({ status: 'complete', heatingDemand: 40, totalEnergy: 45, globalWarmingPotential: 120 });
  });

  it("names the simulated building in another building's results, without its figures", () => {
    const results = energyResultsForBuilding(nodeWith(completeRun), scene, first.id);
    expect(results).toEqual({ status: 'idle', emptyMessage: 'Energy was simulated for Building 2, not for this building.' });
  });

  it('names the simulated building while its run is in progress', () => {
    const running = { ...completeRun, status: 'running' as const };
    expect(energyResultsForBuilding(nodeWith(running), scene, first.id))
      .toEqual({ status: 'running', emptyMessage: 'Energy simulation running for Building 2…' });
    expect(energyResultsForBuilding(nodeWith(running), scene, second.id)).toEqual({ status: 'running' });
  });

  it('says the results are out of date after an energy-only change on the simulated building', () => {
    const edited = [first, { ...second, wall_construction: 'Another wall' }];
    expect(energyResultsForBuilding(nodeWith(completeRun), edited, second.id)).toEqual({
      status: 'idle', emptyMessage: 'The design has changed since the energy simulation. Run studies again to update it.',
    });
  });

  it('shows a failed run, no run, and no node as before', () => {
    expect(energyResultsForBuilding(nodeWith({ ...completeRun, status: 'failed' }), scene, second.id)).toEqual({ status: 'failed' });
    expect(energyResultsForBuilding(nodeWith(undefined), scene, first.id)).toEqual({ status: 'idle' });
    expect(energyResultsForBuilding(null, scene, first.id)).toBeUndefined();
  });
});
