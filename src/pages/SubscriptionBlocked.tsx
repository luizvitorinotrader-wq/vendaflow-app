import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Clock, CreditCard } from 'lucide-react';

export default function SubscriptionBlocked() {
  const { store, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 p-4 rounded-full">
              <AlertCircle className="w-12 h-12 text-red-600" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            Acesso Bloqueado
          </h1>

          <p className="text-center text-gray-600 mb-8">
            Seu acesso está temporariamente bloqueado
          </p>

          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <Clock className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-red-900 mb-1">
                  Período Expirado
                </h3>
                <p className="text-sm text-red-700">
                  Seu período de teste ou assinatura expirou
                </p>
              </div>
            </div>

            {store && (
              <div className="border-t border-red-200 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-red-700">Loja:</span>
                  <span className="font-medium text-red-900">{store.name}</span>
                </div>

                {store.plan_name && (
                  <div className="flex justify-between">
                    <span className="text-red-700">Plano:</span>
                    <span className="font-medium text-red-900">{store.plan_name}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-red-700">Status:</span>
                  <span className="font-medium text-red-900 capitalize">
                    {store.subscription_status === 'trial' && 'Teste Expirado'}
                    {store.subscription_status === 'cancelled' && 'Cancelado'}
                    {store.subscription_status === 'overdue' && 'Vencido'}
                    {store.is_blocked && 'Bloqueado'}
                  </span>
                </div>

                {store.trial_ends_at && store.subscription_status === 'trial' && (
                  <div className="flex justify-between">
                    <span className="text-red-700">Teste expirou em:</span>
                    <span className="font-medium text-red-900">
                      {formatDate(store.trial_ends_at)}
                    </span>
                  </div>
                )}

                {store.subscription_ends_at && (
                  <div className="flex justify-between">
                    <span className="text-red-700">Assinatura expirou em:</span>
                    <span className="font-medium text-red-900">
                      {formatDate(store.subscription_ends_at)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Como Reativar
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Para reativar seu acesso, entre em contato com o suporte
                </p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Email: suporte@vendaflow.com.br</li>
                  <li>• WhatsApp: (11) 99999-9999</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition"
          >
            Fazer Logout
          </button>
        </div>
      </div>
    </div>
  );
}
