// The runs started by Save and run (and its Retry). Each run has its own record: its controllers for
// the daylight and energy requests, and whether the user cancelled it. Only the newest run is
// "current": when a run ends, it may only change the app's shared state (e.g. re-enable Run
// studies) if it is still current, so a run that was replaced can't interfere with the one that
// replaced it (#73).

/** One run: its own abort controllers, and whether it was cancelled. */
export interface Run {
  readonly id: number;
  readonly daylight: AbortController;
  readonly energy: AbortController;
  cancelled: boolean;
}

export class RunTracker {
  private current: Run | null = null;
  private nextId = 1;

  /** Start a new run. A run still going is aborted: the new one takes its place. */
  startRun(): Run {
    this.abort(this.current);
    this.current = { id: this.nextId++, daylight: new AbortController(), energy: new AbortController(), cancelled: false };
    return this.current;
  }

  /** Whether `run` is still the newest run. */
  isCurrentRun(run: Run): boolean {
    return this.current === run;
  }

  /** Cancel the current run, if there is one: both its requests are aborted and it's marked as cancelled. */
  cancelCurrentRun(): void {
    if (this.current) this.current.cancelled = true;
    this.abort(this.current);
  }

  /** `run` is over. Returns whether it was still current, i.e. whether it may update the app's shared state. */
  finishRun(run: Run): boolean {
    if (this.current !== run) return false;
    this.current = null;
    return true;
  }

  /** Abort both of a run's requests. */
  private abort(run: Run | null): void {
    run?.daylight.abort();
    run?.energy.abort();
  }
}
