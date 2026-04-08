import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Search, Store, Calendar, Ban, CheckCircle, CreditCard as Edit3, X } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';
import { logAuditEvent } from '../lib/auditLogger';

type Store = Database['public']['Tables']['stores']['Row'];
type SupportSession = Database['public']['Tables']['admin_support_sessions']['Row'] & {
  stores: Store | null;
};

export default function Admin() {
  const { isSuperAdmin, startSupportMode, user } = useAuth();
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState<string>('');
  const [supportSessions, setSupportSessions] = useState<SupportSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // CRITICAL: Only super_admin role should access this legacy admin page
    if (!isSuperAdmin) {
      navigate('/app/dashboard', { replace: true });
      return;
    }
  }, [isSuperAdmin, navigate]);

  useEffect(() => {
    fetchStores();
    fetchSupportSessions();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredStores(stores);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredStores(
        stores.filter(
          (store) =>
            store.name.toLowerCase().includes(query) ||
            (store.phone && store.phone.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, stores]);

  const fetchStores = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setStores(data);
      setFilteredStores(data);
    }
    setLoading(false);
  };

  const fetchSupportSessions = async () => {
    setLoadingSessions(true);
    const { data, error } = await supabase
      .from('admin_support_sessions')
      .select('*, stores(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      logger.log('Sessões de suporte carregadas');
      setSupportSessions(data);
    }
    setLoadingSessions(false);
  };

  const showSuccessMessage = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleEndSession = async (sessionId: string) => {
    await supabase
      .from('admin_support_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    logger.log('Sessão encerrada');

    await logAuditEvent({
      eventType: 'support_mode_ended',
      eventStatus: 'success',
      metadata: {
        session_id: sessionId,
      },
    });

    await fetchSupportSessions();
    showSuccessMessage('Sessão de suporte encerrada com sucesso');
  };

  const handleEndAllSessions = async () => {
    if (!user) return;

    await supabase
      .from('admin_support_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
      })
      .eq('admin_user_id', user.id)
      .eq('is_active', true);

    logger.log('Todas as sessões encerradas');
    await fetchSupportSessions();
    showSuccessMessage('Todas as sessões de suporte foram encerradas');
  };

  const updateStore = async (storeId: string, updates: Partial<Store>) => {
    const { error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', storeId);

    if (!error) {
      await fetchStores();
    }
  };

  const handleExtend30Days = async (storeId: string) => {
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 30);

    await updateStore(storeId, {
      subscription_status: 'active',
      subscription_ends_at: newEndDate.toISOString(),
      is_blocked: false,
    });
  };

  const handleSetTrial = async (storeId: string) => {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    await updateStore(storeId, {
      subscription_status: 'trial',
      trial_ends_at: trialEndDate.toISOString(),
      is_blocked: false,
    });
  };

  const handleBlock = async (storeId: string) => {
    await updateStore(storeId, {
      is_blocked: true,
      subscription_status: 'cancelled',
    });
  };

  const handleUnblock = async (storeId: string) => {
    await updateStore(storeId, {
      is_blocked: false,
    });
  };

  const handleChangePlan = async (storeId: string, plan: string) => {
    const planNames: Record<string, string> = {
      starter: 'Plano Starter',
      professional: 'Plano Profissional',
      premium: 'Plano Premium',
    };

    await updateStore(storeId, {
      plan,
      plan_name: planNames[plan],
    });
    setEditingPlan(null);
  };

  const handleAccessStore = async (storeId: string) => {
    await startSupportMode(storeId);

    await logAuditEvent({
      eventType: 'support_mode_started',
      eventStatus: 'success',
      metadata: {
        target_store_id: storeId,
      },
    });

    navigate('/app/dashboard');
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const formatDateTime = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (store: Store) => {
    if (store.is_blocked) {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          Bloqueada
        </span>
      );
    }

    const status = store.subscription_status;
    if (status === 'active') {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          Ativa
        </span>
      );
    }
    if (status === 'trial') {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Trial
        </span>
      );
    }
    if (status === 'overdue') {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
          Vencida
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          Cancelada
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
        {status}
      </span>
    );
  };

  const totalStores = stores.length;
  const activeStores = stores.filter((s) => s.subscription_status === 'active' && !s.is_blocked).length;
  const trialStores = stores.filter((s) => s.subscription_status === 'trial' && !s.is_blocked).length;
  const overdueStores = stores.filter(
    (s) => s.subscription_status === 'overdue' || s.subscription_status === 'cancelled'
  ).length;
  const blockedStores = stores.filter((s) => s.is_blocked).length;

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo SaaS</h1>
        <p className="text-gray-600 mt-1">Gerencie todas as lojas, planos e assinaturas do sistema</p>
      </div>

      {successMessage && (
        <div className="mb-6 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
          <span className="block sm:inline">{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total de Lojas</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalStores}</p>
            </div>
            <Store className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Lojas Ativas</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{activeStores}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Lojas em Trial</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{trialStores}</p>
            </div>
            <Calendar className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Lojas Vencidas</p>
              <p className="text-3xl font-bold text-orange-600 mt-2">{overdueStores}</p>
            </div>
            <Calendar className="w-8 h-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Lojas Bloqueadas</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{blockedStores}</p>
            </div>
            <Ban className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Carregando...</div>
          ) : filteredStores.length === 0 ? (
            <div className="p-12 text-center text-gray-500">Nenhuma loja encontrada</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loja
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Telefone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cidade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plano
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trial até
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assinatura até
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bloqueada
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStores.map((store) => (
                  <tr key={store.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{store.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {store.phone || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {store.address || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPlan === store.id ? (
                        <div className="flex gap-2">
                          <select
                            value={newPlan}
                            onChange={(e) => setNewPlan(e.target.value)}
                            className="text-sm border rounded px-2 py-1"
                          >
                            <option value="starter">Starter</option>
                            <option value="professional">Profissional</option>
                            <option value="premium">Premium</option>
                          </select>
                          <button
                            onClick={() => handleChangePlan(store.id, newPlan)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setEditingPlan(null)}
                            className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900">
                            {store.plan_name || store.plan || '-'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingPlan(store.id);
                              setNewPlan(store.plan || 'starter');
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(store)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(store.trial_ends_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(store.subscription_ends_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {store.is_blocked ? (
                        <span className="text-red-600 font-semibold">Sim</span>
                      ) : (
                        <span className="text-gray-400">Não</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleAccessStore(store.id)}
                          className="text-xs bg-primary text-white px-3 py-1 rounded hover:opacity-90 transition"
                        >
                          Acessar loja
                        </button>
                        <button
                          onClick={() => handleExtend30Days(store.id)}
                          className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition"
                        >
                          Liberar 30 dias
                        </button>
                        <button
                          onClick={() => handleSetTrial(store.id)}
                          className="text-xs bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 transition"
                        >
                          Colocar em Trial
                        </button>
                        {store.is_blocked ? (
                          <button
                            onClick={() => handleUnblock(store.id)}
                            className="text-xs bg-slate-600 text-white px-3 py-1 rounded hover:bg-slate-700 transition"
                          >
                            Desbloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlock(store.id)}
                            className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition"
                          >
                            Bloquear
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mt-8">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Sessões de Suporte</h2>
            <p className="text-sm text-gray-600 mt-1">Monitore e gerencie as sessões de acesso às lojas</p>
          </div>
          <button
            onClick={handleEndAllSessions}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium"
          >
            Encerrar Todas as Sessões
          </button>
        </div>

        <div className="overflow-x-auto">
          {loadingSessions ? (
            <div className="p-12 text-center text-gray-500">Carregando sessões...</div>
          ) : supportSessions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">Nenhuma sessão encontrada</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loja Acessada
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data/Hora do Acesso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {supportSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">
                        {session.stores?.name || 'Loja não encontrada'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(session.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {session.is_active ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Ativa
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          Encerrada
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {session.is_active ? (
                        <button
                          onClick={() => handleEndSession(session.id)}
                          className="flex items-center gap-1 text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition"
                        >
                          <X className="w-3 h-3" />
                          Encerrar
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
