import * as Cesium from 'cesium';

import type {
  ExplosionEffectConfig,
  ExplosionEffectType,
  GeoPosition,
  VisualEffectsConfig,
} from '../types/tactical-scenario';

export interface ExplosionLayerDescriptor {
  kind: 'flash' | 'fireball' | 'ground-burst' | 'shockwave' | 'smoke-column' | 'sparks';
  durationMs: number;
}

export interface ExplosionParticleLayerConfig {
  lifetimeSec: number;
  emissionRate: number;
  particleLifeSec: { min: number; max: number };
  speed: { min: number; max: number };
  imageSize: { min: number; max: number };
  startScale: number;
  endScale: number;
  bursts: Array<{ timeSec: number; min: number; max: number }>;
}

export interface ExplosionParticleConfig {
  fire: ExplosionParticleLayerConfig;
  smoke: ExplosionParticleLayerConfig;
  dust: ExplosionParticleLayerConfig;
  sparks: ExplosionParticleLayerConfig;
}

export interface ExplosionDescriptor {
  id: string;
  type: ExplosionEffectType;
  position: GeoPosition;
  startTimeMs: number;
  visualStartTimeMs?: number;
  durationMs: number;
  radius: number;
  damage: number;
  status: 'active' | 'fading' | 'complete';
  innerColor: string;
  outerColor: string;
  layers: ExplosionLayerDescriptor[];
}

export function getDefaultExplosionEffect(type: ExplosionEffectType): ExplosionEffectConfig {
  if (type === 'ship-impact') {
    return { type, radius: 96, durationMs: 1400, innerColor: '#ffe3a1', outerColor: '#ff3b30' };
  }
  if (type === 'ground-impact') {
    return { type, radius: 84, durationMs: 1200, innerColor: '#ffd27a', outerColor: '#ff6b35' };
  }
  return { type, radius: 72, durationMs: 1000, innerColor: '#ffd27a', outerColor: '#ff5500' };
}

export function resolveExplosionEffectConfig(
  type: ExplosionEffectType,
  visualEffects?: VisualEffectsConfig | null,
): ExplosionEffectConfig {
  const configured = visualEffects?.explosionEffects?.items?.find(effect => effect.type === type);
  if (configured && visualEffects?.explosionEffects?.enabled !== false) return configured;
  return getDefaultExplosionEffect(type);
}

export function getExplosionVisualDurationMs(
  type: ExplosionEffectType,
  visualEffects?: VisualEffectsConfig | null,
): number {
  return Math.max(3_000, resolveExplosionEffectConfig(type, visualEffects).durationMs);
}

export function createExplosionDescriptor(args: {
  id: string;
  type: ExplosionEffectType;
  position: GeoPosition;
  damage: number;
  effect: ExplosionEffectConfig;
  startTimeMs: number;
  visualStartTimeMs?: number;
}): ExplosionDescriptor {
  const scaledRadius = Math.max(args.effect.radius, Math.round(Math.sqrt(Math.max(args.damage, 1)) * 2.2));
  const durationMs = Math.max(3_000, args.effect.durationMs);

  return {
    id: args.id,
    type: args.type,
    position: { ...args.position },
    startTimeMs: args.startTimeMs,
    visualStartTimeMs: args.visualStartTimeMs,
    durationMs,
    radius: scaledRadius,
    damage: args.damage,
    status: 'active',
    innerColor: args.effect.innerColor,
    outerColor: args.effect.outerColor,
    layers: [
      { kind: 'flash', durationMs: Math.min(350, durationMs * 0.12) },
      { kind: 'fireball', durationMs: Math.round(durationMs * 0.5) },
      { kind: 'ground-burst', durationMs: Math.round(durationMs * 0.42) },
      { kind: 'shockwave', durationMs: Math.round(durationMs * 0.62) },
      { kind: 'smoke-column', durationMs },
      { kind: 'sparks', durationMs: Math.round(durationMs * 0.55) },
    ],
  };
}

