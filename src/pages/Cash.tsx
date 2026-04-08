import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Wallet, TrendingUp, CreditCard, Banknote, Smartphone, DoorOpen, DoorClosed, AlertCircle } from 'lucide-react';
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
        .filter(e => e.type === 'entry')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const cash = entriesData
        .filter(e => e.type === 'entry' && e.payment_method === 'cash')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const pix = entriesData
        .filter(e => e.type === 'entry' && e.payment_method === 'pix')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const debit = entriesData
        .filter(e => e.type === 'entry' && e.payment_method === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const credit = entriesData
        .filter(e => e.type === 'entry' && e.payment_method === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const entriesTotal = entriesData
        .filter(e => e.type === 'entry')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const exitsTotal = entriesData
        .filter(e => e.type === 'exit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      setTotals({ total, cash, pix, debit, credit, entries: entriesTotal, exits: exitsTotal });
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
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total de Vendas Hoje',
      value: totals.total,
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'green',
    },
    {
      label: 'Dinheiro',
      value: totals.cash,
      icon: <Banknote className="w-6 h-6" />,
      color: 'blue',
    },
    {
      label: 'PIX',
      value: totals.pix,
      icon: <Smartphone className="w-6 h-6" />,
      color: 'emerald',
    },
    {
      label: 'Débito',
      value: totals.debit,
      icon: <CreditCard className="w-6 h-6" />,
      color: 'amber',
    },
    {
      label: 'Crédito',
      value: totals.credit,
      icon: <CreditCard className="w-6 h-6" />,
      color: 'orange',
    },
  ];

  const colorClasses = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  const expectedBalance = cashSession
    ? cashSession.opening_amount + totals.entries - totals.exits
    : 0;

  const totalClosedSessions = closedSessions.length;
  const accumulatedDifference = closedSessions.reduce(
    (sum, session) => sum + Number(session.difference_amount || 0),
    0
  );

  return (
    <div className="space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Caixa</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Resumo financeiro do dia</p>
        </div>
        <div>
          {!cashSession ? (
            <button
              onClick={() => setShowOpenModal(true)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium w-full sm:w-auto justify-center"
            >
              <DoorOpen className="w-5 h-5" />
              Abrir Caixa
            </button>
          ) : (
            <button
              onClick={() => setShowCloseModal(true)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium w-full sm:w-auto justify-center"
            >
              <DoorClosed className="w-5 h-5" />
              Fechar Caixa
            </button>
          )}
        </div>
      </div>

      {!cashSession && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-yellow-900 mb-1">Nenhum caixa aberto</h3>
            <p className="text-sm text-yellow-700">
              Para começar a registrar vendas, abra o caixa com o valor inicial disponível.
            </p>
          </div>
        </div>
      )}

      {cashSession && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-green-900 flex items-center gap-2">
              <DoorOpen className="w-5 h-5" />
              Caixa Aberto
            </h3>
            <span className="text-sm text-green-700">
              Aberto às {new Date(cashSession.opened_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-green-700">Valor de Abertura</div>
              <div className="text-xl font-bold text-green-900">
                R$ {cashSession.opening_amount.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-green-700">Entradas</div>
              <div className="text-xl font-bold text-green-900">
                R$ {totals.entries.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-green-700">Saídas</div>
              <div className="text-xl font-bold text-green-900">
                R$ {totals.exits.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-green-700">Saldo Esperado</div>
              <div className="text-xl font-bold text-green-900">
                R$ {expectedBalance.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                {stat.icon}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              R$ {stat.value.toFixed(2)}
            </div>
            <div className="text-sm text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Movimentações de Hoje</h2>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhuma movimentação hoje</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Horário</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Descrição</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Categoria</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Pagamento</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Tipo</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(entry.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {entry.description || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {entry.category || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {entry.payment_method ? (
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {entry.payment_method === 'cash' ? 'Dinheiro' :
                           entry.payment_method === 'pix' ? 'PIX' :
                           entry.payment_method === 'debit' ? 'Débito' :
                           entry.payment_method === 'credit' ? 'Crédito' : '-'}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          entry.type === 'entry'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {entry.type === 'entry' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold">
                      <span
                        className={
                          entry.type === 'entry' ? 'text-green-600' : 'text-red-600'
                        }
                      >
                        {entry.type === 'entry' ? '+' : '-'} R${' '}
                        {Number(entry.amount).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Histórico de Caixas Fechados</h2>
        </div>

        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total de Caixas Fechados</div>
              <div className="text-2xl font-bold text-gray-900">{totalClosedSessions}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Diferença Acumulada</div>
              <div className={`text-2xl font-bold ${
                accumulatedDifference === 0 ? 'text-gray-900' :
                accumulatedDifference > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                R$ {accumulatedDifference.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {closedSessions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <DoorClosed className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhum caixa fechado ainda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Data</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Abertura</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Fechamento</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Valor Inicial</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Valor Esperado</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Valor Contado</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Diferença</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {closedSessions.map((session) => {
                  const openingAmount = Number(session.opening_amount);
                  const expectedAmount = Number(session.expected_amount);
                  const closingAmount = Number(session.closing_amount_reported);
                  const difference = Number(session.difference_amount || 0);

                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(session.closed_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(session.opened_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(session.closed_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        R$ {openingAmount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        R$ {expectedAmount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        R$ {closingAmount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold">
                        <span className={
                          difference === 0 ? 'text-gray-900' :
                          difference > 0 ? 'text-green-600' : 'text-red-600'
                        }>
                          {difference > 0 ? '+' : ''} R$ {difference.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          Fechado
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
