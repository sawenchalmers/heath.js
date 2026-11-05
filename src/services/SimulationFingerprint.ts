import type { BuildingModel } from '../types/building';
import type { DaylightRunSummary } from '../types/daylight';
import { ensureHoneybeeCounterClockwise, getBuildingFacadeParameters } from './FacadeGeometry';
import type { AdjacencyInput } from './BuildingAdjacency';
import { buildSimulationFootprint, sharedFloorsByEdge } from './SimulationFootprint';

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hash = (value: unknown): string => {
  const serialized = stableSerialize(value);
  let state = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    state ^= serialized.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }
  return `v1-${(state >>> 0).toString(16).padStart(8, '0')}`;
};

const footprintInput = (building: BuildingModel) => ensureHoneybeeCounterClockwise(building.points)
  .map(point => [point.x, point.z]);

const massingInput = (building: BuildingModel) => ({
  footprint: footprintInput(building),
  floors: building.floors,
  floorHeight: building.floorHeight
});

/** The target building in a daylight study: its raw massing and window parameters. */
const daylightTargetInput = (building: BuildingModel) => ({
  ...massingInput(building),
  ...getBuildingFacadeParameters(building)
});

export const createDaylightInputFingerprint = (
  target: BuildingModel,
  allBuildings: BuildingModel[]
): string => hash({
  target: daylightTargetInput(target),
  context: allBuildings
    .filter(building => building.id !== target.id)
    .map(massingInput)
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
});

/**
 * The walls as the energy request sends them: the simplified, split footprint and the shared floors
 * of each edge. Neighbours that touch no wall leave it unchanged, so moving them keeps cached results.
 */
const energyWallsInput = (building: BuildingModel, buildings: readonly AdjacencyInput[]) => {
  const simulationFootprint = buildSimulationFootprint(building, buildings);
  return {
    footprint: simulationFootprint.footprint.map(point => [point.x, point.z]),
    sharedFloorsByEdge: sharedFloorsByEdge(simulationFootprint) ?? null,
  };
};

/** Fingerprint of everything an energy study depends on, including walls shared with `buildings`. */
export const createEnergyInputFingerprint = (building: BuildingModel, buildings: readonly AdjacencyInput[]): string => hash({
  walls: energyWallsInput(building, buildings),
  massing: { floors: building.floors, floorHeight: building.floorHeight },
  facade: getBuildingFacadeParameters(building),
  wallConstruction: building.wall_construction ?? null,
  floorConstruction: building.floor_construction ?? null,
  roofConstruction: building.roof_construction ?? null,
  windowConstruction: building.window_construction ?? null,
  structuralSystem: building.structural_system ?? null,
  buildingProgram: building.building_program ?? null,
  hvacSystem: building.hvac_system ?? null,
  naturalVentilation: building.natural_ventilation ?? false
});

export const retainValidDaylightResults = (
  results: Record<string, DaylightRunSummary>,
  buildings: BuildingModel[]
): Record<string, DaylightRunSummary> => Object.fromEntries(
  Object.entries(results).filter(([buildingId, result]) => {
    const target = buildings.find(building => building.id === buildingId);
    return target && result.inputFingerprint === createDaylightInputFingerprint(target, buildings);
  })
);
