import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';
import { logAuditEvent } from '../lib/auditLogger';

interface CloseCashModalProps {
  sessionId: string;
  storeId: string;
  openingAmount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CloseCashModal({
  sessionId,
  storeId,
  openingAmount,
  onClose,
  onSuccess,
}: CloseCashModalProps) {
  const [closingAmount, setClosingAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expectedAmount, setExpectedAmount] = useState(0);
  const [difference, setDifference] = useState(0);

  useEffect(() => {
    calculateExpectedAmount();
  }, [storeId, openingAmount]);

  useEffect(() => {
    if (closingAmount) {
      const closing = parseFloat(closingAmount);
      if (!isNaN(closing)) {
        setDifference(closing - expectedAmount);
      }
    } else {
      setDifference(0);
    }
  }, [closingAmount, expectedAmount]);

  const calculateExpectedAmount = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: cashEntries } = await supabase
      .from('cash_entries')
      .select('type, amount')
      .eq('store_id', storeId)
      .gte('created_at', today.toISOString());

    if (cashEntries) {
      const entries = cashEntries
        .filter((e: any) => e.type === 'entry')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const exits = cashEntries
        .filter((e: any) => e.type === 'exit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const expected = openingAmount + entries - exits;
      setExpectedAmount(expected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const closing = parseFloat(closingAmount);
    if (isNaN(closing) || closing < 0) {
      setError('Valor contado inválido');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('cash_sessions')
        .update({
          closing_amount_reported: closing,
          expected_amount: expectedAmount,
          difference_amount: difference,
          closed_at: new Date().toISOString(),
          status: 'closed',
          notes: notes || null,
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      await logAuditEvent({
        eventType: 'cash_session_closed',
        eventStatus: 'success',
        metadata: {
          store_id: storeId,
          session_id: sessionId,
          opening_amount: openingAmount,
          closing_amount: closing,
          expected_amount: expectedAmount,
          difference_amount: difference,
          notes: notes || null,
        },
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao fechar caixa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Fechar Caixa</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Valor de Abertura:</span>
              <span className="font-semibold text-gray-900">R$ {openingAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Valor Esperado:</span>
              <span className="font-semibold text-green-600">R$ {expectedAmount.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valor Contado
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="0.00"
              required
            />
          </div>

          {closingAmount && (
            <div className={`bg-${difference >= 0 ? 'green' : 'red'}-50 rounded-lg p-4`}>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Diferença:</span>
                <span className={`text-lg font-bold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {difference >= 0 ? '+' : ''} R$ {difference.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observação (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              rows={3}
              placeholder="Adicione uma observação..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Fechando...
                </span>
              ) : (
                'Fechar Caixa'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
