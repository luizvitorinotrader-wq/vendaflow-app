import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity as formatQty } from '../lib/formatters';
import { Package, TrendingDown, TrendingUp, Settings } from 'lucide-react';
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
  supply: 'Entrada'
};

const typeColors: Record<string, string> = {
  sale: 'text-red-600 bg-red-50',
  purchase: 'text-green-600 bg-green-50',
  adjustment: 'text-blue-600 bg-blue-50',
  loss: 'text-orange-600 bg-orange-50',
  production: 'text-purple-600 bg-purple-50',
  supply: 'text-green-600 bg-green-50'
};

export default function Movements() {
  const { storeId } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
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

    // Apply period filter
    if (selectedPeriod !== 'all') {
      const now = new Date();
      let startDate = new Date();

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

    // Apply item filter
    if (selectedItem !== 'all') {
      query = query.eq('stock_item_id', selectedItem);
    }

    // Apply type filter
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
    console.log('[STORE DEBUG - Movements] Null stock_items:', data?.filter(m => !m.stock_items).length || 0);
    setMovements(data || []);
    setLoading(false);
  };

  const calculateSummary = () => {
    const sales = movements.filter(m => m.type === 'sale').reduce((sum, m) => sum + Math.abs(m.quantity), 0);
    const entries = movements.filter(m => ['supply', 'purchase', 'production'].includes(m.type)).reduce((sum, m) => sum + Math.abs(m.quantity), 0);
    const adjustments = movements.filter(m => m.type === 'adjustment').reduce((sum, m) => sum + Math.abs(m.quantity), 0);

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
      minute: '2-digit'
    }).format(date);
  };

  const formatQuantityDisplay = (quantity: number, unit: string) => {
    const absQty = Math.abs(quantity);
    return `${formatQty(absQty, unit as 'kg' | 'l' | 'un')} ${unit}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Movimentações de Estoque</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">Histórico de entradas, saídas e ajustes</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Saídas</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {summary.sales.toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Entradas</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {summary.entries.toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Ajustes</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {summary.adjustments.toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="today">Hoje</option>
              <option value="week">Última Semana</option>
              <option value="month">Último Mês</option>
              <option value="all">Tudo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item
            </label>
            <select
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">Todos os Itens</option>
              {stockItems.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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

      {/* Movements Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {movements.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Nenhuma movimentação encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data/Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantidade
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estoque Antes
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estoque Depois
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {movements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(movement.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {movement.stock_items?.name || 'Item removido'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColors[movement.type] || 'text-gray-600 bg-gray-50'}`}>
                        {typeTranslations[movement.type] || movement.type}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${movement.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {movement.quantity > 0 ? '+' : ''}{formatQuantityDisplay(movement.quantity, movement.stock_items?.unit || 'un')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatQty(movement.previous_stock, (movement.stock_items?.unit || 'un') as 'kg' | 'l' | 'un')} {movement.stock_items?.unit || 'un'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatQty(movement.new_stock, (movement.stock_items?.unit || 'un') as 'kg' | 'l' | 'un')} {movement.stock_items?.unit || 'un'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {movement.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
