import type {
  GeoPosition,
  TacticalScenario,
  WeaponTrajectoryKeyPoint,
} from '../types/tactical-scenario';

export interface ScenarioEntityMoveResult {
  scenario: TacticalScenario;
  delta: GeoPosition;
}

export interface ScenarioEntityUpdateInput {
  name?: string;
  position?: Partial<GeoPosition>;
}

export interface ScenarioRoutePointUpdateResult {
  scenario: TacticalScenario;
  entityPositionChanged: boolean;
  linkedLaunchPointsChanged: number;
  entityName?: string;
  routeLabel?: string;
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

function isSamePosition(a: GeoPosition, b: GeoPosition): boolean {
  return Math.abs(a.longitude - b.longitude) < 1e-9
    && Math.abs(a.latitude - b.latitude) < 1e-9
    && Math.abs((a.altitude ?? 0) - (b.altitude ?? 0)) < 1e-6;
}

function isLaunchTrajectoryPoint(point: WeaponTrajectoryKeyPoint, index: number): boolean {
  return point.role === 'launch' || index === 0;
}

function isRoutePointAtTimestamp(timestamp: number | undefined, targetTimestamp: number): boolean {
  return timestamp !== undefined && Math.abs(timestamp - targetTimestamp) < 1e-6;
}

function isRoutePointLinkedToStrikeLaunch(
  oldRoutePointPosition: GeoPosition,
  routeTimestamp: number | undefined,
  task: TacticalScenario['strikeTasks'][number],
): boolean {
  if (isRoutePointAtTimestamp(routeTimestamp, task.timestamp)) return true;

  const launchPoint = task.weaponTrajectory?.points.find((point, index) =>
    isLaunchTrajectoryPoint(point, index)
  );
  return launchPoint ? isSamePosition(oldRoutePointPosition, launchPoint.position) : false;
}

export function moveScenarioEntityWithLinkedGeometry(
  scenario: TacticalScenario,
  entityId: string,
  newPositionInput: Partial<GeoPosition>,
): TacticalScenario {
  return moveScenarioEntityWithLinkedGeometryDetailed(scenario, entityId, newPositionInput).scenario;
}

export function updateScenarioEntityWithLinkedGeometry(
  scenario: TacticalScenario,
  entityId: string,
  updates: ScenarioEntityUpdateInput,
): TacticalScenario {
  const position = updates.position;
  const movedScenario = position
    ? moveScenarioEntityWithLinkedGeometryDetailed(scenario, entityId, position).scenario
    : cloneScenario(scenario);

  if (updates.name === undefined) return movedScenario;

  const nextName = updates.name.trim();
  if (!nextName) return movedScenario;

  const entity = movedScenario.forces
    .flatMap(force => force.entities)
    .find(item => item.id === entityId);
  if (entity) {
    entity.name = nextName;
  }

  return movedScenario;
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

export function updateScenarioRoutePointWithLinkedGeometry(
  scenario: TacticalScenario,
  routeIndex: number,
  pointIndex: number,
  newPositionInput: Partial<GeoPosition>,
): ScenarioRoutePointUpdateResult {
  const nextScenario = cloneScenario(scenario);
  const route = nextScenario.routes[routeIndex];
  const point = route?.points[pointIndex];

  if (!route || !point) {
    return {
      scenario: nextScenario,
      entityPositionChanged: false,
      linkedLaunchPointsChanged: 0,
    };
  }

  const oldPosition = { ...point.position };
  const newPosition = resolveMovePosition(oldPosition, newPositionInput);
  const linkedLaunchPhaseIds = new Set<string>();
  let linkedLaunchPointsChanged = 0;

  route.points[pointIndex] = {
    ...point,
    position: newPosition,
  };

  const entity = nextScenario.forces
    .flatMap(force => force.entities)
    .find(item => item.id === route.entityId);
  const entityPositionChanged = pointIndex === 0 && Boolean(entity);

  if (entityPositionChanged && entity) {
    entity.position = { ...newPosition };
    nextScenario.detectionZones = nextScenario.detectionZones.map(zone => {
      if (zone.entityId !== route.entityId) return zone;
      return {
        ...zone,
        center: { ...newPosition },
      };
    });
  }

  nextScenario.strikeTasks = nextScenario.strikeTasks.map(task => {
    if (
      task.attackerEntityId !== route.entityId
      || !isRoutePointLinkedToStrikeLaunch(oldPosition, point.timestamp, task)
    ) {
      return task;
    }

    linkedLaunchPhaseIds.add(task.phaseId);

    if (!task.weaponTrajectory) return task;

    return {
      ...task,
      weaponTrajectory: {
        ...task.weaponTrajectory,
        points: task.weaponTrajectory.points.map((trajectoryPoint, trajectoryIndex) => {
          if (!isLaunchTrajectoryPoint(trajectoryPoint, trajectoryIndex)) return trajectoryPoint;
          linkedLaunchPointsChanged += 1;
          return {
            ...trajectoryPoint,
            position: { ...newPosition },
          };
        }),
      },
    };
  });

  nextScenario.phases = nextScenario.phases.map(phase => ({
    ...phase,
    events: phase.events.map(event => {
      if (
        event.sourceEntityId !== route.entityId
        || !isRoutePointAtTimestamp(point.timestamp, event.timestamp)
        || !event.weaponTrajectory
      ) {
        return event;
      }

      return {
        ...event,
        weaponTrajectory: {
          ...event.weaponTrajectory,
          points: event.weaponTrajectory.points.map((trajectoryPoint, trajectoryIndex) => {
            if (!isLaunchTrajectoryPoint(trajectoryPoint, trajectoryIndex)) return trajectoryPoint;
            return {
              ...trajectoryPoint,
              position: { ...newPosition },
            };
          }),
        },
      };
    }),
    entityStates: phase.entityStates.map(state => {
      if (state.entityId !== route.entityId) return state;
      if (!isSamePosition(state.position, oldPosition) && !linkedLaunchPhaseIds.has(phase.id)) return state;
      return {
        ...state,
        position: { ...newPosition },
      };
    }),
  }));

  return {
    scenario: nextScenario,
    entityPositionChanged,
    linkedLaunchPointsChanged,
    entityName: entity?.name,
    routeLabel: route.label,
  };
}
