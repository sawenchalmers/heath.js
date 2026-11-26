// The dev presets, read from the JSON files next to this file.
import type { Point3D } from '../types/building';

/** A preset scene for manual tests: Import's format, plus a name and a description for the dev menu. */
export interface DevPreset {
  /** The file's name without `.json`, e.g. `rotated-pair`. */
  id: string;
  name: string;
  description: string;
  buildings: Array<{ id: string; name: string; points: Point3D[]; floors: number; floorHeight: number }>;
}

/** Each preset file's content, by path; picked up at build time, so a new file shows up by itself. */
const files = import.meta.glob<Omit<DevPreset, 'id'>>('./presets/*.json', { eager: true, import: 'default' });

/** All presets, sorted by name. */
export const DEV_PRESETS: DevPreset[] = Object.entries(files)
  .map(([path, preset]) => ({ ...preset, id: path.replace(/^.*\/(.+)\.json$/, '$1') }))
  .sort((a, b) => a.name.localeCompare(b.name));
