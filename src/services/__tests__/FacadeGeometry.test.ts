import { describe, expect, it } from 'vitest';
import {
  buildFacadeLayout,
  buildHoneybeeSubRectangles,
  DEFAULT_FACADE_PARAMETERS
} from '../FacadeGeometry';
import honeybeeFixtures from './fixtures/honeybee-facades.json';

const rectangle = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 10, y: 0, z: 8 },
  { x: 0, y: 0, z: 8 }
];

describe('Honeybee-faithful facade geometry', () => {
  it.each(honeybeeFixtures)('matches HBJSON-derived fixture $name', (fixture) => {
    const footprint = fixture.footprint.map(([x, z]) => ({ x, y: 0, z }));
    const layout = buildFacadeLayout(footprint, 1, fixture.floorHeight, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr: fixture.wwr,
      // Fixture snapshots were exported with a 0.3 m vertical split.
      windowSpacing: 0.3
    });

    fixture.edges.forEach((expected, edgeIndex) => {
      const edgeApertures = layout.apertures.filter(aperture => aperture.edgeIndex === edgeIndex);
      expect(edgeApertures).toHaveLength(expected.count);
      const first = edgeApertures[0];
      expect(first.width).toBeCloseTo(expected.width, 8);
      expect(first.height).toBeCloseTo(expected.height, 8);
      expect([first.center.x, first.center.z, first.center.y]).toEqual(
        expected.firstCenter.map(value => expect.closeTo(value, 8))
      );
    });
  });

  it.each([0, 0.2, 0.4, 0.95])('matches requested aperture area for WWR %s', (wwr) => {
    const layout = buildFacadeLayout(rectangle, 2, 3, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr
    });
    const apertureArea = layout.apertures.reduce((sum, aperture) => sum + aperture.width * aperture.height, 0);
    const wallArea = (10 + 8 + 10 + 8) * 3 * 2;
    expect(apertureArea).toBeCloseTo(wallArea * wwr, 8);
  });

  it('matches the HBJSON-derived 10m wall fixture and preserves row order', () => {
    const rectangles = buildHoneybeeSubRectangles(10, 3, 0.4, 1.5, 0.75, 1.5, 0.3);

    expect(rectangles).toHaveLength(14);
    expect(rectangles.slice(0, 7).map(rectangle => rectangle.bottom)).toEqual(Array(7).fill(0.75));
    expect(rectangles.slice(7).map(rectangle => rectangle.bottom)).toEqual(Array(7).fill(1.8));
    expect(rectangles[0].width).toBeCloseTo(1.142857142857, 10);
    expect(rectangles[0].height).toBeCloseTo(0.75, 10);
  });

  it('orders apertures floor-first, then footprint-edge, without reversing geometry', () => {
    const layout = buildFacadeLayout(rectangle, 2, 3, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr: 0.4,
      windowSpacing: 0.3
    });
    const firstFloorCount = layout.apertures.filter(aperture => aperture.floorNumber === 1).length;

    expect(layout.apertures.slice(0, firstFloorCount).every(aperture => aperture.floorNumber === 1)).toBe(true);
    expect(layout.apertures.slice(firstFloorCount).every(aperture => aperture.floorNumber === 2)).toBe(true);
    expect(layout.apertures.slice(0, 14).every(aperture => aperture.edgeIndex === 0)).toBe(true);
    expect(layout.apertures[0].center.x).toBeGreaterThan(0);
    expect(layout.apertures[0].center.z).toBe(0);
    expect(layout.apertures[0].outward).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('always includes wall-thickness overhang and fins, adding extra depth only to the overhang', () => {
    const baseline = buildFacadeLayout(rectangle, 1, 3, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr: 0.4
    }).apertures[0];
    const extended = buildFacadeLayout(rectangle, 1, 3, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr: 0.4,
      additionalHorizontalShadingDepth: 0.5
    }).apertures[0];

    expect(baseline.shades.map(shade => shade.depth)).toEqual([0.3, 0.3, 0.3]);
    expect(extended.shades.map(shade => shade.depth)).toEqual([0.8, 0.3, 0.3]);
  });

  it('supports irregular footprints, short edges and high-WWR height expansion', () => {
    const irregular = [rectangle[0], { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 2 }, { x: 0, y: 0, z: 4 }];
    const layout = buildFacadeLayout(irregular, 1, 2.5, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr: 0.95
    });
    const perimeter = irregular.reduce((sum, point, index) => {
      const next = irregular[(index + 1) % irregular.length];
      return sum + Math.hypot(next.x - point.x, next.z - point.z);
    }, 0);

    expect(layout.apertures.length).toBeGreaterThan(0);
    expect(layout.apertures.reduce((sum, aperture) => sum + aperture.width * aperture.height, 0))
      .toBeCloseTo(perimeter * 2.5 * 0.95, 8);
  });

  // Visual explanation of this test (group 3):
  // https://claude.ai/artifact/G3TizxVrAig6HLK3U61E8Y (private Claude artifact; share it before others can open it)
  it('leaves out windows on shared walls, only on the shared floors', () => {
    const parameters = { ...DEFAULT_FACADE_PARAMETERS, wwr: 0.4 };
    const all = buildFacadeLayout(rectangle, 2, 3, parameters).apertures;
    const shared = buildFacadeLayout(rectangle, 2, 3, parameters, [[], [1], [], []]).apertures;
    const onEdge = (apertures: typeof all, edge: number, floor: number) =>
      apertures.filter(aperture => aperture.edgeIndex === edge && aperture.floorNumber === floor).length;

    expect(onEdge(all, 1, 1)).toBeGreaterThan(0);
    expect(onEdge(shared, 1, 1)).toBe(0);
    expect(onEdge(shared, 1, 2)).toBe(onEdge(all, 1, 2));
    expect(shared).toHaveLength(all.length - onEdge(all, 1, 1));
  });

  it('defaults to single-row apertures (no stacked windows) for realistic streetscape rhythm', () => {
    const layout = buildFacadeLayout(rectangle, 1, 3, {
      ...DEFAULT_FACADE_PARAMETERS,
      wwr: 0.4
    });

    const edge0Apertures = layout.apertures.filter(aperture => aperture.edgeIndex === 0);
    const bottoms = new Set(
      edge0Apertures.map(aperture => Number((aperture.center.y - aperture.height / 2).toFixed(6)))
    );

    expect(bottoms.size).toBe(1);
  });
});
