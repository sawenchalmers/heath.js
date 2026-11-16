import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const daylightProxyTarget = env.VITE_DAYLIGHT_PROXY_TARGET || 'http://localhost:8000';

  const basePath = env.VITE_BASE_PATH || '/';

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
        '/api/climate': {
          target: 'https://climate.onebuilding.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/climate/, ''),
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (_proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
        '/api/daylight': {
          target: daylightProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/daylight/, ''),
        },
        '/api/epsm': {
          target: 'https://epsm.chalmers.se',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/epsm/, ''),
        }
      }
    },
    preview: {
      proxy: {
        '/api/daylight': {
          target: daylightProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/daylight/, ''),
        },
        '/api/epsm': {
          target: 'https://epsm.chalmers.se',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/epsm/, ''),
        }
      }
    }
  };
});