export function createExplosionParticleConfig(descriptor: Pick<ExplosionDescriptor, 'radius' | 'durationMs'>): ExplosionParticleConfig {
  const radius = Math.max(1, descriptor.radius);
  const durationSec = Math.max(0.1, descriptor.durationMs / 1000);
  const visualScale = Math.max(1, radius / 72);
  const fireLifetimeSec = Math.min(durationSec * 0.42, Math.max(0.55, durationSec * 0.34));
  const smokeLifetimeSec = Math.min(durationSec * 0.48, Math.max(0.85, durationSec * 0.42));
  const dustLifetimeSec = Math.min(durationSec * 0.42, Math.max(0.75, durationSec * 0.38));
  const sparkLifetimeSec = Math.min(durationSec * 0.36, Math.max(0.55, durationSec * 0.3));
  const fitParticleLife = (
    emitterLifetimeSec: number,
    desiredMinSec: number,
    desiredMaxSec: number,
  ) => {
    const maxSec = Math.max(0.05, Math.min(desiredMaxSec, durationSec - emitterLifetimeSec));
    return {
      min: Math.min(desiredMinSec, maxSec),
      max: maxSec,
    };
  };

  return {
    fire: {
      lifetimeSec: fireLifetimeSec,
      emissionRate: Math.round(26 + radius * 0.24),
      particleLifeSec: fitParticleLife(fireLifetimeSec, 0.22, 0.72),
      speed: { min: radius * 0.4, max: radius * 1.8 },
      imageSize: { min: 24 * visualScale, max: 68 * visualScale },
      startScale: 0.55,
      endScale: 1.45,
      bursts: [
        { timeSec: 0, min: 28, max: 48 },
        { timeSec: 0.16, min: 12, max: 22 },
      ],
    },
    smoke: {
      lifetimeSec: smokeLifetimeSec,
      emissionRate: Math.round(18 + radius * 0.2),
      particleLifeSec: fitParticleLife(smokeLifetimeSec, 1.4, Math.max(2.2, durationSec * 0.9)),
      speed: { min: radius * 0.18, max: radius * 0.72 },
      imageSize: { min: 42 * visualScale, max: 112 * visualScale },
      startScale: 0.85,
      endScale: 2.25,
      bursts: [
        { timeSec: 0.22, min: 18, max: 30 },
        { timeSec: 0.58, min: 12, max: 24 },
      ],
    },
    dust: {
      lifetimeSec: dustLifetimeSec,
      emissionRate: Math.round(12 + radius * 0.12),
      particleLifeSec: fitParticleLife(dustLifetimeSec, 0.8, 1.6),
      speed: { min: radius * 0.22, max: radius * 0.95 },
      imageSize: { min: 30 * visualScale, max: 84 * visualScale },
      startScale: 0.72,
      endScale: 1.8,
      bursts: [
        { timeSec: 0.08, min: 16, max: 30 },
      ],
    },
    sparks: {
      lifetimeSec: sparkLifetimeSec,
      emissionRate: Math.round(10 + radius * 0.1),
      particleLifeSec: fitParticleLife(sparkLifetimeSec, 0.25, 0.95),
      speed: { min: radius * 1.2, max: radius * 3.6 },
      imageSize: { min: 5 * visualScale, max: 16 * visualScale },
      startScale: 0.55,
      endScale: 0.12,
      bursts: [
        { timeSec: 0, min: 24, max: 44 },
        { timeSec: 0.12, min: 12, max: 22 },
      ],
    },
  };
}

export function getExplosionStatusAtTime(
  descriptor: Pick<ExplosionDescriptor, 'startTimeMs' | 'visualStartTimeMs' | 'durationMs'>,
  virtualTimeMs: number,
  visualTimeMs?: number,
): { elapsedMs: number; progress: number; status: ExplosionDescriptor['status'] } {
  const elapsedMs = descriptor.visualStartTimeMs !== undefined && visualTimeMs !== undefined
    ? Math.max(0, visualTimeMs - descriptor.visualStartTimeMs)
    : Math.max(0, virtualTimeMs - descriptor.startTimeMs);
  const progress = Math.max(0, Math.min(1, elapsedMs / descriptor.durationMs));
  const status = elapsedMs >= descriptor.durationMs
    ? 'complete'
    : elapsedMs >= descriptor.durationMs * 0.72
      ? 'fading'
      : 'active';

  return { elapsedMs, progress, status };
}

