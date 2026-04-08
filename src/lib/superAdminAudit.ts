import { supabase } from './supabase';
import { logger } from './logger';

export type AuditActionType =
  | 'block_store'
  | 'unblock_store'
  | 'change_plan'
  | 'change_subscription_status'
  | 'extend_trial'
  | 'cancel_trial'
  | 'user_limit_reached'
  | 'start_support_mode'
  | 'end_support_mode'
  | 'switch_support_store';

interface AuditLogEntry {
  store_id: string;
  action_type: AuditActionType;
  old_value?: string;
  new_value?: string;
  notes?: string;
}

export async function logSuperAdminAction(entry: AuditLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      logger.log('Cannot log audit: no authenticated user');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'super_admin') {
      logger.log('Cannot log audit: user is not super_admin');
      return;
    }

    const { error } = await supabase
      .from('super_admin_audit_log')
      .insert({
        store_id: entry.store_id,
        admin_user_id: user.id,
        admin_email: profile.email || user.email || 'unknown',
        action_type: entry.action_type,
        old_value: entry.old_value || null,
        new_value: entry.new_value || null,
        notes: entry.notes || null,
      });

    if (error) {
      logger.log('Error logging super admin action:', error);
    } else {
      logger.log(`Audit logged: ${entry.action_type} for store ${entry.store_id}`);
    }
  } catch (error) {
    logger.log('Exception logging super admin action:', error);
  }
}

export interface AuditLogRecord {
  id: string;
  store_id: string;
  admin_user_id: string;
  admin_email: string;
  action_type: AuditActionType;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  created_at: string;
}

export async function getStoreAuditLog(storeId: string): Promise<AuditLogRecord[]> {
  try {
    const { data, error } = await supabase
      .from('super_admin_audit_log')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.log('Error fetching audit log:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.log('Exception fetching audit log:', error);
    return [];
  }
}

export function getActionLabel(actionType: AuditActionType): string {
  const labels: Record<AuditActionType, string> = {
    block_store: 'Bloqueou loja',
    unblock_store: 'Desbloqueou loja',
    change_plan: 'Alterou plano',
    change_subscription_status: 'Alterou status da assinatura',
    extend_trial: 'Estendeu período de teste',
    cancel_trial: 'Cancelou período de teste',
    user_limit_reached: 'Tentativa bloqueada: limite de usuários',
    start_support_mode: 'Iniciou modo suporte',
    end_support_mode: 'Encerrou modo suporte',
    switch_support_store: 'Trocou de loja em modo suporte',
  };
  return labels[actionType] || actionType;
}

export function formatAuditChange(
  actionType: AuditActionType,
  oldValue: string | null,
  newValue: string | null
): string {
  if (actionType === 'block_store' || actionType === 'unblock_store' || actionType === 'start_support_mode' || actionType === 'end_support_mode' || actionType === 'switch_support_store') {
    return '';
  }

  if (!oldValue && !newValue) {
    return '';
  }

  if (!oldValue) {
    return `→ ${newValue}`;
  }

  if (!newValue) {
    return `${oldValue} → (removido)`;
  }

  return `${oldValue} → ${newValue}`;
}
