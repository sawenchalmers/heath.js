// The outside services the app reaches through its own server, under `<base>proxy/<name>`: forwarded
// by the Vite dev server (vite.config.ts) and, when deployed, by the container's nginx (nginx.conf,
// kept in step by a test). The browser can't call these sites directly (no CORS headers).
//
// Shared by the app and vite.config.ts, so it must not use browser-only or Vite-only features
// (the app-only helper is proxyUrl.ts).

/** The path segment all forwarded services live under, after the base path. */
export const PROXY_PREFIX = 'proxy/';

/** The forwarded services and where they go. The engine's target is configurable (vite.config.ts sets it for dev), so it has none here. */
export const PROXIED_SERVICES = {
  climate: 'https://climate.onebuilding.org',
  epsm: 'https://epsm.chalmers.se',
  engine: null,
} as const;

export type ProxiedService = keyof typeof PROXIED_SERVICES;

/** The path to `service` under the base path `base` (which ends in `/`), e.g. `/heath/proxy/epsm`. */
export const proxyPathUnder = (base: string, service: ProxiedService): string => `${base}${PROXY_PREFIX}${service}`;
