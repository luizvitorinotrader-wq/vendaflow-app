import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NewTableModalProps {
  storeId: string;
  currentTableCount: number;
  maxTables: number;
  effectivePlan: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewTableModal({
  storeId,
  currentTableCount,
  maxTables,
  effectivePlan,
  onClose,
  onSuccess,
}: NewTableModalProps) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!number || parseInt(number) <= 0) {
      setError('Número da mesa deve ser maior que zero');
      return;
    }

    if (!capacity || parseInt(capacity) <= 0) {
      setError('Capacidade deve ser maior que zero');
      return;
    }

    if (currentTableCount >= maxTables) {
      setError(`Você atingiu o limite de ${maxTables} mesas do seu plano`);
      return;
    }

    setLoading(true);

    try {
      const { data: existingTable } = await supabase
        .from('tables')
        .select('id')
        .eq('store_id', storeId)
        .eq('number', parseInt(number))
        .maybeSingle();

      if (existingTable) {
        setError('Já existe uma mesa com este número');
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('tables')
        .insert({
          store_id: storeId,
          number: parseInt(number),
          name: name || null,
          capacity: parseInt(capacity),
          status: 'free',
        });

      if (insertError) throw insertError;

      onSuccess();
    } catch (err) {
      console.error('Error creating table:', err);
      setError('Erro ao criar mesa. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Nova Mesa</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Número da Mesa *
            </label>
            <input
              type="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              min="1"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: 1, 2, 3..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome/Apelido (opcional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: Varanda, Salão..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Capacidade (lugares) *
            </label>
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              min="1"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: 4"
            />
          </div>

          <div className="text-sm text-gray-600">
            Mesa {currentTableCount + 1} de {maxTables}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Criando...' : 'Criar Mesa'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
