import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  CreditCard as Edit2,
  Trash2,
  X,
  FileText,
  Package2,
  Tag,
  BadgeCheck,
  BadgeX,
  ShoppingBag,
} from 'lucide-react';
import type { Database } from '../lib/database.types';
import { CategorySelect } from '../components/CategorySelect';
import { useProductCategories } from '../hooks/useProductCategories';
import { StockDeductionConfig } from '../components/StockDeductionConfig';

type Product = Database['public']['Tables']['products']['Row'];

interface ProductWithCategory extends Product {
  product_categories?: {
    id: string;
    name: string;
    display_order: number;
  } | null;
}

type StockDeductionMode =
  Database['public']['Tables']['products']['Row']['stock_deduction_mode'];

interface StockItem {
  id: string;
  name: string;
  unit: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default function Products() {
  const navigate = useNavigate();
  const { storeId } = useAuth();

  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithCategory | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price: '',
    pricing_type: 'unit' as 'unit' | 'weight',
    price_per_kg: '',
    active: true,
    stock_item_id: null as string | null,
    stock_deduction_mode: 'none' as StockDeductionMode,
    stock_deduction_multiplier: null as number | null,
  });

  const { categories, isEnabled: categoriesEnabled } = useProductCategories(storeId);

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
    console.log('[Products] effectiveStoreId:', storeId);
    if (storeId) {
      loadProducts();
      loadStockItems();
    }
  }, [storeId]);

  const loadStockItems = async () => {
    if (!storeId) return;

    const { data } = await supabase
      .from('stock_items')
      .select('id, name, unit')
      .eq('store_id', storeId)
      .order('name');

    setStockItems(data || []);
  };

  const loadProducts = async () => {
    if (!storeId) {
      console.log('[Products] loadProducts skipped - no storeId');
      return;
    }

    console.log('[Products] loadProducts with storeId:', storeId);

    const { data } = await supabase
      .from('products')
      .select(`
        *,
        product_categories (
          id,
          name,
          display_order
        )
      `)
      .eq('store_id', storeId)
      .order('name');

    console.log('[Products] loaded', data?.length || 0, 'products');
    setProducts(data || []);
    setLoading(false);
  };

  const openModal = (product?: ProductWithCategory) => {
    if (product) {
      setEditingProduct(product);

      const categoryId = product.category_id || '';

      setFormData({
        name: product.name,
        category_id: categoryId,
        price: product.price.toString(),
        pricing_type: product.pricing_type || 'unit',
        price_per_kg: product.price_per_kg?.toString() || '',
        active: product.active,
        stock_item_id: product.stock_item_id || null,
        stock_deduction_mode: product.stock_deduction_mode || 'none',
        stock_deduction_multiplier: product.stock_deduction_multiplier || null,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        category_id: '',
        price: '',
        pricing_type: 'unit',
        price_per_kg: '',
        active: true,
        stock_item_id: null,
        stock_deduction_mode: 'none',
        stock_deduction_multiplier: null,
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    if (!formData.category_id) {
      alert('Por favor, selecione uma categoria.');
      return;
    }

    if (formData.stock_deduction_mode !== 'none') {
      if (!formData.stock_item_id) {
        alert('Por favor, selecione um item de estoque quando o modo de baixa não for "Sem baixa".');
        return;
      }

      if (formData.stock_deduction_mode === 'by_multiplier') {
        if (!formData.stock_deduction_multiplier || formData.stock_deduction_multiplier <= 0) {
          alert('Por favor, informe um multiplicador válido (maior que zero).');
          return;
        }
      }
    }

    const productData = {
      name: formData.name,
      category_id: formData.category_id,
      price: formData.pricing_type === 'unit' ? parseFloat(formData.price) : 0,
      cost: 0,
      stock_quantity: 0,
      min_stock: 0,
      active: formData.active,
      pricing_type: formData.pricing_type,
      price_per_kg:
        formData.pricing_type === 'weight' ? parseFloat(formData.price_per_kg) : null,
      stock_item_id: formData.stock_item_id,
      stock_deduction_mode: formData.stock_deduction_mode,
      stock_deduction_multiplier: formData.stock_deduction_multiplier,
      store_id: storeId,
    };

    if (editingProduct) {
      await supabase.from('products').update(productData).eq('id', editingProduct.id);
    } else {
      await supabase.from('products').insert(productData);
    }

    closeModal();
    loadProducts();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    await supabase.from('products').delete().eq('id', id);

    loadProducts();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
          <p className="text-sm font-medium text-gray-500">Carregando produtos...</p>
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
              <ShoppingBag className="h-4 w-4" />
              Cardápio e Produtos
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Produtos
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Gerencie o cardápio da sua loja com visual mais limpo e profissional.
            </p>
          </div>

          <button
            onClick={() => openModal()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            Novo Produto
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Package2 className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Nenhum produto cadastrado</h2>
          <p className="mt-2 text-sm text-gray-500">
            Comece adicionando seu primeiro item ao cardápio.
          </p>
          <button
            onClick={() => openModal()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
          >
            <Plus className="h-5 w-5" />
            Criar primeiro produto
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total de produtos
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">{products.length}</div>
                </div>
                <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                  <Package2 className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ativos
                  </div>
                  <div className="mt-2 text-2xl font-bold text-green-600">
                    {products.filter((p) => p.active).length}
                  </div>
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
                    Inativos
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-700">
                    {products.filter((p) => !p.active).length}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-100 p-3 text-gray-600">
                  <BadgeX className="h-6 w-6" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:hidden">
            {products.map((product) => (
              <div
                key={product.id}
                className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
              >
                <div className="border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-gray-900">{product.name}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          <Tag className="h-3.5 w-3.5" />
                          {product.product_categories?.name || '-'}
                        </span>

                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {product.pricing_type === 'weight' ? 'Por Peso' : 'Unitário'}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            product.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {product.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-2xl font-bold tracking-tight text-red-600">
                    {product.pricing_type === 'weight' && product.price_per_kg
                      ? `${formatCurrency(Number(product.price_per_kg))}/kg`
                      : formatCurrency(Number(product.price))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 p-4">
                  <button
                    onClick={() => navigate(`/app/products/${product.id}/recipe`)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                  >
                    <FileText className="h-4 w-4" />
                    Receita
                  </button>

                  <button
                    onClick={() => openModal(product)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    <Edit2 className="h-4 w-4" />
                    Editar
                  </button>

                  <button
                    onClick={() => deleteProduct(product.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Categoria
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Tipo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Preço
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
                  {products.map((product) => (
                    <tr key={product.id} className="transition hover:bg-gray-50/80">
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {product.name}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          <Tag className="h-3.5 w-3.5" />
                          {product.product_categories?.name || '-'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">
                        {product.pricing_type === 'weight' ? 'Por Peso' : 'Unitário'}
                      </td>

                      <td className="px-6 py-4 text-sm font-bold text-gray-900">
                        {product.pricing_type === 'weight' && product.price_per_kg
                          ? `${formatCurrency(Number(product.price_per_kg))}/kg`
                          : formatCurrency(Number(product.price))}
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            product.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {product.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/app/products/${product.id}/recipe`)}
                            className="rounded-xl p-2 text-red-600 transition hover:bg-red-50"
                            title="Ficha Técnica"
                          >
                            <FileText className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => openModal(product)}
                            className="rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="rounded-xl p-2 text-red-600 transition hover:bg-red-50"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Preencha os dados do produto para salvar no cardápio.
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
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Açaí 500ml"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Categoria *
                </label>
                {storeId && (
                  <CategorySelect
                    storeId={storeId}
                    value={formData.category_id}
                    onChange={(categoryId) => {
                      setFormData({
                        ...formData,
                        category_id: categoryId,
                      });
                    }}
                    required
                  />
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Tipo de Venda *
                </label>
                <select
                  value={formData.pricing_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pricing_type: e.target.value as 'unit' | 'weight',
                    })
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                >
                  <option value="unit">Preço Unitário</option>
                  <option value="weight">Preço por Peso (Kg)</option>
                </select>
              </div>

              {formData.pricing_type === 'unit' ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Preço Unitário *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    placeholder="Ex: 15.00"
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Preço por Kg *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price_per_kg}
                    onChange={(e) => setFormData({ ...formData, price_per_kg: e.target.value })}
                    required
                    placeholder="Ex: 40.00"
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                  />
                </div>
              )}

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-semibold text-gray-700">Produto Ativo</span>
                </label>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white">
                <StockDeductionConfig
                  stockItemId={formData.stock_item_id}
                  deductionMode={formData.stock_deduction_mode}
                  deductionMultiplier={formData.stock_deduction_multiplier}
                  onDeductionModeChange={(mode) =>
                    setFormData({ ...formData, stock_deduction_mode: mode })
                  }
                  onDeductionMultiplierChange={(multiplier) =>
                    setFormData({ ...formData, stock_deduction_multiplier: multiplier })
                  }
                  onStockItemIdChange={(stockItemId) =>
                    setFormData({ ...formData, stock_item_id: stockItemId })
                  }
                  stockItems={stockItems}
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
                >
                  {editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
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
    </div>
  );
}
