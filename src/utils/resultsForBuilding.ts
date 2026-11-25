import type { EnergyResults } from '../types/energyResults';
import { isEnergyRunCurrent } from '../services/SimulationFingerprint';
import type { BuildingModel } from '../types/building';
import type { DesignNode } from '../types/designExploration';

/** A building's display name; `fallback` when no building has that id. */
export const buildingNameOf = (buildings: readonly BuildingModel[], id: string | undefined, fallback = 'another building'): string => {
  const building = buildings.find(each => each.id === id);
  return building ? building.name || 'Untitled building' : fallback;
};

/**
 * What the energy and embodied-carbon sections show for the building whose results are open (`buildingId`).
 * An energy study simulates one building, so another building's dialog names it instead of showing its figures.
 */
export const energyResultsForBuilding = (
  node: DesignNode | null | undefined,
  buildings: readonly BuildingModel[],
  buildingId: string,
): EnergyResults | undefined => {
  if (!node) return undefined;
  const run = node.energyRun;
  const status = run?.status;
  const forOtherBuilding = Boolean(run?.buildingId && run.buildingId !== buildingId);
  const simulatedName = buildingNameOf(buildings, run?.buildingId);

  // A run in progress shows its status, even before it has a fingerprint for the current scene.
  if (status === 'queued' || status === 'running') {
    return forOtherBuilding ? { status, emptyMessage: `Energy simulation ${status} for ${simulatedName}…` } : { status };
  }
 
  if (forOtherBuilding) {
    if (status === 'failed') return { status: 'idle', emptyMessage: `The energy simulation for ${simulatedName} failed. Energy is simulated for one building per run.` };
    if (status === 'complete') return { status: 'idle', emptyMessage: `Energy was simulated for ${simulatedName}, not for this building.` };
    return { status: 'idle', emptyMessage: `Energy is simulated for ${simulatedName} only.` };
  }
  if (status === 'failed') return { status };
  if (!isEnergyRunCurrent(run, buildings)) {
    return status === 'complete'
      ? { status: 'idle', emptyMessage: 'The design has changed since the energy simulation. Run studies again to update it.' }
      : { status: 'idle' };
  }
  return {
    heatingDemand: node.metrics.heatingDemand,
    coolingDemand: node.metrics.coolingDemand,
    totalEnergy: node.metrics.totalEnergy,
    globalWarmingPotential: node.metrics.globalWarmingPotential,
    embodiedCarbonBreakdown: node.metrics.embodiedCarbonBreakdown,
    monthlyHeatBalance: run?.monthlyHeatBalance,
    status: 'complete',
  };
};

/**
 * The name of the current run when it has daylight results for `buildingId` that no longer match the design,
 * so the building panel can say why its results are hidden (#83); otherwise undefined.
 */
export const resultsChangedSinceRun = (
  node: DesignNode | null | undefined,
  buildingId: string | null | undefined,
  currentResults: Record<string, unknown>,
): string | undefined =>
  node && buildingId && node.daylightResultsByBuildingId?.[buildingId] && !currentResults[buildingId] ? node.name : undefined;
