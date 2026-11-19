import { proxyPathUnder, type ProxiedService } from './proxiedServices';

// Kept apart from proxiedServices.ts on purpose: vite.config.ts imports that file and is type-checked
// without Vite's browser types (tsconfig.node.json), where `import.meta.env` doesn't exist.

/** Where the app reaches a forwarded service: under its own base path (`/proxy/epsm` in dev, `/heath/proxy/epsm` when deployed). */
export const proxyUrl = (service: ProxiedService): string => proxyPathUnder(import.meta.env.BASE_URL, service);
