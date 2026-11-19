import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const daylightProxyTarget = env.VITE_DAYLIGHT_PROXY_TARGET || 'http://localhost:8000';

  const basePath = env.VITE_BASE_PATH || '/';

  // The app reaches outside services under its base path (`<base>proxy/climate`, …; see the services),
  // so the proxies listen there too: /proxy/… in dev, /heath/proxy/… for `npm run preview` of a production
  // build. (`<base>api/` is reserved for Heath's own backend.)
  const proxyPath = (name: string) => `${basePath}proxy/${name}`;
  /** Forward `<base>proxy/<name>/x` to `<target>/x`, as the container's nginx does in production. */
  const forward = (name: string, target: string) => ({
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.slice(proxyPath(name).length),
  });

  return {
    plugins: [react(), buildInfoPlugin()],
    base: basePath,
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    // Configure static asset handling
    assetsInclude: ['**/*.3dm'],
    // Proxy configuration to handle CORS issues
    server: {
      proxy: {
        [proxyPath('climate')]: {
          ...forward('climate', 'https://climate.onebuilding.org'),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (_proxyReq, req) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
        [proxyPath('daylight')]: forward('daylight', daylightProxyTarget),
        [proxyPath('epsm')]: forward('epsm', 'https://epsm.chalmers.se'),
      }
    },
    preview: {
      proxy: {
        [proxyPath('climate')]: forward('climate', 'https://climate.onebuilding.org'),
        [proxyPath('daylight')]: forward('daylight', daylightProxyTarget),
        [proxyPath('epsm')]: forward('epsm', 'https://epsm.chalmers.se'),
      }
    }
  };
});
