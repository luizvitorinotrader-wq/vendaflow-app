import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Category {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface CategoryModalProps {
  category: Category | null;
  onClose: (success: boolean) => void;
  storeId: string;
}

export default function CategoryModal({ category, onClose, storeId }: CategoryModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!category;

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
      setDisplayOrder(category.display_order);
      setIsActive(category.is_active);
    }
  }, [category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Nome da categoria é obrigatório');
      return;
    }

    if (displayOrder < 0) {
      setError('Ordem de exibição deve ser maior ou igual a zero');
      return;
    }

    try {
      setLoading(true);

      if (isEditing && category) {
        const { error: updateError } = await supabase
          .from('product_categories')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            display_order: displayOrder,
            is_active: isActive,
          })
          .eq('id', category.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('product_categories')
          .insert({
            store_id: storeId,
            name: name.trim(),
            description: description.trim() || null,
            display_order: displayOrder,
            is_active: isActive,
          });

        if (insertError) throw insertError;
      }

      onClose(true);
    } catch (err: any) {
      console.error('Error saving category:', err);

      if (err.code === '23505') {
        setError('Já existe uma categoria com este nome nesta loja');
      } else {
        setError('Erro ao salvar categoria. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing ? 'Editar Categoria' : 'Nova Categoria'}
          </h2>
          <button
            onClick={() => onClose(false)}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nome da Categoria <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Ex: Sobremesas, Bebidas, Lanches..."
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Descrição
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              placeholder="Descreva esta categoria (opcional)"
              rows={3}
              maxLength={500}
            />
          </div>

          <div>
            <label htmlFor="displayOrder" className="block text-sm font-medium text-gray-700 mb-2">
              Ordem de Exibição
            </label>
            <input
              id="displayOrder"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
              min="0"
              step="1"
            />
            <p className="mt-1 text-xs text-gray-500">
              Categorias com ordem menor aparecem primeiro
            </p>
          </div>

          <div className="flex items-center">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={loading}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary disabled:opacity-50"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Categoria ativa
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => onClose(false)}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                isEditing ? 'Salvar Alterações' : 'Criar Categoria'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
