import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Plus, Trash2, X, Save } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';

type Product = Database['public']['Tables']['products']['Row'];
type StockItem = Database['public']['Tables']['stock_items']['Row'];
type RecipeItem = Database['public']['Tables']['product_recipe_items']['Row'];

interface RecipeItemWithDetails extends RecipeItem {
  stock_item?: StockItem;
}

export default function Recipe() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { storeId } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeItemWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    stock_item_id: '',
    quantity_used: '',
    unit: 'kg' as 'kg' | 'l' | 'un',
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
    if (storeId && productId) {
      loadData();
    }
  }, [storeId, productId]);

  const loadData = async () => {
    if (!storeId || !productId) return;

    const [productRes, stockRes, recipeRes] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('store_id', storeId)
        .maybeSingle(),

      supabase
        .from('stock_items')
        .select('*')
        .eq('store_id', storeId)
        .order('name'),

      supabase
        .from('product_recipe_items')
        .select('*, stock_item:stock_items(*)')
        .eq('product_id', productId)
        .eq('store_id', storeId),
    ]);

    if (productRes.data) setProduct(productRes.data);
    if (stockRes.data) setStockItems(stockRes.data);
    if (recipeRes.data) setRecipeItems(recipeRes.data as RecipeItemWithDetails[]);

    setLoading(false);
  };

  const openModal = () => {
    setFormData({
      stock_item_id: '',
      quantity_used: '',
      unit: 'kg',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !productId) return;

    // Validate required fields
    if (!formData.stock_item_id) {
      alert('Selecione um insumo');
      return;
    }

    if (!formData.quantity_used) {
      alert('Informe a quantidade utilizada');
      return;
    }

    const quantityUsed = parseFloat(formData.quantity_used);
    if (isNaN(quantityUsed) || quantityUsed <= 0) {
      alert('Quantidade deve ser maior que zero');
      return;
    }

    // Verify stock item exists and belongs to store
    const { data: stockItem, error: stockError } = await supabase
      .from('stock_items')
      .select('id, name')
      .eq('id', formData.stock_item_id)
      .eq('store_id', storeId)
      .maybeSingle();

    if (stockError || !stockItem) {
      alert('Insumo inválido ou não encontrado');
      return;
    }

    // Check for duplicates
    const existingItem = recipeItems.find(
      item => item.stock_item_id === formData.stock_item_id
    );

    if (existingItem) {
      alert('Este insumo já está vinculado a este produto. Exclua o vínculo existente primeiro.');
      return;
    }

    const { error } = await supabase
      .from('product_recipe_items')
      .insert({
        store_id: storeId,
        product_id: productId,
        stock_item_id: formData.stock_item_id,
        quantity_used: quantityUsed,
        unit: formData.unit,
      });

    if (error) {
      logger.error('Erro ao salvar vínculo:', error);
      alert('Erro ao salvar vínculo');
      return;
    }

    closeModal();
    loadData();
  };

  const deleteRecipeItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este vínculo?')) return;

    await supabase
      .from('product_recipe_items')
      .delete()
      .eq('id', id);

    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="text-gray-500 mb-4">Produto não encontrado</div>
        <button
          onClick={() => navigate('/products')}
          className="text-primary hover:opacity-80"
        >
          Voltar para Produtos
        </button>
      </div>
    );
  }

  const unitLabels = {
    kg: 'Kg',
    l: 'Litros',
    un: 'Unidades',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/products')}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ficha Técnica</h1>
            <p className="text-gray-600 mt-1">
              {product.name} - Configure os insumos utilizados
            </p>
          </div>
        </div>
        <button
          onClick={openModal}
          className="bg-gradient-to-r from-primary to-primary-dark text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition flex items-center space-x-2 shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Adicionar Insumo</span>
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Sobre a Ficha Técnica</h3>
        <p className="text-sm text-blue-800">
          {product.pricing_type === 'weight' ? (
            <>
              Este produto é vendido por peso. A quantidade de cada insumo será calculada proporcionalmente ao peso vendido.
              <br />
              <strong>Exemplo:</strong> Se configurar 1.000 kg de Polpa de Açaí e vender 400g, serão consumidos 0.400 kg do estoque.
            </>
          ) : (
            <>
              Este produto é vendido por unidade. A quantidade de cada insumo será consumida integralmente a cada venda.
              <br />
              <strong>Exemplo:</strong> Se configurar 0.300 kg de Batata e vender 2 unidades, serão consumidos 0.600 kg do estoque.
            </>
          )}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {recipeItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">Nenhum insumo configurado</p>
            <p className="text-sm">Clique em "Adicionar Insumo" para começar</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Insumo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Quantidade Usada</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Unidade</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Estoque Atual</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recipeItems.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                    {item.stock_item?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {Number(item.quantity_used).toFixed(3)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {unitLabels[item.unit]}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={
                      item.stock_item && item.stock_item.current_stock <= item.stock_item.min_stock
                        ? 'text-red-600 font-semibold'
                        : 'text-gray-900'
                    }>
                      {item.stock_item?.current_stock.toFixed(2) || '0.00'} {unitLabels[item.unit]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => deleteRecipeItem(item.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Adicionar Insumo</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Insumo *
                </label>
                <select
                  value={formData.stock_item_id}
                  onChange={(e) => {
                    const selectedItem = stockItems.find(s => s.id === e.target.value);
                    setFormData({
                      ...formData,
                      stock_item_id: e.target.value,
                      unit: selectedItem?.unit || 'kg'
                    });
                  }}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Selecione um insumo</option>
                  {stockItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({unitLabels[item.unit]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantidade Usada {product.pricing_type === 'weight' ? 'por Kg' : 'por Unidade'} *
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={formData.quantity_used}
                  onChange={(e) => setFormData({ ...formData, quantity_used: e.target.value })}
                  required
                  placeholder="Ex: 0.300"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unidade
                </label>
                <input
                  type="text"
                  value={unitLabels[formData.unit]}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  A unidade é definida automaticamente pelo insumo selecionado
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Atenção:</strong> Ao finalizar vendas, o estoque deste insumo será reduzido automaticamente
                  baseado nesta configuração.
                </p>
              </div>

              <div className="flex items-center space-x-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition shadow-md flex items-center justify-center space-x-2"
                >
                  <Save className="w-5 h-5" />
                  <span>Salvar Vínculo</span>
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
