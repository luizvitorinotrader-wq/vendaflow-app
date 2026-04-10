import type { Database } from './database.types';
import { normalizePlanName } from './planLimits';

type Store = Database['public']['Tables']['stores']['Row'];
type EffectivePlan = 'starter' | 'professional' | 'premium';

export function getEffectivePlan(
  store: Store | null,
  isSuperAdmin: boolean,
  isSupportMode: boolean
): EffectivePlan {
  // Super admin fora do support mode pode operar com visão máxima
  if (isSuperAdmin && !isSupportMode) {
    return 'premium';
  }

  // Em support mode, respeita o plano real da loja suportada
  if (store) {
    return normalizePlanName(store.plan);
  }

  return 'starter';
}