interface ActiveExplosion {
  descriptor: ExplosionDescriptor;
  particleSystems: Cesium.ParticleSystem[];
}

export class ExplosionRenderer {
  private viewer: Cesium.Viewer;
  private activeExplosions = new Map<string, ActiveExplosion>();
  private readonly maxActiveExplosions = 10;
  private fireParticleImage: HTMLCanvasElement | null = null;
  private smokeParticleImage: HTMLCanvasElement | null = null;
  private dustParticleImage: HTMLCanvasElement | null = null;
  private sparkParticleImage: HTMLCanvasElement | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  renderVirtualExplosions(
    explosions: Array<{
      id: string;
      type: ExplosionEffectType;
      position: GeoPosition;
      startTimeMs: number;
      damage: number;
      triggeredAtMs?: number;
      effect: ExplosionEffectConfig;
    }>,
    virtualTimeMs: number,
    visualTimeMs: number = performance.now(),
  ): void {
    const activeIds = new Set<string>();

    explosions.forEach((explosion) => {
      const existing = this.activeExplosions.get(explosion.id);
      const descriptor = existing?.descriptor
        ?? createExplosionDescriptor({
          id: explosion.id,
          type: explosion.type,
          position: explosion.position,
          damage: explosion.damage,
          effect: explosion.effect,
          startTimeMs: explosion.startTimeMs,
          visualStartTimeMs: explosion.triggeredAtMs,
        });
      const { status, elapsedMs } = getExplosionStatusAtTime(descriptor, virtualTimeMs, visualTimeMs);

      if (status === 'complete') {
        this.remove(explosion.id);
        return;
      }

      activeIds.add(explosion.id);
      descriptor.status = status;
      if (existing) return;

      const position = Cesium.Cartesian3.fromDegrees(
        explosion.position.longitude,
        explosion.position.latitude,
        explosion.position.altitude,
      );

      if (this.activeExplosions.size >= this.maxActiveExplosions) {
        const oldest = this.activeExplosions.values().next().value as ActiveExplosion | undefined;
        if (oldest) this.remove(oldest.descriptor.id);
      }

      const particleSystems = this.createParticleSystems(descriptor, position);
      this.activeExplosions.set(descriptor.id, { descriptor, particleSystems });
    });

    for (const id of Array.from(this.activeExplosions.keys())) {
      if (!activeIds.has(id)) this.remove(id);
    }
  }

  reset(): void {
    for (const id of Array.from(this.activeExplosions.keys())) {
      this.remove(id);
    }
  }

  private remove(id: string): void {
    const active = this.activeExplosions.get(id);
    if (!active) return;
    active.particleSystems.forEach((system) => {
      this.viewer.scene.primitives.remove(system);
    });
    active.descriptor.status = 'complete';
    this.activeExplosions.delete(id);
  }

