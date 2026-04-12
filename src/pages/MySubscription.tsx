import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  CreditCard,
  Calendar,
  AlertTriangle,
  CheckCircle,
  MessageCircle,
  Home,
  Gift,
  Users,
  Table2,
  Crown,
  ShieldCheck,
  Clock3,
  TrendingUp,
} from 'lucide-react';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';
import { getPlanLimits } from '../lib/planLimits';

type Store = Database['public']['Tables']['stores']['Row'];
type CheckoutPlan = 'starter' | 'pro' | 'premium';
type ProcessingAction = 'renew' | 'upgrade' | null;

export default function MySubscription() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<ProcessingAction>(null);

  useEffect(() => {
    fetchStoreData();
  }, [user]);

  const fetchStoreData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('store_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Erro ao buscar perfil:', profileError);
        setStore(null);
        return;
      }

      if (profile?.store_id) {
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('*')
          .eq('id', profile.store_id)
          .maybeSingle();

        if (storeError) {
          console.error('Erro ao buscar loja:', storeError);
          setStore(null);
          return;
        }

        setStore(storeData);
      } else {
        setStore(null);
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar assinatura:', err);
      setStore(null);
    } finally {
      setLoading(false);
    }
  };

  const normalizePlan = (plan: string | null | undefined): CheckoutPlan => {
    const normalized = (plan || '').toLowerCase();

    if (normalized === 'premium') return 'premium';
    if (normalized === 'pro' || normalized === 'professional') return 'pro';
    return 'starter';
  };

  const getPlanName = (plan: string | null) => {
    const planNames: Record<string, string> = {
      starter: 'Starter',
      pro: 'Pro',
      professional: 'Pro',
      premium: 'Premium',
    };
    return planNames[plan?.toLowerCase() || ''] || plan || 'Starter';
  };

  const isBlocked = !!store?.is_blocked;
  const isTrial =
    !!store &&
    !isBlocked &&
    store.subscription_status === 'trial' &&
    !!store.trial_ends_at;

  const isPaid =
    !!store &&
    !isBlocked &&
    store.subscription_status === 'active' &&
    store.access_mode === 'paid' &&
    !!store.subscription_ends_at;

  const isManual =
    !!store &&
    !isBlocked &&
    store.subscription_status === 'active' &&
    store.access_mode === 'manual';

  const isCancelled =
    !!store &&
    (isBlocked ||
      store.subscription_status === 'cancelled' ||
      store.subscription_status === 'overdue' ||
      store.subscription_status === 'past_due');

  const getStatusTranslation = () => {
    if (!store) return '-';
    if (isBlocked) return 'Bloqueada';
    if (isTrial) return 'Teste Grátis';
    if (isPaid || isManual) return 'Ativa';

    const translations: Record<string, string> = {
      trial: 'Teste Grátis',
      active: 'Ativa',
      past_due: 'Pagamento pendente',
      overdue: 'Vencida',
      cancelled: 'Cancelada',
    };

    return translations[store.subscription_status || ''] || store.subscription_status || '-';
  };

  const getStatusColor = () => {
    if (!store) return 'bg-gray-100 text-gray-800';
    if (isBlocked || isCancelled) return 'bg-red-100 text-red-800';
    if (isTrial) return 'bg-yellow-100 text-yellow-800';
    if (isPaid || isManual) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getDaysRemaining = () => {
    if (!store) return 0;

    const now = new Date();
    let endDate: Date | null = null;

    if (isTrial && store.trial_ends_at) {
      endDate = new Date(store.trial_ends_at);
    } else if (isPaid && store.subscription_ends_at) {
      endDate = new Date(store.subscription_ends_at);
    }

    if (!endDate) return 0;

    const diff = endDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const getStatusMessage = () => {
    if (!store) return '';

    if (isBlocked) return 'Sua loja está bloqueada';
    if (isTrial) return 'Seu teste grátis está ativo';
    if (isPaid || isManual) return 'Sua assinatura está ativa';
    if (store.subscription_status === 'past_due') return 'Sua assinatura está com pagamento pendente';
    if (store.subscription_status === 'overdue') return 'Sua assinatura venceu';
    if (store.subscription_status === 'cancelled') return 'Sua assinatura foi cancelada';

    return '';
  };

  const getStatusMessageColor = () => {
    if (!store) return 'bg-gray-100 text-gray-800 border-gray-300';
    if (isBlocked || isCancelled) return 'bg-red-100 border-red-300 text-red-700';
    if (isTrial) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    if (isPaid || isManual) return 'bg-green-100 border-green-300 text-green-700';
    return 'bg-gray-100 border-gray-300 text-gray-700';
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getNextPlan = (plan: string | null | undefined): CheckoutPlan | null => {
    const normalized = normalizePlan(plan);

    if (normalized === 'starter') return 'pro';
    if (normalized === 'pro') return 'premium';
    return null;
  };

  const getUpgradeLabel = (plan: string | null | undefined) => {
    const nextPlan = getNextPlan(plan);
    if (nextPlan === 'pro') return 'Upgrade para Pro';
    if (nextPlan === 'premium') return 'Upgrade para Premium';
    return null;
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

  const startCheckout = async (
    selectedPlan: CheckoutPlan,
    action: Exclude<ProcessingAction, null>
  ) => {
    try {
      if (!user || processingAction !== null) return;

      if (!store?.id) {
        alert('Erro: loja não identificada.');
        return;
      }

      setProcessingAction(action);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Erro ao obter sessão:', sessionError);
        alert('Erro ao validar a sessão. Faça login novamente.');
        return;
      }

      if (!session?.access_token) {
        alert('Sessão expirada. Faça login novamente.');
        return;
      }

      logger.log('[MySubscription] Iniciando checkout', {
        storeId: store.id,
        selectedPlan,
        action,
        hasToken: !!session.access_token,
      });

      const { data, error } = await supabase.functions.invoke('create-checkout-session-v2', {
        body: {
          storeId: store.id,
          plan: selectedPlan,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });

      if (error) {
        console.error('Erro ao criar sessão de checkout:', error);
        alert('Não foi possível iniciar o pagamento. Tente novamente.');
        return;
      }

      logger.log('[MySubscription] Resposta checkout', data);

      if (data?.url && typeof data.url === 'string') {
        window.location.href = data.url;
        return;
      }

      if (data?.error) {
        console.error('Erro retornado pela function:', data.error);
        alert(typeof data.error === 'string' ? data.error : 'Não foi possível gerar o link de pagamento.');
        return;
      }

      alert('Não foi possível gerar o link de pagamento.');
    } catch (err: any) {
      console.error('Erro ao iniciar checkout:', err);
      alert('Erro inesperado. Tente novamente.');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleRenewSubscription = async () => {
    const currentPlan = normalizePlan(store?.plan || store?.plan_name || 'starter');
    await startCheckout(currentPlan, 'renew');
  };

  const handleUpgradeSubscription = async () => {
    const nextPlan = getNextPlan(store?.plan || store?.plan_name);
    if (!nextPlan) {
      alert('Sua loja já está no plano mais alto.');
      return;
    }

    await startCheckout(nextPlan, 'upgrade');
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
          <p className="text-sm font-medium text-gray-500">Carregando assinatura...</p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="w-full max-w-full space-y-6 pb-4">
        <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <CreditCard className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Nenhuma assinatura encontrada</h3>
          <p className="mt-2 text-sm text-gray-500">
            Não localizamos dados de assinatura para esta conta.
          </p>
        </div>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining();
  const limits = getPlanLimits(store.plan || 'starter');
  const upgradeLabel = getUpgradeLabel(store.plan || store.plan_name);
  const hasUpgrade = !!getNextPlan(store.plan || store.plan_name);
  const canRenew =
  store.subscription_status === 'active' &&
  store.access_mode === 'paid';
  const showAccessModeBadge = isPaid || isManual;
  const isAnyProcessing = processingAction !== null;

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <CreditCard className="h-4 w-4" />
              Plano e Acesso
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Minha Assinatura
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Acompanhe plano, status, validade e benefícios da sua assinatura.
            </p>
          </div>
        </div>
      </div>

      {store.is_blocked && (
        <div className="rounded-2xl border border-red-300 bg-red-100 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-200 p-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-900">Acesso bloqueado</p>
              <p className="mt-1 text-sm text-red-800">
                Sua loja está bloqueada até a regularização da assinatura.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-2xl border px-6 py-4 shadow-sm ${getStatusMessageColor()}`}>
        <div className="flex items-center gap-3">
          {(isPaid || isManual || isTrial) && !store.is_blocked ? (
            <CheckCircle className="h-6 w-6" />
          ) : (
            <AlertTriangle className="h-6 w-6" />
          )}
          <span className="text-base font-semibold sm:text-lg">{getStatusMessage()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Plano atual
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {getPlanName(store.plan)}
              </div>
            </div>
            <div className="rounded-2xl bg-purple-50 p-3 text-purple-600">
              <Crown className="h-6 w-6" />
            </div>
          </div>

          {showAccessModeBadge && store.access_mode && (
            <div className="mt-4">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getAccessModeBadge(
                  store.access_mode
                )}`}
              >
                {store.access_mode === 'manual' && <Gift className="h-3 w-3" />}
                {store.access_mode === 'paid' && <CreditCard className="h-3 w-3" />}
                {getAccessModeLabel(store.access_mode)}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status da assinatura
              </div>
              <div className="mt-3">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor()}`}
                >
                  {getStatusTranslation()}
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-green-50 p-3 text-green-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Dias restantes
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
              </div>
            </div>
            <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
              <Clock3 className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-yellow-50 p-3 text-yellow-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Teste grátis até
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900">
                {isTrial ? formatDate(store.trial_ends_at) : '-'}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Assinatura válida até
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900">
                {(isPaid || isManual) ? formatDate(store.subscription_ends_at) : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900">
            Benefícios do Plano {getPlanName(store.plan)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Recursos disponíveis no seu plano atual.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-100 p-2 text-blue-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Usuários</p>
                <p className="mt-1 text-sm text-gray-600">
                  {limits.maxUsers === 999
                    ? 'Ilimitados'
                    : `Até ${limits.maxUsers} usuários ativos`}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-green-100 p-2 text-green-600">
                <Table2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Mesas/Comandas</p>
                <p className="mt-1 text-sm text-gray-600">
                  {limits.hasTablesFeature
                    ? `Até ${limits.maxTables} mesas simultâneas`
                    : 'Disponível em planos Pro e Premium'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          onClick={() => navigate('/app/dashboard')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-700"
        >
          <Home className="h-5 w-5" />
          Voltar ao Dashboard
        </button>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-700">
          <MessageCircle className="h-5 w-5" />
          Falar no WhatsApp
        </button>

        {hasUpgrade && (
          <button
            onClick={handleUpgradeSubscription}
            disabled={isAnyProcessing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processingAction === 'upgrade' ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processando...
              </>
            ) : (
              <>
                <TrendingUp className="h-5 w-5" />
                {upgradeLabel}
              </>
            )}
          </button>
        )}

        {!isTrial && canRenew && (
          <button
            onClick={handleRenewSubscription}
            disabled={isAnyProcessing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processingAction === 'renew' ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processando...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Renovar Assinatura
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
