import { useState, useEffect } from 'react';
import { Users, Plus, CreditCard as Edit2, Shield, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getPlanLimits } from '../lib/planLimits';
import { logAuditEvent } from '../lib/auditLogger';
import type { Database } from '../lib/database.types';

type StoreUser = Database['public']['Tables']['store_users']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface TeamMember {
  id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'staff';
  is_active: boolean;
  email: string;
  full_name: string | null;
}

export default function Team() {
  const { storeId, isOwner, effectivePlan, user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [activeUserCount, setActiveUserCount] = useState<number>(0);
  const [ownerCount, setOwnerCount] = useState<number>(0);

  const planLimits = getPlanLimits(effectivePlan);
  const userLimit = planLimits.maxUsers;
  const maxOwners = planLimits.maxOwners;

  useEffect(() => {
    console.log('[Team] effectiveStoreId:', storeId);
    if (storeId) {
      loadTeamMembers();
    }
  }, [storeId]);

  const loadTeamMembers = async () => {
    if (!storeId) {
      console.log('[Team] loadTeamMembers skipped - no storeId');
      return;
    }
    console.log('[Team] loadTeamMembers with storeId:', storeId);

    try {
      setLoading(true);

      const { data: storeUsers, error: storeUsersError } = await supabase
        .from('store_users')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (storeUsersError) throw storeUsersError;

      if (!storeUsers || storeUsers.length === 0) {
        console.log('[Team] No store_users found for this store');
        setTeamMembers([]);
        setActiveUserCount(0);
        return;
      }

      console.log('[Team] Found', storeUsers.length, 'store_users');

      const userIds = storeUsers.map((su) => su.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const members: TeamMember[] = storeUsers.map((su) => {
        const profile = profiles?.find((p) => p.id === su.user_id);
        return {
          id: su.id,
          user_id: su.user_id,
          role: su.role as 'owner' | 'manager' | 'staff',
          is_active: su.is_active,
          email: profile?.email || 'Unknown',
          full_name: profile?.full_name || null,
        };
      });

      console.log('[Team] Loaded', members.length, 'team members');
      setTeamMembers(members);
      setActiveUserCount(members.filter((m) => m.is_active).length);
      setOwnerCount(members.filter((m) => m.is_active && m.role === 'owner').length);
    } catch (error) {
      console.error('Error loading team members:', error);
      alert('Erro ao carregar equipe');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
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

  if (!isOwner) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            Apenas proprietários podem acessar o gerenciamento de equipe.
          </p>
        </div>
      </div>
    );
  }

  const isAtUserLimit = activeUserCount >= userLimit;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-8 w-8" />
            Equipe
          </h1>
          <p className="mt-2 text-gray-600">
            Gerencie os membros da sua equipe e suas permissões
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Usuários ativos: <span className="font-semibold">{activeUserCount}</span> de{' '}
            <span className="font-semibold">{userLimit === 999 ? 'ilimitado' : userLimit}</span>
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          disabled={isAtUserLimit}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isAtUserLimit
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          title={isAtUserLimit ? `Limite de ${userLimit} usuários atingido` : 'Adicionar novo membro'}
        >
          <Plus className="h-5 w-5" />
          Adicionar Membro
        </button>
      </div>

      {isAtUserLimit && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              Limite de usuários atingido
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              Seu plano atual permite até {userLimit} usuários ativos. Faça upgrade para adicionar mais membros à sua equipe.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : teamMembers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum membro na equipe
          </h3>
          <p className="text-gray-600 mb-6">
            Comece adicionando membros à sua equipe
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Adicionar Primeiro Membro
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Membro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Papel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-gray-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {member.full_name || 'Sem nome'}
                        </div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                      {member.role === 'owner' && <Shield className="h-3 w-3" />}
                      {getRoleLabel(member.role)}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        member.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {member.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      {member.user_id !== user?.id && (
                        <>
                          <button
                            onClick={() => setEditingMember(member)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar papel"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => setRemovingMember(member)}
                            className="text-red-600 hover:text-red-900"
                            title="Remover da equipe"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateMemberModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadTeamMembers();
          }}
          currentOwnerCount={ownerCount}
          maxOwners={maxOwners}
          effectivePlan={effectivePlan}
        />
      )}

      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSuccess={() => {
            setEditingMember(null);
            loadTeamMembers();
          }}
          currentOwnerCount={ownerCount}
          maxOwners={maxOwners}
          effectivePlan={effectivePlan}
        />
      )}

      {removingMember && (
        <RemoveMemberModal
          member={removingMember}
          onClose={() => setRemovingMember(null)}
          onSuccess={() => {
            setRemovingMember(null);
            loadTeamMembers();
          }}
          storeId={storeId}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}

function CreateMemberModal({
  onClose,
  onSuccess,
  currentOwnerCount,
  maxOwners,
  effectivePlan
}: {
  onClose: () => void;
  onSuccess: () => void;
  currentOwnerCount: number;
  maxOwners: number;
  effectivePlan: string;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'owner' | 'manager' | 'staff'>('staff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const isOwnerLimitReached = currentOwnerCount >= maxOwners;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !fullName || !password) {
      setError('Preencha todos os campos');
      return;
    }

    try {
      setLoading(true);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-member`;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          fullName: fullName.trim(),
          password,
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar membro');
      }

      alert('Membro criado com sucesso!');
      onSuccess();
    } catch (error: any) {
      console.error('Error creating member:', error);
      setError(error.message || 'Erro ao criar membro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Adicionar Membro</h2>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome Completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha Temporária
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              minLength={6}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Mínimo de 6 caracteres</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Papel
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'owner' | 'manager' | 'staff')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="staff">Atendente (apenas PDV e mesas)</option>
              <option value="manager">Gerente (acesso operacional completo)</option>
              <option
                value="owner"
                disabled={isOwnerLimitReached}
              >
                Proprietário (acesso total) {isOwnerLimitReached ? `- Limite atingido (${maxOwners})` : `- ${currentOwnerCount}/${maxOwners}`}
              </option>
            </select>
            {isOwnerLimitReached && role === 'owner' && (
              <p className="text-xs text-yellow-600 mt-1">
                Limite de proprietários atingido para o plano {effectivePlan}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading || (role === 'owner' && isOwnerLimitReached)}
            >
              {loading ? 'Criando...' : 'Criar Membro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSuccess,
  currentOwnerCount,
  maxOwners,
  effectivePlan
}: {
  member: TeamMember;
  onClose: () => void;
  onSuccess: () => void;
  currentOwnerCount: number;
  maxOwners: number;
  effectivePlan: string;
}) {
  const [role, setRole] = useState<'owner' | 'manager' | 'staff'>(member.role);
  const [loading, setLoading] = useState(false);

  // If promoting to owner, check if limit would be exceeded
  const isPromotingToOwner = role === 'owner' && member.role !== 'owner';
  const wouldExceedOwnerLimit = isPromotingToOwner && currentOwnerCount >= maxOwners;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);

      const { error } = await supabase
        .from('store_users')
        .update({ role })
        .eq('id', member.id);

      if (error) throw error;

      alert('Papel atualizado com sucesso!');
      onSuccess();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Erro ao atualizar papel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Editar Papel</h2>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Membro:</p>
          <p className="font-medium text-gray-900">{member.full_name || member.email}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Papel
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'owner' | 'manager' | 'staff')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="staff">Atendente (apenas PDV e mesas)</option>
              <option value="manager">Gerente (acesso operacional completo)</option>
              <option
                value="owner"
                disabled={member.role !== 'owner' && currentOwnerCount >= maxOwners}
              >
                Proprietário (acesso total) {member.role !== 'owner' ? (currentOwnerCount >= maxOwners ? `- Limite atingido (${maxOwners})` : `- ${currentOwnerCount}/${maxOwners}`) : ''}
              </option>
            </select>
            {wouldExceedOwnerLimit && (
              <p className="text-xs text-yellow-600 mt-1">
                Limite de proprietários atingido para o plano {effectivePlan}. Rebaixe outro proprietário primeiro.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading || wouldExceedOwnerLimit}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RemoveMemberModal({
  member,
  onClose,
  onSuccess,
  storeId,
  currentUserId,
}: {
  member: TeamMember;
  onClose: () => void;
  onSuccess: () => void;
  storeId: string | null;
  currentUserId: string | undefined;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleRemove = async () => {
    if (!storeId || !currentUserId) {
      setError('Sessão inválida');
      return;
    }

    if (member.user_id === currentUserId) {
      setError('Você não pode remover a si mesmo da equipe');
      return;
    }

    // Allow removing owners, but warn in UI
    // No hard block here - business logic allows it

    try {
      setLoading(true);
      setError('');

      const { error: deleteError } = await supabase
        .from('store_users')
        .delete()
        .eq('id', member.id);

      if (deleteError) throw deleteError;

      await logAuditEvent({
        userId: currentUserId,
        eventType: 'team_member_removed',
        eventStatus: 'success',
        metadata: {
          removed_user_id: member.user_id,
          removed_user_email: member.email,
          removed_user_role: member.role,
          store_id: storeId,
        },
      });

      alert('Membro removido da equipe com sucesso!');
      onSuccess();
    } catch (err: any) {
      console.error('Error removing member:', err);
      setError(err.message || 'Erro ao remover membro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <Trash2 className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Remover Membro</h2>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            Tem certeza que deseja remover <span className="font-semibold">{member.full_name || member.email}</span> da equipe?
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 font-medium mb-2">
              Esta ação irá:
            </p>
            <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
              <li>Remover completamente o acesso do membro a esta loja</li>
              <li>O membro não poderá mais fazer login nesta loja</li>
              <li>Esta ação não pode ser desfeita</li>
            </ul>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Email:</p>
            <p className="font-medium text-gray-900">{member.email}</p>
            <p className="text-sm text-gray-600 mt-2">Papel atual:</p>
            <p className="font-medium text-gray-900">
              {member.role === 'manager' ? 'Gerente' : 'Atendente'}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Removendo...' : 'Remover Membro'}
          </button>
        </div>
      </div>
    </div>
  );
}
