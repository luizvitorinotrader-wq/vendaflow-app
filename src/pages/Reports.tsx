import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatMoney, formatQuantity } from '../lib/formatters';
import { TrendingUp, Package, Scale, CreditCard, Clock, Archive } from 'lucide-react';

export default function Reports() {
  const { storeId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'month'>('today');
  const [stats, setStats] = useState({
    salesToday: 0,
    salesThisMonth: 0,
    topProducts: [] as Array<{ name: string; quantity: number; revenue: number; weightKg: number }>,
    totalAcaiKg: 0,
    paymentMethods: [] as Array<{ method: string; total: number }>,
    stockConsumption: [] as Array<{ name: string; quantity: number; unit: string }>,
    hourlyRevenue: [] as Array<{ hour: number; revenue: number; salesCount: number }>,
  });

  useEffect(() => {
    if (storeId) {
      loadReports();
    }
  }, [storeId, period]);

  const loadReports = async () => {
    if (!storeId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

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

    const startDate = period === 'today' ? today.toISOString() : firstDayOfMonth.toISOString();

    const { data: saleItems } = await supabase
      .from('sale_items')
      .select(`
        product_id,
        quantity,
        total_price,
        weight,
        products (
          name,
          pricing_type
        ),
        sales!inner (
          store_id,
          created_at
        )
      `)
      .eq('sales.store_id', storeId)
      .gte('sales.created_at', startDate);

    const productMap = new Map<string, { name: string; quantity: number; revenue: number; weightKg: number }>();
    let totalAcaiKg = 0;

    if (saleItems) {
      saleItems.forEach((item: any) => {
        const productName = item.products?.name || 'Produto';
        const existing = productMap.get(item.product_id) || { name: productName, quantity: 0, revenue: 0, weightKg: 0 };

        existing.quantity += item.quantity;
        existing.revenue += Number(item.total_price);

        if (item.weight && item.products?.pricing_type === 'weight') {
          const weightInKg = item.weight / 1000;
          existing.weightKg += weightInKg;

          if (productName.toLowerCase().includes('açaí')) {
            totalAcaiKg += weightInKg;
          }
        }

        productMap.set(item.product_id, existing);
      });
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Load payment methods
    const { data: cashEntries } = await supabase
      .from('cash_entries')
      .select('payment_method, amount')
      .eq('store_id', storeId)
      .eq('category', 'sale')
      .gte('created_at', startDate);

    const paymentMap = new Map<string, number>();
    if (cashEntries) {
      cashEntries.forEach((entry: any) => {
        const method = entry.payment_method || 'Não especificado';
        paymentMap.set(method, (paymentMap.get(method) || 0) + Number(entry.amount));
      });
    }

    const paymentMethods = Array.from(paymentMap.entries())
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);

    // Load stock consumption for today only
    const { data: stockMovements } = await supabase
      .from('stock_movements')
      .select(`
        quantity,
        stock_items (
          name,
          unit
        )
      `)
      .eq('store_id', storeId)
      .eq('type', 'sale')
      .gte('created_at', today.toISOString());

    const stockMap = new Map<string, { name: string; quantity: number; unit: string }>();
    if (stockMovements) {
      stockMovements.forEach((movement: any) => {
        if (movement.stock_items) {
          const name = movement.stock_items.name;
          const existing = stockMap.get(name) || {
            name,
            quantity: 0,
            unit: movement.stock_items.unit
          };
          existing.quantity += Math.abs(movement.quantity);
          stockMap.set(name, existing);
        }
      });
    }

    const stockConsumption = Array.from(stockMap.values())
      .sort((a, b) => b.quantity - a.quantity);

    // Load hourly revenue
    const { data: salesData } = await supabase
      .from('sales')
      .select('created_at, total_amount')
      .eq('store_id', storeId)
      .gte('created_at', startDate);

    const hourlyMap = new Map<number, { revenue: number; salesCount: number }>();
    if (salesData) {
      salesData.forEach((sale: any) => {
        const hour = new Date(sale.created_at).getHours();
        const existing = hourlyMap.get(hour) || { revenue: 0, salesCount: 0 };
        existing.revenue += Number(sale.total_amount);
        existing.salesCount += 1;
        hourlyMap.set(hour, existing);
      });
    }

    const hourlyRevenue = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    setStats({
      salesToday: salesToday?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0,
      salesThisMonth: salesThisMonth?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0,
      topProducts,
      totalAcaiKg,
      paymentMethods,
      stockConsumption,
      hourlyRevenue,
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Resumo de vendas e desempenho</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod('today')}
            className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base ${
              period === 'today'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              period === 'month'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Este Mês
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-green-50 text-green-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            R$ {formatMoney(stats.salesToday)}
          </div>
          <div className="text-sm text-gray-600">Vendas Hoje</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            R$ {formatMoney(stats.salesThisMonth)}
          </div>
          <div className="text-sm text-gray-600">Vendas Este Mês</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-amber-50 text-amber-600">
              <Scale className="w-6 h-6" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {formatQuantity(stats.totalAcaiKg, 'kg')} kg
          </div>
          <div className="text-sm text-gray-600">
            Total Açaí Vendido {period === 'today' ? 'Hoje' : 'Este Mês'}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <CreditCard className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Vendas por Forma de Pagamento {period === 'today' ? 'Hoje' : 'Este Mês'}
          </h2>
        </div>

        {stats.paymentMethods.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhuma venda registrada neste período</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.paymentMethods.map((payment, index) => (
              <div
                key={index}
                className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200"
              >
                <div className="text-sm text-gray-600 mb-2">{payment.method}</div>
                <div className="text-2xl font-bold text-gray-900">
                  R$ {formatMoney(payment.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-green-50 text-green-600">
            <Package className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Produtos Mais Vendidos {period === 'today' ? 'Hoje' : 'Este Mês'}
          </h2>
        </div>

        {stats.topProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhuma venda registrada neste período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Produto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantidade
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receita
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.topProducts.map((product, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 bg-green-100 text-green-700 rounded-full font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {product.quantity} {product.quantity === 1 ? 'venda' : 'vendas'}
                      {product.weightKg > 0 && (
                        <div className="text-xs text-gray-500">{formatQuantity(product.weightKg, 'kg')} kg</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-lg font-bold text-green-600">
                        R$ {formatMoney(product.revenue)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Consumption Today */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
            <Archive className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Consumo de Insumos Hoje
          </h2>
        </div>

        {stats.stockConsumption.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Archive className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhum consumo registrado hoje</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantidade Usada Hoje
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.stockConsumption.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatQuantity(item.quantity, item.unit as 'kg' | 'l' | 'un')} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hourly Revenue */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
            <Clock className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Horários de Maior Movimento {period === 'today' ? 'Hoje' : 'Este Mês'}
          </h2>
        </div>

        {stats.hourlyRevenue.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhuma venda registrada neste período</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stats.hourlyRevenue.map((hour, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 text-indigo-700 rounded-lg font-bold">
                    {hour.hour}h
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {hour.salesCount} {hour.salesCount === 1 ? 'venda' : 'vendas'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Ticket médio: R$ {formatMoney(hour.revenue / hour.salesCount)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-indigo-600">
                    R$ {formatMoney(hour.revenue)}
                  </div>
                  <div className="text-xs text-gray-500">Receita</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
