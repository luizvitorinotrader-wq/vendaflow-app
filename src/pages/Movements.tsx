import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity as formatQty } from '../lib/formatters';
import {
  Package,
  TrendingDown,
  TrendingUp,
  Settings,
  Boxes,
  ArrowDownToLine,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import { logger } from '../lib/logger';

interface StockMovement {
  id: string;
  stock_item_id: string;
  type: 'sale' | 'adjustment' | 'supply' | 'loss';
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
  stock_items: {
    name: string;
    unit: string;
  } | null;
}

interface StockItem {
  id: string;
  name: string;
}

const typeTranslations: Record<string, string> = {
  sale: 'Venda',
  purchase: 'Compra',
  adjustment: 'Ajuste',
  loss: 'Perda',
  production: 'Produção',
  supply: 'Entrada',
};

const typeColors: Record<string, string> = {
  sale: 'bg-red-100 text-red-700',
  purchase: 'bg-green-100 text-green-700',
  adjustment: 'bg-blue-100 text-blue-700',
  loss: 'bg-orange-100 text-orange-700',
  production: 'bg-purple-100 text-purple-700',
  supply: 'bg-green-100 text-green-700',
};

export default function Movements() {
  const { storeId } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [selectedItem, setSelectedItem] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  useEffect(() => {
    if (storeId) {
      loadStockItems();
      loadMovements();
    }
  }, [storeId, selectedPeriod, selectedItem, selectedType]);

  const loadStockItems = async () => {
    if (!storeId) return;

    const { data, error } = await supabase
      .from('stock_items')
      .select('id, name')
      .eq('store_id', storeId)
      .order('name');

    if (error) {
      logger.error('Erro ao carregar itens:', error);
      return;
    }

    setStockItems(data || []);
  };

  const loadMovements = async () => {
    if (!storeId) return;

    setLoading(true);

    let query = supabase
      .from('stock_movements')
      .select(`
        *,
        stock_items (
          name,
          unit
        )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (selectedPeriod !== 'all') {
      const now = new Date();
      const startDate = new Date();

      switch (selectedPeriod) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
      }

      query = query.gte('created_at', startDate.toISOString());
    }

    if (selectedItem !== 'all') {
      query = query.eq('stock_item_id', selectedItem);
    }

    if (selectedType !== 'all') {
      query = query.eq('type', selectedType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Erro ao carregar movimentações:', error);
      setLoading(false);
      return;
    }

    console.log('[STORE DEBUG - Movements] Loaded movements:', data?.length || 0);
    console.log(
      '[STORE DEBUG - Movements] Null stock_items:',
      data?.filter((m) => !m.stock_items).length || 0
    );

    setMovements(data || []);
    setLoading(false);
  };

  const calculateSummary = () => {
    const sales = movements
      .filter((m) => m.type === 'sale')
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

    const entries = movements
      .filter((m) => ['supply', 'purchase', 'production'].includes(m.type))
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

    const adjustments = movements
      .filter((m) => m.type === 'adjustment')
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

    return { sales, entries, adjustments };
  };

  const summary = calculateSummary();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatQuantityDisplay = (quantity: number, unit: string) => {
    const absQty = Math.abs(quantity);
    return `${formatQty(absQty, unit as 'kg' | 'l' | 'un')} ${unit}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
          <p className="text-sm font-medium text-gray-500">Carregando movimentações...</p>
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
              <Boxes className="h-4 w-4" />
              Histórico de Estoque
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Movimentações de Estoque
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Histórico completo de entradas, saídas e ajustes de estoque.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Total de saídas
              </div>
              <div className="mt-2 text-2xl font-bold text-red-600">
                {summary.sales.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl bg-red-50 p-3 text-red-600">
              <TrendingDown className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Total de entradas
              </div>
              <div className="mt-2 text-2xl font-bold text-green-600">
                {summary.entries.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl bg-green-50 p-3 text-green-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Total de ajustes
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-600">
                {summary.adjustments.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
              <Settings className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-xl bg-gray-100 p-2 text-gray-600">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Filtros</h2>
            <p className="text-sm text-gray-500">Refine a visualização das movimentações.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Período</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
            >
              <option value="today">Hoje</option>
              <option value="week">Última Semana</option>
              <option value="month">Último Mês</option>
              <option value="all">Tudo</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Item</label>
            <select
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
            >
              <option value="all">Todos os Itens</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Tipo</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
            >
              <option value="all">Todos os Tipos</option>
              <option value="sale">Venda</option>
              <option value="supply">Entrada</option>
              <option value="adjustment">Ajuste</option>
              <option value="loss">Perda</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 p-5 sm:p-6">
          <div className="rounded-2xl bg-red-50 p-2.5 text-red-600">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Histórico de Movimentações</h2>
            <p className="text-sm text-gray-500">
              Consulte todas as alterações registradas no estoque.
            </p>
          </div>
        </div>

        {movements.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Package className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-base font-medium text-gray-500">Nenhuma movimentação encontrada</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 p-4 md:hidden sm:p-5">
              {movements.map((movement) => {
                const unit = movement.stock_items?.unit || 'un';
                const movementTypeColor =
                  typeColors[movement.type] || 'bg-gray-100 text-gray-700';

                return (
                  <div
                    key={movement.id}
                    className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
                  >
                    <div className="border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-bold text-gray-900">
                            {movement.stock_items?.name || 'Item removido'}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(movement.created_at)}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${movementTypeColor}`}
                        >
                          {typeTranslations[movement.type] || movement.type}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-gray-50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Quantidade
                          </div>
                          <div
                            className={`mt-1 text-sm font-bold ${
                              movement.quantity < 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {movement.quantity > 0 ? '+' : ''}
                            {formatQuantityDisplay(movement.quantity, unit)}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Motivo
                          </div>
                          <div className="mt-1 text-sm text-gray-700">
                            {movement.reason || '-'}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Estoque antes
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {formatQty(
                              movement.previous_stock,
                              unit as 'kg' | 'l' | 'un'
                            )}{' '}
                            {unit}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Estoque depois
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {formatQty(movement.new_stock, unit as 'kg' | 'l' | 'un')} {unit}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Data/Hora
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Item
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Tipo
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Quantidade
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Estoque Antes
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Estoque Depois
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Motivo
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {movements.map((movement) => (
                    <tr key={movement.id} className="transition hover:bg-gray-50/80">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(movement.created_at)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {movement.stock_items?.name || 'Item removido'}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            typeColors[movement.type] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {typeTranslations[movement.type] || movement.type}
                        </span>
                      </td>

                      <td
                        className={`px-6 py-4 whitespace-nowrap text-right text-sm font-bold ${
                          movement.quantity < 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {formatQuantityDisplay(
                          movement.quantity,
                          movement.stock_items?.unit || 'un'
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatQty(
                          movement.previous_stock,
                          (movement.stock_items?.unit || 'un') as 'kg' | 'l' | 'un'
                        )}{' '}
                        {movement.stock_items?.unit || 'un'}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatQty(
                          movement.new_stock,
                          (movement.stock_items?.unit || 'un') as 'kg' | 'l' | 'un'
                        )}{' '}
                        {movement.stock_items?.unit || 'un'}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">{movement.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
