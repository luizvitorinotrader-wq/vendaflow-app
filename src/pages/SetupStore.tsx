import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Store, MapPin, Phone } from 'lucide-react';
import { logger } from '../lib/logger';

export default function SetupStore() {
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [plan, setPlan] = useState<'starter' | 'professional' | 'premium'>('starter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const { user, hasValidStore, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkExistingStore = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      logger.log('Verificando se usuário já possui loja configurada...');

      if (hasValidStore) {
        logger.log('Usuário já possui loja válida, redirecionando para dashboard...');
        navigate('/app/dashboard', { replace: true });
        return;
      }

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('store_id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile?.store_id) {
        logger.log('Store ID encontrado, verificando existência da loja...');

        const { data: existingStore } = await supabase
          .from('stores')
          .select('*')
          .eq('id', existingProfile.store_id)
          .maybeSingle();

        if (existingStore) {
          logger.log('Loja existente encontrada, redirecionando para dashboard...');
          await refreshProfile();
          navigate('/app/dashboard', { replace: true });
          return;
        }
      }

      logger.log('Nenhuma loja encontrada, permitindo configuração...');
      setChecking(false);
    };

    checkExistingStore();
  }, [user, hasValidStore, navigate, refreshProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!user) return;

    try {
      logger.log('Verificando se o usuário já possui uma loja...');

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('store_id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile?.store_id) {
        logger.log('Usuário já possui store_id:', existingProfile.store_id);

        const { data: existingStore } = await supabase
          .from('stores')
          .select('*')
          .eq('id', existingProfile.store_id)
          .maybeSingle();

        if (existingStore) {
          logger.log('Loja existente encontrada, redirecionando...');
          await refreshProfile();
          navigate('/app');
          return;
        }
      }

      logger.log('Criando nova loja...');
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .insert({
          name: storeName,
          owner_id: user.id,
          phone,
          address,
          plan,
        })
        .select()
        .single();

      if (storeError) throw storeError;

      logger.log('Loja criada:', store);
      logger.log('Atualizando perfil com store_id...');

      await supabase
        .from('profiles')
        .update({ store_id: store.id })
        .eq('id', user.id);

      await refreshProfile();
      navigate('/app');
    } catch (err) {
      logger.error('Erro ao criar loja:', err);
      setError('Erro ao criar loja. Tente novamente.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
        <div className="text-gray-600">Verificando configuração...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-primary to-primary-dark p-3 rounded-xl">
              <Store className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            Configure sua Loja
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Vamos começar com as informações básicas da sua negócio
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="storeName" className="block text-sm font-medium text-gray-700 mb-2">
                Nome da Loja
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="storeName"
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  placeholder="Açaí da Praia"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Telefone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  placeholder="(11) 98765-4321"
                />
              </div>
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                Endereço
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  placeholder="Rua das Praias, 123"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Escolha seu Plano
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { value: 'starter', name: 'Starter', price: 'R$ 79,90/mês' },
                  { value: 'professional', name: 'Pro', price: 'R$ 99,90/mês' },
                  { value: 'premium', name: 'Premium', price: 'R$ 199,90/mês' },
                ].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPlan(p.value as typeof plan)}
                    className={`p-4 border-2 rounded-lg text-center transition ${
                      plan === p.value
                        ? 'border-primary bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{p.name}</div>
                    <div className="text-sm text-gray-600 mt-1">{p.price}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500 text-center">
                7 dias de teste grátis em todos os planos
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Criando loja...' : 'Criar minha loja'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
