import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Wallet,
  TrendingUp,
  CreditCard,
  Banknote,
  Smartphone,
  DoorOpen,
  DoorClosed,
  AlertCircle,
  CalendarDays,
  Clock3,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
} from 'lucide-react';
import type { Database } from '../lib/database.types';
import OpenCashModal from '../components/OpenCashModal';
import CloseCashModal from '../components/CloseCashModal';

type CashEntry = Database['public']['Tables']['cash_entries']['Row'];

interface CashSession {
  id: string;
  opening_amount: number;
  opened_at: string;
  status: string;
  notes: string | null;
}

interface ClosedCashSession {
  id: string;
  opening_amount: number;
  closing_amount_reported: number;
  expected_amount: number;
  difference_amount: number;
  opened_at: string;
  closed_at: string;
  status: string;
}

type StatColor = 'green' | 'blue' | 'emerald' | 'amber' | 'orange';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function getPaymentMethodLabel(method: string | null) {
  if (!method) return '-';

  switch (method) {
    case 'cash':
      return 'Dinheiro';
    case 'pix':
      return 'PIX';
    case 'debit':
      return 'Débito';
    case 'credit':
      return 'Crédito';
    default:
      return '-';
  }
}

function getPaymentMethodBadge(method: string | null) {
  if (!method) return 'bg-gray-100 text-gray-600 border-gray-200';

  switch (method) {
    case 'cash':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'pix':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'debit':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'credit':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export default function Cash() {
  const { user, storeId } = useAuth();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [closedSessions, setClosedSessions] = useState<ClosedCashSession[]>([]);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [totals, setTotals] = useState({
    total: 0,
    cash: 0,
    pix: 0,
    debit: 0,
    credit: 0,
    entries: 0,
    exits: 0,
  });

  useEffect(() => {
    const checkSubscription = async () => {
      if (!storeId) return;

      const { data: store } = await supabase
        .from('stores')
        .select('subscription_status, is_blocked')
        .eq('id', storeId)
        .maybeSingle();

      if (!store) return;

      const isBlocked = store.is_blocked;
      const isInactive = !['active', 'trial'].includes(store.subscription_status);

      if (isBlocked || isInactive) {
        navigate('/app/subscription-blocked');
      }
    };

    checkSubscription();
  }, [storeId, navigate]);

  useEffect(() => {
    if (storeId) {
      loadCashSession();
      loadTodayData();
      loadClosedSessions();
    }
  }, [storeId]);

  const loadCashSession = async () => {
    if (!storeId) return;

    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'open')
      .maybeSingle();

    setCashSession(data);
  };

  const loadClosedSessions = async () => {
    if (!storeId) return;

    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    if (data) {
      setClosedSessions(data as ClosedCashSession[]);
    }
  };

  const loadTodayData = async () => {
    if (!storeId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: entriesData } = await supabase
      .from('cash_entries')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (entriesData) {
      setEntries(entriesData);

      const total = entriesData
        .filter((e) => e.type === 'entry')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const cash = entriesData
        .filter((e) => e.type === 'entry' && e.payment_method === 'cash')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const pix = entriesData
        .filter((e) => e.type === 'entry' && e.payment_method === 'pix')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const debit = entriesData
        .filter((e) => e.type === 'entry' && e.payment_method === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const credit = entriesData
        .filter((e) => e.type === 'entry' && e.payment_method === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const entriesTotal = entriesData
        .filter((e) => e.type === 'entry')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const exitsTotal = entriesData
        .filter((e) => e.type === 'exit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      setTotals({
        total,
        cash,
        pix,
        debit,
        credit,
        entries: entriesTotal,
        exits: exitsTotal,
      });
    }

    setLoading(false);
  };

  const handleOpenCashSuccess = () => {
    loadCashSession();
    loadTodayData();
    loadClosedSessions();
  };

  const handleCloseCashSuccess = () => {
    loadCashSession();
    loadTodayData();
    loadClosedSessions();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
          <p className="text-sm font-medium text-gray-500">Carregando caixa...</p>
        </div>
      </div>
    );
  }

  const stats: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: StatColor;
  }[] = [
    {
      label: 'Total de Vendas Hoje',
      value: totals.total,
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'green',
    },
    {
      label: 'Dinheiro',
      value: totals.cash,
      icon: <Banknote className="h-6 w-6" />,
      color: 'blue',
    },
    {
      label: 'PIX',
      value: totals.pix,
      icon: <Smartphone className="h-6 w-6" />,
      color: 'emerald',
    },
    {
      label: 'Débito',
      value: totals.debit,
      icon: <CreditCard className="h-6 w-6" />,
      color: 'amber',
    },
    {
      label: 'Crédito',
      value: totals.credit,
      icon: <Landmark className="h-6 w-6" />,
      color: 'orange',
    },
  ];

  const colorClasses: Record<
    StatColor,
    {
      soft: string;
      strong: string;
      ring: string;
    }
  > = {
    green: {
      soft: 'bg-green-50 text-green-700',
      strong: 'bg-green-500 text-white',
      ring: 'ring-green-100',
    },
    blue: {
      soft: 'bg-blue-50 text-blue-700',
      strong: 'bg-blue-500 text-white',
      ring: 'ring-blue-100',
    },
    emerald: {
      soft: 'bg-emerald-50 text-emerald-700',
      strong: 'bg-emerald-500 text-white',
      ring: 'ring-emerald-100',
    },
    amber: {
      soft: 'bg-amber-50 text-amber-700',
      strong: 'bg-amber-500 text-white',
      ring: 'ring-amber-100',
    },
    orange: {
      soft: 'bg-orange-50 text-orange-700',
      strong: 'bg-orange-500 text-white',
      ring: 'ring-orange-100',
    },
  };

  const expectedBalance = cashSession
    ? Number(cashSession.opening_amount) + totals.entries - totals.exits
    : 0;

  const totalClosedSessions = closedSessions.length;
  const accumulatedDifference = closedSessions.reduce(
    (sum, session) => sum + Number(session.difference_amount || 0),
    0
  );

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <Wallet className="h-4 w-4" />
              Gestão de Caixa
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Caixa
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Acompanhe abertura, fechamento e movimentações financeiras do dia.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {!cashSession ? (
              <button
                onClick={() => setShowOpenModal(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 sm:w-auto"
              >
                <DoorOpen className="h-5 w-5" />
                Abrir Caixa
              </button>
            ) : (
              <button
                onClick={() => setShowCloseModal(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 sm:w-auto"
              >
                <DoorClosed className="h-5 w-5" />
                Fechar Caixa
              </button>
            )}
          </div>
        </div>
      </div>

      {!cashSession && (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-yellow-100 p-2 text-yellow-700">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-yellow-900">Nenhum caixa aberto</h3>
              <p className="mt-1 text-sm text-yellow-800">
                Para começar a registrar vendas, abra o caixa com o valor inicial disponível.
              </p>
            </div>
          </div>
        </div>
      )}

      {cashSession && (
        <div className="overflow-hidden rounded-3xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 shadow-sm">
          <div className="border-b border-green-200/70 p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-green-900">
                  <DoorOpen className="h-5 w-5" />
                  Caixa Aberto
                </h3>
                <p className="mt-1 text-sm text-green-800">
                  Sessão ativa pronta para registrar entradas e saídas.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-2xl border border-green-200 bg-white/70 px-4 py-2 text-sm font-medium text-green-800">
                <Clock3 className="h-4 w-4" />
                Aberto às {formatTime(cashSession.opened_at)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                Valor de abertura
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(Number(cashSession.opening_amount))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                Entradas
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(totals.entries)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                Saídas
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(totals.exits)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                Saldo esperado
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(expectedBalance)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={`rounded-3xl border border-gray-100 bg-white p-5 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${colorClasses[stat.color].ring}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`rounded-2xl p-3 ${colorClasses[stat.color].soft}`}>
                {stat.icon}
              </div>
              <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${colorClasses[stat.color].soft}`}>
                Hoje
              </div>
            </div>

            <div className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
              {formatCurrency(stat.value)}
            </div>
            <div className="mt-1 text-sm text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Movimentações de Hoje</h2>
            <p className="mt-1 text-sm text-gray-500">
              Entradas e saídas registradas no caixa ao longo do dia.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
            <CalendarDays className="h-4 w-4" />
            {new Date().toLocaleDateString('pt-BR')}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Wallet className="h-7 w-7 opacity-60" />
            </div>
            <p className="text-base font-medium text-gray-500">Nenhuma movimentação hoje</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Horário
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Descrição
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Categoria
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Pagamento
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Tipo
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="transition hover:bg-gray-50/80">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatTime(entry.created_at)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {entry.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {entry.category || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {entry.payment_method ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPaymentMethodBadge(
                              entry.payment_method
                            )}`}
                          >
                            {getPaymentMethodLabel(entry.payment_method)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            entry.type === 'entry'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {entry.type === 'entry' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold">
                        <span
                          className={
                            entry.type === 'entry' ? 'text-green-600' : 'text-red-600'
                          }
                        >
                          {entry.type === 'entry' ? '+' : '-'}{' '}
                          {formatCurrency(Number(entry.amount))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 lg:hidden sm:p-5">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Clock3 className="h-4 w-4 text-gray-400" />
                        {formatTime(entry.created_at)}
                      </div>
                      <p className="mt-2 break-words text-sm text-gray-900">
                        {entry.description || '-'}
                      </p>
                    </div>

                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
                        entry.type === 'entry'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {entry.type === 'entry' ? (
                        <ArrowDownLeft className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Categoria
                      </div>
                      <div className="mt-1 text-gray-700">{entry.category || '-'}</div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Pagamento
                      </div>
                      <div className="mt-1">
                        {entry.payment_method ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPaymentMethodBadge(
                              entry.payment_method
                            )}`}
                          >
                            {getPaymentMethodLabel(entry.payment_method)}
                          </span>
                        ) : (
                          <span className="text-gray-700">-</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        entry.type === 'entry'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {entry.type === 'entry' ? 'Entrada' : 'Saída'}
                    </span>

                    <span
                      className={`text-base font-bold ${
                        entry.type === 'entry' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {entry.type === 'entry' ? '+' : '-'}{' '}
                      {formatCurrency(Number(entry.amount))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Histórico de Caixas Fechados</h2>
          <p className="mt-1 text-sm text-gray-500">
            Consulte sessões já encerradas e acompanhe diferenças no fechamento.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-gray-100 p-5 sm:grid-cols-2 sm:p-6">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Total de caixas fechados
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {totalClosedSessions}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Diferença acumulada
            </div>
            <div
              className={`mt-2 text-2xl font-bold ${
                accumulatedDifference === 0
                  ? 'text-gray-900'
                  : accumulatedDifference > 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {formatCurrency(accumulatedDifference)}
            </div>
          </div>
        </div>

        {closedSessions.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <DoorClosed className="h-7 w-7 opacity-60" />
            </div>
            <p className="text-base font-medium text-gray-500">Nenhum caixa fechado ainda</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Data
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Abertura
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Fechamento
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Valor Inicial
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Valor Esperado
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Valor Contado
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Diferença
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {closedSessions.map((session) => {
                    const openingAmount = Number(session.opening_amount);
                    const expectedAmount = Number(session.expected_amount);
                    const closingAmount = Number(session.closing_amount_reported);
                    const difference = Number(session.difference_amount || 0);

                    return (
                      <tr key={session.id} className="transition hover:bg-gray-50/80">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {formatDate(session.closed_at)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatTime(session.opened_at)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatTime(session.closed_at)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {formatCurrency(openingAmount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {formatCurrency(expectedAmount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(closingAmount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold">
                          <span
                            className={
                              difference === 0
                                ? 'text-gray-900'
                                : difference > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }
                          >
                            {difference > 0 ? '+' : ''}
                            {formatCurrency(difference)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            Fechado
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 lg:hidden sm:p-5">
              {closedSessions.map((session) => {
                const openingAmount = Number(session.opening_amount);
                const expectedAmount = Number(session.expected_amount);
                const closingAmount = Number(session.closing_amount_reported);
                const difference = Number(session.difference_amount || 0);

                return (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">
                          Caixa fechado em {formatDate(session.closed_at)}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Abertura {formatTime(session.opened_at)} • Fechamento{' '}
                          {formatTime(session.closed_at)}
                        </p>
                      </div>

                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                        Fechado
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Valor inicial
                        </div>
                        <div className="mt-1 text-sm font-bold text-gray-900">
                          {formatCurrency(openingAmount)}
                        </div>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Valor esperado
                        </div>
                        <div className="mt-1 text-sm font-bold text-gray-900">
                          {formatCurrency(expectedAmount)}
                        </div>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Valor contado
                        </div>
                        <div className="mt-1 text-sm font-bold text-gray-900">
                          {formatCurrency(closingAmount)}
                        </div>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Diferença
                        </div>
                        <div
                          className={`mt-1 text-sm font-bold ${
                            difference === 0
                              ? 'text-gray-900'
                              : difference > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {difference > 0 ? '+' : ''}
                          {formatCurrency(difference)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showOpenModal && user && storeId && (
        <OpenCashModal
          storeId={storeId}
          userId={user.id}
          onClose={() => setShowOpenModal(false)}
          onSuccess={handleOpenCashSuccess}
        />
      )}

      {showCloseModal && cashSession && storeId && (
        <CloseCashModal
          sessionId={cashSession.id}
          storeId={storeId}
          openingAmount={cashSession.opening_amount}
          onClose={() => setShowCloseModal(false)}
          onSuccess={handleCloseCashSuccess}
        />
      )}
    </div>
  );
}
