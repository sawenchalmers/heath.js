import type { EmbodiedCarbonResult } from '../services/EPSMService';
import type { MonthlyHeatBalance } from '../services/EnergyApiService';

/** What the Results Explorer's energy and embodied-carbon sections show: figures, a status, or a message instead. */
export interface EnergyResults {
  heatingDemand?: number;
  coolingDemand?: number;
  totalEnergy?: number;
  globalWarmingPotential?: number;
  embodiedCarbonBreakdown?: EmbodiedCarbonResult;
  monthlyHeatBalance?: MonthlyHeatBalance;
  status?: 'idle' | 'queued' | 'running' | 'complete' | 'failed';
  /** Shown instead of the figures, e.g. when energy was simulated for another building (#32). */
  emptyMessage?: string;
}
