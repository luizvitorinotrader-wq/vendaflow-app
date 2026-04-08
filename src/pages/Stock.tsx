import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity } from '../lib/formatters';
import { Plus, CreditCard as Edit2, Trash2, X, AlertTriangle, Settings } from 'lucide-react';
import type { Database } from '../lib/database.types';
import StockAdjustmentModal from '../components/StockAdjustmentModal';

type StockItem = Database['public']['Tables']['stock_items']['Row'];

export default function Stock() {
  const { storeId } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<StockItem | null>(null);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    unit: 'kg' as 'kg' | 'l' | 'un',
    current_stock: '',
    min_stock: '',
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
    console.log('[Stock] effectiveStoreId:', storeId);
    if (storeId) {
      loadItems();
    }
  }, [storeId]);

  const loadItems = async () => {
    if (!storeId) {
      console.log('[Stock] loadItems skipped - no storeId');
      return;
    }
    console.log('[Stock] loadItems with storeId:', storeId);

    const { data } = await supabase
      .from('stock_items')
      .select('*')
      .eq('store_id', storeId)
      .order('name');

    console.log('[Stock] loaded', data?.length || 0, 'items');
    setItems(data || []);
    setLoading(false);
  };

  const openModal = (item?: StockItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        unit: item.unit,
        current_stock: item.current_stock.toString(),
        min_stock: item.min_stock.toString(),
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        unit: 'kg',
        current_stock: '0',
        min_stock: '1',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    const itemData = {
      name: formData.name,
      unit: formData.unit,
      current_stock: parseFloat(formData.current_stock),
      min_stock: parseFloat(formData.min_stock),
      store_id: storeId,
    };

    if (editingItem) {
      await supabase
        .from('stock_items')
        .update(itemData)
        .eq('id', editingItem.id);
    } else {
      await supabase
        .from('stock_items')
        .insert(itemData);
    }

    closeModal();
    loadItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;

    await supabase
      .from('stock_items')
      .delete()
      .eq('id', id);

    loadItems();
  };

  const openAdjustmentModal = (item: StockItem) => {
    setAdjustingItem(item);
    setShowAdjustmentModal(true);
  };

  const closeAdjustmentModal = () => {
    setShowAdjustmentModal(false);
    setAdjustingItem(null);
  };

  const handleAdjustmentSuccess = () => {
    setSuccessMessage('Ajuste de estoque realizado com sucesso');
    loadItems();
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const unitLabels = {
    kg: 'Kg',
    l: 'Litros',
    un: 'Unidades',
  };

  const lowStockItems = items.filter(item => item.current_stock <= item.min_stock);

  return (
    <div className="space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Estoque</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Controle básico de insumos</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition flex items-center justify-center space-x-2 shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Item</span>
        </button>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <p className="text-sm text-green-800 font-medium">{successMessage}</p>
          </div>
        </div>
      )}

      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Estoque Baixo</h3>
              <p className="text-sm text-amber-800 mt-1">
                {lowStockItems.length} {lowStockItems.length === 1 ? 'item está' : 'itens estão'} com estoque abaixo do mínimo
              </p>
              <div className="mt-2 space-y-1">
                {lowStockItems.map(item => (
                  <div key={item.id} className="text-sm text-amber-800">
                    • {item.name}: {formatQuantity(item.current_stock, item.unit)} {unitLabels[item.unit]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Nome</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Unidade</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Estoque Atual</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Estoque Mínimo</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => {
              const getStockStatus = () => {
                if (item.current_stock <= 0) {
                  return {
                    label: 'Sem estoque',
                    color: 'bg-red-100 text-red-700',
                    rowColor: 'bg-red-50'
                  };
                } else if (item.current_stock < item.min_stock) {
                  return {
                    label: 'Crítico',
                    color: 'bg-red-100 text-red-700',
                    rowColor: 'bg-red-50'
                  };
                } else if (item.current_stock === item.min_stock) {
                  return {
                    label: 'Mínimo',
                    color: 'bg-amber-100 text-amber-700',
                    rowColor: 'bg-amber-50'
                  };
                } else {
                  return {
                    label: 'OK',
                    color: 'bg-green-100 text-green-700',
                    rowColor: ''
                  };
                }
              };

              const status = getStockStatus();

              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${status.rowColor}`}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {item.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {unitLabels[item.unit]}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold">
                    <span className={item.current_stock <= item.min_stock ? 'text-red-700' : 'text-gray-900'}>
                      {formatQuantity(item.current_stock, item.unit)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatQuantity(item.min_stock, item.unit)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 ${status.color} rounded-full text-xs font-medium flex items-center gap-1 w-fit`}>
                      {status.label !== 'OK' && <AlertTriangle className="w-3 h-3" />}
                      {status.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => openAdjustmentModal(item)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-700 hover:text-blue-800 font-medium text-sm flex items-center gap-1.5 transition"
                        title="Ajustar estoque"
                      >
                        <Settings className="w-4 h-4" />
                        Ajustar
                      </button>
                      <button
                        onClick={() => openModal(item)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingItem ? 'Editar Item' : 'Novo Item'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Item *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Polpa de Açaí"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unidade *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as 'kg' | 'l' | 'un' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="kg">Kg (Quilogramas)</option>
                  <option value="l">L (Litros)</option>
                  <option value="un">Un (Unidades)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estoque Atual *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                  required
                  placeholder="Ex: 50"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estoque Mínimo *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                  required
                  placeholder="Ex: 10"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Você será alertado quando o estoque atingir este valor
                </p>
              </div>

              <div className="flex items-center space-x-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition shadow-md"
                >
                  {editingItem ? 'Salvar Alterações' : 'Criar Item'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdjustmentModal && adjustingItem && storeId && (
        <StockAdjustmentModal
          item={adjustingItem}
          storeId={storeId}
          onClose={closeAdjustmentModal}
          onSuccess={handleAdjustmentSuccess}
        />
      )}
    </div>
  );
}
