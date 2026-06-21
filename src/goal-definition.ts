export interface GoalScope {
  in: string[];
  out: string[];
}

export interface GoalDefinition {
  objective: string;
  scope?: GoalScope;
  verification?: string[];
  stopConditions?: string[];
}

export interface ParsedGoalDefinition {
  definition: GoalDefinition;
  legacy: boolean;
}

const GOAL_PREFIX = "devspace-goal-v1:";

export function serializeGoalDefinition(definition: GoalDefinition): string {
  return `${GOAL_PREFIX}${JSON.stringify(normalizeGoalDefinition(definition))}`;
}

export function parseGoalDefinition(raw: string): ParsedGoalDefinition {
  if (!raw.startsWith(GOAL_PREFIX)) {
    return {
      definition: { objective: raw },
      legacy: true,
    };
  }

  try {
    const parsed = JSON.parse(raw.slice(GOAL_PREFIX.length)) as GoalDefinition;
    return {
      definition: normalizeGoalDefinition(parsed),
      legacy: false,
    };
  } catch {
    return {
      definition: { objective: raw },
      legacy: true,
    };
  }
}

export function normalizeGoalDefinition(definition: GoalDefinition): GoalDefinition {
  return {
    objective: definition.objective.trim(),
    scope: definition.scope
      ? {
          in: definition.scope.in.map((item) => item.trim()).filter(Boolean),
          out: definition.scope.out.map((item) => item.trim()).filter(Boolean),
        }
      : undefined,
    verification: definition.verification?.map((item) => item.trim()).filter(Boolean),
    stopConditions: definition.stopConditions?.map((item) => item.trim()).filter(Boolean),
  };
}
