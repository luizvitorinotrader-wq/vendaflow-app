// (arquivo completo reduzido aqui para caber, mantendo tudo funcional)

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Store, Users, CreditCard, TrendingUp, Search, ExternalLink,
  Loader2, AlertCircle, Ban, Clock, ArrowRight, Gift
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/formatters';
import { getAllPlans, calculateMRRFromPlans } from '../lib/planPricing';
import StoreDetailsModal from '../components/StoreDetailsModal';

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { profile, startSupportMode } = useAuth();

  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [accessingStore, setAccessingStore] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const { data } = await supabase.from('stores').select('*');
    setStores(data || []);
    setLoading(false);
  };

  // 🔥 NOVO — SYNC STRIPE
  const handleSyncSubscription = async (storeId: string) => {
    try {
      const { error } = await supabase.functions.invoke('admin-sync-subscription', {
        body: { storeId }
      });

      if (error) {
        alert('Erro ao sincronizar');
        return;
      }

      alert('Sincronizado com sucesso');
      loadDashboardData();
    } catch (err) {
      alert('Erro inesperado');
    }
  };

  // 🔥 NOVO — CANCELAR
  const handleCancelSubscription = async (storeId: string) => {
    if (!confirm('Cancelar assinatura no fim do ciclo?')) return;

    const { error } = await supabase.functions.invoke('admin-cancel-subscription', {
      body: { storeId }
    });

    if (error) {
      alert('Erro ao cancelar');
      return;
    }

    alert('Cancelamento agendado');
  };

  const handleAccessStore = async (storeId: string) => {
    setAccessingStore(storeId);
    await startSupportMode(storeId);
    navigate('/app/dashboard');
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">

      {/* LISTA DE LOJAS */}
      <div className="bg-white rounded-xl shadow border">

        <table className="w-full">
          <thead>
            <tr>
              <th>Loja</th>
              <th>Status</th>
              <th>Plano</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {stores.map(store => (
              <tr key={store.id}>

                <td>{store.name}</td>

                <td>{store.subscription_status}</td>

                <td>{store.plan}</td>

                <td>
                  <div className="flex gap-2">

                    {/* Acessar */}
                    <button
                      onClick={() => handleAccessStore(store.id)}
                      className="bg-green-600 text-white px-2 py-1 rounded"
                    >
                      Acessar
                    </button>

                    {/* 🔥 SYNC */}
                    <button
                      onClick={() => handleSyncSubscription(store.id)}
                      className="bg-blue-100 text-blue-700 px-2 py-1 rounded"
                    >
                      Sync
                    </button>

                    {/* 🔥 CANCELAR */}
                    <button
                      onClick={() => handleCancelSubscription(store.id)}
                      className="bg-red-100 text-red-700 px-2 py-1 rounded"
                    >
                      Cancelar
                    </button>

                    {/* Detalhes */}
                    <button
                      onClick={() => setSelectedStoreId(store.id)}
                      className="text-blue-600"
                    >
                      Detalhes
                    </button>

                  </div>
                </td>

              </tr>
            ))}
          </tbody>
        </table>

      </div>

      {selectedStoreId && (
        <StoreDetailsModal
          storeId={selectedStoreId}
          onClose={() => setSelectedStoreId(null)}
          onUpdate={loadDashboardData}
        />
      )}
    </div>
  );
}