  private createParticleSystems(descriptor: ExplosionDescriptor, position: Cesium.Cartesian3): Cesium.ParticleSystem[] {
    const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const config = createExplosionParticleConfig(descriptor);
    const systems = [
      this.createParticleSystem({
        modelMatrix,
        image: this.getFireParticleImage(),
        config: config.fire,
        emitter: new Cesium.SphereEmitter(Math.max(1, descriptor.radius * 0.12)),
        startColor: Cesium.Color.fromCssColorString(descriptor.innerColor).withAlpha(0.95),
        endColor: Cesium.Color.fromCssColorString(descriptor.outerColor).withAlpha(0),
      }),
      this.createParticleSystem({
        modelMatrix,
        image: this.getSmokeParticleImage(),
        config: config.smoke,
        emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(28)),
        emitterModelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, descriptor.radius * 0.18)),
        startColor: new Cesium.Color(0.34, 0.34, 0.32, 0.72),
        endColor: new Cesium.Color(0.08, 0.08, 0.08, 0),
      }),
      this.createParticleSystem({
        modelMatrix,
        image: this.getDustParticleImage(),
        config: config.dust,
        emitter: new Cesium.CircleEmitter(Math.max(1, descriptor.radius * 0.42)),
        startColor: new Cesium.Color(0.45, 0.41, 0.34, 0.5),
        endColor: new Cesium.Color(0.2, 0.18, 0.16, 0),
      }),
      this.createParticleSystem({
        modelMatrix,
        image: this.getSparkParticleImage(),
        config: config.sparks,
        emitter: new Cesium.SphereEmitter(Math.max(1, descriptor.radius * 0.08)),
        startColor: Cesium.Color.fromCssColorString('#fff4b0').withAlpha(0.95),
        endColor: Cesium.Color.fromCssColorString('#ff6b00').withAlpha(0),
      }),
    ];

    systems.forEach((system) => {
      (system as any).__tacticalLayer = true;
      this.viewer.scene.primitives.add(system);
    });
    return systems;
  }

  private createParticleSystem(args: {
    modelMatrix: Cesium.Matrix4;
    image: HTMLCanvasElement;
    config: ExplosionParticleLayerConfig;
    emitter: Cesium.ParticleEmitter;
    startColor: Cesium.Color;
    endColor: Cesium.Color;
    emitterModelMatrix?: Cesium.Matrix4;
  }): Cesium.ParticleSystem {
    return new Cesium.ParticleSystem({
      image: args.image,
      modelMatrix: args.modelMatrix,
      emitterModelMatrix: args.emitterModelMatrix,
      emitter: args.emitter,
      loop: false,
      lifetime: args.config.lifetimeSec,
      emissionRate: args.config.emissionRate,
      bursts: args.config.bursts.map(burst => new Cesium.ParticleBurst({
        time: burst.timeSec,
        minimum: burst.min,
        maximum: burst.max,
      })),
      startColor: args.startColor,
      endColor: args.endColor,
      startScale: args.config.startScale,
      endScale: args.config.endScale,
      minimumSpeed: args.config.speed.min,
      maximumSpeed: args.config.speed.max,
      minimumParticleLife: args.config.particleLifeSec.min,
      maximumParticleLife: args.config.particleLifeSec.max,
      minimumImageSize: new Cesium.Cartesian2(args.config.imageSize.min, args.config.imageSize.min),
      maximumImageSize: new Cesium.Cartesian2(args.config.imageSize.max, args.config.imageSize.max),
    });
  }

  private getFireParticleImage(): HTMLCanvasElement {
    if (!this.fireParticleImage) {
      this.fireParticleImage = this.createParticleSprite([
        { offset: 0, color: 'rgba(255,255,255,0.95)' },
        { offset: 0.28, color: 'rgba(255,231,124,0.9)' },
        { offset: 0.62, color: 'rgba(255,116,24,0.45)' },
        { offset: 1, color: 'rgba(255,80,0,0)' },
      ]);
    }
    return this.fireParticleImage;
  }

  private getSmokeParticleImage(): HTMLCanvasElement {
    if (!this.smokeParticleImage) {
      this.smokeParticleImage = this.createParticleSprite([
        { offset: 0, color: 'rgba(210,210,200,0.34)' },
        { offset: 0.42, color: 'rgba(110,110,105,0.52)' },
        { offset: 0.76, color: 'rgba(45,45,45,0.34)' },
        { offset: 1, color: 'rgba(20,20,20,0)' },
      ]);
    }
    return this.smokeParticleImage;
  }

  private getDustParticleImage(): HTMLCanvasElement {
    if (!this.dustParticleImage) {
      this.dustParticleImage = this.createParticleSprite([
        { offset: 0, color: 'rgba(190,178,148,0.38)' },
        { offset: 0.6, color: 'rgba(116,103,83,0.32)' },
        { offset: 1, color: 'rgba(80,70,58,0)' },
      ]);
    }
    return this.dustParticleImage;
  }

  private getSparkParticleImage(): HTMLCanvasElement {
    if (!this.sparkParticleImage) {
      this.sparkParticleImage = this.createParticleSprite([
        { offset: 0, color: 'rgba(255,255,255,1)' },
        { offset: 0.32, color: 'rgba(255,216,92,0.9)' },
        { offset: 1, color: 'rgba(255,92,0,0)' },
      ], 32);
    }
    return this.sparkParticleImage;
  }

  private createParticleSprite(
    stops: Array<{ offset: number; color: string }>,
    size = 96,
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    stops.forEach(stop => gradient.addColorStop(stop.offset, stop.color));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  }
}
