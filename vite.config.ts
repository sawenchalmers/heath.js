import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const daylightProxyTarget = env.VITE_DAYLIGHT_PROXY_TARGET || 'http://localhost:8000';

  const basePath = env.VITE_BASE_PATH || '/';

  // The app calls its APIs under its base path (`<base>api/climate`, …; see the services), so the
  // proxies listen there too: /api/… in dev, /heath/api/… for `npm run preview` of a production build.
  const apiPath = (name: string) => `${basePath}api/${name}`;
  /** Forward `<base>api/<name>/x` to `<target>/x`, as the container's nginx does in production. */
  const forward = (name: string, target: string) => ({
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.slice(apiPath(name).length),
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
        [apiPath('climate')]: {
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
        [apiPath('daylight')]: forward('daylight', daylightProxyTarget),
        [apiPath('epsm')]: forward('epsm', 'https://epsm.chalmers.se'),
      }
    },
    preview: {
      proxy: {
        [apiPath('climate')]: forward('climate', 'https://climate.onebuilding.org'),
        [apiPath('daylight')]: forward('daylight', daylightProxyTarget),
        [apiPath('epsm')]: forward('epsm', 'https://epsm.chalmers.se'),
      }
    }
  };
});
