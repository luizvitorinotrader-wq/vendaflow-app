import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CreditCard, Calendar, AlertTriangle, CheckCircle, MessageCircle, Home, Gift, Users, Table2 } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';
import { getPlanLimits } from '../lib/planLimits';

type Store = Database['public']['Tables']['stores']['Row'];

export default function MySubscription() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingCheckout, setProcessingCheckout] = useState(false);

  useEffect(() => {
    fetchStoreData();
  }, []);

  const fetchStoreData = async () => {
    if (!user) return;

    setLoading(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.store_id) {
      const { data: storeData } = await supabase
        .from('stores')
        .select('*')
        .eq('id', profile.store_id)
        .maybeSingle();

      setStore(storeData);
    }

    setLoading(false);
  };

  const getStatusTranslation = (status: string | null) => {
    const translations: Record<string, string> = {
      trial: 'Teste Grátis',
      active: 'Ativa',
      past_due: 'Pagamento pendente',
      overdue: 'Vencida',
      cancelled: 'Cancelada',
    };
    return translations[status || ''] || status || '-';
  };

  const getStatusColor = (status: string | null, isBlocked: boolean) => {
    if (isBlocked) return 'bg-red-100 text-red-800';

    const colors: Record<string, string> = {
      trial: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      past_due: 'bg-orange-100 text-orange-800',
      overdue: 'bg-orange-100 text-orange-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status || ''] || 'bg-gray-100 text-gray-800';
  };

  const getDaysRemaining = () => {
    if (!store) return 0;

    const now = new Date();
    let endDate: Date | null = null;

    if (store.subscription_status === 'trial' && store.trial_ends_at) {
      endDate = new Date(store.trial_ends_at);
    } else if (store.subscription_status === 'active' && store.subscription_ends_at) {
      endDate = new Date(store.subscription_ends_at);
    }

    if (!endDate) return 0;

    const diff = endDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const getStatusMessage = () => {
    if (!store) return '';

    if (store.is_blocked) {
      return 'Sua loja está bloqueada';
    }

    switch (store.subscription_status) {
      case 'trial':
        return 'Seu teste grátis está ativo';
      case 'active':
        return 'Sua assinatura está ativa';
      case 'overdue':
        return 'Sua assinatura venceu';
      case 'cancelled':
        return 'Sua loja está bloqueada';
      default:
        return '';
    }
  };

  const getStatusMessageColor = () => {
    if (!store) return 'bg-gray-100 text-gray-800';

    if (store.is_blocked || store.subscription_status === 'cancelled') {
      return 'bg-red-100 border-red-400 text-red-700';
    }

    switch (store.subscription_status) {
      case 'trial':
        return 'bg-yellow-100 border-yellow-400 text-yellow-700';
      case 'active':
        return 'bg-green-100 border-green-400 text-green-700';
      case 'overdue':
        return 'bg-orange-100 border-orange-400 text-orange-700';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-700';
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getPlanName = (plan: string | null) => {
    const planNames: Record<string, string> = {
      starter: 'Starter',
      pro: 'Pro',
      premium: 'Premium',
    };
    return planNames[plan?.toLowerCase() || ''] || plan || 'Starter';
  };

  const getAccessModeLabel = (accessMode: string | null) => {
    if (accessMode === 'manual') return 'Plano Manual';
    if (accessMode === 'paid') return 'Plano Pago';
    return null;
  };

  const getAccessModeBadge = (accessMode: string | null) => {
    if (accessMode === 'manual') {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (accessMode === 'paid') {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const handleRenewSubscription = async () => {
  try {
    if (!user || processingCheckout) return;

    if (!store?.id) {
      alert("Erro: loja não identificada.");
      return;
    }

    setProcessingCheckout(true);

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      alert("Sessão expirada. Faça login novamente.");
      return;
    }

    const { data, error } = await supabase.functions.invoke("create-checkout-session-v2", {
      body: {
        storeId: store.id,
        plan: store.plan || store.plan_name || 'starter',
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error("Erro ao criar sessão de checkout:", error);
      alert("Não foi possível iniciar o pagamento. Tente novamente.");
      return;
    }

    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert("Não foi possível gerar o link de pagamento.");
    }

  } catch (err: any) {
    console.error("Erro ao renovar assinatura:", err);
    alert("Erro inesperado. Tente novamente.");
  } finally {
    setProcessingCheckout(false);
  }
};

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">Nenhuma assinatura encontrada</p>
        </div>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining();

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Minha Assinatura</h1>
        <p className="text-gray-600 mt-1">Informações do seu plano e acesso</p>
      </div>

      {store.is_blocked && (
        <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-semibold">Acesso bloqueado até regularização</span>
        </div>
      )}

      <div className={`mb-8 border px-6 py-4 rounded-lg ${getStatusMessageColor()} flex items-center gap-3`}>
        {(store.subscription_status === 'active' || store.subscription_status === 'trial') && !store.is_blocked ? (
          <CheckCircle className="w-6 h-6" />
        ) : (
          <AlertTriangle className="w-6 h-6" />
        )}
        <span className="text-lg font-semibold">{getStatusMessage()}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-3">
            <CreditCard className="w-6 h-6 text-primary" />
            <h3 className="text-sm font-medium text-gray-600">Plano Atual</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-2">
            {getPlanName(store.plan)}
          </p>
          {store.access_mode && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${getAccessModeBadge(store.access_mode)}`}>
              {store.access_mode === 'manual' && <Gift className="w-3 h-3" />}
              {store.access_mode === 'paid' && <CreditCard className="w-3 h-3" />}
              {getAccessModeLabel(store.access_mode)}
            </span>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="text-sm font-medium text-gray-600">Status da Assinatura</h3>
          </div>
          <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(store.subscription_status, store.is_blocked)}`}>
            {getStatusTranslation(store.subscription_status)}
          </span>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="w-6 h-6 text-orange-600" />
            <h3 className="text-sm font-medium text-gray-600">Dias Restantes</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Teste Grátis até</h3>
          <p className="text-xl font-semibold text-gray-900">
            {formatDate(store.trial_ends_at)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Assinatura válida até</h3>
          <p className="text-xl font-semibold text-gray-900">
            {formatDate(store.subscription_ends_at)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Benefícios do Plano {getPlanName(store.plan)}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const limits = getPlanLimits(store.plan || 'starter');
            return (
              <>
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Usuários</p>
                    <p className="text-sm text-gray-600">
                      {limits.maxUsers === 999 ? 'Ilimitados' : `Até ${limits.maxUsers} usuários ativos`}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Table2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Mesas/Comandas</p>
                    <p className="text-sm text-gray-600">
                      {limits.hasTablesFeature
                        ? `Até ${limits.maxTables} mesas simultâneas`
                        : 'Disponível em planos Pro e Premium'}
                    </p>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={() => navigate('/app/dashboard')}
          className="flex items-center justify-center gap-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-medium"
        >
          <Home className="w-5 h-5" />
          Voltar ao Dashboard
        </button>

        <button
          className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-medium"
        >
          <MessageCircle className="w-5 h-5" />
          Falar no WhatsApp
        </button>

        <button
          onClick={handleRenewSubscription}
          disabled={processingCheckout}
          className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processingCheckout ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Processando...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Renovar Assinatura
            </>
          )}
        </button>
      </div>
    </div>
  );
}
