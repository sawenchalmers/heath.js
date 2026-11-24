import { describe, expect, it } from 'vitest';
import { RunTracker } from '../runTracker';

describe('RunTracker', () => {
  it('cancels the current run: both its requests are aborted and it is marked as cancelled', () => {
    const tracker = new RunTracker();
    const run = tracker.startRun();
    tracker.cancelCurrentRun();
    expect(run.daylight.signal.aborted).toBe(true);
    expect(run.energy.signal.aborted).toBe(true);
    expect(run.cancelled).toBe(true);
  });

  it('aborts a run still going when a new one starts, and keeps the new one untouched', () => {
    const tracker = new RunTracker();
    const first = tracker.startRun();
    const second = tracker.startRun();
    expect(first.daylight.signal.aborted).toBe(true);
    expect(second.daylight.signal.aborted).toBe(false);
    expect(tracker.isCurrentRun(second)).toBe(true);
  });

  it('lets only the current run end the run in progress, so a replaced run can\'t re-enable Run studies', () => {
    const tracker = new RunTracker();
    const first = tracker.startRun();
    const second = tracker.startRun();
    expect(tracker.finishRun(first)).toBe(false); // the replaced run ends late: no effect
    expect(tracker.isCurrentRun(second)).toBe(true);
    expect(tracker.finishRun(second)).toBe(true);
    expect(tracker.isCurrentRun(second)).toBe(false);
  });

  it('keeps a cancelled run cancelled when a new run starts after it', () => {
    const tracker = new RunTracker();
    const first = tracker.startRun();
    tracker.cancelCurrentRun();
    const second = tracker.startRun();
    expect(first.cancelled).toBe(true);
    expect(second.cancelled).toBe(false);
  });

  it('only cancels the current run\'s own requests, nothing else', () => {
    const tracker = new RunTracker();
    const elsewhere = new AbortController(); // e.g. the design graph's energy rerun
    tracker.startRun();
    tracker.cancelCurrentRun();
    expect(elsewhere.signal.aborted).toBe(false);
  });
});
