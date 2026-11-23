import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';
import { PROXIED_SERVICES, proxyPathUnder, type ProxiedService } from './src/services/proxiedServices';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/';

  // Where each forwarded service goes in dev and preview; the engine's address is a setting (the v1 engine,
  // run locally with Docker on port 8001; see the README).
  const targets = { ...PROXIED_SERVICES, engine: env.VITE_ENGINE_PROXY_TARGET || 'http://localhost:8001' };
  // v1 answers only when a study is done, and gives up after about 21 minutes (a 504), so the engine's
  // forward waits longer than that instead of the proxy's default of 2 minutes.
  const ENGINE_TIMEOUT_MS = 25 * 60 * 1000;

  // One forward per service in src/services/proxiedServices.ts, under the app's base path, as the
  // container's nginx does in production: `<base>proxy/<name>/x` → `<target>/x` (/proxy/… in dev,
  // /heath/proxy/… for `npm run preview` of a production build). `<base>api/` is Heath's own backend.
  const forwards: Record<string, ProxyOptions> = Object.fromEntries(
    (Object.keys(targets) as ProxiedService[]).map(service => {
      const path = proxyPathUnder(basePath, service);
      const timeouts = service === 'engine' ? { timeout: ENGINE_TIMEOUT_MS, proxyTimeout: ENGINE_TIMEOUT_MS } : {};
      return [path, { target: targets[service], changeOrigin: true, rewrite: (url: string) => url.slice(path.length), ...timeouts }];
    }),
  );

  return {
    plugins: [react(), buildInfoPlugin()],
    base: basePath,
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    // Configure static asset handling
    assetsInclude: ['**/*.3dm'],
    // Proxies to outside services, which the browser can't call directly (no CORS headers)
    server: { proxy: forwards },
    preview: { proxy: forwards },
  };
});
