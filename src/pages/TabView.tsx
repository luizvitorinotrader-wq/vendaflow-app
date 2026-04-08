import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  X,
  UserPlus,
  Receipt,
  Clock3,
  User,
  ShoppingBag,
  CircleDollarSign,
} from 'lucide-react';
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
  const [closingEmptyTab, setClosingEmptyTab] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

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
      setAddingItem(true);

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
    } finally {
      setAddingItem(false);
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
        setClosingEmptyTab(true);

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
      } finally {
        setClosingEmptyTab(false);
      }

      return;
    }

    setShowCheckoutModal(true);
  };

  const handleCheckoutSuccess = () => {
    setShowCheckoutModal(false);
    navigate('/app/tables');
  };

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.total_price), 0),
    [items]
  );

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items]
  );

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

  if (!tab) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/app/tables')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center max-w-2xl mx-auto">
          <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-8 h-8 text-gray-500" />
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-2">Mesa {table.number}</h2>
          {table.name && <p className="text-gray-500 mb-2">{table.name}</p>}
          <p className="text-gray-600 mb-8">Esta mesa está livre no momento</p>

          <div className="max-w-md mx-auto space-y-4">
            <input
              type="text"
              placeholder="Nome do cliente (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <button
              onClick={handleOpenTab}
              className="w-full bg-primary text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition"
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
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <button
          onClick={() => navigate('/app/tables')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar para Mesas</span>
        </button>

        {canCheckoutTab(effectiveUserRole) && (
          <button
            onClick={handleCloseTab}
            disabled={closingEmptyTab}
            className="bg-primary text-white px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {closingEmptyTab && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            Fechar Comanda
          </button>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Comanda
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Mesa {table.number}</h1>
              {table.name && <p className="text-gray-500 mt-1">{table.name}</p>}
            </div>

            <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700">
              Aberta
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                <User className="w-4 h-4" />
                Cliente
              </div>

              {showCustomerInput ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Nome do cliente"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateCustomerName}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <Save className="w-4 h-4" />
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setShowCustomerInput(false);
                        setCustomerName(tab.customer_name || '');
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomerInput(true)}
                  className="text-left w-full hover:opacity-90 transition"
                >
                  <div className="font-semibold text-gray-900">
                    {tab.customer_name || 'Adicionar cliente'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                    <UserPlus className="w-3 h-3" />
                    Editar cliente
                  </div>
                </button>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                <Clock3 className="w-4 h-4" />
                Abertura
              </div>
              <div className="font-semibold text-gray-900">
                {new Date(tab.opened_at).toLocaleDateString('pt-BR')}
              </div>
              <div className="text-sm text-gray-600">
                {new Date(tab.opened_at).toLocaleTimeString('pt-BR')}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                <ShoppingBag className="w-4 h-4" />
                Itens
              </div>
              <div className="font-semibold text-gray-900">{totalItems}</div>
              <div className="text-sm text-gray-600">
                {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5">
          <div className="flex items-center gap-2 text-amber-700 text-sm mb-3">
            <CircleDollarSign className="w-4 h-4" />
            Total da comanda
          </div>
          <div className="text-4xl font-bold text-amber-700">
            {formatCurrency(total)}
          </div>
          <p className="text-sm text-amber-600 mt-2">
            Atualizado conforme os itens adicionados
          </p>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Itens da Comanda</h3>
            <p className="text-sm text-gray-500 mt-1">
              Adicione produtos e acompanhe o total em tempo real
            </p>
          </div>

          <button
            onClick={() => setShowAddItem(!showAddItem)}
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl hover:opacity-90 transition"
          >
            <Plus className="w-5 h-5" />
            {showAddItem ? 'Fechar formulário' : 'Adicionar Item'}
          </button>
        </div>

        {showAddItem && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-5 space-y-3 border border-gray-200">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Selecione um produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {formatCurrency(product.price)}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Quantidade"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                step="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              <input
                type="text"
                placeholder="Observações (opcional)"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleAddItem}
                disabled={!selectedProductId || !quantity || addingItem}
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-xl hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {addingItem && (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                Adicionar
              </button>

              <button
                onClick={() => {
                  setShowAddItem(false);
                  setSelectedProductId('');
                  setQuantity('1');
                  setItemNotes('');
                }}
                className="px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-400" />
            <p className="font-medium">Nenhum item adicionado ainda</p>
            <p className="text-sm mt-1">
              Você pode fechar a comanda vazia ou adicionar itens.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">
                    {item.product.name}
                  </div>

                  <div className="text-sm text-gray-600 mt-1">
                    {item.weight ? (
                      <span>
                        {item.weight}g • {formatCurrency(item.unit_price)}
                      </span>
                    ) : (
                      <span>
                        {item.quantity}x • {formatCurrency(item.unit_price)}
                      </span>
                    )}

                    {item.notes && (
                      <span className="ml-2 italic text-gray-500">({item.notes})</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Subtotal</div>
                    <div className="font-bold text-gray-900">
                      {formatCurrency(item.total_price)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                    title="Remover item"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-200 mt-6 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-3xl font-bold text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {showCheckoutModal && store && table && tab && (
        <TabCheckoutModal
          tabId={tab.id}
          storeId={storeId}
          tableNumber={table.number}
          items={items.map((item) => ({
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
