import type { BuildingModel } from '../types/building';
import type { DaylightRunState, DaylightRunSummary } from '../types/daylight';
import type { EPSMConstructionOptions, ResolvedEnergyConstructions } from './EPSMService';
import { resolveEnergyConstructions } from './EPSMService';
import { daylightApiService } from './DaylightApiService';
import { energyApiService, type EnergyRunCallbacks, type EnergyStudyResult } from './EnergyApiService';
import { createDaylightInputFingerprint } from './SimulationFingerprint';

interface DaylightStudySetOptions {
  buildings: BuildingModel[];
  signal: AbortSignal;
  onStatus?: (building: BuildingModel, status: DaylightRunState) => void;
}

interface EnergyStudyOptions {
  building: BuildingModel;
  /** All buildings in the scene, used to find walls shared with `building`. */
  buildings: readonly BuildingModel[];
  epsm: EPSMConstructionOptions | null;
  signal: AbortSignal;
  callbacks?: EnergyRunCallbacks;
}

export interface CoordinatedEnergyResult {
  result: EnergyStudyResult;
  constructions: ResolvedEnergyConstructions;
}

/** Owns simulation submission/polling details so the workspace remains UI orchestration only. */
export class SimulationCoordinator {
  async runDaylightStudySet({ buildings, signal, onStatus }: DaylightStudySetOptions): Promise<Record<string, DaylightRunSummary>> {
    const results = await Promise.all(buildings.map(building => daylightApiService.runStudyForBuilding(
      building,
      {
        // v1 computes sDA with the engine's default weather; it no longer depends on a location.
        run_sda: true,
        selected_floor_number: Math.max(1, building.floors),
        simulate_all_floors: true,
        context_buildings: buildings
          .filter(context => context.id !== building.id)
          .map(context => daylightApiService.buildContextBuilding(context)),
        neighbours: buildings,
      },
      { signal, onStatus: status => onStatus?.(building, status) },
    )));

    return Object.fromEntries(buildings.map((building, index) => [building.id, {
      ...results[index],
      inputFingerprint: createDaylightInputFingerprint(building, buildings),
    }]));
  }

  /** Run an energy study for one building, with shared walls taken from the other buildings. */
  async runEnergyStudy({ building, buildings, epsm, signal, callbacks }: EnergyStudyOptions): Promise<CoordinatedEnergyResult> {
    const constructions = resolveEnergyConstructions(epsm, {
      wall: building.wall_construction,
      floor: building.floor_construction,
      roof: building.roof_construction,
      window: building.window_construction,
    });
    const result = await energyApiService.runEnergyStudy(
      building,
      {
        constructions,
        building_program: building.building_program ?? 'Office',
        natural_ventilation: building.natural_ventilation ?? false,
        neighbours: buildings,
      },
      callbacks,
      signal,
    );
    return { result, constructions };
  }
}

export const simulationCoordinator = new SimulationCoordinator();
