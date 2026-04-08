import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Store, Loader2 } from 'lucide-react';
import { logAuditEvent } from '../lib/auditLogger';
import { logger } from '../lib/logger';

export default function MagicLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'validating' | 'error'>('validating');
  const [errorType, setErrorType] = useState<'invalid' | 'expired' | 'used' | 'server'>('invalid');

  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setErrorType('invalid');
        return;
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-magic-link`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          }
        );

        const data = await response.json();

        if (!data.success) {
          setStatus('error');
          setErrorType(data.error === 'expired' ? 'expired' : data.error === 'used' ? 'used' : 'invalid');
          return;
        }

        if (data.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          if (data.userId) {
            await logAuditEvent({
              userId: data.userId,
              eventType: 'magic_link_used',
              eventStatus: 'success',
            });
          }

          navigate('/app');
        } else {
          setStatus('error');
          setErrorType('server');
        }
      } catch (error) {
        logger.error('Error validating magic link:', error);
        setStatus('error');
        setErrorType('server');
      }
    };

    validateToken();
  }, [searchParams, navigate]);

  if (status === 'validating') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-gradient-to-r from-primary to-primary-dark p-3 rounded-xl">
                <Store className="w-8 h-8 text-white" />
              </div>
            </div>

            <div className="text-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Validando acesso...
              </h1>
              <p className="text-gray-600">
                Aguarde enquanto verificamos seu link de acesso.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 p-4 rounded-full">
              <Store className="w-8 h-8 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">
            {errorType === 'expired' && 'Link expirado'}
            {errorType === 'used' && 'Link já utilizado'}
            {errorType === 'invalid' && 'Link inválido'}
            {errorType === 'server' && 'Erro no servidor'}
          </h1>

          <p className="text-center text-gray-600 mb-8">
            {errorType === 'expired' && 'Seu link de acesso expirou. Links são válidos por apenas 15 minutos. Solicite um novo link para entrar na sua conta.'}
            {errorType === 'used' && 'Este link já foi utilizado e não pode ser reutilizado. Solicite um novo link se precisar acessar sua conta novamente.'}
            {errorType === 'invalid' && 'Seu link de acesso não é válido. Solicite um novo link para entrar na sua conta.'}
            {errorType === 'server' && 'Ocorreu um erro ao processar seu acesso. Tente novamente em alguns instantes.'}
          </p>

          <button
            onClick={() => navigate('/login')}
            className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition mb-3"
          >
            Solicitar novo link
          </button>

          <button
            onClick={() => navigate('/login')}
            className="w-full text-gray-600 hover:text-gray-900 py-2 text-sm"
          >
            Voltar para login
          </button>
        </div>
      </div>
    </div>
  );
}
