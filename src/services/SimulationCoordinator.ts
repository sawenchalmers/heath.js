import type { BuildingModel } from '../types/building';
import type { DaylightRunState, DaylightRunSummary } from '../types/daylight';
import type { EPSMConstructionOptions, ResolvedEnergyConstructions } from './EPSMService';
import { resolveEnergyConstructions } from './EPSMService';
import { daylightApiService } from './DaylightApiService';
import { energyApiService, type EnergyRunCallbacks, type EnergyStudyResult } from './EnergyApiService';
import { createDaylightInputFingerprint } from './SimulationFingerprint';

interface DaylightStudySetOptions {
  buildings: BuildingModel[];
  location?: string;
  signal: AbortSignal;
  onStatus?: (building: BuildingModel, status: DaylightRunState) => void;
}

interface EnergyStudyOptions {
  building: BuildingModel;
  location: string;
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
  async runDaylightStudySet({ buildings, location, signal, onStatus }: DaylightStudySetOptions): Promise<Record<string, DaylightRunSummary>> {
    const runSda = Boolean(location);
    const results = await Promise.all(buildings.map(building => daylightApiService.runStudyForBuilding(
      building,
      {
        run_sda: runSda,
        location,
        quality: 'full',
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

  async runEnergyStudy({ building, location, epsm, signal, callbacks }: EnergyStudyOptions): Promise<CoordinatedEnergyResult> {
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
        hvac_system: building.hvac_system ?? 'Default HVAC',
        natural_ventilation: building.natural_ventilation ?? false,
        location,
      },
      callbacks,
      signal,
    );
    return { result, constructions };
  }
}

export const simulationCoordinator = new SimulationCoordinator();
