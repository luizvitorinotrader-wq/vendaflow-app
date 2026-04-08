import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatMoney, formatQuantity } from '../lib/formatters';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Package,
  Weight,
  DoorOpen,
  DoorClosed,
  ShoppingCart,
  CreditCard,
  Clock,
  ArrowUpDown
} from 'lucide-react';
import { logger } from '../lib/logger';
import DashboardStockInsights from '../components/DashboardStockInsights';

interface DashboardMetrics {
  todaySales: number;
  monthSales: number;
  cashStatus: 'open' | 'closed';
  acaiSoldToday: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface Alert {
  type: 'critical' | 'warning' | 'info';
  message: string;
}

interface Sale {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
}

interface StockMovement {
  id: string;
  created_at: string;
  stock_item_id: string;
  type: string;
  quantity: number;
  reason: string;
}

export default function Dashboard() {
  logger.log('Dashboard iniciado');

  const { storeId } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todaySales: 0,
    monthSales: 0,
    cashStatus: 'closed',
    acaiSoldToday: 0,
  });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastSales, setLastSales] = useState<Sale[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const getMovementTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      sale: 'Venda',
      adjustment: 'Ajuste',
      loss: 'Perda',
      supply: 'Abastecimento',
    };
    return types[type] || type;
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'PIX',
      debit: 'Débito',
      credit: 'Crédito',
    };
    return methods[method] || method;
  };

  useEffect(() => {
    if (storeId) {
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, [storeId]);

  const loadDashboardData = async () => {
    try {
      if (!storeId) {
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      todaySalesRes,
      monthSalesRes,
      cashSessionRes,
      acaiProductRes,
      todaySaleItemsRes,
      topProductsRes,
      lastSalesRes,
      stockMovementsRes,
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('total_amount')
        .eq('store_id', storeId)
        .gte('created_at', today.toISOString()),

      supabase
        .from('sales')
        .select('total_amount')
        .eq('store_id', storeId)
        .gte('created_at', firstDayOfMonth.toISOString()),

      supabase
        .from('cash_sessions')
        .select('status')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .maybeSingle(),

      supabase
        .from('products')
        .select('id')
        .eq('store_id', storeId)
        .eq('name', 'Açaí por Kg')
        .maybeSingle(),

      supabase
        .from('sale_items')
        .select('weight, sale_id')
        .gte('created_at', today.toISOString()),

      supabase
        .from('sale_items')
        .select('product_id, quantity, products!inner(name, price)')
        .gte('created_at', today.toISOString()),

      supabase
        .from('sales')
        .select('id, created_at, total_amount, payment_method')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('stock_movements')
        .select('*, stock_items!inner(name)')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const todayTotal = todaySalesRes.data?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const monthTotal = monthSalesRes.data?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const cashStatus = cashSessionRes.data ? 'open' : 'closed';

    let acaiSold = 0;
    if (acaiProductRes.data && todaySaleItemsRes.data) {
      const todaySaleIds = new Set((await supabase
        .from('sales')
        .select('id')
        .eq('store_id', storeId)
        .gte('created_at', today.toISOString())).data?.map(s => s.id) || []);

      const totalGrams = todaySaleItemsRes.data
        .filter((item: any) => todaySaleIds.has(item.sale_id) && item.weight)
        .reduce((sum, item: any) => sum + Number(item.weight || 0), 0);

      acaiSold = totalGrams / 1000;
    }

    const productSales = new Map();
    if (topProductsRes.data) {
      for (const item of topProductsRes.data) {
        const product = (item as any).products;
        if (!product) continue;

        const key = product.name;
        if (!productSales.has(key)) {
          productSales.set(key, { name: key, quantity: 0, revenue: 0 });
        }
        const existing = productSales.get(key);
        existing.quantity += Number((item as any).quantity);
        existing.revenue += Number((item as any).quantity) * Number(product.price);
      }
    }

    const topProductsArray = Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const alertsList: Alert[] = [];

    if (!cashSessionRes.data) {
      alertsList.push({
        type: 'warning',
        message: 'Nenhum caixa aberto',
      });
    }

    setMetrics({
      todaySales: todayTotal,
      monthSales: monthTotal,
      cashStatus: cashStatus as 'open' | 'closed',
      acaiSoldToday: acaiSold,
    });

      setTopProducts(topProductsArray);
      setAlerts(alertsList);
      setLastSales(lastSalesRes.data || []);
      setStockMovements(stockMovementsRes.data || []);
      setLoading(false);

      logger.log('Dashboard dados carregados');
    } catch (error) {
      logger.error('Erro ao carregar dados do dashboard:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Vendas Hoje',
      value: `R$ ${formatMoney(metrics.todaySales)}`,
      icon: <DollarSign className="w-6 h-6" />,
      color: 'bg-green-50 text-green-600',
    },
    {
      title: 'Vendas no Mês',
      value: `R$ ${formatMoney(metrics.monthSales)}`,
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Status do Caixa',
      value: metrics.cashStatus === 'open' ? 'Caixa Aberto' : 'Caixa Fechado',
      icon: metrics.cashStatus === 'open' ? <DoorOpen className="w-6 h-6" /> : <DoorClosed className="w-6 h-6" />,
      color: metrics.cashStatus === 'open' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600',
    },
    {
      title: 'Açaí Vendido Hoje',
      value: `${formatQuantity(metrics.acaiSoldToday, 'kg')} kg`,
      icon: <Weight className="w-6 h-6" />,
      color: 'bg-amber-50 text-amber-600',
    },
  ];

  logger.log('Dashboard renderizado com sucesso');

  return (
    <div className="space-y-6 w-full max-w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">Resumo geral da operação de hoje</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.color}`}>
                {card.icon}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{card.value}</div>
            <div className="text-sm text-gray-600">{card.title}</div>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h2 className="text-xl font-bold text-gray-900">Alertas</h2>
          </div>
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-4 rounded-lg border ${
                  alert.type === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    alert.type === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : alert.type === 'warning'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {alert.type === 'critical' ? 'CRÍTICO' : alert.type === 'warning' ? 'ATENÇÃO' : 'INFO'}
                </span>
                <span className="text-gray-900 font-medium">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
          <Package className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Nenhum alerta no momento</p>
        </div>
      )}

      <DashboardStockInsights storeId={storeId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart className="w-5 h-5 text-gray-700" />
            <h2 className="text-xl font-bold text-gray-900">Produtos Mais Vendidos Hoje</h2>
          </div>
          {topProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 text-sm font-semibold text-gray-900">Produto</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-900">Quantidade</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-900">Receita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topProducts.map((product, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="py-3 text-sm text-gray-900">{product.name}</td>
                      <td className="py-3 text-sm text-right text-gray-900">{product.quantity}</td>
                      <td className="py-3 text-sm text-right font-semibold text-green-600">
                        R$ {formatMoney(product.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nenhuma venda registrada hoje</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-gray-700" />
            <h2 className="text-xl font-bold text-gray-900">Últimas Vendas</h2>
          </div>
          {lastSales.length > 0 ? (
            <div className="space-y-3">
              {lastSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div>
                    <div className="font-semibold text-gray-900">
                      R$ {formatMoney(Number(sale.total_amount))}
                    </div>
                    <div className="text-xs text-gray-600 flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3" />
                      {new Date(sale.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-white rounded text-xs font-medium text-gray-700 border border-gray-300">
                    {getPaymentMethodLabel(sale.payment_method)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nenhuma venda registrada</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpDown className="w-5 h-5 text-gray-700" />
          <h2 className="text-xl font-bold text-gray-900">Últimas Movimentações de Estoque</h2>
        </div>
        {stockMovements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 text-sm font-semibold text-gray-900">Item</th>
                  <th className="text-left py-3 text-sm font-semibold text-gray-900">Tipo</th>
                  <th className="text-right py-3 text-sm font-semibold text-gray-900">Quantidade</th>
                  <th className="text-right py-3 text-sm font-semibold text-gray-900">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stockMovements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="py-3 text-sm text-gray-900">
                      {(movement as any).stock_items?.name || 'Item desconhecido'}
                    </td>
                    <td className="py-3 text-sm">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                        {getMovementTypeLabel(movement.type)}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-right font-semibold text-gray-900">
                      {movement.quantity}
                    </td>
                    <td className="py-3 text-sm text-right text-gray-600">
                      {new Date(movement.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Nenhuma movimentação de estoque</p>
          </div>
        )}
      </div>
    </div>
  );
}
