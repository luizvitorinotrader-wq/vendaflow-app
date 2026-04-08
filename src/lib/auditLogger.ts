import { supabase } from './supabase';
import { logger } from './logger';

export type AuditEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'magic_link_sent'
  | 'magic_link_used'
  | 'session_expired'
  | 'signup_success'
  | 'signup_failed'
  | 'sale_completed'
  | 'cash_session_opened'
  | 'cash_session_closed'
  | 'stock_adjustment'
  | 'support_mode_started'
  | 'support_mode_ended'
  | 'team_member_removed';

export type AuditEventStatus = 'success' | 'failure';

interface AuditLogEntry {
  userId?: string;
  eventType: AuditEventType;
  eventStatus: AuditEventStatus;
  metadata?: Record<string, unknown>;
}

async function getBrowserInfo() {
  const userAgent = navigator.userAgent;

  return {
    userAgent,
    platform: navigator.platform,
    language: navigator.language,
  };
}

export async function logAuditEvent({
  userId,
  eventType,
  eventStatus,
  metadata = {},
}: AuditLogEntry): Promise<void> {
  try {
    const browserInfo = await getBrowserInfo();

    const { data: { user } } = await supabase.auth.getUser();
    const finalUserId = userId || user?.id || null;

    if (!finalUserId) {
      logger.warn('No user ID available for audit log');
      return;
    }

    await supabase.rpc('log_audit_event', {
      p_user_id: finalUserId,
      p_event_type: eventType,
      p_event_status: eventStatus,
      p_metadata: {
        ...metadata,
        ...browserInfo,
      },
    });
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
}

export async function getUserAuditLogs(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('auth_audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to fetch audit logs:', error);
    return [];
  }

  return data || [];
}
