import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Power, AlertCircle, Loader2 } from 'lucide-react';
import CategoryModal from '../components/CategoryModal';

interface Category {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function Categories() {
  const { storeId } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  useEffect(() => {
    console.log('[Categories] effectiveStoreId:', storeId);
    loadCategories();
  }, [storeId]);

  const loadCategories = async () => {
    if (!storeId) {
      console.log('[Categories] loadCategories skipped - no storeId');
      return;
    }
    console.log('[Categories] loadCategories with storeId:', storeId);

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('product_categories')
        .select('*')
        .eq('store_id', storeId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setCategories(data || []);
    } catch (err) {
      console.error('Error loading categories:', err);
      setError('Erro ao carregar categorias. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (category: Category) => {
    try {
      setToggleLoading(category.id);

      const { error: updateError } = await supabase
        .from('product_categories')
        .update({ is_active: !category.is_active })
        .eq('id', category.id);

      if (updateError) throw updateError;

      await loadCategories();
    } catch (err) {
      console.error('Error toggling category:', err);
      alert('Erro ao alterar status da categoria.');
    } finally {
      setToggleLoading(null);
    }
  };

  const handleModalClose = (success: boolean) => {
    setIsModalOpen(false);
    setEditingCategory(null);
    if (success) {
      loadCategories();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Categorias</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Organize seus produtos em categorias personalizadas</p>
        </div>
        <button
          onClick={handleCreateCategory}
          className="bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nova Categoria
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Nenhuma categoria criada
            </h3>
            <p className="text-gray-600 mb-6">
              Comece criando categorias para organizar melhor seus produtos
            </p>
            <button
              onClick={handleCreateCategory}
              className="bg-gradient-to-r from-primary to-primary-dark text-white px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition"
            >
              Criar Primeira Categoria
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ordem
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descrição
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.id} className={!category.is_active ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {category.display_order}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{category.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {category.description || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        category.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {category.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditCategory(category)}
                        className="text-primary hover:text-primary-dark p-1 rounded hover:bg-gray-100 transition"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(category)}
                        disabled={toggleLoading === category.id}
                        className={`p-1 rounded transition ${
                          category.is_active
                            ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                        } disabled:opacity-50`}
                        title={category.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {toggleLoading === category.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <CategoryModal
          category={editingCategory}
          onClose={handleModalClose}
          storeId={storeId || ''}
        />
      )}
    </div>
  );
}
