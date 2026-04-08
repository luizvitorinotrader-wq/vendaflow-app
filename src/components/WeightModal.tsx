import { useState, useEffect } from 'react';
import { X, Scale } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';

type Product = Database['public']['Tables']['products']['Row'];

interface WeightModalProps {
  product: Product;
  onConfirm: (weight: number, totalPrice: number) => void;
  onClose: () => void;
}

export default function WeightModal({ product, onConfirm, onClose }: WeightModalProps) {
  const [weight, setWeight] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    if (weight && product.price_per_kg) {
      const weightInKg = parseFloat(weight) / 1000;
      const calculated = weightInKg * product.price_per_kg;
      setTotalPrice(calculated);
    } else {
      setTotalPrice(0);
    }
  }, [weight, product.price_per_kg]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weight || parseFloat(weight) <= 0) return;

    if (typeof onConfirm !== 'function') {
      logger.error('Erro: onConfirm não é uma função válida. Verifique o componente pai.');
      return;
    }

    onConfirm(parseFloat(weight), totalPrice);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Scale className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Adicionar {product.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Preço por kg</span>
              <span className="text-lg font-bold text-primary">
                R$ {product.price_per_kg?.toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Peso (gramas)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: 350"
            />
            <p className="text-sm text-gray-500 mt-2">
              Informe o peso do produto em gramas
            </p>
          </div>

          {weight && parseFloat(weight) > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Peso:</span>
                  <span className="font-semibold">{parseFloat(weight).toFixed(0)}g ({(parseFloat(weight) / 1000).toFixed(3)}kg)</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-green-300">
                  <span className="font-semibold text-gray-900">Total:</span>
                  <span className="text-2xl font-bold text-green-600">
                    R$ {totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-4 pt-4">
            <button
              type="submit"
              disabled={!weight || parseFloat(weight) <= 0}
              className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Adicionar ao Carrinho
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
