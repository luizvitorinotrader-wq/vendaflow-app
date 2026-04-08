import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatQuantity } from '../lib/formatters';
import { X, AlertCircle } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';
import { logAuditEvent } from '../lib/auditLogger';

type StockItem = Database['public']['Tables']['stock_items']['Row'];

interface StockAdjustmentModalProps {
  item: StockItem;
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type MovementType = 'entry' | 'exit' | 'adjustment' | 'loss';

export default function StockAdjustmentModal({
  item,
  storeId,
  onClose,
  onSuccess,
}: StockAdjustmentModalProps) {
  const [movementType, setMovementType] = useState<MovementType>('entry');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const unitLabels = {
    kg: 'kg',
    l: 'L',
    un: 'un',
  };

  const movementTypeLabels: Record<MovementType, string> = {
    entry: 'Entrada',
    exit: 'Saída',
    adjustment: 'Ajuste',
    loss: 'Perda',
  };

  const movementTypeToDbType: Record<MovementType, string> = {
    entry: 'supply',
    exit: 'adjustment',
    adjustment: 'adjustment',
    loss: 'loss',
  };

  const calculateNewStock = (currentStock: number, qty: number, type: MovementType): number => {
    switch (type) {
      case 'entry':
        return currentStock + qty;
      case 'exit':
        return currentStock - qty;
      case 'adjustment':
        return qty;
      case 'loss':
        return currentStock - qty;
      default:
        return currentStock;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantidade deve ser maior que zero');
      return;
    }

    if (!reason.trim()) {
      setError('Motivo é obrigatório');
      return;
    }

    logger.log('Ajuste de estoque iniciado', {
      item: item.name,
      type: movementType,
      quantity: qty,
      currentStock: item.current_stock,
    });

    const previousStock = item.current_stock;
    const newStock = calculateNewStock(previousStock, qty, movementType);

    if (newStock < 0) {
      setError('Estoque não pode ficar negativo');
      return;
    }

    setSubmitting(true);

    try {
      const movementQuantity = movementType === 'entry' ? qty : -qty;
      if (movementType === 'adjustment') {
        // For adjustment, the quantity should be the difference
        const diff = qty - previousStock;
        await supabase.from('stock_movements').insert({
          store_id: storeId,
          stock_item_id: item.id,
          type: movementTypeToDbType[movementType],
          quantity: diff,
          previous_stock: previousStock,
          new_stock: newStock,
          reason: reason.trim(),
        });
      } else {
        await supabase.from('stock_movements').insert({
          store_id: storeId,
          stock_item_id: item.id,
          type: movementTypeToDbType[movementType],
          quantity: movementQuantity,
          previous_stock: previousStock,
          new_stock: newStock,
          reason: reason.trim(),
        });
      }

      logger.log('Ajuste registrado', {
        previousStock,
        newStock,
        movementQuantity: movementType === 'adjustment' ? qty - previousStock : movementQuantity,
      });

      const { error: updateError } = await supabase
        .from('stock_items')
        .update({ current_stock: newStock })
        .eq('id', item.id);

      if (updateError) throw updateError;

      logger.log('Estoque atualizado', { newStock });

      await logAuditEvent({
        eventType: 'stock_adjustment',
        eventStatus: 'success',
        metadata: {
          store_id: storeId,
          stock_item_id: item.id,
          stock_item_name: item.name,
          movement_type: movementType,
          quantity: qty,
          previous_stock: previousStock,
          new_stock: newStock,
          reason: reason.trim(),
        },
      });

      onSuccess();
      onClose();
    } catch (err) {
      logger.error('Erro ao ajustar estoque:', err);
      setError('Erro ao realizar ajuste de estoque');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Ajustar Estoque</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Item</label>
            <input
              type="text"
              value={`${item.name} (${formatQuantity(item.current_stock, item.unit)} ${unitLabels[item.unit]})`}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de movimentação *
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as MovementType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="entry">Entrada</option>
              <option value="exit">Saída</option>
              <option value="adjustment">Ajuste</option>
              <option value="loss">Perda</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {movementType === 'entry' && 'Adicionar ao estoque atual'}
              {movementType === 'exit' && 'Remover do estoque atual'}
              {movementType === 'adjustment' && 'Definir novo valor de estoque'}
              {movementType === 'loss' && 'Registrar perda e remover do estoque'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantidade *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                placeholder={movementType === 'adjustment' ? 'Novo valor' : 'Quantidade'}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <span className="text-gray-600 font-medium">{unitLabels[item.unit]}</span>
            </div>
            {movementType !== 'adjustment' && quantity && (
              <p className="text-xs text-gray-600 mt-1">
                Novo estoque:{' '}
                {formatQuantity(calculateNewStock(item.current_stock, parseFloat(quantity) || 0, movementType), item.unit)}{' '}
                {unitLabels[item.unit]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Motivo *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Descreva o motivo do ajuste"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex items-center space-x-4 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Processando...
                </span>
              ) : (
                'Confirmar Ajuste'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
