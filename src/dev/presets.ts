// The dev presets, read from the JSON files next to this file.
import type { BuildingModel } from '../types/building';

// Every building setting the interface offers, so presets (and later a JSON export, #85) can carry them.
/** The building settings a preset may set besides its shape, as the building panel offers them. */
export const PRESET_BUILDING_SETTINGS = [
  'description', 'color', 'window_to_wall_ratio', 'window_overhang', 'window_overhang_depth',
  'wall_construction', 'floor_construction', 'roof_construction', 'window_construction',
  'structural_system', 'building_program', 'hvac_system', 'natural_ventilation',
] as const satisfies ReadonlyArray<keyof BuildingModel>;

/** One building in a preset: its shape, and any of the panel's settings (the rest take the app's defaults). */
export type PresetBuilding = Pick<BuildingModel, 'id' | 'points' | 'floors' | 'floorHeight'> & { name: string }
  & Partial<Pick<BuildingModel, typeof PRESET_BUILDING_SETTINGS[number]>>;

/** A preset scene for manual tests: Import's format, plus a name and a description for the dev menu. */
export interface DevPreset {
  /** The file's name without `.json`, e.g. `rotated-pair`. */
  id: string;
  name: string;
  description: string;
  /** Deliberately invalid, for checking how loading fails; the tests expect it not to load. */
  broken?: boolean;
  buildings: PresetBuilding[];
}

/** Each preset file's content, by path; picked up at build time, so a new file shows up by itself. */
const files = import.meta.glob<Omit<DevPreset, 'id'>>('./presets/*.json', { eager: true, import: 'default' });

/** All presets, sorted by name. */
export const DEV_PRESETS: DevPreset[] = Object.entries(files)
  .map(([path, preset]) => ({ ...preset, id: path.replace(/^.*\/(.+)\.json$/, '$1') }))
  .sort((a, b) => a.name.localeCompare(b.name));
