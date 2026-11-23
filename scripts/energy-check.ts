// Energy check (#30): sends five fixed scenes to a running engine through the app's own request code
// (EnergyApiService), and prints heating, cooling and total energy per scene. Run it against the old
// engine and again after the move to v1 (#25), and compare the saved results.
//
//   npm run check:energy                                  # v1 engine at http://127.0.0.1:8001
//   npm run check:energy -- --url http://127.0.0.1:8000 --save old   # the old engine (npm run engine)
//
// Not part of the normal test run: it needs a running engine.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EnergyApiService, type EnergyStudyResult } from '../src/services/EnergyApiService';
import type { BuildingModel, Point3D } from '../src/types/building';
import { calculateBuildingMetrics } from '../src/utils/buildingMetrics';

/** A plan point; plan coordinates are x and z (y is up). */
const point = (x: number, z: number): Point3D => ({ x, y: 0, z });

/** A rectangle from (x0, z0) to (x1, z1), counter-clockwise in plan. */
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];

/** A building as the app would hold it, with fixed façade settings. */
const building = (id: string, points: Point3D[], floors: number, floorHeight = 3.5): BuildingModel => ({
  id,
  points,
  floors,
  floorHeight,
  footprintArea: calculateBuildingMetrics(points, floors, floorHeight).footprintArea,
  metrics: calculateBuildingMetrics(points, floors, floorHeight),
  createdAt: new Date(0),
  window_to_wall_ratio: 0.4,
});

// The target: 10 x 10 m, 3 storeys. Its east wall runs along x = 10.
const target = building('target', box(0, 0, 10, 10), 3);

/** The scenes from #30: what each one checks is in its name. */
const SCENES: { name: string; neighbours: BuildingModel[] }[] = [
  { name: 'Target alone', neighbours: [] },
  { name: 'Same-height neighbour on part of the east wall', neighbours: [building('n', box(10, 3, 18, 7), 3)] },
  { name: 'Lower neighbour (2 of 3 storeys)', neighbours: [building('n', box(10, 3, 18, 7), 2)] },
  { name: 'Lower neighbour slid along the wall', neighbours: [building('n', box(10, 1, 18, 5), 2)] },
  { name: 'Neighbour not touching', neighbours: [building('n', box(12, 3, 20, 7), 3)] },
];

// Fixed inputs, so runs on different engines are comparable. Construction names are from EPSM.
const CONSTRUCTIONS = { wall: 'Brick Wall with Insulation', floor: 'Concrete Floor', roof: 'Insulated Roof', window: 'Triple Glazed Low-E Window' };
const PROGRAM = 'Office';

/** The value after `--name` on the command line, or the fallback. */
const argument = (name: string, fallback?: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

/** Rounds to one decimal, keeping missing values visible. */
const round = (value: number | undefined) => (value === undefined ? null : Math.round(value * 10) / 10);

/** Sends every scene, one after the other, and returns one row per scene. */
async function runScenes(url: string) {
  const service = new EnergyApiService(url);
  const rows = [];
  for (const scene of SCENES) {
    const started = Date.now();
    try {
      const result: EnergyStudyResult = await service.runEnergyStudy(target, {
        constructions: CONSTRUCTIONS,
        building_program: PROGRAM,
        neighbours: [target, ...scene.neighbours],
      });
      rows.push({
        scene: scene.name,
        heating_kwh_m2: round(result.heating_demand_kwh_m2),
        cooling_kwh_m2: round(result.cooling_demand_kwh_m2),
        total_kwh_m2: round(result.total_energy_kwh_m2),
        seconds: round((Date.now() - started) / 1000),
      });
    } catch (error) {
      rows.push({ scene: scene.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return rows;
}

const url = argument('url', 'http://127.0.0.1:8001')!;
const save = argument('save');

// The v1 engine has no location parameter: it uses its default weather file (Gothenburg TMYx).
console.log(`Energy check against ${url} (${PROGRAM})`);
const rows = await runScenes(url);
console.table(rows);

if (save) {
  const folder = path.resolve('docs/audits/energy-check');
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${save}.json`);
  writeFileSync(file, JSON.stringify({ engine: save, url, program: PROGRAM, constructions: CONSTRUCTIONS, date: new Date().toISOString(), scenes: rows }, null, 2) + '\n');
  console.log(`Saved to ${path.relative(process.cwd(), file)}`);
}
if (rows.some(row => 'error' in row)) process.exitCode = 1;
