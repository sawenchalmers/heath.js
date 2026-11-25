import { describe, expect, it } from 'vitest';
import { createEnergyInputFingerprint } from '../../services/SimulationFingerprint';
import type { BuildingData } from '../../types/building';
import type { DaylightRunSummary } from '../../types/daylight';
import type { DesignNode, EnergyRunMetadata } from '../../types/designExploration';
import { energyResultsForBuilding, resultsChangedSinceRun } from '../resultsForBuilding';

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

  it("says how another building's failed or stopped run went, without claiming it was simulated", () => {
    expect(energyResultsForBuilding(nodeWith({ ...completeRun, status: 'failed' }), scene, first.id)).toEqual({
      status: 'idle', emptyMessage: 'The energy simulation for Building 2 failed. Energy is simulated for one building per run.',
    });
    expect(energyResultsForBuilding(nodeWith({ ...completeRun, status: 'idle' }), scene, first.id))
      .toEqual({ status: 'idle', emptyMessage: 'Energy is simulated for Building 2 only.' });
  });

  it('falls back to "another building" when the simulated building is gone', () => {
    expect(energyResultsForBuilding(nodeWith(completeRun), [first], first.id))
      .toEqual({ status: 'idle', emptyMessage: 'Energy was simulated for another building, not for this building.' });
  });

  it('goes out of date when a neighbour starts sharing a wall with the simulated building', () => {
    const touching = { ...building('touching', 'Building 3', 10) };
    expect(energyResultsForBuilding(nodeWith(completeRun), [...scene, touching], second.id))
      .toMatchObject({ status: 'idle', emptyMessage: expect.stringContaining('The design has changed') });
  });

  it('counts a complete run saved without a building as out of date', () => {
    expect(energyResultsForBuilding(nodeWith({ ...completeRun, buildingId: undefined }), scene, second.id))
      .toMatchObject({ status: 'idle', emptyMessage: expect.stringContaining('The design has changed') });
  });

  it('shows a failed run (before #32 it read "Not yet run"), no run, and no node', () => {
    expect(energyResultsForBuilding(nodeWith({ ...completeRun, status: 'failed' }), scene, second.id)).toEqual({ status: 'failed' });
    expect(energyResultsForBuilding(nodeWith(undefined), scene, first.id)).toEqual({ status: 'idle' });
    expect(energyResultsForBuilding(null, scene, first.id)).toBeUndefined();
  });
});

describe('resultsChangedSinceRun', () => {
  it("names the run when the building's results no longer match the design", () => {
    expect(resultsChangedSinceRun(nodeWith(completeRun), first.id, { second: {} })).toBe('Run 3');
  });

  it('says nothing while the results still match, or when the run had none for the building', () => {
    expect(resultsChangedSinceRun(nodeWith(completeRun), first.id, { first: {} })).toBeUndefined();
    expect(resultsChangedSinceRun({ ...nodeWith(completeRun), daylightResultsByBuildingId: {} }, first.id, {})).toBeUndefined();
    expect(resultsChangedSinceRun(null, first.id, {})).toBeUndefined();
  });
});
