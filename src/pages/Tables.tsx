import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Users,
  Clock3,
  Ban,
  Lock,
  Pencil,
  Trash2,
  X,
  UtensilsCrossed,
  CircleDollarSign,
  LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getPlanLimits, canCreateTable, getTableLimitMessage } from '../lib/planLimits';
import NewTableModal from '../components/NewTableModal';
import { formatCurrency } from '../lib/formatters';

interface Table {
  id: string;
  number: number;
  name: string | null;
  capacity: number;
  status: 'free' | 'occupied' | 'inactive';
}

interface Tab {
  id: string;
  table_id: string;
  customer_name: string | null;
  status: string;
  opened_at: string;
}

interface TabItem {
  total_price: number;
}

export default function Tables() {
  const { store, storeId, effectiveUserRole, effectivePlan, isSupportMode } = useAuth();
  const navigate = useNavigate();

  const [tables, setTables] = useState<Table[]>([]);
  const [tabs, setTabs] = useState<Record<string, Tab>>({});
  const [tabTotals, setTabTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showNewTableModal, setShowNewTableModal] = useState(false);

  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);

  const planLimits = getPlanLimits(effectivePlan);
  const hasTablesFeature = planLimits.hasTablesFeature;
  const canManageTables = effectiveUserRole === 'owner' || effectiveUserRole === 'manager';

  useEffect(() => {
    if (storeId) {
      loadTables();
    }
  }, [storeId]);

  const loadTables = async () => {
    if (!storeId) return;

    setLoading(true);
    try {
      const { data: tablesData, error: tablesError } = await supabase
        .from('tables')
        .select('*')
        .eq('store_id', storeId)
        .order('number', { ascending: true });

      if (tablesError) throw tablesError;
      setTables(tablesData || []);

      const { data: openTabsData, error: tabsError } = await supabase
        .from('tabs')
        .select('id, table_id, customer_name, status, opened_at')
        .eq('store_id', storeId)
        .eq('status', 'open');

      if (tabsError) throw tabsError;

      const tabsByTable: Record<string, Tab> = {};
      (openTabsData || []).forEach((tab) => {
        if (
          !tabsByTable[tab.table_id] ||
          new Date(tab.opened_at) > new Date(tabsByTable[tab.table_id].opened_at)
        ) {
          tabsByTable[tab.table_id] = tab;
        }
      });
      setTabs(tabsByTable);

      const totals: Record<string, number> = {};
      for (const tab of openTabsData || []) {
        const { data: itemsData } = await supabase
          .from('tab_items')
          .select('total_price')
          .eq('tab_id', tab.id);

        const total = (itemsData || []).reduce(
          (sum: number, item: TabItem) => sum + Number(item.total_price),
          0
        );

        totals[tab.table_id] = total;
      }
      setTabTotals(totals);
    } catch (error) {
      console.error('Error loading tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTableClick = (table: Table) => {
    if (table.status === 'inactive') return;

    const tab = tabs[table.id];
    if (tab) {
      navigate(`/app/tables/${table.id}/tab/${tab.id}`);
    } else {
      navigate(`/app/tables/${table.id}`);
    }
  };

  const handleCreateTable = () => {
    const activeTableCount = tables.filter((t) => t.status !== 'inactive').length;
    if (canCreateTable(activeTableCount, effectivePlan)) {
      setShowNewTableModal(true);
    }
  };

  const handleTableCreated = () => {
    setShowNewTableModal(false);
    loadTables();
  };

  const handleEditTable = (table: Table) => {
    setEditingTable({
      ...table,
      name: table.name || '',
    });
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    if (savingEdit) return;
    setShowEditModal(false);
    setEditingTable(null);
  };

  const handleUpdateTable = async () => {
    if (!editingTable || !storeId) return;

    const trimmedName = editingTable.name?.trim() || '';

    if (!editingTable.number || editingTable.number < 1) {
      alert('Informe um número de mesa válido.');
      return;
    }

    if (!editingTable.capacity || editingTable.capacity < 1) {
      alert('Informe uma capacidade válida.');
      return;
    }

    try {
      setSavingEdit(true);

      const duplicateNumber = tables.find(
        (table) => table.id !== editingTable.id && table.number === editingTable.number
      );

      if (duplicateNumber) {
        alert('Já existe uma mesa com esse número.');
        return;
      }

      const { error } = await supabase
        .from('tables')
        .update({
          number: editingTable.number,
          name: trimmedName === '' ? null : trimmedName,
          capacity: editingTable.capacity,
        })
        .eq('id', editingTable.id)
        .eq('store_id', storeId);

      if (error) throw error;

      setShowEditModal(false);
      setEditingTable(null);
      await loadTables();
    } catch (error) {
      console.error('Error updating table:', error);
      alert('Erro ao atualizar mesa.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTable = async (table: Table) => {
    if (!storeId) return;

    const hasOpenTab = !!tabs[table.id];
    if (hasOpenTab) {
      alert('Não é possível excluir uma mesa com comanda aberta.');
      return;
    }

    const confirmed = window.confirm(
      `Deseja excluir a Mesa ${table.number}${table.name ? ` (${table.name})` : ''}?`
    );
    if (!confirmed) return;

    try {
      setDeletingTableId(table.id);

      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', table.id)
        .eq('store_id', storeId);

      if (error) throw error;

      await loadTables();
    } catch (error) {
      console.error('Error deleting table:', error);
      alert('Erro ao excluir mesa.');
    } finally {
      setDeletingTableId(null);
    }
  };

  const activeTables = useMemo(
    () => tables.filter((t) => t.status !== 'inactive'),
    [tables]
  );

  const occupiedCount = useMemo(
    () => activeTables.filter((table) => !!tabs[table.id]).length,
    [activeTables, tabs]
  );

  const freeCount = useMemo(
    () => activeTables.filter((table) => !tabs[table.id]).length,
    [activeTables, tabs]
  );

  const totalOpenTabsValue = useMemo(() => {
    return Object.values(tabTotals).reduce((sum, value) => sum + Number(value || 0), 0);
  }, [tabTotals]);

  const occupancyRate = activeTables.length
    ? Math.round((occupiedCount / activeTables.length) * 100)
    : 0;

  if (!hasTablesFeature && !isSupportMode) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Recurso Bloqueado</h2>
          <p className="text-gray-600 mb-6">{getTableLimitMessage(effectivePlan)}</p>
          <button
            onClick={() => navigate('/app/my-subscription')}
            className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition"
          >
            Fazer Upgrade
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando mesas...</p>
        </div>
      </div>
    );
  }

  const activeTableCount = activeTables.length;
  const canAddMore = isSupportMode ? false : canCreateTable(activeTableCount, effectivePlan);

  const tableCountText = isSupportMode
    ? `${activeTableCount} mesa${activeTableCount !== 1 ? 's' : ''} carregada${activeTableCount !== 1 ? 's' : ''}`
    : `${activeTableCount} de ${planLimits.maxTables} mesas ativas`;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold text-gray-900">Mesas</h1>
          </div>
          <p className="text-gray-600">{tableCountText}</p>
        </div>

        {!isSupportMode && canManageTables && (
          <button
            onClick={handleCreateTable}
            disabled={!canAddMore}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition ${
              canAddMore
                ? 'bg-primary text-white hover:opacity-90 shadow-sm'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Plus className="w-5 h-5" />
            <span>Nova Mesa</span>
          </button>
        )}
      </div>

      {/* Resumo operacional */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Mesas ativas</span>
            <UtensilsCrossed className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{activeTableCount}</div>
          <p className="text-xs text-gray-500 mt-1">Operação disponível agora</p>
        </div>

        <div className="bg-white rounded-2xl border border-green-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-green-700">Livres</span>
            <Users className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-700">{freeCount}</div>
          <p className="text-xs text-green-600 mt-1">Prontas para receber</p>
        </div>

        <div className="bg-white rounded-2xl border border-red-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-red-700">Ocupadas</span>
            <Clock3 className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-700">{occupiedCount}</div>
          <p className="text-xs text-red-600 mt-1">Ocupação: {occupancyRate}%</p>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-amber-700">Total em aberto</span>
            <CircleDollarSign className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700">
            {formatCurrency(totalOpenTabsValue)}
          </div>
          <p className="text-xs text-amber-600 mt-1">Comandas abertas</p>
        </div>
      </div>

      {!isSupportMode && !canAddMore && canManageTables && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-800">
            Você atingiu o limite de {planLimits.maxTables} mesas do seu plano.{' '}
            <button
              onClick={() => navigate('/app/my-subscription')}
              className="underline font-medium hover:text-yellow-900"
            >
              Fazer upgrade
            </button>
          </p>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Nenhuma mesa cadastrada
          </h3>
          <p className="text-gray-600 mb-6">
            Comece criando sua primeira mesa para atendimento.
          </p>
          {!isSupportMode && canManageTables && canAddMore && (
            <button
              onClick={handleCreateTable}
              className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>Criar Primeira Mesa</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {tables.map((table) => {
            const tab = tabs[table.id];
            const total = tabTotals[table.id] || 0;
            const isOccupied = !!tab;
            const isInactive = table.status === 'inactive';

            const statusBadge = isInactive
              ? 'bg-gray-100 text-gray-700'
              : isOccupied
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700';

            const statusLabel = isInactive
              ? 'Inativa'
              : isOccupied
              ? 'Ocupada'
              : 'Livre';

            const cardClasses = isInactive
              ? 'bg-gray-100 border-gray-300 opacity-70'
              : isOccupied
              ? 'bg-white border-red-300 hover:border-red-400 hover:shadow-lg'
              : 'bg-white border-green-200 hover:border-green-300 hover:shadow-lg';

            return (
              <div
                key={table.id}
                className={`relative rounded-2xl border shadow-sm transition-all ${cardClasses}`}
              >
                {/* Ações */}
                {canManageTables && !isSupportMode && (
                  <div className="absolute top-3 right-3 z-10 flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTable(table);
                      }}
                      className="bg-white/95 border border-gray-200 p-2 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700"
                      title="Editar mesa"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTable(table);
                      }}
                      disabled={deletingTableId === table.id}
                      className="bg-white/95 border border-gray-200 p-2 rounded-lg shadow-sm hover:bg-red-50 text-red-600 disabled:opacity-50"
                      title="Excluir mesa"
                    >
                      {deletingTableId === table.id ? (
                        <svg
                          className="w-4 h-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleTableClick(table)}
                  disabled={isInactive}
                  className={`w-full text-left p-5 rounded-2xl ${isInactive ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-start justify-between pr-24">
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Mesa
                      </div>
                      <div className="text-3xl font-bold text-gray-900 leading-none">
                        {table.number}
                      </div>
                      {table.name && (
                        <div className="text-sm text-gray-600 mt-2">{table.name}</div>
                      )}
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      {table.capacity} {table.capacity === 1 ? 'lugar' : 'lugares'}
                    </div>

                    {isOccupied && tab ? (
                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {tab.customer_name || 'Comanda aberta'}
                        </div>
                        <div className="text-xl font-bold text-red-600">
                          {formatCurrency(total)}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`text-sm font-medium ${
                          isInactive ? 'text-gray-500' : 'text-green-600'
                        }`}
                      >
                        {isInactive ? 'Indisponível' : 'Pronta para abrir'}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {isOccupied ? 'Ver comanda' : isInactive ? 'Mesa inativa' : 'Abrir comanda'}
                    </span>
                    {!isInactive && (
                      <span className={`font-semibold ${isOccupied ? 'text-red-600' : 'text-primary'}`}>
                        Entrar →
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showNewTableModal && (
        <NewTableModal
          storeId={store!.id}
          currentTableCount={activeTableCount}
          maxTables={planLimits.maxTables}
          effectivePlan={effectivePlan}
          onClose={() => setShowNewTableModal(false)}
          onSuccess={handleTableCreated}
        />
      )}

      {showEditModal && editingTable && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Editar Mesa</h2>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número da Mesa
                </label>
                <input
                  type="number"
                  min="1"
                  value={editingTable.number}
                  onChange={(e) =>
                    setEditingTable({
                      ...editingTable,
                      number: Number(e.target.value),
                    })
                  }
                  className="w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder="Número"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome/Apelido (opcional)
                </label>
                <input
                  type="text"
                  value={editingTable.name || ''}
                  onChange={(e) =>
                    setEditingTable({
                      ...editingTable,
                      name: e.target.value,
                    })
                  }
                  className="w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder="Ex.: Varanda, Salão esquerdo..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Deixe em branco para remover o apelido da mesa.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Capacidade
                </label>
                <input
                  type="number"
                  min="1"
                  value={editingTable.capacity}
                  onChange={(e) =>
                    setEditingTable({
                      ...editingTable,
                      capacity: Number(e.target.value),
                    })
                  }
                  className="w-full border border-gray-300 rounded-xl px-3 py-2"
                  placeholder="Capacidade"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={savingEdit}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleUpdateTable}
                disabled={savingEdit}
                className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {savingEdit && (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
