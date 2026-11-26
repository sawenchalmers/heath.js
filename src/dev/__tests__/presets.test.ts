import { describe, expect, it } from 'vitest';
import { DEV_PRESETS } from '../presets';
import { validateFootprint } from '../../utils/buildingMetrics';
import { buildSimulationFootprint, sharedFloorsByEdge } from '../../services/SimulationFootprint';

/** Each building's shared floors per edge in a preset, by building id (undefined when it shares no wall). */
const sharedWalls = (id: string) => {
  const preset = DEV_PRESETS.find(p => p.id === id)!;
  return Object.fromEntries(preset.buildings.map(b => [b.id, sharedFloorsByEdge(buildSimulationFootprint(b, preset.buildings))]));
};

/** The floors a building shares on any of its walls, sorted. */
const floorsShared = (edges: number[][] | undefined) => [...new Set((edges ?? []).flat())].sort((a, b) => a - b);

describe('dev presets', () => {
  it('are all picked up, each with a name, a description and buildings with unique ids', () => {
    expect(DEV_PRESETS.map(p => p.id).sort()).toEqual([
      'footprint-shapes', 'rotated-pair', 'shared-full', 'shared-l-neighbour', 'shared-lower', 'shared-partial', 'shared-row', 'single-heights',
    ]);
    for (const preset of DEV_PRESETS) {
      expect(preset.name && preset.description).toBeTruthy();
      expect(new Set(preset.buildings.map(b => b.id)).size).toBe(preset.buildings.length);
    }
  });

  it('have valid footprints that only touch, never overlap', () => {
    for (const preset of DEV_PRESETS) {
      for (const building of preset.buildings) {
        const others = preset.buildings.filter(b => b !== building).map(b => b.points);
        expect(validateFootprint(building.points, others), `${preset.id}/${building.id}`).toBeNull();
      }
    }
  });

  it('share walls only in the shared-wall presets', () => {
    for (const id of ['rotated-pair', 'single-heights', 'footprint-shapes']) {
      expect(Object.values(sharedWalls(id)).every(edges => edges === undefined), id).toBe(true);
    }
    expect(floorsShared(sharedWalls('shared-full').west)).toEqual([1, 2, 3]);
    expect(floorsShared(sharedWalls('shared-partial').east)).toEqual([1, 2, 3]);
    expect(floorsShared(sharedWalls('shared-lower').tall)).toEqual([1, 2]);
    const row = sharedWalls('shared-row');
    expect((row.middle ?? []).filter(edge => edge.length > 0)).toHaveLength(2);
    expect((sharedWalls('shared-l-neighbour').corner ?? []).filter(edge => edge.length > 0)).toHaveLength(2);
  });
});
