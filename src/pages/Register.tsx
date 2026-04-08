import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store } from 'lucide-react';
import Turnstile, { TurnstileRef } from '../components/Turnstile';
import { useRateLimiter } from '../hooks/useRateLimiter';
import { validateTurnstileToken, getTurnstileErrorMessage } from '../lib/turnstile';
import { logger } from '../lib/logger';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaTimestamp, setCaptchaTimestamp] = useState<number | null>(null);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const rateLimiter = useRateLimiter({ cooldownSeconds: 10 });
  const turnstileRef = useRef<TurnstileRef>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check rate limit
    if (rateLimiter.isLocked) {
      setError(`Aguarde ${rateLimiter.remainingSeconds} segundos antes de tentar novamente.`);
      return;
    }

    // Validate password
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    // TURNSTILE TEMPORARILY DISABLED
    // TODO: Re-enable after configuring in Supabase Dashboard

    setLoading(true);

    try {
      logger.log('Attempting registration without captcha (temporarily disabled)...');
      const { error } = await signUp(email, password, fullName, storeName, phone, city, null);

      if (error) {
        logger.error('Registration failed:', error.message);

        // Check for specific error types
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          setError('Este email já está cadastrado. Faça login ou use outro email.');
        } else if (error.message.includes('captcha')) {
          setError('Verificação de segurança falhou. Tente novamente.');
        } else if (error.message.includes('Password should be')) {
          setError('A senha deve ter pelo menos 6 caracteres.');
        } else {
          setError('Não foi possível criar sua conta. Verifique seus dados e tente novamente.');
        }

        // Reset widget on error
        setCaptchaToken(null);
        setCaptchaTimestamp(null);
        turnstileRef.current?.reset();
        rateLimiter.startCooldown();
      } else {
        logger.log('Registration successful');
        navigate('/app/dashboard');
      }
    } catch (err) {
      logger.error('Unexpected registration error:', err);
      setError('Erro inesperado ao criar conta. Por favor, tente novamente.');
      setCaptchaToken(null);
      setCaptchaTimestamp(null);
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-primary to-primary-dark p-3 rounded-xl">
              <Store className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            Criar Conta
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Comece seu teste grátis de 7 dias
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                Nome Completo
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="Seu nome"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="••••••••"
              />
              <p className="mt-1 text-xs text-gray-500">Mínimo de 6 caracteres</p>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Informações da Loja</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="storeName" className="block text-sm font-medium text-gray-700 mb-2">
                    Nome da Loja
                  </label>
                  <input
                    id="storeName"
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    placeholder="Açaí da Praia"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Telefone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    placeholder="(11) 98765-4321"
                  />
                </div>

                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
                    Cidade
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    placeholder="São Paulo"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Turnstile
                ref={turnstileRef}
                onVerify={(token) => {
                  logger.log('Register Turnstile verified, storing token');
                  setCaptchaToken(token);
                  setCaptchaTimestamp(Date.now());
                }}
                onExpire={() => {
                  logger.log('Register Turnstile token expired');
                  setCaptchaToken(null);
                  setCaptchaTimestamp(null);
                }}
                onError={() => {
                  logger.error('Register Turnstile error');
                  setCaptchaToken(null);
                  setCaptchaTimestamp(null);
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || rateLimiter.isLocked}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Criando conta...' : rateLimiter.isLocked ? `Aguarde ${rateLimiter.remainingSeconds}s` : 'Criar conta grátis'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Já tem uma conta?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-primary hover:text-primary-dark font-medium"
              >
                Fazer login
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Voltar para home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
