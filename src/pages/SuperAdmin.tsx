import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield,
  Store,
  Users,
  CreditCard,
  TrendingUp,
  Search,
  ExternalLink,
  Loader2,
  AlertCircle,
  Ban,
  Clock,
  ArrowRight,
  Gift,
  RefreshCcw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/formatters';
import { getAllPlans, calculateMRRFromPlans } from '../lib/planPricing';
import StoreDetailsModal from '../components/StoreDetailsModal';

interface StoreData {
  id: string;
  name: string;
  owner_id: string;
  plan: 'starter' | 'professional' | 'premium';
  subscription_status: string;
  plan_name: string | null;
  created_at: string;
  subscription_ends_at?: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_blocked: boolean;
  owner_email?: string;
  access_mode?: string | null;
}

interface DashboardStats {
  totalStores: number;
  totalUsers: number;
  activeSubscriptions: number;
  trialStores: number;
  expiredStores: number;
  storesByPlan: {
    starter: number;
    professional: number;
    premium: number;
  };
  mrr: number;
}

function truncateStripeId(value: string | null, start = 8, end = 4) {
  if (!value) return '—';
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatDateBR(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { profile, startSupportMode } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalStores: 0,
    totalUsers: 0,
    activeSubscriptions: 0,
    trialStores: 0,
    expiredStores: 0,
    storesByPlan: {
      starter: 0,
      professional: 0,
      premium: 0,
    },
    mrr: 0,
  });

  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [accessingStore, setAccessingStore] = useState<string | null>(null);
  const [syncingStore, setSyncingStore] = useState<string | null>(null);
  const [cancellingStore, setCancellingStore] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [storesResult, usersResult] = await Promise.all([
        supabase.from('stores').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ]);

      if (storesResult.error) throw storesResult.error;
      if (usersResult.error) throw usersResult.error;

      const storesData = (storesResult.data || []) as StoreData[];

      const storesWithOwnerEmails = await Promise.all(
        storesData.map(async (store) => {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', store.owner_id)
            .maybeSingle();

          return {
            ...store,
            owner_email: ownerProfile?.email || 'N/A',
          };
        })
      );

      const activeSubscriptions = storesData.filter(
        (s) => s.subscription_status === 'active' && !s.is_blocked
      ).length;

      const trialStores = storesData.filter((s) => s.subscription_status === 'trial').length;

      const expiredStores = storesData.filter(
        (s) => s.subscription_status === 'cancelled' || s.subscription_status === 'overdue'
      ).length;

      const storesByPlan = {
        starter: storesData.filter((s) => s.plan === 'starter').length,
        professional: storesData.filter((s) => s.plan === 'professional').length,
        premium: storesData.filter((s) => s.plan === 'premium').length,
      };

      const plans = await getAllPlans();
      const mrr = calculateMRRFromPlans(storesData, plans);

      setStats({
        totalStores: storesData.length,
        totalUsers: usersResult.count || 0,
        activeSubscriptions,
        trialStores,
        expiredStores,
        storesByPlan,
        mrr,
      });

      setStores(storesWithOwnerEmails);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Erro ao carregar dados do dashboard. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const filteredStores = stores.filter(
    (store) =>
      store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.owner_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string, isBlocked?: boolean) => {
    if (isBlocked) return 'bg-red-100 text-red-800 border-red-200';

    const badges = {
      active: 'bg-green-100 text-green-800 border-green-200',
      trial: 'bg-blue-100 text-blue-800 border-blue-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
      overdue: 'bg-red-100 text-red-800 border-red-200',
      past_due: 'bg-orange-100 text-orange-800 border-orange-200',
    };

    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusText = (status: string, isBlocked?: boolean) => {
    if (isBlocked) return 'Bloqueada';

    const texts = {
      active: 'Ativa',
      trial: 'Trial',
      cancelled: 'Cancelada',
      overdue: 'Vencida',
      past_due: 'Pendente',
    };

    return texts[status as keyof typeof texts] || status;
  };

  const getPlanLabel = (plan: string | null, planName: string | null) => {
    if (planName) return planName;

    const planLabels: Record<string, string> = {
      starter: 'Starter',
      professional: 'Professional',
      premium: 'Premium',
    };

    return planLabels[plan || ''] || plan || 'Starter';
  };

  const hasStripeCustomer = (store: StoreData) =>
    Boolean(store.stripe_customer_id && store.stripe_customer_id.trim());

  const hasStripeSubscription = (store: StoreData) =>
    Boolean(store.stripe_subscription_id && store.stripe_subscription_id.trim());

  const isPaidStore = (store: StoreData) => store.access_mode === 'paid';

  const canSyncStripe = (store: StoreData) => {
    if (!isPaidStore(store)) return false;
    return hasStripeCustomer(store) || hasStripeSubscription(store);
  };

  const canCancelStripe = (store: StoreData) => {
    if (!isPaidStore(store)) return false;
    if (!hasStripeSubscription(store)) return false;
    if (store.is_blocked) return false;

    return ['active', 'trial', 'past_due'].includes(store.subscription_status);
  };

  const handleAccessStore = async (storeId: string) => {
    try {
      setAccessingStore(storeId);
      await startSupportMode(storeId);
      navigate('/app/dashboard');
    } catch (error) {
      console.error('Erro ao acessar loja:', error);
      setAccessingStore(null);
    }
  };

  const handleSyncSubscription = async (storeId: string) => {
    try {
      setSyncingStore(storeId);

      const { error } = await supabase.functions.invoke('admin-sync-subscription', {
        body: { storeId },
      });

      if (error) {
        console.error('Erro ao sincronizar assinatura:', error);
        alert('Erro ao sincronizar assinatura com Stripe.');
        return;
      }

      alert('Assinatura sincronizada com sucesso.');
      await loadDashboardData();
    } catch (err) {
      console.error('Erro inesperado ao sincronizar assinatura:', err);
      alert('Erro inesperado ao sincronizar assinatura.');
    } finally {
      setSyncingStore(null);
    }
  };

  const handleCancelSubscription = async (storeId: string) => {
    const confirmed = window.confirm(
      'Deseja cancelar a assinatura no fim do ciclo atual?'
    );
    if (!confirmed) return;

    try {
      setCancellingStore(storeId);

      const { error } = await supabase.functions.invoke('admin-cancel-subscription', {
        body: { storeId },
      });

      if (error) {
        console.error('Erro ao cancelar assinatura:', error);
        alert('Erro ao cancelar assinatura.');
        return;
      }

      alert('Cancelamento agendado com sucesso.');
      await loadDashboardData();
    } catch (err) {
      console.error('Erro inesperado ao cancelar assinatura:', err);
      alert('Erro inesperado ao cancelar assinatura.');
    } finally {
      setCancellingStore(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <Shield className="h-4 w-4" />
              Administração Global
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Super Admin
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Visão global da plataforma, assinaturas e acesso às lojas.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-600 to-purple-800 p-6 text-white shadow-lg">
        <div className="mb-2 flex items-center gap-3">
          <Shield className="h-8 w-8" />
          <h2 className="text-2xl font-bold">Super Admin</h2>
        </div>
        <p className="text-purple-100">
          Você tem acesso global à plataforma. Use com responsabilidade.
        </p>
        <div className="mt-4 text-sm text-purple-100">
          <strong>Email:</strong> {profile?.email}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-2xl bg-blue-50 p-3">
              <Store className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mb-1 text-2xl font-bold text-gray-900">{stats.totalStores}</div>
          <div className="text-sm text-gray-600">Total de Lojas</div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-2xl bg-green-50 p-3">
              <Users className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mb-1 text-2xl font-bold text-gray-900">{stats.totalUsers}</div>
          <div className="text-sm text-gray-600">Total de Usuários</div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <CreditCard className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <div className="mb-1 text-2xl font-bold text-gray-900">
            {stats.activeSubscriptions}
          </div>
          <div className="text-sm text-gray-600">Assinaturas Ativas</div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-2xl bg-green-50 p-3">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mb-1 text-2xl font-bold text-gray-900">
            {formatCurrency(stats.mrr)}
          </div>
          <div className="text-sm text-gray-600">MRR</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-2xl bg-blue-50 p-3">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mb-1 text-2xl font-bold text-gray-900">{stats.trialStores}</div>
          <div className="text-sm text-gray-600">Lojas em Trial</div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-2xl bg-red-50 p-3">
              <Ban className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <div className="mb-1 text-2xl font-bold text-gray-900">{stats.expiredStores}</div>
          <div className="text-sm text-gray-600">Canceladas/Vencidas</div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 text-sm font-medium text-gray-600">Lojas por Plano</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Starter</span>
              <span className="text-sm font-semibold text-gray-900">
                {stats.storesByPlan.starter}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Professional</span>
              <span className="text-sm font-semibold text-gray-900">
                {stats.storesByPlan.professional}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Premium</span>
              <span className="text-sm font-semibold text-gray-900">
                {stats.storesByPlan.premium}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-5 shadow-sm">
          <div className="mb-4 text-sm font-medium text-gray-600">
            Receita Mensal Recorrente
          </div>
          <div className="mb-2 text-3xl font-bold text-green-700">
            {formatCurrency(stats.mrr)}
          </div>
          <div className="text-xs text-gray-600">
            {stats.activeSubscriptions} assinaturas ativas
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Lojas Cadastradas</h3>
              <p className="mt-1 text-sm text-gray-500">
                Gerencie assinaturas, acesso e detalhes administrativos.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-primary sm:w-80"
              />
            </div>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead className="bg-gray-50/80">
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Loja
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Proprietário
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Plano
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Stripe
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Válida até
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Criada em
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                    {searchTerm
                      ? 'Nenhuma loja encontrada com esse filtro.'
                      : 'Nenhuma loja cadastrada ainda.'}
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => (
                  <tr key={store.id} className="transition hover:bg-gray-50/80">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-900">{store.name}</div>
                        {store.is_blocked && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                            Bloqueada
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{store.owner_email}</div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadge(
                          store.subscription_status,
                          store.is_blocked
                        )}`}
                      >
                        {getStatusText(store.subscription_status, store.is_blocked)}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {getPlanLabel(store.plan, store.plan_name)}
                        </span>

                        {store.access_mode === 'manual' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                            <Gift className="h-3 w-3" />
                            Manual
                          </span>
                        )}

                        {store.access_mode === 'paid' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            <CreditCard className="h-3 w-3" />
                            Pago
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="min-w-[36px] font-medium text-gray-600">Cus:</span>
                          {hasStripeCustomer(store) ? (
                            <span
                              className="inline-flex rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700"
                              title={store.stripe_customer_id || ''}
                            >
                              {truncateStripeId(store.stripe_customer_id)}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                              Não vinculado
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="min-w-[36px] font-medium text-gray-600">Sub:</span>
                          {hasStripeSubscription(store) ? (
                            <span
                              className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700"
                              title={store.stripe_subscription_id || ''}
                            >
                              {truncateStripeId(store.stripe_subscription_id)}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                              Não vinculada
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {formatDateBR(store.subscription_ends_at)}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {new Date(store.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => handleAccessStore(store.id)}
                          disabled={accessingStore === store.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-400"
                          title="Acessar loja em modo suporte"
                        >
                          {accessingStore === store.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Acessando...</span>
                            </>
                          ) : (
                            <>
                              <ArrowRight className="h-4 w-4" />
                              <span>Acessar</span>
                            </>
                          )}
                        </button>

                        {canSyncStripe(store) && (
                          <button
                            onClick={() => handleSyncSubscription(store.id)}
                            disabled={syncingStore === store.id}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Sincronizar assinatura com Stripe"
                          >
                            {syncingStore === store.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Sync...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCcw className="h-4 w-4" />
                                <span>Sync Stripe</span>
                              </>
                            )}
                          </button>
                        )}

                        {canCancelStripe(store) && (
                          <button
                            onClick={() => handleCancelSubscription(store.id)}
                            disabled={cancellingStore === store.id}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Cancelar assinatura no fim do ciclo"
                          >
                            {cancellingStore === store.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Cancelando...</span>
                              </>
                            ) : (
                              <>
                                <Ban className="h-4 w-4" />
                                <span>Cancelar</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedStoreId(store.id)}
                          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-800"
                          title="Ver detalhes completos"
                        >
                          <span>Detalhes</span>
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          {filteredStores.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-500">
              {searchTerm
                ? 'Nenhuma loja encontrada com esse filtro.'
                : 'Nenhuma loja cadastrada ainda.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredStores.map((store) => (
                <div key={store.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-semibold text-gray-900">{store.name}</h4>
                      <p className="mt-0.5 truncate text-sm text-gray-600">
                        {store.owner_email}
                      </p>
                    </div>

                    {store.is_blocked && (
                      <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Bloqueada
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadge(
                        store.subscription_status,
                        store.is_blocked
                      )}`}
                    >
                      {getStatusText(store.subscription_status, store.is_blocked)}
                    </span>

                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                      {getPlanLabel(store.plan, store.plan_name)}
                    </span>

                    {store.access_mode === 'manual' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                        <Gift className="h-3 w-3" />
                        Manual
                      </span>
                    )}

                    {store.access_mode === 'paid' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <CreditCard className="h-3 w-3" />
                        Pago
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 rounded-2xl bg-gray-50 p-3 text-xs text-gray-600">
                    <div>
                      <div className="mb-1 font-semibold text-gray-700">Stripe Customer</div>
                      {hasStripeCustomer(store) ? (
                        <span
                          className="inline-flex rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700"
                          title={store.stripe_customer_id || ''}
                        >
                          {truncateStripeId(store.stripe_customer_id)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                          Não vinculado
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-gray-700">Stripe Subscription</div>
                      {hasStripeSubscription(store) ? (
                        <span
                          className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700"
                          title={store.stripe_subscription_id || ''}
                        >
                          {truncateStripeId(store.stripe_subscription_id)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                          Não vinculada
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-gray-700">Válida até</div>
                      <div>{formatDateBR(store.subscription_ends_at)}</div>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-gray-700">Criada em</div>
                      <div>{new Date(store.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleAccessStore(store.id)}
                      disabled={accessingStore === store.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-400"
                    >
                      {accessingStore === store.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Acessando...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="h-4 w-4" />
                          <span>Acessar</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedStoreId(store.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Detalhes</span>
                    </button>

                    {canSyncStripe(store) && (
                      <button
                        onClick={() => handleSyncSubscription(store.id)}
                        disabled={syncingStore === store.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {syncingStore === store.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Sync...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCcw className="h-4 w-4" />
                            <span>Sync Stripe</span>
                          </>
                        )}
                      </button>
                    )}

                    {canCancelStripe(store) && (
                      <button
                        onClick={() => handleCancelSubscription(store.id)}
                        disabled={cancellingStore === store.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancellingStore === store.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Cancelando...</span>
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4" />
                            <span>Cancelar</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="mb-4 text-base font-bold text-gray-900 sm:text-lg">
          Status de Implementação
        </h3>

        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-700">Listagem de Lojas</span>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-700">Estatísticas Globais</span>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-700">
                Detalhes da Loja (view completa + ações administrativas)
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-700">MRR Real e Métricas Comerciais</span>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-700">Modo Suporte para Lojas</span>
            </div>
          </div>

          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="font-medium text-gray-700">Gerenciamento de Assinaturas</span>
              </div>
              <p className="ml-5 text-sm text-gray-600">
                Integração administrativa com Stripe parcialmente implementada:
                sincronização e cancelamento já funcionam. Ainda faltam histórico de
                pagamentos, reembolsos, reativação e gestão avançada.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-gray-700">
                Analytics e Relatórios Globais (não implementado)
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-yellow-600" />
          <div>
            <h4 className="font-semibold text-yellow-900">Importante</h4>
            <p className="mt-1 text-sm text-yellow-800">
              Como Super Admin, você tem acesso irrestrito à plataforma. Tenha cuidado
              ao fazer alterações que possam afetar as lojas dos clientes.
            </p>
          </div>
        </div>
      </div>

      {selectedStoreId && (
        <StoreDetailsModal
          storeId={selectedStoreId}
          onClose={() => setSelectedStoreId(null)}
          onUpdate={loadDashboardData}
        />
      )}
    </div>
  );
}
