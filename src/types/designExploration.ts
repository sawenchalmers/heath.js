import { BuildingModel } from './building';
import { DaylightRunSummary } from './daylight';
import { EmbodiedCarbonResult } from '../services/EPSMService';
import { MonthlyHeatBalance } from '../services/EnergyApiService';

export interface DesignMetrics {
  /** Embodied carbon (A1–A3) — kg CO₂e/m² floor area, computed client-side from EPSM */
  globalWarmingPotential: number;
  /** Per-element breakdown from EPSM — stored alongside globalWarmingPotential */
  embodiedCarbonBreakdown?: EmbodiedCarbonResult;
  /** Spatial daylight autonomy % — from daylight sim */
  spatialDaylightAutonomy: number;
  /** Heating demand kWh/m²/year — from energy sim, undefined until run */
  heatingDemand?: number;
  /** Cooling demand kWh/m²/year — from energy sim */
  coolingDemand?: number;
  /** Total energy kWh/m²/year — from energy sim */
  totalEnergy?: number;
}

export type DaylightRunStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed';

export interface DaylightRunMetadata {
  studyId?: string;
  status: DaylightRunStatus;
  stage?: string;
  error?: string;
  sensorCount?: number;
  meanDF?: number;
  updatedAt?: string;
}

export type EnergyRunStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed';

export interface EnergyRunMetadata {
  /** The building the energy study simulated; the others in the node only provide shared walls. */
  buildingId?: string;
  inputFingerprint?: string;
  studyId?: string;
  status: EnergyRunStatus;
  stage?: string;
  error?: string;
  monthlyHeatBalance?: MonthlyHeatBalance;
}

export interface DesignNode {
  id: string;
  timestamp: Date;
  name: string;
  buildings: BuildingModel[];
  metrics: DesignMetrics;
  daylightRun?: DaylightRunMetadata;
  daylightResultsByBuildingId?: Record<string, DaylightRunSummary>;
  energyRun?: EnergyRunMetadata;
  parentId?: string;
  position?: { x: number; y: number }; // For graph layout
}

export interface DesignExplorationGraph {
  nodes: DesignNode[];
  edges: { from: string; to: string }[];
  currentNodeId?: string;
}

export interface GraphPosition {
  x: number;
  y: number;
}
