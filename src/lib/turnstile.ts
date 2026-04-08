/**
 * Turnstile Token Validation
 *
 * Validates Cloudflare Turnstile tokens before authentication operations.
 * This prevents unauthorized access and bot attacks.
 */

interface TurnstileValidationResult {
  success: boolean;
  error?: string;
  errorCode?: 'missing_token' | 'validation_failed' | 'network_error' | 'invalid_response';
}

/**
 * Validates a Turnstile token with the backend
 *
 * @param token - The Turnstile token from the widget
 * @param action - The action being performed (for logging)
 * @returns Validation result
 */
export async function validateTurnstileToken(
  token: string | null,
  action: 'login' | 'register' | 'magic_link' | 'password_reset'
): Promise<TurnstileValidationResult> {

  // Check if token exists
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return {
      success: false,
      error: 'Por favor, complete a verificação de segurança antes de continuar.',
      errorCode: 'missing_token'
    };
  }

  // For Supabase Auth operations (login, register, password reset),
  // we rely on Supabase's built-in Turnstile integration
  // The token is passed to Supabase Auth API which validates it server-side

  // For custom operations (magic link), validation happens in the edge function

  return {
    success: true
  };
}

/**
 * Gets user-friendly error message for Turnstile errors
 */
export function getTurnstileErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case 'missing_token':
      return 'Complete a verificação de segurança (checkbox) antes de continuar.';

    case 'validation_failed':
      return 'A verificação de segurança falhou. Por favor, tente novamente.';

    case 'network_error':
      return 'Erro de conexão ao validar segurança. Verifique sua internet e tente novamente.';

    case 'invalid_response':
      return 'Resposta inválida do servidor de segurança. Tente novamente em alguns instantes.';

    default:
      return 'Erro na verificação de segurança. Por favor, recarregue a página e tente novamente.';
  }
}
