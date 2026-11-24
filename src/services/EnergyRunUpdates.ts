import type { EnergyRunMetadata } from '../types/designExploration';

/**
 * The node update after an energy rerun throws. An aborted run (another run took over) goes back to idle
 * instead of showing as failed; any other error marks it failed. Decided from the run's own abort signal:
 * an abort usually surfaces as the browser's AbortError ("signal is aborted without reason"), and only
 * rarely as "Energy study aborted".
 */
export const energyRunAfterRerunError = (error: unknown, aborted: boolean): EnergyRunMetadata => aborted
  ? { status: 'idle', stage: undefined, error: undefined }
  : { status: 'failed', stage: undefined, error: error instanceof Error ? error.message : 'Energy simulation failed.' };
