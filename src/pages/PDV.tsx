import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatMoney } from '../lib/formatters';
import { Trash2, X, ShoppingBag, Plus, Minus, ShoppingCart } from 'lucide-react';
import WeightModal from '../components/WeightModal';
import type { ProductWithCategory, CategoryOption } from '../lib/database.types';
import { logger } from '../lib/logger';
import { logAuditEvent } from '../lib/auditLogger';
import { useProductCategories } from '../hooks/useProductCategories';

type Product = ProductWithCategory;

interface CartItem {
  product: Product;
  quantity: number;
  weight?: number;
  unitPrice: number;
  totalPrice: number;
  displayName: string;
}

interface Table {
  id: string;
  number: number;
  name: string | null;
  status: string;
}

interface Tab {
  id: string;
  table_id: string;
  customer_name: string | null;
  status: string;
}

export default function PDV() {
  const { storeId } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'debit' | 'pix'>('pix');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedWeightProduct, setSelectedWeightProduct] = useState<Product | null>(null);
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Estados para integração PDV + Mesas
  const [saleChannel, setSaleChannel] = useState<'counter' | 'table'>('counter');
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);

  const { categories: structuredCategories, isEnabled: categoriesEnabled } =
    useProductCategories(storeId);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!storeId) return;

      const { data: store } = await supabase
        .from('stores')
        .select('subscription_status, is_blocked')
        .eq('id', storeId)
        .maybeSingle();

      if (!store) return;

      const isBlocked = store.is_blocked;
      const isInactive = !['active', 'trial'].includes(store.subscription_status);

      if (isBlocked || isInactive) {
        navigate('/app/subscription-blocked');
      }
    };

    checkSubscription();
  }, [storeId, navigate]);

  useEffect(() => {
    if (storeId) {
      loadProducts();
    }
  }, [storeId, categoriesEnabled]);

  const loadProducts = async () => {
    if (!storeId) return;

    const { data } = await supabase
      .from('products')
      .select(`
        *,
        category_structured:product_categories(*)
      `)
      .eq('store_id', storeId)
      .eq('active', true)
      .order('name');

    setProducts(data || []);
    setLoading(false);
  };

  const loadTables = async () => {
    if (!storeId) return;

    const { data: tablesData, error } = await supabase
      .from('tables')
      .select('id, number, name, status')
      .eq('store_id', storeId)
      .neq('status', 'inactive')
      .order('number');

    if (error) throw error;

    setTables(tablesData || []);
  };

  const loadTableTab = async (tableId: string) => {
    if (!storeId || !tableId) return;

    const { data: tabData } = await supabase
      .from('tabs')
      .select('id, table_id, customer_name, status')
      .eq('store_id', storeId)
      .eq('table_id', tableId)
      .eq('status', 'open')
      .maybeSingle();

    setSelectedTab(tabData);

    if (!tabData) {
      alert('Esta mesa não possui comanda aberta. Abra uma comanda primeiro na tela de Mesas.');
    }
  };

  const handleProductClick = (product: Product) => {
    if (product.pricing_type === 'weight') {
      setSelectedWeightProduct(product);
    } else {
      addToCart(product, 1);
    }
  };

  const handleWeightSubmit = (weight: number, totalPrice: number) => {
    if (selectedWeightProduct) {
      addToCart(selectedWeightProduct, 1, weight);
      setSelectedWeightProduct(null);
    }
  };

  const addToCart = (product: Product, quantity: number, weight?: number) => {
    const existingIndex = cart.findIndex(item => {
      if (product.pricing_type === 'weight') {
        return false;
      }
      return item.product.id === product.id;
    });

    if (existingIndex >= 0 && product.pricing_type === 'unit') {
      const newCart = [...cart];
      newCart[existingIndex].quantity += quantity;
      newCart[existingIndex].totalPrice = newCart[existingIndex].unitPrice * newCart[existingIndex].quantity;
      setCart(newCart);
    } else {
      let unitPrice = product.price;
      let totalPrice = product.price * quantity;
      let displayName = product.name;

      if (product.pricing_type === 'weight' && weight && product.price_per_kg) {
        unitPrice = (weight / 1000) * product.price_per_kg;
        totalPrice = unitPrice;
        displayName = `${product.name} (${weight}g)`;
      }

      setCart([...cart, {
        product,
        quantity,
        weight,
        unitPrice,
        totalPrice,
        displayName,
      }]);
    }
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const increaseQuantity = (index: number) => {
    const newCart = [...cart];
    const item = newCart[index];

    if (item.product.pricing_type === 'unit') {
      item.quantity += 1;
      item.totalPrice = item.unitPrice * item.quantity;
      setCart(newCart);
    }
  };

  const decreaseQuantity = (index: number) => {
    const newCart = [...cart];
    const item = newCart[index];

    if (item.product.pricing_type === 'unit') {
      if (item.quantity > 1) {
        item.quantity -= 1;
        item.totalPrice = item.unitPrice * item.quantity;
        setCart(newCart);
      } else {
        removeFromCart(index);
      }
    }
  };

  const clearCart = () => {
    setCart([]);
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const finalizeSale = async () => {
    if (!storeId || cart.length === 0) return;

    setProcessing(true);

    try {
      // ========================================
      // MODO MESA - Adicionar itens à comanda
      // ========================================
      if (saleChannel === 'table') {
        // Validar que existe uma tab selecionada
        if (!selectedTab) {
          throw new Error('Nenhuma mesa selecionada ou comanda não está aberta');
        }

        // ETAPA 3.1: Revalidar tab no banco antes de inserir
        // Garante que a comanda ainda está aberta e previne race conditions
        const { data: currentTab, error: tabError } = await supabase
          .from('tabs')
          .select('id, table_id, customer_name, status')
          .eq('id', selectedTab.id)
          .eq('status', 'open')
          .maybeSingle();

        if (tabError) throw tabError;
        if (!currentTab) {
          throw new Error('A comanda desta mesa foi fechada ou não está mais disponível');
        }

        // ETAPA 3.4: Preparar itens para insert único (não usar loop)
        // Sanitizar quantidade para número inteiro (mesma lógica de TabView)
        // Agora com suporte para produtos por peso
        const itemsToInsert = cart.map(cartItem => {
          const qty = Math.max(1, Math.floor(cartItem.quantity));

          return {
            tab_id: currentTab.id, // ETAPA 3.4: Usar currentTab validada
            product_id: cartItem.product.id,
            quantity: qty,
            unit_price: cartItem.unitPrice,
            weight: cartItem.weight || null, // Suporte a produtos por peso
            notes: null,
            // ETAPA 3.3: FUTURO - Adicionar created_via = 'pdv' para rastreamento
            // Requer migration: ALTER TABLE tab_items ADD COLUMN created_via text DEFAULT 'manual';
            // Valores possíveis: 'manual' (TabView), 'pdv', 'api'
          };
        });

        // Insert único de todos os itens
        const { error: insertError } = await supabase
          .from('tab_items')
          .insert(itemsToInsert);

        if (insertError) throw insertError;

        // ETAPA 3.2: Mensagem de sucesso melhorada
        const table = tables.find(t => t.id === currentTab.table_id);
        const tableNumber = table?.number || '';
        const itemCount = cart.length;
        const itemText = itemCount === 1 ? 'item adicionado' : 'itens adicionados';
        const customerInfo = currentTab.customer_name
          ? ` (${currentTab.customer_name})`
          : '';

        // Limpar carrinho
        setCart([]);

        // TODO: Substituir alert por toast/notification quando disponível
        alert(`✔ ${itemCount} ${itemText} à Mesa ${tableNumber}${customerInfo}`);

        // Finaliza aqui - não continua para fluxo de balcão
        return;
      }

      // ========================================
      // MODO BALCÃO - Fluxo atual (inalterado)
      // ========================================
      const total = getTotal();

      // Get current cash session
      const { data: currentSession, error: sessionError } = await supabase
        .from('cash_sessions')
        .select('id')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!currentSession) {
        throw new Error('Nenhum caixa aberto. Abra um caixa antes de realizar vendas.');
      }

      // Prepare sale items data
      const saleItemsData = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        weight: item.weight || null,
      }));

      logger.log('=== INICIANDO VENDA ATÔMICA ===');
      logger.log('Total:', total);
      logger.log('Método:', paymentMethod);
      logger.log('Itens:', cart.length);

      // Complete sale using fully atomic transaction
      // This handles: sale creation, sale_items, cash_entry, AND stock deduction
      const { data: saleResult, error: saleError } = await supabase.rpc(
        'complete_sale_transaction',
        {
          p_store_id: storeId,
          p_total_amount: total,
          p_payment_method: paymentMethod,
          p_items: saleItemsData,
          p_cash_session_id: currentSession.id
        }
      );

      if (saleError) {
        logger.error('❌ Erro na transação:', saleError);
        throw saleError;
      }

      logger.log('✅ Venda concluída com sucesso!');
      logger.log('ID da venda:', saleResult.sale_id);
      logger.log('Itens processados:', saleResult.items_processed);

      // Log audit event for sale completion
      await logAuditEvent({
        eventType: 'sale_completed',
        eventStatus: 'success',
        metadata: {
          sale_id: saleResult.sale_id,
          total_amount: total,
          payment_method: paymentMethod,
          item_count: cart.length,
          store_id: storeId,
        },
      });

      setCart([]);
      loadProducts();
      alert('Venda realizada com sucesso!');
    } catch (error) {
      logger.error('❌ Erro ao finalizar venda:', error);

      // Extract user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      // Check for common error patterns
      if (errorMessage.includes('Insufficient stock') || errorMessage.includes('Estoque insuficiente')) {
        alert(`Estoque insuficiente!\n\n${errorMessage}`);
      } else if (errorMessage.includes('Cash session not found')) {
        alert('Caixa não encontrado ou fechado. Abra um caixa antes de realizar vendas.');
      } else if (errorMessage.includes('Weight required')) {
        alert('Peso obrigatório para produtos vendidos por peso.');
      } else if (errorMessage.includes('comanda desta mesa foi fechada') || errorMessage.includes('não está mais disponível')) {
        alert(errorMessage);
      } else if (errorMessage.includes('Nenhuma mesa selecionada') || errorMessage.includes('comanda não está aberta')) {
        alert(errorMessage);
      } else {
        alert(`Erro ao finalizar venda:\n${errorMessage}`);
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const filteredProducts = selectedCategory === 'all'
    ? products
    : products.filter(p => {
        if (p.category_structured) {
          return p.category_structured.id === selectedCategory;
        }
        return false;
      });

  const categories: CategoryOption[] = structuredCategories.length > 0
    ? [
        { id: 'all', name: 'Todos' },
        ...structuredCategories.map(c => ({ id: c.id, name: c.name }))
      ]
    : [
        { id: 'all', name: 'Todos' }
      ];

  const getCategoryColor = (categoryName: string) => {
    const colors: Record<string, string> = {
      'Todos': 'bg-gray-600 hover:bg-gray-700',
      'Açaí': 'bg-purple-600 hover:bg-purple-700',
      'Suco': 'bg-orange-600 hover:bg-orange-700',
      'Lanche': 'bg-amber-600 hover:bg-amber-700',
      'Bebida': 'bg-blue-600 hover:bg-blue-700',
      'Adicional': 'bg-green-600 hover:bg-green-700',
    };
    return colors[categoryName] || 'bg-emerald-600 hover:bg-emerald-700';
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col lg:flex-row gap-3 p-1 pb-20 lg:pb-1">
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-lg p-3 md:p-4">
          <div className="flex overflow-x-auto gap-2 pb-2 lg:pb-0 lg:flex-wrap scrollbar-hide">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-white transition-all transform active:scale-95 shadow-md whitespace-nowrap flex-shrink-0 ${
                  selectedCategory === category.id
                    ? getCategoryColor(category.name) + ' ring-4 ring-white ring-opacity-30'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {category.name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl shadow-lg p-3 md:p-4 overflow-auto min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => handleProductClick(product)}
                className="bg-white hover:bg-gradient-to-br hover:from-green-50 hover:to-emerald-50 border-2 border-gray-200 hover:border-green-500 rounded-xl md:rounded-2xl p-4 md:p-5 transition-all transform hover:scale-105 active:scale-95 shadow-md hover:shadow-xl min-h-[140px] md:min-h-[140px] flex flex-col justify-between group"
              >
                <div>
                  <div className="font-bold text-gray-900 mb-2 text-base md:text-lg leading-tight line-clamp-2 group-hover:text-green-700">
                    {product.name}
                  </div>
                  <div className="inline-block px-2 py-1 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 mb-3">
                    {product.category_structured?.name || '-'}
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-black text-green-600">
                  {product.pricing_type === 'weight' && product.price_per_kg
                    ? `R$ ${formatMoney(product.price_per_kg)}/kg`
                    : `R$ ${formatMoney(product.price)}`
                  }
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-[420px] flex-col gap-3">
        <div className="flex-1 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl p-5 flex flex-col text-white relative">
          {processing && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-2xl z-10 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-xl shadow-2xl">
                <div className="flex items-center gap-4">
                  <svg className="animate-spin h-8 w-8 text-green-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  <span className="font-semibold text-gray-900 text-lg">Processando venda...</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-bold">Pedido</h2>
              <span className="bg-green-500 text-white text-sm font-bold px-2 py-1 rounded-full">
                {cart.length}
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-red-500 hover:bg-opacity-20 transition"
              >
                <Trash2 className="w-4 h-4" />
                Limpar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto mb-4 space-y-2 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Carrinho vazio</p>
                <p className="text-sm mt-1">Adicione produtos para iniciar</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-700 rounded-xl p-4 hover:bg-gray-600 transition group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm mb-1 truncate">
                        {item.displayName}
                      </div>
                      <div className="text-xs text-gray-400">
                        {item.weight ? (
                          `${item.weight}g × R$ ${formatMoney(item.product.price_per_kg || 0)}/kg`
                        ) : (
                          `R$ ${formatMoney(item.unitPrice)} cada`
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(index)}
                      className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition ml-2"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    {item.product.pricing_type === 'unit' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decreaseQuantity(index)}
                          className="bg-gray-600 hover:bg-gray-500 text-white rounded-lg p-1.5 transition active:scale-95"
                          title="Diminuir quantidade"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-white font-bold text-lg min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => increaseQuantity(index)}
                          className="bg-green-600 hover:bg-green-500 text-white rounded-lg p-1.5 transition active:scale-95"
                          title="Aumentar quantidade"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">
                        Produto por peso
                      </div>
                    )}
                    <div className="font-black text-green-400 text-lg whitespace-nowrap">
                      R$ {formatMoney(item.totalPrice)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-700">
            <div className="flex items-baseline justify-between">
              <span className="text-gray-400 text-lg font-medium">TOTAL</span>
              <span className="text-4xl font-black text-green-400">
                R$ {formatMoney(getTotal())}
              </span>
            </div>

            {/* Seletor de Canal de Venda */}
            <div>
              <label className="text-gray-400 text-sm font-medium mb-2 block">
                Canal de Venda
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setSaleChannel('counter');
                    setSelectedTableId('');
                    setSelectedTab(null);
                  }}
                  className={`px-4 py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
                    saleChannel === 'counter'
                      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-400 ring-opacity-30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🏪 Balcão
                </button>
                <button
                  onClick={() => {
                    setSaleChannel('table');
                    loadTables();
                  }}
                  className={`px-4 py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
                    saleChannel === 'table'
                      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-400 ring-opacity-30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🪑 Mesa
                </button>
              </div>
            </div>

            {/* Seletor de Mesa (quando canal = Mesa) */}
            {saleChannel === 'table' && (
              <div>
                <label className="text-gray-400 text-sm font-medium mb-2 block">
                  Selecionar Mesa
                </label>
                <select
                  value={selectedTableId}
                  onChange={(e) => {
                    setSelectedTableId(e.target.value);
                    if (e.target.value) {
                      loadTableTab(e.target.value);
                    } else {
                      setSelectedTab(null);
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-gray-700 text-white font-medium border-2 border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Escolha uma mesa</option>
                  {tables.map(table => (
                    <option key={table.id} value={table.id}>
                      Mesa {table.number} {table.name ? `- ${table.name}` : ''}
                    </option>
                  ))}
                </select>

                {selectedTableId && selectedTab && (
                  <div className="mt-2 p-3 bg-green-900/30 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-sm font-medium">
                      ✓ Comanda aberta
                      {selectedTab.customer_name && `: ${selectedTab.customer_name}`}
                    </p>
                  </div>
                )}

                {selectedTableId && !selectedTab && (
                  <div className="mt-2 p-3 bg-red-900/30 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm font-medium">
                      ✗ Esta mesa não possui comanda aberta
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'pix', label: 'PIX', icon: '💳' },
                { value: 'cash', label: 'Dinheiro', icon: '💵' },
                { value: 'debit', label: 'Débito', icon: '💳' },
                { value: 'credit', label: 'Crédito', icon: '💳' },
              ].map(method => (
                <button
                  key={method.value}
                  onClick={() => setPaymentMethod(method.value as any)}
                  className={`px-4 py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
                    paymentMethod === method.value
                      ? 'bg-green-500 text-white shadow-lg ring-4 ring-green-400 ring-opacity-30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-lg mr-1">{method.icon}</span>
                  {method.label}
                </button>
              ))}
            </div>

            <button
              onClick={finalizeSale}
              disabled={cart.length === 0 || processing || (saleChannel === 'table' && !selectedTab)}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-5 rounded-2xl font-black text-xl hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl"
            >
              {processing ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  PROCESSANDO...
                </span>
              ) : (
                'FINALIZAR VENDA'
              )}
            </button>
          </div>
        </div>
      </div>

      <div className={`fixed lg:hidden inset-0 bg-black bg-opacity-50 z-40 transition-opacity ${showMobileCart ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowMobileCart(false)} />

      <div className={`fixed lg:hidden bottom-0 left-0 right-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-t-3xl shadow-2xl transition-transform duration-300 z-50 ${showMobileCart ? 'translate-y-0' : 'translate-y-full'}`} style={{ maxHeight: '85vh' }}>
        <div className="p-5 flex flex-col h-full max-h-[85vh]">
          {processing && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-t-3xl z-10 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-xl shadow-2xl">
                <div className="flex items-center gap-4">
                  <svg className="animate-spin h-8 w-8 text-green-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  <span className="font-semibold text-gray-900 text-lg">Processando venda...</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-bold text-white">Pedido</h2>
              <span className="bg-green-500 text-white text-sm font-bold px-2 py-1 rounded-full">
                {cart.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-red-500 hover:bg-opacity-20 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpar
                </button>
              )}
              <button
                onClick={() => setShowMobileCart(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto mb-4 space-y-2 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Carrinho vazio</p>
                <p className="text-sm mt-1">Adicione produtos para iniciar</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-700 rounded-xl p-4 hover:bg-gray-600 transition group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm mb-1 truncate">
                        {item.displayName}
                      </div>
                      <div className="text-xs text-gray-400">
                        {item.weight ? (
                          `${item.weight}g × R$ ${formatMoney(item.product.price_per_kg || 0)}/kg`
                        ) : (
                          `R$ ${formatMoney(item.unitPrice)} cada`
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(index)}
                      className="text-red-400 hover:text-red-300 transition ml-2"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    {item.product.pricing_type === 'unit' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decreaseQuantity(index)}
                          className="bg-gray-600 hover:bg-gray-500 text-white rounded-lg p-1.5 transition active:scale-95"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-white font-bold text-lg min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => increaseQuantity(index)}
                          className="bg-green-600 hover:bg-green-500 text-white rounded-lg p-1.5 transition active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">
                        Produto por peso
                      </div>
                    )}
                    <div className="font-black text-green-400 text-lg whitespace-nowrap">
                      R$ {formatMoney(item.totalPrice)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-700">
            <div className="flex items-baseline justify-between">
              <span className="text-gray-400 text-lg font-medium">TOTAL</span>
              <span className="text-3xl md:text-4xl font-black text-green-400">
                R$ {formatMoney(getTotal())}
              </span>
            </div>

            {/* Seletor de Canal de Venda - Mobile */}
            <div>
              <label className="text-gray-400 text-sm font-medium mb-2 block">
                Canal de Venda
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setSaleChannel('counter');
                    setSelectedTableId('');
                    setSelectedTab(null);
                  }}
                  className={`px-3 py-2 rounded-xl font-bold transition-all transform active:scale-95 text-sm ${
                    saleChannel === 'counter'
                      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-400 ring-opacity-30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🏪 Balcão
                </button>
                <button
                  onClick={() => {
                    setSaleChannel('table');
                    loadTables();
                  }}
                  className={`px-3 py-2 rounded-xl font-bold transition-all transform active:scale-95 text-sm ${
                    saleChannel === 'table'
                      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-400 ring-opacity-30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🪑 Mesa
                </button>
              </div>
            </div>

            {/* Seletor de Mesa - Mobile */}
            {saleChannel === 'table' && (
              <div>
                <label className="text-gray-400 text-sm font-medium mb-2 block">
                  Selecionar Mesa
                </label>
                <select
                  value={selectedTableId}
                  onChange={(e) => {
                    setSelectedTableId(e.target.value);
                    if (e.target.value) {
                      loadTableTab(e.target.value);
                    } else {
                      setSelectedTab(null);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-gray-700 text-white font-medium border-2 border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">Escolha uma mesa</option>
                  {tables.map(table => (
                    <option key={table.id} value={table.id}>
                      Mesa {table.number} {table.name ? `- ${table.name}` : ''}
                    </option>
                  ))}
                </select>

                {selectedTableId && selectedTab && (
                  <div className="mt-2 p-2 bg-green-900/30 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-xs font-medium">
                      ✓ Comanda aberta
                      {selectedTab.customer_name && `: ${selectedTab.customer_name}`}
                    </p>
                  </div>
                )}

                {selectedTableId && !selectedTab && (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-xs font-medium">
                      ✗ Esta mesa não possui comanda aberta
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'pix', label: 'PIX', icon: '💳' },
                { value: 'cash', label: 'Dinheiro', icon: '💵' },
                { value: 'debit', label: 'Débito', icon: '💳' },
                { value: 'credit', label: 'Crédito', icon: '💳' },
              ].map(method => (
                <button
                  key={method.value}
                  onClick={() => setPaymentMethod(method.value as any)}
                  className={`px-3 py-2 md:px-4 md:py-3 rounded-xl font-bold transition-all transform active:scale-95 text-sm md:text-base ${
                    paymentMethod === method.value
                      ? 'bg-green-500 text-white shadow-lg ring-4 ring-green-400 ring-opacity-30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-lg mr-1">{method.icon}</span>
                  {method.label}
                </button>
              ))}
            </div>

            <button
              onClick={finalizeSale}
              disabled={cart.length === 0 || processing || (saleChannel === 'table' && !selectedTab)}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-4 md:py-5 rounded-2xl font-black text-lg md:text-xl hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl"
            >
              {processing ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  PROCESSANDO...
                </span>
              ) : (
                'FINALIZAR VENDA'
              )}
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowMobileCart(true)}
        className="lg:hidden fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-full shadow-2xl z-30 flex items-center gap-2 font-bold hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-110 active:scale-95"
      >
        <ShoppingCart className="w-6 h-6" />
        <span className="bg-white text-green-600 text-sm font-black px-2 py-0.5 rounded-full min-w-[1.5rem]">
          {cart.length}
        </span>
      </button>

      {selectedWeightProduct && (
        <WeightModal
          product={selectedWeightProduct}
          onConfirm={handleWeightSubmit}
          onClose={() => setSelectedWeightProduct(null)}
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
