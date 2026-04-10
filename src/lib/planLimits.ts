type PlanName = 'starter' | 'professional' | 'premium';

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
  professional: {
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

export function normalizePlanName(planName?: string | null): PlanName {
  const normalized = (planName || '').trim().toLowerCase();

  if (normalized === 'premium') return 'premium';
  if (normalized === 'pro' || normalized === 'professional') return 'professional';
  return 'starter';
}

export function getPlanLimits(planName: string): PlanLimits {
  const normalizedPlan = normalizePlanName(planName);
  return PLAN_LIMITS[normalizedPlan];
}

export function canCreateTable(currentCount: number, planName: string): boolean {
  const limits = getPlanLimits(planName);
  return limits.hasTablesFeature && currentCount < limits.maxTables;
}

export function getTableLimitMessage(planName: string): string {
  const limits = getPlanLimits(planName);
  const normalizedPlan = normalizePlanName(planName);

  if (!limits.hasTablesFeature) {
    return 'O recurso de mesas/comandas está disponível nos planos Pro e Premium.';
  }

  const planLabel =
    normalizedPlan === 'professional'
      ? 'Pro'
      : normalizedPlan === 'premium'
      ? 'Premium'
      : 'Starter';

  return `Seu plano ${planLabel} permite até ${limits.maxTables} mesas.`;
}

export function canCreateUser(currentActiveCount: number, planName: string): boolean {
  const limits = getPlanLimits(planName);
  return currentActiveCount < limits.maxUsers;
}

export function getUserLimitMessage(planName: string): string {
  const limits = getPlanLimits(planName);
  return `Seu plano atual permite até ${limits.maxUsers} usuários ativos. Faça upgrade para adicionar mais membros.`;
}
