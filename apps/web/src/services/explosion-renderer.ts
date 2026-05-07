import * as Cesium from 'cesium';

import type { ExplosionEffectConfig, ExplosionEffectType, GeoPosition } from '../types/tactical-scenario';

export interface ExplosionLayerDescriptor {
  kind: 'flash' | 'fireball' | 'shockwave' | 'smoke' | 'debris';
  durationMs: number;
}

export interface ExplosionDescriptor {
  id: string;
  type: ExplosionEffectType;
  position: GeoPosition;
  startTimeMs: number;
  durationMs: number;
  radius: number;
  damage: number;
  status: 'active' | 'fading' | 'complete';
  innerColor: string;
  outerColor: string;
  layers: ExplosionLayerDescriptor[];
}

export function createExplosionDescriptor(args: {
  id: string;
  type: ExplosionEffectType;
  position: GeoPosition;
  damage: number;
  effect: ExplosionEffectConfig;
  startTimeMs: number;
}): ExplosionDescriptor {
  const scaledRadius = Math.max(args.effect.radius, Math.round(Math.sqrt(Math.max(args.damage, 1)) * 2.2));
  const durationMs = Math.max(3_000, args.effect.durationMs);

  return {
    id: args.id,
    type: args.type,
    position: { ...args.position },
    startTimeMs: args.startTimeMs,
    durationMs,
    radius: scaledRadius,
    damage: args.damage,
    status: 'active',
    innerColor: args.effect.innerColor,
    outerColor: args.effect.outerColor,
    layers: [
      { kind: 'flash', durationMs: Math.min(350, durationMs * 0.12) },
      { kind: 'fireball', durationMs: Math.round(durationMs * 0.55) },
      { kind: 'shockwave', durationMs: Math.round(durationMs * 0.75) },
      { kind: 'smoke', durationMs },
      { kind: 'debris', durationMs: Math.round(durationMs * 0.6) },
    ],
  };
}

export function getExplosionStatusAtTime(
  descriptor: Pick<ExplosionDescriptor, 'startTimeMs' | 'durationMs'>,
  virtualTimeMs: number,
): { elapsedMs: number; progress: number; status: ExplosionDescriptor['status'] } {
  const elapsedMs = Math.max(0, virtualTimeMs - descriptor.startTimeMs);
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
  entity: Cesium.Entity;
  handler?: () => void;
}

export class ExplosionRenderer {
  private viewer: Cesium.Viewer;
  private activeExplosions = new Map<string, ActiveExplosion>();
  private readonly maxActiveExplosions = 10;

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
      effect: ExplosionEffectConfig;
    }>,
    virtualTimeMs: number,
  ): void {
    const activeIds = new Set<string>();

    explosions.forEach((explosion) => {
      const descriptor = this.activeExplosions.get(explosion.id)?.descriptor
        ?? createExplosionDescriptor({
          id: explosion.id,
          type: explosion.type,
          position: explosion.position,
          damage: explosion.damage,
          effect: explosion.effect,
          startTimeMs: explosion.startTimeMs,
        });
      const { elapsedMs, status } = getExplosionStatusAtTime(descriptor, virtualTimeMs);

      if (status === 'complete') {
        this.remove(explosion.id);
        return;
      }

      activeIds.add(explosion.id);
      descriptor.status = status;
      const position = Cesium.Cartesian3.fromDegrees(
        explosion.position.longitude,
        explosion.position.latitude,
        explosion.position.altitude,
      );
      const image = this.createFrameCanvas(descriptor, elapsedMs);
      const existing = this.activeExplosions.get(explosion.id);

      if (existing) {
        (existing.entity as any).position = position;
        if (existing.entity.billboard) {
          (existing.entity.billboard as any).image = image;
        }
        return;
      }

      if (this.activeExplosions.size >= this.maxActiveExplosions) {
        const oldest = this.activeExplosions.values().next().value as ActiveExplosion | undefined;
        if (oldest) this.remove(oldest.descriptor.id);
      }

      const entity = this.viewer.entities.add({
        id: descriptor.id,
        position,
        billboard: {
          image,
          width: descriptor.radius * 2,
          height: descriptor.radius * 2,
          heightReference: Cesium.HeightReference.NONE,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (entity as any).__tacticalLayer = true;
      this.activeExplosions.set(descriptor.id, { descriptor, entity });
    });

    for (const id of Array.from(this.activeExplosions.keys())) {
      const active = this.activeExplosions.get(id);
      if (active?.handler) continue;
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
    if (active.handler) {
      this.viewer.scene.postRender.removeEventListener(active.handler);
    }
    this.viewer.entities.remove(active.entity);
    active.descriptor.status = 'complete';
    this.activeExplosions.delete(id);
  }

  private createFrameCanvas(descriptor: ExplosionDescriptor, elapsed: number): string {
    const canvas = document.createElement('canvas');
    canvas.width = descriptor.radius * 2;
    canvas.height = descriptor.radius * 2;
    const ctx = canvas.getContext('2d')!;
    const cx = descriptor.radius;
    const cy = descriptor.radius;
    const t = Math.max(0, Math.min(1, elapsed / descriptor.durationMs));
    const outerRadius = descriptor.radius * t;
    const innerRadius = Math.max(24, Math.round(descriptor.radius * 0.52)) * Math.min(1, t / 0.55);
    const fade = 1 - t;

    const flashAlpha = Math.max(0, 1 - elapsed / Math.max(180, descriptor.layers[0].durationMs));
    if (flashAlpha > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, descriptor.radius * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = Cesium.Color.WHITE.withAlpha(flashAlpha).toCssColorString();
      ctx.fill();
    }

    if (outerRadius > 0) {
      const outerBase = Cesium.Color.fromCssColorString(descriptor.outerColor);
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = outerBase.withAlpha(fade * 0.34).toCssColorString();
      ctx.fill();
      ctx.strokeStyle = outerBase.withAlpha(fade * 0.95).toCssColorString();
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (innerRadius > 0) {
      const innerBase = Cesium.Color.fromCssColorString(descriptor.innerColor);
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = innerBase.withAlpha(Math.max(0, 0.92 - t * 0.7)).toCssColorString();
      ctx.fill();
      ctx.strokeStyle = innerBase.withAlpha(Math.max(0, fade)).toCssColorString();
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const smokeRadius = descriptor.radius * Math.min(1, t * 1.18);
    if (smokeRadius > 0) {
      const smokeGradient = ctx.createRadialGradient(cx, cy, innerRadius * 0.5, cx, cy, smokeRadius);
      smokeGradient.addColorStop(0, 'rgba(120,120,120,0)');
      smokeGradient.addColorStop(0.55, `rgba(90,90,90,${Math.max(0, 0.18 - t * 0.08)})`);
      smokeGradient.addColorStop(1, 'rgba(40,40,40,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, smokeRadius, 0, Math.PI * 2);
      ctx.fillStyle = smokeGradient;
      ctx.fill();
    }

    const debrisCount = 8;
    const debrisRadius = descriptor.radius * Math.min(1, t * 0.9);
    const debrisAlpha = Math.max(0, 0.7 - t);
    for (let index = 0; index < debrisCount && debrisAlpha > 0; index += 1) {
      const angle = (Math.PI * 2 * index) / debrisCount;
      const dx = Math.cos(angle) * debrisRadius;
      const dy = Math.sin(angle) * debrisRadius;
      ctx.fillStyle = `rgba(255,140,0,${debrisAlpha})`;
      ctx.fillRect(cx + dx - 1.5, cy + dy - 1.5, 3, 3);
    }

    return canvas.toDataURL();
  }
}
