import { useState } from 'react';
import { X, CreditCard, Banknote, Smartphone, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/formatters';

interface TabCheckoutModalProps {
  tabId: string;
  storeId: string;
  tableNumber: number;
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    weight?: number | null;
  }>;
  subtotal: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TabCheckoutModal({
  tabId,
  storeId,
  tableNumber,
  items,
  subtotal,
  onClose,
  onSuccess,
}: TabCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'debit' | 'pix'>('cash');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const discountValue = parseFloat(discount) || 0;
  const finalTotal = Math.max(0, subtotal - discountValue);

  const paymentMethods = [
    { value: 'cash' as const, label: 'Dinheiro', icon: Banknote },
    { value: 'credit' as const, label: 'Crédito', icon: CreditCard },
    { value: 'debit' as const, label: 'Débito', icon: CreditCard },
    { value: 'pix' as const, label: 'PIX', icon: Smartphone },
  ];

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: cashSessionData } = await supabase
        .from('cash_sessions')
        .select('id')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .maybeSingle();

      if (paymentMethod === 'cash' && !cashSessionData) {
        setError('É necessário abrir o caixa antes de registrar vendas em dinheiro');
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError('Usuário não autenticado');
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('complete_tab_checkout', {
        p_tab_id: tabId,
        p_store_id: storeId,
        p_payment_method: paymentMethod,
        p_cash_session_id: cashSessionData?.id || null,
        p_discount: discountValue,
        p_notes: notes || null,
        p_closed_by_user_id: userData.user.id,
      });

      if (rpcError) {
        console.error('Checkout error:', rpcError);
        setError(rpcError.message || 'Erro ao fechar comanda');
        setLoading(false);
        return;
      }

      if (data && data.success) {
        onSuccess();
      } else {
        setError('Erro desconhecido ao processar checkout');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Erro ao processar checkout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Fechar Comanda - Mesa {tableNumber}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleCheckout} className="p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Itens da Comanda</h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-start mb-2 last:mb-0">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    <div className="text-sm text-gray-600">
                      {item.weight ? (
                        <span>{item.weight}g - {formatCurrency(item.unit_price)}</span>
                      ) : (
                        <span>{item.quantity}x {formatCurrency(item.unit_price)}</span>
                      )}
                    </div>
                  </div>
                  <div className="font-medium text-gray-900">
                    {formatCurrency(item.total_price)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método de Pagamento
            </label>
            <div className="grid grid-cols-2 gap-3">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${
                      paymentMethod === method.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{method.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Desconto (Opcional)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                min="0"
                max={subtotal}
                step="0.01"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="0.00"
              />
            </div>
            {discountValue > subtotal && (
              <p className="text-sm text-red-600 mt-1">
                Desconto não pode ser maior que o subtotal
              </p>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observações (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Observações sobre o pedido..."
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-700">Subtotal</span>
              <span className="font-medium text-gray-900">{formatCurrency(subtotal)}</span>
            </div>
            {discountValue > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700">Desconto</span>
                <span className="font-medium text-red-600">-{formatCurrency(discountValue)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-gray-900">{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || discountValue > subtotal || items.length === 0}
              className="flex-1 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processando...' : 'Fechar Comanda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
