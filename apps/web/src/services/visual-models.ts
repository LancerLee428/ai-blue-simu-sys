import type {
  PlatformType,
  VisualModelAlias,
  VisualModelConfig,
} from '../types/tactical-scenario';
import { PLATFORM_META } from '../types/tactical-scenario';

const missileModelUrl = new URL('../assets/3d-model/dd/XHDD_01.glb', import.meta.url).href;
const aircraftModelUrl = new URL('../assets/3d-model/fj/ZDJ_01_v3.glb', import.meta.url).href;
const shipModelUrl = new URL('../assets/3d-model/jt/SMJT_01.glb', import.meta.url).href;
const radarModelUrl = new URL('../assets/3d-model/ld/ld_01.glb', import.meta.url).href;
const satelliteModelUrl = new URL('../assets/3d-model/wx/WX_01_03.glb', import.meta.url).href;

export interface ResolvedVisualModel extends Required<Pick<VisualModelConfig, 'uri'>> {
  alias?: VisualModelAlias;
  scale: number;
  minimumPixelSize: number;
  maximumScale?: number;
  headingOffsetDeg: number;
  pitchOffsetDeg: number;
  rollOffsetDeg: number;
  heightOffsetMeters: number;
  color?: string;
  colorBlendMode?: 'highlight' | 'replace' | 'mix';
  colorBlendAmount?: number;
  silhouetteColor?: string;
  silhouetteSize?: number;
}

const DEFAULT_BY_ALIAS: Record<VisualModelAlias, ResolvedVisualModel> = {
  fj: {
    alias: 'fj',
    uri: aircraftModelUrl,
    scale: 0.08,
    minimumPixelSize: 72,
    headingOffsetDeg: -90,
    pitchOffsetDeg: 0,
    rollOffsetDeg: 0,
    heightOffsetMeters: 0,
  },
  jt: {
    alias: 'jt',
    uri: shipModelUrl,
    scale: 0.04,
    minimumPixelSize: 72,
    headingOffsetDeg: 0,
    pitchOffsetDeg: 0,
    rollOffsetDeg: 0,
    heightOffsetMeters: 0,
  },
  dd: {
    alias: 'dd',
    uri: missileModelUrl,
    scale: 0.04,
    minimumPixelSize: 48,
    headingOffsetDeg: -90,
    pitchOffsetDeg: 0,
    rollOffsetDeg: 0,
    heightOffsetMeters: 0,
  },
  ld: {
    alias: 'ld',
    uri: radarModelUrl,
    scale: 0.006,
    minimumPixelSize: 64,
    headingOffsetDeg: 0,
    pitchOffsetDeg: 0,
    rollOffsetDeg: 0,
    heightOffsetMeters: 0,
  },
  wx: {
    alias: 'wx',
    uri: satelliteModelUrl,
    scale: 0.04,
    minimumPixelSize: 72,
    headingOffsetDeg: 0,
    pitchOffsetDeg: 0,
    rollOffsetDeg: 0,
    heightOffsetMeters: 0,
  },
};

const BUNDLED_MODEL_URI_BY_XML_PATH: Record<string, string> = {
  'fj/ZDJ_01_v3.glb': aircraftModelUrl,
  'jt/SMJT_01.glb': shipModelUrl,
  'dd/XHDD_01.glb': missileModelUrl,
  'ld/ld_01.glb': radarModelUrl,
  'wx/WX_01_03.glb': satelliteModelUrl,
};

function isVisualModelAlias(value: unknown): value is VisualModelAlias {
  return value === 'fj' || value === 'jt' || value === 'dd' || value === 'ld' || value === 'wx';
}

function normalizeNumber(value: unknown, fallback: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function resolveModelUri(uri: string, defaults: ResolvedVisualModel | undefined): string {
  return BUNDLED_MODEL_URI_BY_XML_PATH[uri] ?? uri;
}

export function getDefaultEntityVisualModel(type: PlatformType): VisualModelConfig | null {
  if (type === 'space-satellite') return { alias: 'wx' };
  const meta = PLATFORM_META[type];
  if (meta?.category === 'air') return { alias: 'fj' };
  if (meta?.category === 'naval') return { alias: 'jt' };
  if (type === 'ground-radar' || type === 'facility-radar') return { alias: 'ld' };
  return null;
}

export function getDefaultWeaponVisualModel(): VisualModelConfig {
  return { alias: 'dd' };
}

export function resolveVisualModel(
  config: VisualModelConfig | undefined | null,
  fallbackType?: PlatformType,
): ResolvedVisualModel | null {
  const fallbackConfig = fallbackType ? getDefaultEntityVisualModel(fallbackType) : null;
  const mergedConfig = config ?? fallbackConfig;
  if (!mergedConfig && !fallbackConfig) return null;

  const alias = isVisualModelAlias(mergedConfig?.alias)
    ? mergedConfig.alias
    : isVisualModelAlias(fallbackConfig?.alias)
      ? fallbackConfig.alias
      : undefined;
  const defaults = alias ? DEFAULT_BY_ALIAS[alias] : undefined;
  const uri = mergedConfig?.uri
    ? resolveModelUri(mergedConfig.uri, defaults)
    : defaults?.uri;
  if (!uri) return null;

  return {
    ...(alias ? { alias } : {}),
    uri,
    scale: normalizeNumber(mergedConfig?.scale, defaults?.scale ?? 1),
    minimumPixelSize: normalizeNumber(mergedConfig?.minimumPixelSize, defaults?.minimumPixelSize ?? 48),
    ...(mergedConfig?.maximumScale !== undefined || defaults?.maximumScale !== undefined
      ? { maximumScale: normalizeNumber(mergedConfig?.maximumScale, defaults?.maximumScale ?? 20_000) }
      : {}),
    headingOffsetDeg: normalizeNumber(mergedConfig?.headingOffsetDeg, defaults?.headingOffsetDeg ?? 0),
    pitchOffsetDeg: normalizeNumber(mergedConfig?.pitchOffsetDeg, defaults?.pitchOffsetDeg ?? 0),
    rollOffsetDeg: normalizeNumber(mergedConfig?.rollOffsetDeg, defaults?.rollOffsetDeg ?? 0),
    heightOffsetMeters: normalizeNumber(mergedConfig?.heightOffsetMeters, defaults?.heightOffsetMeters ?? 0),
    ...(mergedConfig?.color ? { color: mergedConfig.color } : {}),
    ...(mergedConfig?.colorBlendMode ? { colorBlendMode: mergedConfig.colorBlendMode } : {}),
    ...(mergedConfig?.colorBlendAmount !== undefined
      ? { colorBlendAmount: normalizeNumber(mergedConfig.colorBlendAmount, 0.5) }
      : {}),
    ...(mergedConfig?.silhouetteColor ? { silhouetteColor: mergedConfig.silhouetteColor } : {}),
    ...(mergedConfig?.silhouetteSize !== undefined
      ? { silhouetteSize: normalizeNumber(mergedConfig.silhouetteSize, 0) }
      : {}),
  };
}

export function resolveWeaponVisualModel(config: VisualModelConfig | undefined | null): ResolvedVisualModel | null {
  return resolveVisualModel(config ?? getDefaultWeaponVisualModel());
}
