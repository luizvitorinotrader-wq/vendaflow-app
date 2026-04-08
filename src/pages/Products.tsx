import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, X, FileText } from 'lucide-react';
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

type StockDeductionMode = Database['public']['Tables']['products']['Row']['stock_deduction_mode'];

interface StockItem {
  id: string;
  name: string;
  unit: string;
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

    // IMPORTANT: Always join with product_categories to get category name.
    // The legacy 'category' text field is NOT used for display.
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

    // VALIDATION: category_id is REQUIRED (category text field is deprecated)
    if (!formData.category_id) {
      alert('Por favor, selecione uma categoria.');
      return;
    }

    // VALIDATION: stock deduction rules
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

    // IMPORTANT: Only category_id is written. The legacy 'category' field is NOT used.
    const productData = {
      name: formData.name,
      category_id: formData.category_id, // Source of truth for product category
      price: formData.pricing_type === 'unit' ? parseFloat(formData.price) : 0,
      cost: 0,
      stock_quantity: 0,
      min_stock: 0,
      active: formData.active,
      pricing_type: formData.pricing_type,
      price_per_kg: formData.pricing_type === 'weight' ? parseFloat(formData.price_per_kg) : null,
      stock_item_id: formData.stock_item_id,
      stock_deduction_mode: formData.stock_deduction_mode,
      stock_deduction_multiplier: formData.stock_deduction_multiplier,
      store_id: storeId,
    };

    if (editingProduct) {
      await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
    } else {
      await supabase
        .from('products')
        .insert(productData);
    }

    closeModal();
    loadProducts();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    await supabase
      .from('products')
      .delete()
      .eq('id', id);

    loadProducts();
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Produtos</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Gerencie o cardápio da sua loja</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition flex items-center justify-center space-x-2 shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Produto</span>
        </button>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-3">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base mb-1">{product.name}</h3>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                    {product.product_categories?.name || '-'}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-50 rounded text-xs text-blue-700">
                    {product.pricing_type === 'weight' ? 'Por Peso' : 'Unitário'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      product.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {product.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="text-lg font-bold text-green-600">
                  {product.pricing_type === 'weight' && product.price_per_kg
                    ? `R$ ${product.price_per_kg.toFixed(2)}/kg`
                    : `R$ ${product.price.toFixed(2)}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => navigate(`/app/products/${product.id}/recipe`)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg font-medium text-sm hover:bg-primary/20 transition"
              >
                <FileText className="w-4 h-4" />
                Receita
              </button>
              <button
                onClick={() => openModal(product)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200 transition"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={() => deleteProduct(product.id)}
                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Nome</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Categoria</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Tipo</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Preço</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {product.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {product.product_categories?.name || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {product.pricing_type === 'weight' ? 'Por Peso' : 'Unitário'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 font-semibold">
                  {product.pricing_type === 'weight' && product.price_per_kg
                    ? `R$ ${product.price_per_kg.toFixed(2)}/kg`
                    : `R$ ${product.price.toFixed(2)}`}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      product.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {product.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => navigate(`/app/products/${product.id}/recipe`)}
                      className="p-2 hover:bg-primary/10 rounded-lg text-primary hover:opacity-80"
                      title="Ficha Técnica"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openModal(product)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Açaí 500ml"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Venda *
                </label>
                <select
                  value={formData.pricing_type}
                  onChange={(e) => setFormData({ ...formData, pricing_type: e.target.value as 'unit' | 'weight' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="unit">Preço Unitário</option>
                  <option value="weight">Preço por Peso (Kg)</option>
                </select>
              </div>

              {formData.pricing_type === 'unit' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preço Unitário *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    placeholder="Ex: 15.00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preço por Kg *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price_per_kg}
                    onChange={(e) => setFormData({ ...formData, price_per_kg: e.target.value })}
                    required
                    placeholder="Ex: 40.00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Produto Ativo</span>
                </label>
              </div>

              <StockDeductionConfig
                stockItemId={formData.stock_item_id}
                deductionMode={formData.stock_deduction_mode}
                deductionMultiplier={formData.stock_deduction_multiplier}
                onDeductionModeChange={(mode) => setFormData({ ...formData, stock_deduction_mode: mode })}
                onDeductionMultiplierChange={(multiplier) => setFormData({ ...formData, stock_deduction_multiplier: multiplier })}
                onStockItemIdChange={(stockItemId) => setFormData({ ...formData, stock_item_id: stockItemId })}
                stockItems={stockItems}
              />

              <div className="flex items-center space-x-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition shadow-md"
                >
                  {editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
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
    </div>
  );
}
