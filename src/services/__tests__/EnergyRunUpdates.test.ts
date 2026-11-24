import { describe, expect, it } from 'vitest';
import { energyRunAfterRerunError } from '../EnergyRunUpdates';
import type { EnergyRunMetadata } from '../../types/designExploration';

/** Apply an update the way DesignExplorationService.updateNode does: merged onto the existing run. */
const merge = (run: EnergyRunMetadata, update: EnergyRunMetadata): EnergyRunMetadata => ({ ...run, ...update });

describe('node update after an energy rerun throws', () => {
  const running: EnergyRunMetadata = { status: 'running', buildingId: 'b1', stage: 'Simulating' };

  it('puts an aborted run back to idle, whichever error the abort surfaced as', () => {
    for (const error of [new Error('Energy study aborted'), new DOMException('The operation was aborted.', 'AbortError')]) {
      const next = merge(running, energyRunAfterRerunError(error, true));
      expect(next.status).toBe('idle');
      expect(next.stage).toBeUndefined();
      expect(next.buildingId).toBe('b1');
    }
  });

  it('marks any other error as failed with its message', () => {
    const next = merge(running, energyRunAfterRerunError(new Error('Energy study timed out after polling limit'), false));
    expect(next).toMatchObject({ status: 'failed', error: 'Energy study timed out after polling limit', buildingId: 'b1' });
    expect(next.stage).toBeUndefined();
  });

  it('gives a generic message when something other than an Error was thrown', () => {
    expect(energyRunAfterRerunError('boom', false)).toMatchObject({ status: 'failed', error: 'Energy simulation failed.' });
  });
});
