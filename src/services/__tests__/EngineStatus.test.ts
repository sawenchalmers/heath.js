import { describe, expect, it, vi } from 'vitest';
import { engineStatusFromProbe, probeEngine } from '../EngineStatus';

describe('deciding whether the engine is available', () => {
  it('counts a successful JSON reply as available, with or without a charset', () => {
    expect(engineStatusFromProbe({ ok: true, contentType: 'application/json' })).toBe('available');
    expect(engineStatusFromProbe({ ok: true, contentType: 'application/json; charset=utf-8' })).toBe('available');
  });

  it('counts nothing listening and proxy errors as unavailable', () => {
    expect(engineStatusFromProbe('network-error')).toBe('unavailable');
    for (const contentType of [null, 'text/html']) {
      expect(engineStatusFromProbe({ ok: false, contentType })).toBe('unavailable');
    }
  });

  it('counts a 200 with HTML as unavailable: a server falling back to index.html when there is no engine', () => {
    expect(engineStatusFromProbe({ ok: true, contentType: 'text/html' })).toBe('unavailable');
    expect(engineStatusFromProbe({ ok: true, contentType: null })).toBe('unavailable');
  });
});

describe('probing the engine', () => {
  const reply = (status: number, contentType: string | null) => {
    const headers = new Headers();
    if (contentType) headers.set('content-type', contentType);
    return new Response('', { status, headers });
  };

  it('reads the status and content type of the reply', async () => {
    expect(await probeEngine('/api/daylight/v1/locations', vi.fn().mockResolvedValue(reply(200, 'application/json')))).toBe('available');
    expect(await probeEngine('/api/daylight/v1/locations', vi.fn().mockResolvedValue(reply(502, 'text/html')))).toBe('unavailable');
    expect(await probeEngine('/api/daylight/v1/locations', vi.fn().mockResolvedValue(reply(500, null)))).toBe('unavailable');
  });

  it('counts a failed request, such as a refused connection or a timeout, as unavailable', async () => {
    expect(await probeEngine('/api/daylight/v1/locations', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))).toBe('unavailable');
  });
});
