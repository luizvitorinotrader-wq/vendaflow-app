import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity } from '../lib/formatters';
import {
  Plus,
  CreditCard as Edit2,
  Trash2,
  X,
  AlertTriangle,
  Settings,
  Package,
  Boxes,
  ShieldAlert,
  BadgeCheck,
} from 'lucide-react';
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
      await supabase.from('stock_items').update(itemData).eq('id', editingItem.id);
    } else {
      await supabase.from('stock_items').insert(itemData);
    }

    closeModal();
    loadItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;

    await supabase.from('stock_items').delete().eq('id', id);

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
          <p className="text-sm font-medium text-gray-500">Carregando estoque...</p>
        </div>
      </div>
    );
  }

  const unitLabels = {
    kg: 'Kg',
    l: 'Litros',
    un: 'Unidades',
  };

  const lowStockItems = items.filter((item) => item.current_stock <= item.min_stock);
  const okStockItems = items.filter((item) => item.current_stock > item.min_stock);
  const criticalItems = items.filter((item) => item.current_stock <= 0);

  const getStockStatus = (item: StockItem) => {
    if (item.current_stock <= 0) {
      return {
        label: 'Sem estoque',
        color: 'bg-red-100 text-red-700',
        rowColor: 'bg-red-50/70',
        textColor: 'text-red-700',
      };
    }

    if (item.current_stock < item.min_stock) {
      return {
        label: 'Crítico',
        color: 'bg-red-100 text-red-700',
        rowColor: 'bg-red-50/70',
        textColor: 'text-red-700',
      };
    }

    if (item.current_stock === item.min_stock) {
      return {
        label: 'Mínimo',
        color: 'bg-amber-100 text-amber-700',
        rowColor: 'bg-amber-50/70',
        textColor: 'text-amber-700',
      };
    }

    return {
      label: 'OK',
      color: 'bg-green-100 text-green-700',
      rowColor: '',
      textColor: 'text-gray-900',
    };
  };

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <Boxes className="h-4 w-4" />
              Controle de Insumos
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Estoque
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Controle básico e visual do estoque com a mesma identidade do sistema.
            </p>
          </div>

          <button
            onClick={() => openModal()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            Novo Item
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2 text-green-600">
              <BadgeCheck className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-green-800">{successMessage}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Total de itens
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{items.length}</div>
            </div>
            <div className="rounded-2xl bg-red-50 p-3 text-red-600">
              <Package className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Estoque ok
              </div>
              <div className="mt-2 text-2xl font-bold text-green-600">{okStockItems.length}</div>
            </div>
            <div className="rounded-2xl bg-green-50 p-3 text-green-600">
              <BadgeCheck className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Alertas
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-600">{lowStockItems.length}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <h3 className="text-base font-bold text-amber-900">Itens com estoque baixo</h3>
              <p className="mt-1 text-sm text-amber-800">
                {lowStockItems.length}{' '}
                {lowStockItems.length === 1 ? 'item está' : 'itens estão'} no limite mínimo ou abaixo dele.
              </p>

              <div className="mt-3 grid gap-2">
                {lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-amber-200 bg-white/70 px-3 py-2 text-sm text-amber-900"
                  >
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-amber-700">
                      {' '}
                      — {formatQuantity(item.current_stock, item.unit)} {unitLabels[item.unit]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Boxes className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Nenhum item no estoque</h3>
          <p className="mt-2 text-sm text-gray-500">
            Cadastre seus primeiros insumos para começar o controle de estoque.
          </p>
          <button
            onClick={() => openModal()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
          >
            <Plus className="h-5 w-5" />
            Criar primeiro item
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {items.map((item) => {
              const status = getStockStatus(item);

              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-3xl border shadow-sm ${
                    status.rowColor ? `border-transparent ${status.rowColor}` : 'border-gray-100 bg-white'
                  }`}
                >
                  <div className="border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-gray-900">{item.name}</h3>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {unitLabels[item.unit]}
                          </span>

                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-gray-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Estoque atual
                        </div>
                        <div className={`mt-1 text-sm font-bold ${status.textColor}`}>
                          {formatQuantity(item.current_stock, item.unit)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-gray-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Estoque mínimo
                        </div>
                        <div className="mt-1 text-sm font-bold text-gray-900">
                          {formatQuantity(item.min_stock, item.unit)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-4">
                    <button
                      onClick={() => openAdjustmentModal(item)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      <Settings className="h-4 w-4" />
                      Ajustar
                    </button>

                    <button
                      onClick={() => openModal(item)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      <Edit2 className="h-4 w-4" />
                      Editar
                    </button>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Unidade
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Estoque Atual
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Estoque Mínimo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => {
                    const status = getStockStatus(item);

                    return (
                      <tr
                        key={item.id}
                        className={`transition hover:bg-gray-50/80 ${status.rowColor}`}
                      >
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {item.name}
                        </td>

                        <td className="px-6 py-4 text-sm text-gray-600">
                          {unitLabels[item.unit]}
                        </td>

                        <td className={`px-6 py-4 text-sm font-bold ${status.textColor}`}>
                          {formatQuantity(item.current_stock, item.unit)}
                        </td>

                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatQuantity(item.min_stock, item.unit)}
                        </td>

                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.color}`}
                          >
                            {status.label !== 'OK' && <AlertTriangle className="h-3 w-3" />}
                            {status.label}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openAdjustmentModal(item)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                              title="Ajustar estoque"
                            >
                              <Settings className="h-4 w-4" />
                              Ajustar
                            </button>

                            <button
                              onClick={() => openModal(item)}
                              className="rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => deleteItem(item.id)}
                              className="rounded-xl p-2 text-red-600 transition hover:bg-red-50"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
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
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  {editingItem ? 'Editar Item' : 'Novo Item'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Preencha os dados do item para cadastrar no estoque.
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Nome do Item *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Polpa de Açaí"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Unidade *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value as 'kg' | 'l' | 'un' })
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                >
                  <option value="kg">Kg (Quilogramas)</option>
                  <option value="l">L (Litros)</option>
                  <option value="un">Un (Unidades)</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Estoque Atual *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                  required
                  placeholder="Ex: 50"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Estoque Mínimo *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                  required
                  placeholder="Ex: 10"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Você será alertado quando o estoque atingir este valor.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
                >
                  {editingItem ? 'Salvar Alterações' : 'Criar Item'}
                </button>

                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
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
