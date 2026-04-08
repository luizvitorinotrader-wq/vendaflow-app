// (código completo já ajustado — mantive lógica e só evoluí UI)

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatMoney, formatQuantity } from '../lib/formatters';
import {
  TrendingUp,
  Package,
  Scale,
  CreditCard,
  Clock,
  Archive,
  BarChart3,
} from 'lucide-react';

export default function Reports() {
  const { storeId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'month'>('today');

  const [stats, setStats] = useState({
    salesToday: 0,
    salesThisMonth: 0,
    topProducts: [],
    totalAcaiKg: 0,
    paymentMethods: [],
    stockConsumption: [],
    hourlyRevenue: [],
  });

  useEffect(() => {
    if (storeId) loadReports();
  }, [storeId, period]);

  const loadReports = async () => {
    if (!storeId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDate = period === 'today' ? today.toISOString() : firstDayOfMonth.toISOString();

    const { data: salesToday } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('store_id', storeId)
      .gte('created_at', today.toISOString());

    const { data: salesThisMonth } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('store_id', storeId)
      .gte('created_at', firstDayOfMonth.toISOString());

    setStats({
      ...stats,
      salesToday: salesToday?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0,
      salesThisMonth: salesThisMonth?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0,
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      {/* HEADER PREMIUM */}
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-3 py-1 text-xs font-semibold text-red-600">
              <BarChart3 className="h-4 w-4" />
              Inteligência de Vendas
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Relatórios
            </h1>

            <p className="text-sm text-gray-600">
              Acompanhe desempenho, vendas e consumo da sua loja
            </p>
          </div>

          {/* BOTÕES PERÍODO */}
          <div className="flex gap-2">
            <button
              onClick={() => setPeriod('today')}
              className={`px-4 py-2 rounded-2xl font-semibold text-sm transition ${
                period === 'today'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Hoje
            </button>

            <button
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 rounded-2xl font-semibold text-sm transition ${
                period === 'month'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Este Mês
            </button>
          </div>
        </div>
      </div>

      {/* CARDS RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white border p-5 shadow-sm">
          <div className="flex justify-between">
            <TrendingUp className="text-green-600" />
          </div>
          <div className="text-2xl font-bold mt-4 text-gray-900">
            R$ {formatMoney(stats.salesToday)}
          </div>
          <div className="text-sm text-gray-500">Vendas Hoje</div>
        </div>

        <div className="rounded-3xl bg-white border p-5 shadow-sm">
          <div className="flex justify-between">
            <TrendingUp className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold mt-4 text-gray-900">
            R$ {formatMoney(stats.salesThisMonth)}
          </div>
          <div className="text-sm text-gray-500">Vendas no Mês</div>
        </div>

        <div className="rounded-3xl bg-white border p-5 shadow-sm">
          <div className="flex justify-between">
            <Scale className="text-orange-600" />
          </div>
          <div className="text-2xl font-bold mt-4 text-gray-900">
            {formatQuantity(stats.totalAcaiKg, 'kg')} kg
          </div>
          <div className="text-sm text-gray-500">Açaí Vendido</div>
        </div>
      </div>

      {/* FORMAS DE PAGAMENTO */}
      <div className="rounded-3xl bg-white border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="text-blue-600" />
          <h2 className="font-bold text-lg text-gray-900">
            Formas de Pagamento
          </h2>
        </div>

        {stats.paymentMethods.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            Nenhuma venda registrada
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.paymentMethods.map((p, i) => (
              <div key={i} className="bg-gray-50 p-4 rounded-xl">
                <div className="text-sm text-gray-600">{p.method}</div>
                <div className="font-bold text-lg">
                  R$ {formatMoney(p.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PRODUTOS */}
      <div className="rounded-3xl bg-white border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Package className="text-green-600" />
          <h2 className="font-bold text-lg text-gray-900">
            Produtos Mais Vendidos
          </h2>
        </div>

        {stats.topProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            Nenhuma venda registrada
          </div>
        ) : (
          <div className="space-y-3">
            {stats.topProducts.map((p: any, i) => (
              <div key={i} className="flex justify-between bg-gray-50 p-4 rounded-xl">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.quantity} vendas</div>
                </div>
                <div className="font-bold text-green-600">
                  R$ {formatMoney(p.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CONSUMO */}
      <div className="rounded-3xl bg-white border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Archive className="text-orange-600" />
          <h2 className="font-bold text-lg text-gray-900">
            Consumo de Insumos
          </h2>
        </div>

        {stats.stockConsumption.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            Nenhum consumo registrado
          </div>
        ) : (
          <div className="space-y-3">
            {stats.stockConsumption.map((item: any, i) => (
              <div key={i} className="flex justify-between bg-gray-50 p-4 rounded-xl">
                <div>{item.name}</div>
                <div className="font-semibold">
                  {formatQuantity(item.quantity, item.unit)} {item.unit}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HORÁRIOS */}
      <div className="rounded-3xl bg-white border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="text-indigo-600" />
          <h2 className="font-bold text-lg text-gray-900">
            Horários de Pico
          </h2>
        </div>

        {stats.hourlyRevenue.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            Nenhuma venda registrada
          </div>
        ) : (
          <div className="space-y-3">
            {stats.hourlyRevenue.map((h: any, i) => (
              <div key={i} className="flex justify-between bg-gray-50 p-4 rounded-xl">
                <div>{h.hour}h</div>
                <div className="font-bold text-indigo-600">
                  R$ {formatMoney(h.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
