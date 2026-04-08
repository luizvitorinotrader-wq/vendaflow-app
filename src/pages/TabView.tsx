import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, CreditCard as Edit2, Save, X, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/formatters';
import { canCheckoutTab } from '../lib/permissions';
import TabCheckoutModal from '../components/TabCheckoutModal';

interface Table {
  id: string;
  number: number;
  name: string | null;
  status: string;
}

interface Tab {
  id: string;
  customer_name: string | null;
  status: string;
  opened_at: string;
  notes: string | null;
}

interface TabItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  weight: number | null;
  notes: string | null;
  product: {
    name: string;
  };
}

interface Product {
  id: string;
  name: string;
  price: number;
  pricing_type: 'unit' | 'weight';
}

export default function TabView() {
  const { tableId, tabId } = useParams();
  const navigate = useNavigate();
  const { store, storeId, user, effectiveUserRole } = useAuth();
  const [table, setTable] = useState<Table | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [items, setItems] = useState<TabItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCustomerInput, setShowCustomerInput] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [itemNotes, setItemNotes] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  useEffect(() => {
    if (storeId && tableId) {
      loadData();
    }
  }, [storeId, tableId, tabId]);

  const loadData = async () => {
    if (!storeId || !tableId) return;

    setLoading(true);
    try {
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('id', tableId)
        .eq('store_id', storeId)
        .maybeSingle();

      if (tableError) throw tableError;
      setTable(tableData);

      if (tabId) {
        const { data: tabData, error: tabError } = await supabase
          .from('tabs')
          .select('*')
          .eq('id', tabId)
          .eq('store_id', storeId)
          .maybeSingle();

        if (tabError) throw tabError;
        setTab(tabData);
        setCustomerName(tabData?.customer_name || '');

        const { data: itemsData, error: itemsError } = await supabase
          .from('tab_items')
          .select(`
            *,
            product:products(name)
          `)
          .eq('tab_id', tabId)
          .order('created_at', { ascending: true });

        if (itemsError) throw itemsError;
        setItems(itemsData || []);
      }

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, pricing_type')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .eq('pricing_type', 'unit')
        .order('name');

      if (productsError) throw productsError;
      setProducts(productsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTab = async () => {
    if (!store?.id || !tableId || !user?.id) return;

    try {
      const finalCustomerName = customerName.trim() || `Mesa ${table?.number || ''}`;

      const { data: newTab, error } = await supabase
        .from('tabs')
        .insert({
          store_id: storeId,
          table_id: tableId,
          customer_name: finalCustomerName,
          attendant_id: user.id,
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;

      navigate(`/app/tables/${tableId}/tab/${newTab.id}`, { replace: true });
      loadData();
    } catch (error) {
      console.error('Error opening tab:', error);
      alert('Erro ao abrir comanda');
    }
  };

  const handleUpdateCustomerName = async () => {
    if (!tab?.id) return;

    try {
      const { error } = await supabase
        .from('tabs')
        .update({ customer_name: customerName || null })
        .eq('id', tab.id);

      if (error) throw error;

      setShowCustomerInput(false);
      loadData();
    } catch (error) {
      console.error('Error updating customer name:', error);
      alert('Erro ao atualizar nome do cliente');
    }
  };

  const handleAddItem = async () => {
    if (!tab?.id || !selectedProductId || !quantity) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const qty = Math.max(1, Math.floor(parseFloat(quantity)));
    if (qty <= 0 || isNaN(qty)) {
      alert('Quantidade deve ser um número inteiro maior que zero');
      return;
    }

    try {
      const { error } = await supabase
        .from('tab_items')
        .insert({
          tab_id: tab.id,
          product_id: selectedProductId,
          quantity: qty,
          unit_price: product.price,
          notes: itemNotes || null,
        });

      if (error) throw error;

      setShowAddItem(false);
      setSelectedProductId('');
      setQuantity('1');
      setItemNotes('');
      loadData();
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Erro ao adicionar item');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Remover este item da comanda?')) return;

    try {
      const { error } = await supabase
        .from('tab_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Erro ao remover item');
    }
  };

  const handleCloseTab = async () => {
    if (!tab?.id) return;

    if (!canCheckoutTab(effectiveUserRole)) {
      alert('Apenas administradores e gerentes podem realizar o checkout de comandas');
      return;
    }

    if (items.length === 0) {
      const confirmClose = window.confirm(
        'Esta comanda não possui itens.\nDeseja fechar mesmo assim?'
      );

      if (!confirmClose) return;

      try {
        const now = new Date().toISOString();

        const { error } = await supabase
          .from('tabs')
          .update({
            status: 'closed',
            closed_at: now,
          })
          .eq('id', tab.id)
          .eq('store_id', storeId);

        if (error) throw error;

        navigate('/app/tables');
      } catch (error) {
        console.error('Erro ao fechar comanda vazia:', error);
        alert('Erro ao fechar comanda');
      }

      return;
    }

    setShowCheckoutModal(true);
  };

  const handleCheckoutSuccess = () => {
    setShowCheckoutModal(false);
    navigate('/app/tables');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Mesa não encontrada</h2>
        <button
          onClick={() => navigate('/app/tables')}
          className="text-primary hover:opacity-80"
        >
          Voltar para Mesas
        </button>
      </div>
    );
  }

  const total = items.reduce((sum, item) => sum + Number(item.total_price), 0);

  if (!tab) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/app/tables')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>

        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Mesa {table.number}
          </h2>
          <p className="text-gray-600 mb-6">Esta mesa está livre</p>

          <div className="max-w-md mx-auto space-y-4">
            <input
              type="text"
              placeholder="Nome do cliente (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <button
              onClick={handleOpenTab}
              className="w-full bg-primary text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition"
            >
              Abrir Comanda
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/app/tables')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>

        {canCheckoutTab(effectiveUserRole) && (
          <button
            onClick={handleCloseTab}
            className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition"
          >
            Fechar Comanda
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            Mesa {table.number}
          </h2>

          {showCustomerInput ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Nome do cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                onClick={handleUpdateCustomerName}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
              >
                <Save className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setShowCustomerInput(false);
                  setCustomerName(tab.customer_name || '');
                }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomerInput(true)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <UserPlus className="w-5 h-5" />
              <span>{tab.customer_name || 'Adicionar cliente'}</span>
            </button>
          )}
        </div>

        <div className="text-sm text-gray-600 mb-4">
          Aberta em {new Date(tab.opened_at).toLocaleString('pt-BR')}
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Itens</h3>
            <button
              onClick={() => setShowAddItem(!showAddItem)}
              className="flex items-center space-x-2 bg-primary text-white px-4 py-2 rounded-lg hover:opacity-90 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Adicionar Item</span>
            </button>
          </div>

          {showAddItem && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Selecione um produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - {formatCurrency(product.price)}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Quantidade"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              <input
                type="text"
                placeholder="Observações (opcional)"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              <div className="flex space-x-2">
                <button
                  onClick={handleAddItem}
                  disabled={!selectedProductId || !quantity}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Adicionar
                </button>
                <button
                  onClick={() => {
                    setShowAddItem(false);
                    setSelectedProductId('');
                    setQuantity('1');
                    setItemNotes('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum item adicionado ainda
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {item.product.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {item.weight ? (
                        <span>{item.weight}g - {formatCurrency(item.unit_price)}</span>
                      ) : (
                        <span>{item.quantity}x {formatCurrency(item.unit_price)}</span>
                      )}
                      {item.notes && (
                        <span className="ml-2 italic">({item.notes})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(item.total_price)}
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 mt-6 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-primary">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showCheckoutModal && store && table && tab && (
        <TabCheckoutModal
          tabId={tab.id}
          storeId={storeId}
          tableNumber={table.number}
          items={items.map(item => ({
            id: item.id,
            product_name: item.product.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            weight: item.weight,
          }))}
          subtotal={total}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}
