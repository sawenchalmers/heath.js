import { describe, expect, it } from 'vitest';
import { computePortfolioEmbodiedCarbon, embodiedCarbonOfBuilding, resolveEnergyConstructions, type EPSMConstruction, type EPSMConstructionOptions } from '../EPSMService';
import type { BuildingModel } from '../../types/building';

const options: EPSMConstructionOptions = {
  wall: [{ label: 'Wall A', value: 'Wall A', gwp: 1, uValue: 1 }],
  floor: [{ label: 'Floor A', value: 'Floor A', gwp: 1, uValue: 1 }],
  roof: [{ label: 'Roof A', value: 'Roof A', gwp: 1, uValue: 1 }],
  window: [{ label: 'Window A', value: 'Window A', gwp: 1, uValue: 1 }],
  byName: new Map(),
};

describe('energy construction resolution', () => {
  it('resolves default sentinels request-only and preserves valid explicit choices', () => {
    expect(resolveEnergyConstructions(options, { wall: 'Default Wall', floor: 'Floor A', roof: 'Default Roof', window: 'Default Window' })).toEqual({ wall: 'Wall A', floor: 'Floor A', roof: 'Roof A', window: 'Window A' });
  });

  it('blocks unavailable explicit choices and unavailable EPSM', () => {
    expect(() => resolveEnergyConstructions(options, { wall: 'Missing' })).toThrow(/not available/i);
    expect(() => resolveEnergyConstructions(null, {})).toThrow(/EPSM/i);
  });
});

describe('embodied carbon of a simulated building', () => {
  /** An EPSM construction with only the fields the calculation reads. */
  const construction = (name: string, gwp: number) => [name, { id: name, name, element_type: 'wall', u_value_w_m2k: 1, gwp_kgco2e_per_m2: gwp, cost_sek_per_m2: 0 } as EPSMConstruction] as const;
  const epsm = { ...options, byName: new Map([construction('Run wall', 10), construction('Own wall', 1000), construction('Floor A', 2), construction('Roof A', 3), construction('Window A', 5)]) };

  // 10 × 10 m, 3 storeys of 3 m: 40 m perimeter, 360 m² of wall, 300 m² of floor, 100 m² of roof.
  const building = {
    id: 'b', points: [], floors: 3, floorHeight: 3, footprintArea: 100, createdAt: new Date(0),
    metrics: { footprintArea: 100, grossFloorArea: 300, perimeter: 40, totalHeight: 9 },
    wall_construction: 'Own wall',
  } as unknown as BuildingModel;
  const run = { wall: 'Run wall', floor: 'Floor A', roof: 'Roof A', window: 'Window A' };

  it("uses the constructions the energy study ran with, not the building's own fields", () => {
    const { breakdown } = embodiedCarbonOfBuilding(epsm, building, run);
    // No window-to-wall ratio on the building: the default 40 % gives 144 m² of window and 216 m² of wall.
    expect(breakdown).toMatchObject({ wall_gwp_kgco2e: 216 * 10, window_gwp_kgco2e: 144 * 5, floor_gwp_kgco2e: 300 * 2, roof_gwp_kgco2e: 100 * 3 });
  });

  it("follows the building's own window-to-wall ratio when it has one", () => {
    const { breakdown } = embodiedCarbonOfBuilding(epsm, { ...building, window_to_wall_ratio: 0.25 }, run);
    expect(breakdown).toMatchObject({ wall_gwp_kgco2e: 270 * 10, window_gwp_kgco2e: 90 * 5 });
  });
});

describe('embodied carbon of a design before any study', () => {
  it('counts "Default …" construction names as the first EPSM construction, not as 0', () => {
    const epsm = { ...options, byName: new Map(['Wall A', 'Floor A', 'Roof A', 'Window A'].map(name => [name, { id: name, name, element_type: '', u_value_w_m2k: 1, gwp_kgco2e_per_m2: 1, cost_sek_per_m2: 0 }])) };
    const building = { footprintArea: 100, floors: 1, floorHeight: 3, window_to_wall_ratio: 0, wall_construction: 'Default Wall', floor_construction: 'Default Floor', roof_construction: 'Default Roof', window_construction: 'Default Window' };
    // 10 × 10 m (no points: perimeter from the area), 1 storey of 3 m: 120 m² of wall, 100 m² of floor, 100 m² of roof, at 1 kg CO₂e/m².
    expect(computePortfolioEmbodiedCarbon(epsm, [building])).toBeCloseTo(320 / 100);
  });
});
