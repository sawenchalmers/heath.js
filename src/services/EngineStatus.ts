/** Whether heath-engine answers. */
export type EngineStatus = 'available' | 'unavailable';

/** What a probe request came back with, or `'network-error'` when nothing answered at all. */
export type EngineProbeOutcome = { ok: boolean; contentType: string | null } | 'network-error';

/** How long a probe may take before the engine counts as unavailable. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Decide from a probe's outcome whether the engine is available. Only a successful JSON reply counts:
 * a network error, a proxy error (502/503/504, or the Vite proxy's empty 500) and a 200 with HTML
 * all mean unavailable. The last is what the production nginx sends without an engine, since unknown
 * paths fall back to the app's index.html.
 */
export const engineStatusFromProbe = (outcome: EngineProbeOutcome): EngineStatus => {
  if (outcome === 'network-error' || !outcome.ok) return 'unavailable';
  return outcome.contentType?.toLowerCase().includes('application/json') ? 'available' : 'unavailable';
};

/** Probe the engine with a GET to `url`, giving up after a few seconds, and return its status. */
export const probeEngine = async (url: string, fetchFn: typeof fetch = fetch): Promise<EngineStatus> => {
  try {
    const response = await fetchFn(url, { method: 'GET', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return engineStatusFromProbe({ ok: response.ok, contentType: response.headers.get('content-type') });
  } catch {
    return engineStatusFromProbe('network-error');
  }
};
