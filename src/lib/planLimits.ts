type PlanName = 'starter' | 'pro' | 'premium';

export interface PlanLimits {
  maxTables: number;
  hasTablesFeature: boolean;
  maxUsers: number;
  maxOwners: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  starter: {
    maxTables: 0,
    hasTablesFeature: false,
    maxUsers: 3,
    maxOwners: 1,
  },
  pro: {
    maxTables: 10,
    hasTablesFeature: true,
    maxUsers: 10,
    maxOwners: 2,
  },
  premium: {
    maxTables: 30,
    hasTablesFeature: true,
    maxUsers: 999,
    maxOwners: 3,
  },
};

export function getPlanLimits(planName: string): PlanLimits {
  const normalizedPlan = (planName?.toLowerCase() || 'starter') as PlanName;
  return PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.starter;
}

export function canCreateTable(currentCount: number, planName: string): boolean {
  const limits = getPlanLimits(planName);
  return limits.hasTablesFeature && currentCount < limits.maxTables;
}

export function getTableLimitMessage(planName: string): string {
  const limits = getPlanLimits(planName);

  if (!limits.hasTablesFeature) {
    return 'O recurso de mesas/comandas está disponível nos planos Pro e Premium.';
  }

  return `Seu plano ${planName} permite até ${limits.maxTables} mesas.`;
}

export function canCreateUser(currentActiveCount: number, planName: string): boolean {
  const limits = getPlanLimits(planName);
  return currentActiveCount < limits.maxUsers;
}

export function getUserLimitMessage(planName: string): string {
  const limits = getPlanLimits(planName);
  return `Seu plano atual permite até ${limits.maxUsers} usuários ativos. Faça upgrade para adicionar mais membros.`;
}
