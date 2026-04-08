import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Clock, Ban, Lock, Pencil, Trash2, X } from 'lucide-react';
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

  console.log('DEBUG PLAN:', {
    storePlan: store?.plan,
    effectivePlan,
  });

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
    console.log('[STORE DEBUG - Tables]', {
      store_id: store?.id,
      storeId,
    });

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

      console.log('[STORE DEBUG - Tables] Loaded tables:', tablesData?.length || 0);
      setTables(tablesData || []);

      const { data: openTabsData, error: tabsError } = await supabase
        .from('tabs')
        .select('id, table_id, customer_name, status, opened_at')
        .eq('store_id', storeId)
        .eq('status', 'open');

      if (tabsError) throw tabsError;

      const tabsByTable: Record<string, Tab> = {};

      (openTabsData || []).forEach((tab) => {
        if (tab.status === 'open') {
          if (
            !tabsByTable[tab.table_id] ||
            new Date(tab.opened_at) > new Date(tabsByTable[tab.table_id].opened_at)
          ) {
            tabsByTable[tab.table_id] = tab;
          }
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
        (table) =>
          table.id !== editingTable.id &&
          table.number === editingTable.number
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

  const activeTableCount = tables.filter((t) => t.status !== 'inactive').length;
  const canAddMore = isSupportMode ? false : canCreateTable(activeTableCount, effectivePlan);

  const tableCountText = isSupportMode
    ? `${activeTableCount} mesa${activeTableCount !== 1 ? 's' : ''} carregada${activeTableCount !== 1 ? 's' : ''}`
    : `${activeTableCount} de ${planLimits.maxTables} mesas ativas`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mesas</h1>
          <p className="text-gray-600 mt-1">{tableCountText}</p>
        </div>

        {!isSupportMode && canManageTables && (
          <button
            onClick={handleCreateTable}
            disabled={!canAddMore}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition ${
              canAddMore
                ? 'bg-primary text-white hover:opacity-90'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Plus className="w-5 h-5" />
            <span>Nova Mesa</span>
          </button>
        )}
      </div>

      {!isSupportMode && !canAddMore && canManageTables && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
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
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Nenhuma mesa cadastrada</h3>
          <p className="text-gray-600 mb-6">
            Comece criando sua primeira mesa para atendimento.
          </p>
          {!isSupportMode && canManageTables && canAddMore && (
            <button
              onClick={handleCreateTable}
              className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition inline-flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Criar Primeira Mesa</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {tables.map((table) => {
            const tab = tabs[table.id];
            const total = tabTotals[table.id] || 0;
            const isOccupied = !!tab;

            return (
              <div key={table.id} className="relative group">
                <button
                  onClick={() => handleTableClick(table)}
                  disabled={table.status === 'inactive'}
                  className={`w-full p-6 rounded-lg border-2 transition-all ${
                    table.status === 'inactive'
                      ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-60'
                      : isOccupied
                      ? 'bg-green-50 border-green-500 hover:border-green-600 hover:shadow-md'
                      : 'bg-white border-gray-200 hover:border-primary hover:shadow-md'
                  }`}
                >
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-3">
                      {!isOccupied && table.status !== 'inactive' && (
                        <Users className="w-8 h-8 text-gray-400" />
                      )}
                      {isOccupied && <Clock className="w-8 h-8 text-green-600" />}
                      {table.status === 'inactive' && (
                        <Ban className="w-8 h-8 text-gray-400" />
                      )}
                    </div>

                    <div className="font-bold text-2xl text-gray-900 mb-1">
                      Mesa {table.number}
                    </div>

                    {table.name && (
                      <div className="text-sm text-gray-600 mb-2">{table.name}</div>
                    )}

                    <div className="text-xs text-gray-500 mb-3">
                      {table.capacity} lugares
                    </div>

                    {!isOccupied && table.status !== 'inactive' && (
                      <p className="text-gray-600">Livre</p>
                    )}

                    {isOccupied && tab && (
                      <div className="space-y-1">
                        {tab.customer_name && (
                          <div className="text-sm font-medium text-gray-900">
                            {tab.customer_name}
                          </div>
                        )}
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(total)}
                        </div>
                      </div>
                    )}

                    {table.status === 'inactive' && (
                      <div className="text-sm font-medium text-gray-500">Inativa</div>
                    )}
                  </div>
                </button>

                {canManageTables && !isSupportMode && (
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTable(table);
                      }}
                      className="bg-white p-2 rounded shadow hover:bg-gray-100 text-gray-700"
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
                      className="bg-white p-2 rounded shadow hover:bg-red-100 text-red-600 disabled:opacity-50"
                      title="Excluir mesa"
                    >
                      {deletingTableId === table.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Capacidade"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={savingEdit}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleUpdateTable}
                disabled={savingEdit}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
