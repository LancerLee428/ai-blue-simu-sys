export interface RuntimeCameraConfig {
  enabled: boolean;
  longitude: number;
  latitude: number;
  altitude: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  durationSeconds: number;
}

export interface RuntimePlaybackConfig {
  flyToBeforePlay: boolean;
  startDelayAfterCameraMs: number;
}

export interface SimulationRuntimeConfig {
  camera: RuntimeCameraConfig;
  playback: RuntimePlaybackConfig;
}

export const DEFAULT_SIMULATION_RUNTIME_CONFIG: SimulationRuntimeConfig = {
  camera: {
    enabled: false,
    longitude: 0,
    latitude: 0,
    altitude: 2_500_000,
    headingDeg: 0,
    pitchDeg: -45,
    rollDeg: 0,
    durationSeconds: 2.5,
  },
  playback: {
    flyToBeforePlay: true,
    startDelayAfterCameraMs: 0,
  },
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeSimulationRuntimeConfig(input: unknown): SimulationRuntimeConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<{
    camera: Partial<RuntimeCameraConfig>;
    playback: Partial<RuntimePlaybackConfig>;
  }>;
  const defaults = DEFAULT_SIMULATION_RUNTIME_CONFIG;

  return {
    camera: {
      enabled: toBoolean(raw.camera?.enabled, defaults.camera.enabled),
      longitude: toFiniteNumber(raw.camera?.longitude, defaults.camera.longitude),
      latitude: toFiniteNumber(raw.camera?.latitude, defaults.camera.latitude),
      altitude: Math.max(1, toFiniteNumber(raw.camera?.altitude, defaults.camera.altitude)),
      headingDeg: toFiniteNumber(raw.camera?.headingDeg, defaults.camera.headingDeg),
      pitchDeg: toFiniteNumber(raw.camera?.pitchDeg, defaults.camera.pitchDeg),
      rollDeg: toFiniteNumber(raw.camera?.rollDeg, defaults.camera.rollDeg),
      durationSeconds: Math.max(0, toFiniteNumber(raw.camera?.durationSeconds, defaults.camera.durationSeconds)),
    },
    playback: {
      flyToBeforePlay: toBoolean(raw.playback?.flyToBeforePlay, defaults.playback.flyToBeforePlay),
      startDelayAfterCameraMs: Math.max(
        0,
        toFiniteNumber(raw.playback?.startDelayAfterCameraMs, defaults.playback.startDelayAfterCameraMs),
      ),
    },
  };
}

export async function loadSimulationRuntimeConfig(): Promise<SimulationRuntimeConfig> {
  try {
    const response = await fetch('/config/simulation-runtime.json', { cache: 'no-store' });
    if (!response.ok) return DEFAULT_SIMULATION_RUNTIME_CONFIG;
    return normalizeSimulationRuntimeConfig(await response.json());
  } catch (error) {
    console.warn('推演运行配置读取失败，使用默认配置', error);
    return DEFAULT_SIMULATION_RUNTIME_CONFIG;
  }
}

export function runAfterRafDelay(delayMs: number, callback: () => void): () => void {
  let frameId: number | null = null;
  let startMs: number | null = null;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    if (startMs === null) startMs = now;
    if (now - startMs >= delayMs) {
      callback();
      return;
    }
    frameId = requestAnimationFrame(tick);
  };

  if (delayMs <= 0) {
    frameId = requestAnimationFrame(() => {
      if (!cancelled) callback();
    });
  } else {
    frameId = requestAnimationFrame(tick);
  }

  return () => {
    cancelled = true;
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
}
