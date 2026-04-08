type PlanName = 'starter' | 'pro' | 'premium';

interface Store {
  plan?: string | null;
  plan_name?: string | null;
}

export function getEffectivePlan(
  store: Store | null,
  isSuperAdmin: boolean,
  isSupportMode: boolean
): 'starter' | 'pro' | 'premium' {

  // 🔥 REGRA CRÍTICA: Support mode tem acesso total
  if (isSuperAdmin && isSupportMode) {
    return 'premium';
  }

  const realPlan = (store?.plan || 'starter').toLowerCase();

  if (realPlan === 'pro' || realPlan === 'premium') {
    return realPlan as 'pro' | 'premium';
  }

  return 'starter';
}

export function getEffectivePlanDisplay(
  store: Store | null,
  isSuperAdmin: boolean,
  isSupportMode: boolean
): string {
  const effectivePlan = getEffectivePlan(store, isSuperAdmin, isSupportMode);

  if (isSuperAdmin && isSupportMode && effectivePlan !== (store?.plan_name || store?.plan || 'starter').toLowerCase()) {
    return `${effectivePlan} (Support Mode Override)`;
  }

  return effectivePlan;
}
