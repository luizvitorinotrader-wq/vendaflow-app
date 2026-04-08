import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus,
  Pencil,
  Power,
  AlertCircle,
  Loader2,
  Trash2,
  Shapes,
  BadgeCheck,
  BadgeX,
  Tag,
} from 'lucide-react';
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
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

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
        .eq('id', category.id)
        .eq('store_id', storeId);

      if (updateError) throw updateError;

      await loadCategories();
    } catch (err) {
      console.error('Error toggling category:', err);
      alert('Erro ao alterar status da categoria.');
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!storeId) return;

    try {
      setDeleteLoading(category.id);

      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('category_id', category.id);

      if (countError) throw countError;

      if ((count || 0) > 0) {
        alert('Não é possível excluir esta categoria porque há produtos vinculados.');
        return;
      }

      const confirmed = window.confirm(`Deseja excluir a categoria "${category.name}"?`);
      if (!confirmed) return;

      const { error: deleteError } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', category.id)
        .eq('store_id', storeId);

      if (deleteError) throw deleteError;

      await loadCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Erro ao excluir categoria.');
    } finally {
      setDeleteLoading(null);
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-100 border-t-red-500" />
          <p className="text-sm font-medium text-gray-500">Carregando categorias...</p>
        </div>
      </div>
    );
  }

  const totalCategories = categories.length;
  const activeCategories = categories.filter((category) => category.is_active).length;
  const inactiveCategories = categories.filter((category) => !category.is_active).length;

  return (
    <div className="w-full max-w-full space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <Shapes className="h-4 w-4" />
              Organização do Cardápio
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Categorias
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Organize seus produtos em categorias personalizadas com o mesmo padrão visual do sistema.
            </p>
          </div>

          <button
            onClick={handleCreateCategory}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            Nova Categoria
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-100 p-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-red-900">Erro ao carregar categorias</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Shapes className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Nenhuma categoria criada</h3>
          <p className="mt-2 text-sm text-gray-500">
            Comece criando categorias para organizar melhor seus produtos.
          </p>
          <button
            onClick={handleCreateCategory}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
          >
            <Plus className="h-5 w-5" />
            Criar Primeira Categoria
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total de categorias
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">{totalCategories}</div>
                </div>
                <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                  <Shapes className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ativas
                  </div>
                  <div className="mt-2 text-2xl font-bold text-green-600">{activeCategories}</div>
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
                    Inativas
                  </div>
                  <div className="mt-2 text-2xl font-bold text-gray-700">{inactiveCategories}</div>
                </div>
                <div className="rounded-2xl bg-gray-100 p-3 text-gray-600">
                  <BadgeX className="h-6 w-6" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:hidden">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`overflow-hidden rounded-3xl border shadow-sm ${
                  category.is_active
                    ? 'border-gray-100 bg-white'
                    : 'border-gray-200 bg-gray-50/70'
                }`}
              >
                <div className="border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-gray-900">
                        {category.name}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          <Tag className="h-3.5 w-3.5" />
                          Ordem {category.display_order}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            category.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {category.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-gray-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Descrição
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      {category.description || '-'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 p-4">
                  <button
                    onClick={() => handleEditCategory(category)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>

                  <button
                    onClick={() => handleToggleActive(category)}
                    disabled={toggleLoading === category.id}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                      category.is_active
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {toggleLoading === category.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                    {category.is_active ? 'Desativar' : 'Ativar'}
                  </button>

                  <button
                    onClick={() => handleDeleteCategory(category)}
                    disabled={deleteLoading === category.id}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    {deleteLoading === category.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
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
                      Ordem
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      Descrição
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
                  {categories.map((category) => (
                    <tr
                      key={category.id}
                      className={`transition hover:bg-gray-50/80 ${
                        !category.is_active ? 'bg-gray-50/60' : ''
                      }`}
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {category.display_order}
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{category.name}</div>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">
                        {category.description || '-'}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            category.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {category.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditCategory(category)}
                            className="rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteCategory(category)}
                            disabled={deleteLoading === category.id}
                            className="rounded-xl p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            title="Excluir"
                          >
                            {deleteLoading === category.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>

                          <button
                            onClick={() => handleToggleActive(category)}
                            disabled={toggleLoading === category.id}
                            className={`rounded-xl p-2 transition disabled:opacity-50 ${
                              category.is_active
                                ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                : 'text-green-600 hover:bg-green-50 hover:text-green-700'
                            }`}
                            title={category.is_active ? 'Desativar' : 'Ativar'}
                          >
                            {toggleLoading === category.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Power className="h-4 w-4" />
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
        </>
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
