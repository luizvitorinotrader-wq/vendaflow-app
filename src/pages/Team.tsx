import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  CreditCard as Edit2,
  Shield,
  AlertCircle,
  Trash2,
  BadgeCheck,
  BadgeX,
  Crown,
  UserCog,
  User,
  X,
} from 'lucide-react';
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

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-700';
    case 'manager':
      return 'bg-blue-100 text-blue-700';
    case 'staff':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function getRoleLabel(role: string) {
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
}

function getRoleIcon(role: string) {
  switch (role) {
    case 'owner':
      return <Crown className="h-3.5 w-3.5" />;
    case 'manager':
      return <UserCog className="h-3.5 w-3.5" />;
    case 'staff':
      return <User className="h-3.5 w-3.5" />;
    default:
      return <Users className="h-3.5 w-3.5" />;
  }
}

function getInitials(name: string | null, email: string) {
  if (name?.trim()) {
    return name
      .trim()
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  return email.slice(0, 2).toUpperCase();
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
        setOwnerCount(0);
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

  if (!isOwner) {
    return (
      <div className="w-full max-w-full space-y-6 pb-4">
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-yellow-100 p-2 text-yellow-700">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-yellow-900">Acesso restrito</h3>
              <p className="mt-1 text-sm text-yellow-800">
                Apenas proprietários podem acessar o gerenciamento de equipe.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isAtUserLimit = activeUserCount >= userLimit;
  const inactiveCount = teamMembers.filter((m) => !m.is_active).length;

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <Users className="h-4 w-4" />
              Gestão de Equipe
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Equipe
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Gerencie os membros da sua equipe e suas permissões.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Usuários ativos:{' '}
              <span className="font-semibold text-gray-800">{activeUserCount}</span> de{' '}
              <span className="font-semibold text-gray-800">
                {userLimit === 999 ? 'ilimitado' : userLimit}
              </span>
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            disabled={isAtUserLimit}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-sm transition sm:w-auto ${
              isAtUserLimit
                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                : 'bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-700 hover:to-orange-600'
            }`}
            title={
              isAtUserLimit
                ? `Limite de ${userLimit} usuários atingido`
                : 'Adicionar novo membro'
            }
          >
            <Plus className="h-5 w-5" />
            Adicionar Membro
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Membros ativos
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{activeUserCount}</div>
            </div>
            <div className="rounded-2xl bg-green-50 p-3 text-green-600">
              <BadgeCheck className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Proprietários
              </div>
              <div className="mt-2 text-2xl font-bold text-purple-600">{ownerCount}</div>
            </div>
            <div className="rounded-2xl bg-purple-50 p-3 text-purple-600">
              <Crown className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Inativos
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-700">{inactiveCount}</div>
            </div>
            <div className="rounded-2xl bg-gray-100 p-3 text-gray-600">
              <BadgeX className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {isAtUserLimit && (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-yellow-100 p-2 text-yellow-700">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-yellow-900">
                Limite de usuários atingido
              </p>
              <p className="mt-1 text-sm text-yellow-800">
                Seu plano atual permite até {userLimit} usuários ativos. Faça upgrade
                para adicionar mais membros à sua equipe.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
            <p className="text-sm font-medium text-gray-500">Carregando equipe...</p>
          </div>
        </div>
      ) : teamMembers.length === 0 ? (
        <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Users className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Nenhum membro na equipe</h3>
          <p className="mt-2 text-sm text-gray-500">
            Comece adicionando membros para operar sua loja.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
          >
            <Plus className="h-5 w-5" />
            Adicionar Primeiro Membro
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
              >
                <div className="border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700">
                      {getInitials(member.full_name, member.email)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold text-gray-900">
                        {member.full_name || 'Sem nome'}
                      </h3>
                      <p className="truncate text-sm text-gray-500">{member.email}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${getRoleBadgeColor(
                            member.role
                          )}`}
                        >
                          {getRoleIcon(member.role)}
                          {getRoleLabel(member.role)}
                        </span>

                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            member.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {member.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {member.user_id !== user?.id && (
                  <div className="grid grid-cols-2 gap-2 p-4">
                    <button
                      onClick={() => setEditingMember(member)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      <Edit2 className="h-4 w-4" />
                      Editar
                    </button>

                    <button
                      onClick={() => setRemovingMember(member)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Membro
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Papel
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {teamMembers.map((member) => (
                    <tr key={member.id} className="transition hover:bg-gray-50/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700">
                            {getInitials(member.full_name, member.email)}
                          </div>

                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">
                              {member.full_name || 'Sem nome'}
                            </div>
                            <div className="text-sm text-gray-500">{member.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getRoleBadgeColor(
                            member.role
                          )}`}
                        >
                          {getRoleIcon(member.role)}
                          {getRoleLabel(member.role)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            member.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {member.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {member.user_id !== user?.id && (
                            <>
                              <button
                                onClick={() => setEditingMember(member)}
                                className="rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                                title="Editar papel"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => setRemovingMember(member)}
                                className="rounded-xl p-2 text-red-600 transition hover:bg-red-50"
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
          </div>
        </>
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
  effectivePlan,
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Adicionar Membro</h2>
            <p className="mt-1 text-sm text-gray-500">
              Cadastre um novo membro para sua equipe.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Senha Temporária
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                minLength={6}
                required
              />
              <p className="mt-2 text-xs text-gray-500">Mínimo de 6 caracteres</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Papel</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'owner' | 'manager' | 'staff')}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
              >
                <option value="staff">Atendente (apenas PDV e mesas)</option>
                <option value="manager">Gerente (acesso operacional completo)</option>
                <option value="owner" disabled={isOwnerLimitReached}>
                  Proprietário (acesso total){' '}
                  {isOwnerLimitReached
                    ? `- Limite atingido (${maxOwners})`
                    : `- ${currentOwnerCount}/${maxOwners}`}
                </option>
              </select>

              {isOwnerLimitReached && role === 'owner' && (
                <p className="mt-2 text-xs text-yellow-600">
                  Limite de proprietários atingido para o plano {effectivePlan}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                disabled={loading}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600 disabled:opacity-50"
                disabled={loading || (role === 'owner' && isOwnerLimitReached)}
              >
                {loading ? 'Criando...' : 'Criar Membro'}
              </button>
            </div>
          </form>
        </div>
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
  effectivePlan,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Editar Papel</h2>
            <p className="mt-1 text-sm text-gray-500">Atualize a função do membro na equipe.</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4 rounded-2xl bg-gray-50 p-4">
            <p className="text-sm text-gray-600">Membro:</p>
            <p className="font-semibold text-gray-900">{member.full_name || member.email}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Papel</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'owner' | 'manager' | 'staff')}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
              >
                <option value="staff">Atendente (apenas PDV e mesas)</option>
                <option value="manager">Gerente (acesso operacional completo)</option>
                <option
                  value="owner"
                  disabled={member.role !== 'owner' && currentOwnerCount >= maxOwners}
                >
                  Proprietário (acesso total){' '}
                  {member.role !== 'owner'
                    ? currentOwnerCount >= maxOwners
                      ? `- Limite atingido (${maxOwners})`
                      : `- ${currentOwnerCount}/${maxOwners}`
                    : ''}
                </option>
              </select>

              {wouldExceedOwnerLimit && (
                <p className="mt-2 text-xs text-yellow-600">
                  Limite de proprietários atingido para o plano {effectivePlan}. Rebaixe outro
                  proprietário primeiro.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                disabled={loading}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600 disabled:opacity-50"
                disabled={loading || wouldExceedOwnerLimit}
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Remover Membro</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <p className="mb-4 text-gray-700">
              Tem certeza que deseja remover{' '}
              <span className="font-semibold">{member.full_name || member.email}</span> da equipe?
            </p>

            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-semibold text-yellow-900">Esta ação irá:</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-yellow-800">
                <li>Remover completamente o acesso do membro a esta loja</li>
                <li>O membro não poderá mais fazer login nesta loja</li>
                <li>Esta ação não pode ser desfeita</li>
              </ul>
            </div>

            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-sm text-gray-600">Email:</p>
              <p className="font-medium text-gray-900">{member.email}</p>

              <p className="mt-3 text-sm text-gray-600">Papel atual:</p>
              <p className="font-medium text-gray-900">{getRoleLabel(member.role)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Removendo...' : 'Remover Membro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
