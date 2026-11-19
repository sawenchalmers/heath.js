import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';
import { PROXIED_SERVICES, proxyPathUnder, type ProxiedService } from './src/services/proxiedServices';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/';

  // Where each forwarded service goes in dev and preview; the engine's address is a setting.
  const targets = { ...PROXIED_SERVICES, daylight: env.VITE_DAYLIGHT_PROXY_TARGET || 'http://localhost:8000' };

  // One forward per service in src/services/proxiedServices.ts, under the app's base path, as the
  // container's nginx does in production: `<base>proxy/<name>/x` → `<target>/x` (/proxy/… in dev,
  // /heath/proxy/… for `npm run preview` of a production build). `<base>api/` is Heath's own backend.
  const forwards: Record<string, ProxyOptions> = Object.fromEntries(
    (Object.keys(targets) as ProxiedService[]).map(service => {
      const path = proxyPathUnder(basePath, service);
      return [path, { target: targets[service], changeOrigin: true, rewrite: (url: string) => url.slice(path.length) }];
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
