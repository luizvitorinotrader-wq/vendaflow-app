import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store, Eye, EyeOff } from 'lucide-react';
import TurnstileWidget from '../components/auth/TurnstileWidget';
import { env } from '../lib/env';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileFallback, setTurnstileFallback] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  // Fallback: If Turnstile doesn't verify after 15 seconds, allow login without it
  useEffect(() => {
    if (!env.isTurnstileEnabled) return;

    const fallbackTimer = setTimeout(() => {
      if (!turnstileToken && !turnstileError) {
        console.warn('[Login] Turnstile fallback activated - verification timeout');
        setTurnstileFallback(true);
      }
    }, 15000); // 15 seconds

    return () => clearTimeout(fallbackTimer);
  }, [turnstileToken, turnstileError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    console.log('[Login] Submit started', { email });

    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha e-mail e senha.');
      return;
    }

    // Only block if Turnstile is enabled AND errored (not just missing token)
    if (env.isTurnstileEnabled && turnstileError && !turnstileFallback) {
      setError('Falha na verificação de segurança. Aguarde ou atualize a página.');
      return;
    }

    setLoading(true);

    try {
      console.log('[Login] Calling signIn...');
      const result = await signIn(email, password, turnstileToken || undefined);
      console.log('[Login] signIn result:', result);

      if (!result.success) {
        console.log('[Login] signIn failed:', result.error);
        setError(result.error || 'Não foi possível fazer login.');
        setTurnstileToken(null);
        setLoading(false);
      } else {
        console.log('[Login] signIn success - navigating to dashboard');
        // Keep loading state true to show spinner while redirecting
        // PublicRoute will handle the actual redirect based on user role
        navigate('/app/dashboard');
      }
    } catch (err) {
      console.error('[Login] Unexpected login error:', err);
      setError('Erro inesperado ao fazer login. Tente novamente.');
      setTurnstileToken(null);
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
            VendaFlow
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Faça login para acessar seu sistema
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

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
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <Link
                to="/register"
                className="text-primary hover:text-primary-dark font-medium"
              >
                Criar conta grátis
              </Link>
              <Link
                to="/forgot-password"
                className="text-gray-600 hover:text-gray-700"
              >
                Esqueci meu usuário ou senha
              </Link>
            </div>

            {env.isTurnstileEnabled && (
              <div>
                <TurnstileWidget
                  onVerify={(token) => {
                    setTurnstileToken(token);
                    setTurnstileError(false);
                    setTurnstileFallback(false);
                  }}
                  onExpire={() => {
                    setTurnstileToken(null);
                  }}
                  onError={() => {
                    setTurnstileToken(null);
                    setTurnstileError(true);
                  }}
                />
                {turnstileFallback && !turnstileToken && (
                  <p className="text-xs text-amber-600 mt-2 text-center">
                    Verificação de segurança opcional - você pode prosseguir com login
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (env.isTurnstileEnabled && turnstileError && !turnstileFallback)}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
