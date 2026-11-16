/// <reference types="vite/client" />

/** Provided by buildInfoPlugin.ts. */
declare module 'virtual:build-info' {
  /** Version from package.json. */
  export const version: string;
  /** ISO timestamp of the build, or of the last source change on the dev server. */
  export const updatedAt: string;
}
