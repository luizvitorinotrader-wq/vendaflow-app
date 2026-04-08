import { supabase } from './supabase';
import type { Database } from './database.types';

type Plan = Database['public']['Tables']['plans']['Row'];

export interface PlanPricing {
  name: string;
  displayName: string;
  monthlyPrice: number;
  description: string | null;
  isActive: boolean;
}

const FALLBACK_PRICES: Record<string, number> = {
  starter: 39.90,
  pro: 79.90,
  premium: 149.90,
};

export async function getAllPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (error) {
    console.error('Error fetching plans:', error);
    return [];
  }

  return data || [];
}

export async function getPlanByName(planName: string): Promise<Plan | null> {
  const normalizedPlan = planName?.toLowerCase() || 'starter';

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('name', normalizedPlan)
    .maybeSingle();

  if (error) {
    console.error('Error fetching plan:', error);
    return null;
  }

  return data;
}

export function getPlanPriceFallback(plan: string): number {
  const normalizedPlan = plan?.toLowerCase() || 'starter';
  return FALLBACK_PRICES[normalizedPlan] || FALLBACK_PRICES.starter;
}

export function calculateMRRFromPlans(
  stores: Array<{ plan: string; subscription_status: string; is_blocked: boolean; access_mode?: string | null }>,
  plans: Plan[]
): number {
  const planMap = new Map(plans.map(p => [p.name, Number(p.price_monthly)]));

  return stores
    .filter(store =>
      store.subscription_status === 'active' &&
      !store.is_blocked &&
      (store.access_mode === 'paid' || store.access_mode === null)
    )
    .reduce((total, store) => {
      const normalizedPlan = store.plan?.toLowerCase() || 'starter';
      const price = planMap.get(normalizedPlan) || getPlanPriceFallback(normalizedPlan);
      return total + price;
    }, 0);
}

export function convertPlanToInterface(plan: Plan): PlanPricing {
  return {
    name: plan.name,
    displayName: plan.display_name,
    monthlyPrice: Number(plan.price_monthly),
    description: plan.description,
    isActive: plan.is_active,
  };
}
