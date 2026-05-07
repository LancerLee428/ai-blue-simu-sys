import type { EntitySpec, EntityStatus } from '../types/tactical-scenario';

export interface DamageResult {
  damage: number;
  remainingHealth: number;
  status: EntityStatus;
}

function getDefaultMaxHealth(target: EntitySpec): number {
  if (target.type.startsWith('ship-')) return 800;
  if (target.type.startsWith('ground-') || target.type.startsWith('facility-')) return 320;
  if (target.type.startsWith('air-') || target.type.startsWith('uav-')) return 180;
  return 240;
}

function getDefaultArmor(target: EntitySpec): number {
  if (target.type.startsWith('ship-')) return 120;
  if (target.type.startsWith('ground-') || target.type.startsWith('facility-')) return 80;
  return 30;
}

export class DamageCalculator {
  applyDamage(args: {
    target: EntitySpec;
    rawDamage: number;
  }): DamageResult {
    const maxHealth = Math.max(1, args.target.maxHealth ?? getDefaultMaxHealth(args.target));
    const currentHealth = Math.max(0, Math.min(maxHealth, args.target.health ?? maxHealth));
    const armor = Math.max(0, args.target.armor ?? getDefaultArmor(args.target));
    const damage = Math.max(0, Math.round(args.rawDamage - armor));
    const remainingHealth = Math.max(0, currentHealth - damage);
    const status: EntityStatus = remainingHealth <= 0 ? 'destroyed' : remainingHealth < maxHealth ? 'engaged' : 'deployed';

    return {
      damage,
      remainingHealth,
      status,
    };
  }
}
