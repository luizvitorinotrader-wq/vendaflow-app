import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Store, Users, CreditCard, TrendingUp, Search, ExternalLink, Loader2, AlertCircle, Ban, Clock, ArrowRight, Gift } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/formatters';
import { getAllPlans, calculateMRRFromPlans } from '../lib/planPricing';
import StoreDetailsModal from '../components/StoreDetailsModal';
import type { Database } from '../lib/database.types';

interface StoreData {
  id: string;
  name: string;
  owner_id: string;
  plan: 'starter' | 'professional' | 'premium';
  subscription_status: string;
  plan_name: string | null;
  created_at: string;
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
    mrr: 0
  });
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [accessingStore, setAccessingStore] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [storesResult, usersResult] = await Promise.all([
        supabase
          .from('stores')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
      ]);

      if (storesResult.error) throw storesResult.error;
      if (usersResult.error) throw usersResult.error;

      const storesData = storesResult.data || [];

      const storesWithOwnerEmails = await Promise.all(
        storesData.map(async (store) => {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', store.owner_id)
            .maybeSingle();

          return {
            ...store,
            owner_email: ownerProfile?.email || 'N/A'
          };
        })
      );

      const activeSubscriptions = storesData.filter(
        s => s.subscription_status === 'active' && !s.is_blocked
      ).length;

      const trialStores = storesData.filter(
        s => s.subscription_status === 'trial'
      ).length;

      const expiredStores = storesData.filter(
        s => s.subscription_status === 'cancelled' || s.subscription_status === 'overdue'
      ).length;

      const storesByPlan = {
        starter: storesData.filter(s => s.plan === 'starter').length,
        professional: storesData.filter(s => s.plan === 'professional').length,
        premium: storesData.filter(s => s.plan === 'premium').length,
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
        mrr
      });

      setStores(storesWithOwnerEmails);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Erro ao carregar dados do dashboard. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const filteredStores = stores.filter(store =>
    store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.owner_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-800 border-green-200',
      trial: 'bg-blue-100 text-blue-800 border-blue-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
      overdue: 'bg-red-100 text-red-800 border-red-200'
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800 border-gray-200';
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Visão global da plataforma
        </p>
      </div>

      <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8" />
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-lg bg-blue-50">
              <Store className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{stats.totalStores}</div>
          <div className="text-xs sm:text-sm text-gray-600">Total de Lojas</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-lg bg-green-50">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{stats.totalUsers}</div>
          <div className="text-xs sm:text-sm text-gray-600">Total de Usuários</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-lg bg-emerald-50">
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{stats.activeSubscriptions}</div>
          <div className="text-xs sm:text-sm text-gray-600">Assinaturas Ativas</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-lg bg-green-50">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
            {formatCurrency(stats.mrr)}
          </div>
          <div className="text-xs sm:text-sm text-gray-600">MRR</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-lg bg-blue-50">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{stats.trialStores}</div>
          <div className="text-xs sm:text-sm text-gray-600">Lojas em Trial</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-lg bg-red-50">
              <Ban className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{stats.expiredStores}</div>
          <div className="text-xs sm:text-sm text-gray-600">Canceladas/Vencidas</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
          <div className="mb-3 sm:mb-4">
            <div className="text-xs sm:text-sm font-medium text-gray-600 mb-2">Lojas por Plano</div>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-600">Starter</span>
              <span className="text-xs sm:text-sm font-semibold text-gray-900">{stats.storesByPlan.starter}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-600">Professional</span>
              <span className="text-xs sm:text-sm font-semibold text-gray-900">{stats.storesByPlan.professional}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-600">Premium</span>
              <span className="text-xs sm:text-sm font-semibold text-gray-900">{stats.storesByPlan.premium}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm p-4 sm:p-6 border border-green-200">
          <div className="mb-3 sm:mb-4">
            <div className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Receita Mensal Recorrente</div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-700 mb-2">
            {formatCurrency(stats.mrr)}
          </div>
          <div className="text-xs text-gray-600">
            {stats.activeSubscriptions} assinaturas ativas
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-bold text-gray-900">Lojas Cadastradas</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent w-full sm:w-80"
              />
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Loja
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proprietário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plano
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Criada em
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Nenhuma loja encontrada com esse filtro.' : 'Nenhuma loja cadastrada ainda.'}
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => (
                  <tr key={store.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900">{store.name}</div>
                        {store.is_blocked && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                            Bloqueada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{store.owner_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusBadge(store.subscription_status)}`}>
                        {getStatusText(store.subscription_status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900 capitalize">
                          {store.plan_name || 'Starter'}
                        </span>
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
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(store.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleAccessStore(store.id)}
                          disabled={accessingStore === store.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                          title="Acessar loja em modo suporte"
                        >
                          {accessingStore === store.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Acessando...</span>
                            </>
                          ) : (
                            <>
                              <ArrowRight className="w-4 h-4" />
                              <span>Acessar Loja</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setSelectedStoreId(store.id)}
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          title="Ver detalhes completos"
                        >
                          <span>Detalhes</span>
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden">
          {filteredStores.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              {searchTerm ? 'Nenhuma loja encontrada com esse filtro.' : 'Nenhuma loja cadastrada ainda.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredStores.map((store) => (
                <div key={store.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">{store.name}</h4>
                      <p className="text-sm text-gray-600 truncate mt-0.5">{store.owner_email}</p>
                    </div>
                    {store.is_blocked && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full flex-shrink-0">
                        Bloqueada
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusBadge(store.subscription_status)}`}>
                      {getStatusText(store.subscription_status)}
                    </span>
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded capitalize">
                      {store.plan_name || 'Starter'}
                    </span>
                    {store.access_mode === 'manual' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                        <Gift className="h-3 w-3" />
                        Manual
                      </span>
                    )}
                    {store.access_mode === 'paid' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                        <CreditCard className="h-3 w-3" />
                        Pago
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-500">
                    Criada em {new Date(store.created_at).toLocaleDateString('pt-BR')}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => handleAccessStore(store.id)}
                      disabled={accessingStore === store.id}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                    >
                      {accessingStore === store.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Acessando...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          <span>Acessar</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedStoreId(store.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Detalhes</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">Status de Implementação</h3>
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-700">Listagem de Lojas</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-700">Estatísticas Globais</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-700">Detalhes da Loja (view completa + ações administrativas)</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-700">MRR Real e Métricas Comerciais</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-700">Modo Suporte para Lojas</span>
          </div>
          <div className="flex flex-col gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span className="text-gray-700 font-medium">Gerenciamento de Assinaturas</span>
            </div>
            <p className="text-sm text-gray-600 ml-5">
              Gerenciamento manual de planos funcionando. Falta integração administrativa com Stripe (cancelamento, histórico de pagamentos, reembolsos e gestão avançada).
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span className="text-gray-700">Analytics e Relatórios Globais (não implementado)</span>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-900">Importante</h4>
            <p className="text-sm text-yellow-800 mt-1">
              Como Super Admin, você tem acesso irrestrito à plataforma. Tenha cuidado ao fazer alterações que possam afetar as lojas dos clientes.
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
