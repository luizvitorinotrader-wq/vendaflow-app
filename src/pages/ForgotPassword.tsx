import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Store, ArrowLeft } from 'lucide-react';
import Turnstile, { TurnstileRef } from '../components/Turnstile';
import { useRateLimiter } from '../hooks/useRateLimiter';
import { logAuditEvent } from '../lib/auditLogger';
import { validateTurnstileToken, getTurnstileErrorMessage } from '../lib/turnstile';
import { logger } from '../lib/logger';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaTimestamp, setCaptchaTimestamp] = useState<number | null>(null);
  const navigate = useNavigate();
  const rateLimiter = useRateLimiter({ cooldownSeconds: 30 });
  const turnstileRef = useRef<TurnstileRef>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check rate limit
    if (rateLimiter.isLocked) {
      setError(`Aguarde ${rateLimiter.remainingSeconds} segundos antes de solicitar novamente.`);
      return;
    }

    // TURNSTILE TEMPORARILY DISABLED
    // TODO: Re-enable after configuring in Supabase Dashboard

    setLoading(true);
    rateLimiter.startCooldown();

    try {
      logger.log('Requesting password reset without captcha (temporarily disabled)...');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        logger.error('Password reset error:', resetError.message);

        // Check for specific errors
        if (resetError.message.includes('captcha')) {
          setError('Verificação de segurança falhou. Tente novamente.');
          setCaptchaToken(null);
          setCaptchaTimestamp(null);
          turnstileRef.current?.reset();
          setLoading(false);
          return;
        }
        // For security, we don't reveal if email exists
      }

      logger.log('Password reset request sent successfully');

      await logAuditEvent({
        eventType: 'password_reset_requested',
        eventStatus: 'success',
        metadata: { email },
      });

      setSuccess(true);
    } catch (error) {
      logger.error('Unexpected password reset error:', error);
      // For security, always show success even on error
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-green-100 p-4 rounded-full">
                <Store className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">
              Email enviado!
            </h1>

            <p className="text-center text-gray-600 mb-8">
              Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.
            </p>

            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
            >
              Voltar para login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </button>

          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-primary to-primary-dark p-3 rounded-xl">
              <Store className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            Recuperar acesso
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Informe seu e-mail cadastrado e enviaremos instruções para recuperar sua conta.
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="seu@email.com"
              />
            </div>

            <div className="pt-2">
              <Turnstile
                ref={turnstileRef}
                onVerify={(token) => {
                  logger.log('Password reset Turnstile verified, storing token');
                  setCaptchaToken(token);
                  setCaptchaTimestamp(Date.now());
                }}
                onExpire={() => {
                  logger.log('Password reset Turnstile token expired');
                  setCaptchaToken(null);
                  setCaptchaTimestamp(null);
                }}
                onError={() => {
                  logger.error('Password reset Turnstile error');
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
              {loading ? 'Enviando...' : rateLimiter.isLocked ? `Aguarde ${rateLimiter.remainingSeconds}s` : 'Enviar instruções'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
