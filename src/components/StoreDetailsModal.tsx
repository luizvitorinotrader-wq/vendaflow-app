import { useState, useEffect } from 'react';
import { X, Users, Shield, Calendar, CreditCard, Store as StoreIcon, AlertCircle, Loader2, Check, Clock, LifeBuoy, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getPlanLimits } from '../lib/planLimits';
import { logSuperAdminAction, getStoreAuditLog, getActionLabel, formatAuditChange, type AuditLogRecord } from '../lib/superAdminAudit';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';

interface StoreDetailsModalProps {
  storeId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'staff';
  is_active: boolean;
  email: string;
  full_name: string | null;
}

interface StoreDetails {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  subscription_status: string;
  created_at: string;
  phone: string | null;
  city: string | null;
  is_blocked: boolean;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  owner_email: string;
  owner_name: string | null;
  access_mode: string | null;
  granted_by: string | null;
  granted_at: string | null;
  grant_reason: string | null;
}

export default function StoreDetailsModal({ storeId, onClose, onUpdate }: StoreDetailsModalProps) {
  const navigate = useNavigate();
  const { startSupportMode } = useAuth();
  const [store, setStore] = useState<StoreDetails | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showGrantPlanModal, setShowGrantPlanModal] = useState(false);
  const [grantPlanData, setGrantPlanData] = useState({
    plan: 'starter' as 'starter' | 'pro' | 'premium',
    durationDays: 30,
    reason: '',
  });

  useEffect(() => {
    loadStoreDetails();
  }, [storeId]);

  const loadStoreDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();

      if (storeError) throw storeError;

      const { data: ownerProfile, error: ownerError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', storeData.owner_id)
        .single();

      if (ownerError) throw ownerError;

      const storeDetails: StoreDetails = {
        ...storeData,
        owner_email: ownerProfile.email || 'N/A',
        owner_name: ownerProfile.full_name,
      };

      setStore(storeDetails);

      const { data: storeUsers, error: storeUsersError } = await supabase
        .from('store_users')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (storeUsersError) throw storeUsersError;

      if (storeUsers && storeUsers.length > 0) {
        const userIds = storeUsers.map(su => su.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const members: TeamMember[] = storeUsers.map(su => {
          const profile = profiles?.find(p => p.id === su.user_id);
          return {
            id: su.id,
            user_id: su.user_id,
            role: su.role as 'owner' | 'manager' | 'staff',
            is_active: su.is_active,
            email: profile?.email || 'Unknown',
            full_name: profile?.full_name || null,
          };
        });

        setTeamMembers(members);
      }

      const auditLogs = await getStoreAuditLog(storeId);
      setAuditLog(auditLogs);
    } catch (err: any) {
      console.error('Error loading store details:', err);
      setError(err.message || 'Erro ao carregar detalhes da loja');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!store) return;

    const action = store.is_blocked ? 'desbloquear' : 'bloquear';
    const confirmed = confirm(`Tem certeza que deseja ${action} a loja "${store.name}"?`);

    if (!confirmed) return;

    try {
      setActionLoading('block');

      const oldValue = store.is_blocked ? 'blocked' : 'unblocked';
      const newValue = !store.is_blocked ? 'blocked' : 'unblocked';

      const { error } = await supabase
        .from('stores')
        .update({ is_blocked: !store.is_blocked })
        .eq('id', storeId);

      if (error) throw error;

      await logSuperAdminAction({
        store_id: storeId,
        action_type: store.is_blocked ? 'unblock_store' : 'block_store',
        old_value: oldValue,
        new_value: newValue,
      });

      alert(`Loja ${action === 'bloquear' ? 'bloqueada' : 'desbloqueada'} com sucesso!`);
      await loadStoreDetails();
      onUpdate();
    } catch (err: any) {
      console.error('Error toggling block:', err);
      alert(err.message || `Erro ao ${action} loja`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdatePlan = async () => {
    if (!store) return;

    const newPlan = prompt(
      `Alterar plano de "${store.plan || 'starter'}" para:\n\n` +
      'Opções: starter, pro, premium',
      store.plan || 'starter'
    );

    if (!newPlan) return;

    const validPlans = ['starter', 'pro', 'professional', 'premium'];
    if (!validPlans.includes(newPlan.toLowerCase())) {
      alert('Plano inválido. Use: starter, pro ou premium');
      return;
    }

    try {
      setActionLoading('plan');

      const oldPlan = store.plan || 'starter';
      const normalizedNewPlan = newPlan.toLowerCase();

      const { error } = await supabase
        .from('stores')
        .update({ plan: normalizedNewPlan })
        .eq('id', storeId);

      if (error) throw error;

      await logSuperAdminAction({
        store_id: storeId,
        action_type: 'change_plan',
        old_value: oldPlan,
        new_value: normalizedNewPlan,
      });

      alert('Plano atualizado com sucesso!');
      await loadStoreDetails();
      onUpdate();
    } catch (err: any) {
      console.error('Error updating plan:', err);
      alert(err.message || 'Erro ao atualizar plano');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateSubscriptionStatus = async () => {
    if (!store) return;

    const newStatus = prompt(
      `Alterar status de assinatura de "${store.subscription_status}" para:\n\n` +
      'Opções: trial, active, cancelled, overdue',
      store.subscription_status
    );

    if (!newStatus) return;

    const validStatuses = ['trial', 'active', 'cancelled', 'overdue'];
    if (!validStatuses.includes(newStatus.toLowerCase())) {
      alert('Status inválido. Use: trial, active, cancelled ou overdue');
      return;
    }

    try {
      setActionLoading('status');

      const oldStatus = store.subscription_status;
      const normalizedNewStatus = newStatus.toLowerCase();

      const { error } = await supabase
        .from('stores')
        .update({ subscription_status: normalizedNewStatus })
        .eq('id', storeId);

      if (error) throw error;

      await logSuperAdminAction({
        store_id: storeId,
        action_type: 'change_subscription_status',
        old_value: oldStatus,
        new_value: normalizedNewStatus,
      });

      alert('Status da assinatura atualizado com sucesso!');
      await loadStoreDetails();
      onUpdate();
    } catch (err: any) {
      console.error('Error updating subscription status:', err);
      alert(err.message || 'Erro ao atualizar status');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      trial: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-gray-100 text-gray-800',
      overdue: 'bg-red-100 text-red-800'
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts = {
      active: 'Ativa',
      trial: 'Trial',
      cancelled: 'Cancelada',
      overdue: 'Vencida'
    };
    return texts[status as keyof typeof texts] || status;
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      case 'staff':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Proprietário';
      case 'manager':
        return 'Gerente';
      case 'staff':
        return 'Atendente';
      default:
        return role;
    }
  };

  const handleStartSupportMode = async () => {
    if (!store) return;

    const confirmed = confirm(
      `Entrar em modo suporte para "${store.name}"?\n\n` +
      'Você terá acesso temporário ao contexto desta loja para diagnóstico e suporte.'
    );

    if (!confirmed) return;

    try {
      setActionLoading('support');

      await logSuperAdminAction({
        store_id: storeId,
        action_type: 'start_support_mode',
        notes: 'Modo suporte iniciado via painel super admin',
      });

      await startSupportMode(storeId);

      onClose();
      navigate('/app/dashboard');
    } catch (err: any) {
      console.error('Error starting support mode:', err);
      alert(err.message || 'Erro ao iniciar modo suporte');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGrantPlan = async () => {
    if (!store) return;

    if (!grantPlanData.reason.trim()) {
      alert('Por favor, informe o motivo da concessão');
      return;
    }

    if (grantPlanData.reason.trim().length < 3) {
      alert('O motivo deve ter pelo menos 3 caracteres');
      return;
    }

    try {
      setActionLoading('grant');

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-plan-manual`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeId: storeId,
            plan: grantPlanData.plan,
            durationDays: grantPlanData.durationDays,
            reason: grantPlanData.reason.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao conceder plano');
      }

      alert('Plano concedido com sucesso!');
      setShowGrantPlanModal(false);
      setGrantPlanData({ plan: 'starter', durationDays: 30, reason: '' });
      await loadStoreDetails();
      onUpdate();
    } catch (err: any) {
      console.error('Error granting plan:', err);
      alert(err.message || 'Erro ao conceder plano');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Erro</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-red-800">{error || 'Loja não encontrada'}</p>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeUserCount = teamMembers.filter(m => m.is_active).length;
  const planLimits = getPlanLimits(store.plan || 'starter');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <StoreIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{store.name}</h2>
                <p className="text-sm text-gray-500">ID: {store.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {store.is_blocked && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Loja Bloqueada</p>
                <p className="text-sm text-red-700 mt-1">Esta loja está atualmente bloqueada e não pode acessar o sistema.</p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <StoreIcon className="w-5 h-5" />
              Dados Gerais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Nome da Loja</p>
                <p className="font-medium text-gray-900">{store.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email do Proprietário</p>
                <p className="font-medium text-gray-900">{store.owner_email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Nome do Proprietário</p>
                <p className="font-medium text-gray-900">{store.owner_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Plano Atual</p>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 capitalize">{store.plan || 'starter'}</p>
                  {store.access_mode === 'manual' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                      <Gift className="h-3 w-3" />
                      Manual
                    </span>
                  )}
                  {store.access_mode === 'paid' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                      <CreditCard className="h-3 w-3" />
                      Pago
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status da Assinatura</p>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(store.subscription_status)}`}>
                  {getStatusText(store.subscription_status)}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Data de Criação</p>
                <p className="font-medium text-gray-900">
                  {new Date(store.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {store.phone && (
                <div>
                  <p className="text-sm text-gray-600">Telefone</p>
                  <p className="font-medium text-gray-900">{store.phone}</p>
                </div>
              )}
              {store.city && (
                <div>
                  <p className="text-sm text-gray-600">Cidade</p>
                  <p className="font-medium text-gray-900">{store.city}</p>
                </div>
              )}
              {store.trial_ends_at && (
                <div>
                  <p className="text-sm text-gray-600">Trial Termina em</p>
                  <p className="font-medium text-gray-900">
                    {new Date(store.trial_ends_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
              {store.subscription_ends_at && (
                <div>
                  <p className="text-sm text-gray-600">Assinatura Termina em</p>
                  <p className="font-medium text-gray-900">
                    {new Date(store.subscription_ends_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
            </div>

            {store.access_mode === 'manual' && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Acesso Concedido Manualmente
                </p>
                <div className="space-y-1 text-sm text-purple-800">
                  {store.granted_at && (
                    <p>
                      <strong>Data:</strong> {new Date(store.granted_at).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(store.granted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  {store.grant_reason && (
                    <p>
                      <strong>Motivo:</strong> {store.grant_reason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Equipe
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${
                  activeUserCount >= planLimits.maxUsers ? 'text-red-600' : 'text-gray-700'
                }`}>
                  {activeUserCount} / {planLimits.maxUsers === 999 ? '∞' : planLimits.maxUsers}
                </span>
                {activeUserCount >= planLimits.maxUsers && planLimits.maxUsers !== 999 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                    <AlertCircle className="h-3 w-3" />
                    Limite atingido
                  </span>
                )}
              </div>
            </div>
            {teamMembers.length === 0 ? (
              <p className="text-gray-600 text-sm">Nenhum membro cadastrado</p>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {member.full_name || member.email}
                      </p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadge(member.role)}`}>
                        {member.role === 'owner' && <Shield className="h-3 w-3" />}
                        {getRoleLabel(member.role)}
                      </span>
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Ações Administrativas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={handleStartSupportMode}
                disabled={!!actionLoading}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'support' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LifeBuoy className="w-4 h-4" />
                )}
                Entrar em Modo Suporte
              </button>

              <button
                onClick={() => setShowGrantPlanModal(true)}
                disabled={!!actionLoading}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <Gift className="w-4 h-4" />
                Conceder Plano
              </button>

              <button
                onClick={handleToggleBlock}
                disabled={actionLoading === 'block'}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  store.is_blocked
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } disabled:opacity-50`}
              >
                {actionLoading === 'block' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : store.is_blocked ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {store.is_blocked ? 'Desbloquear Loja' : 'Bloquear Loja'}
              </button>

              <button
                onClick={handleUpdatePlan}
                disabled={!!actionLoading}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'plan' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Alterar Plano
              </button>

              <button
                onClick={handleUpdateSubscriptionStatus}
                disabled={!!actionLoading}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'status' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                Alterar Status
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Histórico de Ações ({auditLog.length})
            </h3>
            {auditLog.length === 0 ? (
              <p className="text-gray-600 text-sm">Nenhuma ação administrativa registrada</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {auditLog.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-white rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">
                          {getActionLabel(log.action_type)}
                        </p>
                        {(log.old_value || log.new_value) && (
                          <p className="text-sm text-gray-600 mt-1">
                            {formatAuditChange(log.action_type, log.old_value, log.new_value)}
                          </p>
                        )}
                        {log.notes && (
                          <p className="text-sm text-gray-500 mt-1 italic">
                            Nota: {log.notes}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Por {log.admin_email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Fechar
          </button>
        </div>
      </div>

      {showGrantPlanModal && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-10">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Gift className="w-6 h-6 text-emerald-600" />
                Conceder Plano Manualmente
              </h3>
              <button
                onClick={() => setShowGrantPlanModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plano
                </label>
                <select
                  value={grantPlanData.plan}
                  onChange={(e) => setGrantPlanData({ ...grantPlanData, plan: e.target.value as 'starter' | 'pro' | 'premium' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duração
                </label>
                <select
                  value={grantPlanData.durationDays}
                  onChange={(e) => setGrantPlanData({ ...grantPlanData, durationDays: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value={30}>30 dias (1 mês)</option>
                  <option value={90}>90 dias (3 meses)</option>
                  <option value={180}>180 dias (6 meses)</option>
                  <option value={365}>365 dias (1 ano)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={grantPlanData.reason}
                  onChange={(e) => setGrantPlanData({ ...grantPlanData, reason: e.target.value })}
                  placeholder="Ex: cortesia, parceria, teste..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Mínimo 3 caracteres. Este campo é obrigatório para fins de auditoria.
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Atenção:</strong> Esta ação concederá acesso manual ao plano selecionado,
                  sem passar pelo Stripe. A concessão será registrada no log de auditoria.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowGrantPlanModal(false)}
                disabled={!!actionLoading}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGrantPlan}
                disabled={!!actionLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'grant' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Concedendo...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4" />
                    Conceder Acesso
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
