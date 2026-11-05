import { describe, expect, it } from 'vitest';
import type { BuildingData } from '../../types/building';
import type { DaylightRunSummary } from '../../types/daylight';
import { createDaylightInputFingerprint, createEnergyInputFingerprint, isEnergyRunCurrent, retainValidDaylightResults } from '../SimulationFingerprint';

const building = (id: string): BuildingData => ({
  id,
  mesh: {} as BuildingData['mesh'],
  points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 8 }, { x: 0, y: 0, z: 8 }],
  footprintArea: 80,
  metrics: { footprintArea: 80, grossFloorArea: 240, perimeter: 36, totalHeight: 9 },
  floors: 3,
  floorHeight: 3,
  createdAt: new Date(),
  name: 'Original',
  color: 0x111111,
  window_to_wall_ratio: 0.4,
  window_overhang: false,
  window_overhang_depth: 0.5,
  wall_construction: 'Wall A',
  building_program: 'Office',
  hvac_system: 'VAV'
});

describe('simulation input fingerprints', () => {
  it('ignores metadata but expires daylight for facade and context massing changes', () => {
    const target = building('target');
    const context = building('context');
    const original = createDaylightInputFingerprint(target, [target, context]);

    expect(createDaylightInputFingerprint({ ...target, name: 'Renamed', color: 0xffffff }, [target, context])).toBe(original);
    expect(createDaylightInputFingerprint({ ...target, window_to_wall_ratio: 0.5 }, [target, context])).not.toBe(original);
    expect(createDaylightInputFingerprint(target, [target, { ...context, floors: 4 }])).not.toBe(original);
    expect(createDaylightInputFingerprint(target, [target, { ...context, color: 0xffffff }])).toBe(original);
  });

  it('ignores a stored additional depth while disabled and includes relevant energy inputs', () => {
    const original = building('target');
    expect(createDaylightInputFingerprint({ ...original, window_overhang_depth: 1.2 }, [original]))
      .toBe(createDaylightInputFingerprint(original, [original]));
    const energyFingerprintAlone = (target: BuildingData) => createEnergyInputFingerprint(target, [target]);
    expect(energyFingerprintAlone({ ...original, name: 'Renamed' })).toBe(energyFingerprintAlone(original));
    expect(energyFingerprintAlone({ ...original, wall_construction: 'Wall B' })).not.toBe(energyFingerprintAlone(original));
    expect(energyFingerprintAlone({ ...original, natural_ventilation: true })).not.toBe(energyFingerprintAlone(original));
    expect(energyFingerprintAlone({ ...original, floors: 4 })).not.toBe(energyFingerprintAlone(original));
    expect(energyFingerprintAlone({ ...original, window_to_wall_ratio: 0.5 })).not.toBe(energyFingerprintAlone(original));
  });

  it('retains working results for metadata commits but not relevant commits, without mutating historical data', () => {
    const original = building('target');
    const historicalResult = {
      inputFingerprint: createDaylightInputFingerprint(original, [original]),
      studyId: 'study-1', status: 'complete', sensorCount: 1, meanDF: 2, sda: 50,
      points: [], sensorGrids: [], startedAt: '2026-01-01', completedAt: '2026-01-01'
    } satisfies DaylightRunSummary;
    const historicalNodeResults = { [original.id]: historicalResult };

    expect(retainValidDaylightResults(historicalNodeResults, [{ ...original, name: 'Renamed' }]))
      .toEqual(historicalNodeResults);
    expect(retainValidDaylightResults(historicalNodeResults, [{ ...original, floors: 4 }]))
      .toEqual({});
    expect(historicalNodeResults).toEqual({ [original.id]: historicalResult });
  });
});

describe('energy fingerprint and neighbouring buildings', () => {
  const point = (x: number, z: number) => ({ x, y: 0, z });
  const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];
  /** The 10 × 8 m, 3-storey target from `building`, and a neighbour with the given footprint and storeys. */
  const target = building('target');
  const neighbour = (points: ReturnType<typeof box>, floors = 3) => ({ ...building('neighbour'), points, floors });
  const fingerprint = (buildings: BuildingData[]) => createEnergyInputFingerprint(target, [target, ...buildings]);

  it('keeps the fingerprint when a building that touches no wall moves', () => {
    expect(fingerprint([neighbour(box(20, 0, 30, 8))])).toBe(fingerprint([]));
    expect(fingerprint([neighbour(box(25, 0, 35, 8))])).toBe(fingerprint([]));
  });

  it('changes the fingerprint when a neighbour starts touching a wall', () => {
    expect(fingerprint([neighbour(box(10, 2, 20, 6))])).not.toBe(fingerprint([neighbour(box(20, 2, 30, 6))]));
  });

  it('changes the fingerprint when a touching neighbour slides along the wall', () => {
    expect(fingerprint([neighbour(box(10, 2, 20, 6))])).not.toBe(fingerprint([neighbour(box(10, 3, 20, 7))]));
  });

  it('changes the fingerprint when a lower neighbour grows by a storey', () => {
    const lower = (floors: number) => fingerprint([neighbour(box(10, 2, 20, 6), floors)]);
    expect(lower(1)).not.toBe(lower(2));
  });

  it('keeps the fingerprint when an extra point is added in the middle of a straight wall', () => {
    const withExtraPoint = { ...target, points: [point(0, 0), point(5, 0), point(10, 0), point(10, 8), point(0, 8)] };
    expect(createEnergyInputFingerprint(withExtraPoint, [withExtraPoint])).toBe(createEnergyInputFingerprint(target, [target]));
  });
});

describe('whether a saved energy result is current', () => {
  const point = (x: number, z: number) => ({ x, y: 0, z });
  const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];
  /** A scene where the simulated building is not the first one, as when it was drawn second. */
  const first = { ...building('first'), points: box(-30, 0, -20, 8) };
  const simulated = building('simulated');
  const scene = [first, simulated];
  const savedRun = { status: 'complete' as const, buildingId: simulated.id, inputFingerprint: createEnergyInputFingerprint(simulated, scene) };

  it('checks the building the study simulated, not the first building in the scene', () => {
    expect(isEnergyRunCurrent(savedRun, scene)).toBe(true);
    expect(isEnergyRunCurrent(savedRun, [first, { ...simulated, floors: 4 }])).toBe(false);
  });

  it('goes out of date when a neighbour starts touching a wall', () => {
    const touching = { ...building('touching'), points: box(10, 2, 20, 6) };
    expect(isEnergyRunCurrent(savedRun, [...scene, touching])).toBe(false);
  });

  it('counts results without a building id, or whose building is gone, as out of date', () => {
    expect(isEnergyRunCurrent({ ...savedRun, buildingId: undefined }, scene)).toBe(false);
    expect(isEnergyRunCurrent(savedRun, [first])).toBe(false);
    expect(isEnergyRunCurrent(undefined, scene)).toBe(false);
  });
});
