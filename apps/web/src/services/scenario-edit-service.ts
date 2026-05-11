import type {
  GeoPosition,
  TacticalScenario,
  WeaponTrajectoryKeyPoint,
} from '../types/tactical-scenario';

export interface ScenarioEntityMoveResult {
  scenario: TacticalScenario;
  delta: GeoPosition;
}

function cloneScenario(scenario: TacticalScenario): TacticalScenario {
  return JSON.parse(JSON.stringify(scenario)) as TacticalScenario;
}

function addDelta(position: GeoPosition, delta: GeoPosition): GeoPosition {
  return {
    ...position,
    longitude: position.longitude + delta.longitude,
    latitude: position.latitude + delta.latitude,
    altitude: position.altitude + delta.altitude,
  };
}

function resolveMovePosition(oldPosition: GeoPosition, newPosition: Partial<GeoPosition>): GeoPosition {
  return {
    ...oldPosition,
    longitude: Number(newPosition.longitude ?? oldPosition.longitude),
    latitude: Number(newPosition.latitude ?? oldPosition.latitude),
    altitude: Number(newPosition.altitude ?? oldPosition.altitude),
  };
}

function getDelta(from: GeoPosition, to: GeoPosition): GeoPosition {
  return {
    longitude: to.longitude - from.longitude,
    latitude: to.latitude - from.latitude,
    altitude: to.altitude - from.altitude,
  };
}

function isTerminalPoint(point: WeaponTrajectoryKeyPoint, index: number, points: WeaponTrajectoryKeyPoint[]): boolean {
  return point.role === 'terminal'
    || point.role === 'impact'
    || index === points.length - 1;
}

function moveTargetTrajectoryPoint(
  point: WeaponTrajectoryKeyPoint,
  index: number,
  points: WeaponTrajectoryKeyPoint[],
  targetPosition: GeoPosition,
  delta: GeoPosition,
): WeaponTrajectoryKeyPoint {
  if (point.role === 'impact' || index === points.length - 1) {
    return {
      ...point,
      position: { ...targetPosition },
    };
  }

  if (isTerminalPoint(point, index, points)) {
    return {
      ...point,
      position: addDelta(point.position, delta),
    };
  }

  return point;
}

export function moveScenarioEntityWithLinkedGeometry(
  scenario: TacticalScenario,
  entityId: string,
  newPositionInput: Partial<GeoPosition>,
): TacticalScenario {
  return moveScenarioEntityWithLinkedGeometryDetailed(scenario, entityId, newPositionInput).scenario;
}

export function moveScenarioEntityWithLinkedGeometryDetailed(
  scenario: TacticalScenario,
  entityId: string,
  newPositionInput: Partial<GeoPosition>,
): ScenarioEntityMoveResult {
  const nextScenario = cloneScenario(scenario);
  const entity = nextScenario.forces
    .flatMap(force => force.entities)
    .find(item => item.id === entityId);

  if (!entity) {
    return {
      scenario: nextScenario,
      delta: { longitude: 0, latitude: 0, altitude: 0 },
    };
  }

  const oldPosition = { ...entity.position };
  const newPosition = resolveMovePosition(oldPosition, newPositionInput);
  const delta = getDelta(oldPosition, newPosition);

  entity.position = newPosition;

  nextScenario.routes = nextScenario.routes.map(route => {
    if (route.entityId !== entityId) return route;
    return {
      ...route,
      points: route.points.map(point => ({
        ...point,
        position: addDelta(point.position, delta),
      })),
    };
  });

  nextScenario.phases = nextScenario.phases.map(phase => ({
    ...phase,
    entityStates: phase.entityStates.map(state => {
      if (state.entityId !== entityId) return state;
      return {
        ...state,
        position: addDelta(state.position, delta),
      };
    }),
  }));

  nextScenario.detectionZones = nextScenario.detectionZones.map(zone => {
    if (zone.entityId !== entityId) return zone;
    return {
      ...zone,
      center: addDelta(zone.center, delta),
    };
  });

  nextScenario.strikeTasks = nextScenario.strikeTasks.map(task => {
    if (!task.weaponTrajectory) return task;

    if (task.attackerEntityId === entityId) {
      return {
        ...task,
        weaponTrajectory: {
          ...task.weaponTrajectory,
          points: task.weaponTrajectory.points.map(point => ({
            ...point,
            position: addDelta(point.position, delta),
          })),
        },
      };
    }

    if (task.targetEntityId === entityId) {
      return {
        ...task,
        weaponTrajectory: {
          ...task.weaponTrajectory,
          points: task.weaponTrajectory.points.map((point, index, points) =>
            moveTargetTrajectoryPoint(point, index, points, newPosition, delta)
          ),
        },
      };
    }

    return task;
  });

  return {
    scenario: nextScenario,
    delta,
  };
}
