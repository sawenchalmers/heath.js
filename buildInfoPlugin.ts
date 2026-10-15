import type { Plugin } from 'vite';
import packageJson from './package.json';

const MODULE_ID = 'virtual:build-info';
const RESOLVED_MODULE_ID = `\0${MODULE_ID}`;

/**
 * Serves `virtual:build-info` with the package version and `updatedAt`: the time the code was built,
 * or on the dev server, the time of the last source change (refreshed on every hot update).
 */
export function buildInfoPlugin(): Plugin {
  const { version } = packageJson;
  let updatedAt = new Date();

  return {
    name: 'heath-build-info',
    resolveId: id => (id === MODULE_ID ? RESOLVED_MODULE_ID : undefined),
    load: id => (id === RESOLVED_MODULE_ID
      ? `export const version = ${JSON.stringify(version)};\nexport const updatedAt = ${JSON.stringify(updatedAt.toISOString())};\n`
      : undefined),
    handleHotUpdate({ file, server, modules }) {
      if (!file.includes('/src/')) return;
      updatedAt = new Date();
      const buildInfoModule = server.moduleGraph.getModuleById(RESOLVED_MODULE_ID);
      if (!buildInfoModule) return;
      server.moduleGraph.invalidateModule(buildInfoModule);
      return [...modules, buildInfoModule];
    },
  };
}
