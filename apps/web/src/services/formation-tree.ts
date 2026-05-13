import {
  PLATFORM_META,
} from '../types/tactical-scenario';
import type {
  EntitySpec,
  EquipmentGroup,
  ForceSide,
  FormationRoleMarker,
  TacticalScenario,
} from '../types/tactical-scenario';

export type FormationMember = EntitySpec & {
  side: ForceSide;
  displayRole?: string;
  formationRole?: FormationRoleMarker;
};

export interface FormationCategoryNode {
  id: string;
  name: string;
  marker: FormationRoleMarker;
  members: FormationMember[];
}

export interface FormationGroupNode {
  id: string;
  name: string;
  side: ForceSide;
  categories: FormationCategoryNode[];
}

export interface SideFormationNode {
  id: ForceSide;
  side: ForceSide;
  name: string;
  groups: FormationGroupNode[];
  total: number;
}

export function getFormationRoleMarker(role: FormationRoleMarker | undefined): FormationRoleMarker {
  return role ?? 'V';
}

function getEntityRoleLabel(entity: EntitySpec): string {
  if (entity.type === 'space-satellite') return '卫星';
  if (PLATFORM_META[entity.type]?.category === 'air') return '飞机';
  if (entity.type.startsWith('ship-')) return '平台';
  if (entity.type.includes('radar')) return '雷达';
  if (entity.type === 'ground-sam') return '导弹';
  return entity.name.replace(/[0-9０-９].*$/, '') || entity.type;
}

function inferGroupSide(group: EquipmentGroup, entityById: Map<string, FormationMember>): ForceSide | undefined {
  if (group.side) return group.side;
  return group.members
    .map(member => entityById.get(member.equipRef)?.side)
    .find((side): side is ForceSide => side === 'red' || side === 'blue');
}

function buildCategoryNode(
  group: EquipmentGroup,
  entityById: Map<string, FormationMember>,
): FormationCategoryNode {
  const members = group.members
    .map((member): FormationMember | null => {
      const entity = entityById.get(member.equipRef);
      if (!entity) return null;
      return {
        ...entity,
        displayRole: member.role,
        formationRole: member.formationRole ?? group.formationRole ?? entity.formationRole,
      };
    })
    .filter((member): member is FormationMember => member !== null);

  return {
    id: group.id,
    name: group.name,
    marker: getFormationRoleMarker(group.formationRole ?? members[0]?.formationRole),
    members,
  };
}

function buildCategoriesFromMembers(
  group: EquipmentGroup,
  entityById: Map<string, FormationMember>,
): FormationCategoryNode[] {
  const categories = new Map<string, FormationCategoryNode>();

  group.members.forEach((member) => {
    const entity = entityById.get(member.equipRef);
    if (!entity) return;
    const categoryName = member.categoryName ?? member.role?.replace(/-[LVC]$/, '') ?? getEntityRoleLabel(entity);
    const marker = getFormationRoleMarker(member.formationRole ?? entity.formationRole);
    const categoryId = member.categoryId ?? `${group.id}-${categoryName}-${marker}`;
    const category = categories.get(categoryId) ?? {
      id: categoryId,
      name: categoryName,
      marker,
      members: [],
    };
    category.members.push({
      ...entity,
      displayRole: member.role,
      formationRole: member.formationRole ?? entity.formationRole,
    });
    categories.set(categoryId, category);
  });

  return Array.from(categories.values()).filter(category => category.members.length > 0);
}

function buildFallbackGroups(side: ForceSide, entities: FormationMember[]): FormationGroupNode[] {
  if (entities.length === 0) return [];
  const categories = new Map<string, FormationCategoryNode>();

  entities.forEach((entity) => {
    const name = getEntityRoleLabel(entity);
    const marker = getFormationRoleMarker(entity.formationRole);
    const id = `${side}-${name}-${marker}`;
    const category = categories.get(id) ?? {
      id,
      name,
      marker,
      members: [],
    };
    category.members.push(entity);
    categories.set(id, category);
  });

  return [{
    id: `${side}-ungrouped`,
    side,
    name: side === 'red' ? '红方未编组资源' : '蓝方未编组资源',
    categories: Array.from(categories.values()),
  }];
}

export function buildFormationTree(scenario: TacticalScenario | null | undefined): SideFormationNode[] {
  const sides: { side: ForceSide; name: string }[] = [
    { side: 'red', name: '红方' },
    { side: 'blue', name: '蓝方' },
  ];
  const entityById = new Map<string, FormationMember>();

  scenario?.forces.forEach(force => {
    force.entities.forEach(entity => {
      entityById.set(entity.id, { ...entity, side: force.side });
    });
  });

  const groupedNodes = (scenario?.interactions?.groups ?? [])
    .map((group) => {
      const side = inferGroupSide(group, entityById);
      if (!side) return null;

      const categories = group.children?.length
        ? group.children.map(child => buildCategoryNode(child, entityById))
        : buildCategoriesFromMembers(group, entityById);

      return {
        id: group.id,
        name: group.name,
        side,
        categories: categories.filter(category => category.members.length > 0),
      };
    })
    .filter((group): group is FormationGroupNode => group !== null && group.categories.length > 0);

  return sides.map(({ side, name }): SideFormationNode => {
    const sideGroups = groupedNodes.filter(group => group.side === side);
    const sideEntities = scenario?.forces
      .filter(force => force.side === side)
      .flatMap(force => force.entities.map(entity => ({ ...entity, side }))) ?? [];
    const groups = sideGroups.length > 0 ? sideGroups : buildFallbackGroups(side, sideEntities);

    return {
      id: side,
      side,
      name,
      groups,
      total: groups.reduce((sum, group) => (
        sum + group.categories.reduce((count, category) => count + category.members.length, 0)
      ), 0),
    };
  });
}
