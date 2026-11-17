/** Whether heath-engine answers. */
export type EngineStatus = 'available' | 'unavailable';

/** What a probe request came back with, or `'network-error'` when nothing answered at all. */
export type EngineProbeOutcome = { ok: boolean; contentType: string | null } | 'network-error';

/** How long a probe may take before the engine counts as unavailable. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Decide whether the engine is up, from the answer to the check request.
 * Only an OK answer containing JSON counts as up. Everything else counts as down:
 * - no answer at all (nothing running at that address)
 * - an error status, e.g. 502 or 503 from a proxy that couldn't reach the engine
 * - an OK answer with a web page instead of JSON: some servers answer every unknown
 *   address with the app's start page, which would otherwise look like a working engine
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
