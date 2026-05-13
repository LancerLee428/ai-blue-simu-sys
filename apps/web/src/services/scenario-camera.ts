import type { EntitySpec, TacticalScenario } from '../types/tactical-scenario';
import type { AutoDemoCameraConfig } from '../config/auto-demo';

function isSatelliteEntity(entity: EntitySpec): boolean {
  if (entity.type === 'space-satellite') return true;

  const visualModel = entity.visualModel;
  const searchable = [
    entity.id,
    entity.name,
    entity.modelId,
    entity.modelType,
    visualModel?.alias,
    visualModel?.uri,
  ].filter(Boolean).join(' ');

  return /卫星|satellite/i.test(searchable);
}

export function findScenarioSatelliteCameraTarget(scenario: TacticalScenario): EntitySpec | null {
  const forceEntities = scenario.forces.flatMap(force => (
    force.entities.map(entity => ({ side: force.side, entity }))
  ));

  return forceEntities.find(({ side, entity }) => side === 'red' && isSatelliteEntity(entity))?.entity
    ?? forceEntities.find(({ entity }) => isSatelliteEntity(entity))?.entity
    ?? null;
}

export function getSatelliteCameraRangeMeters(
  entity: EntitySpec,
  cameraConfig?: Pick<AutoDemoCameraConfig, 'rangeMeters'>,
): number {
  if (typeof cameraConfig?.rangeMeters === 'number' && cameraConfig.rangeMeters > 0) {
    return cameraConfig.rangeMeters;
  }

  const altitude = Math.max(0, entity.position.altitude);
  return Math.min(Math.max(altitude * 0.6, 300_000), 1_200_000);
}
