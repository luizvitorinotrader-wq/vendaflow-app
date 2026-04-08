/**
 * Environment Variables Validation
 *
 * Validates and exports all required environment variables for the application.
 * Throws clear errors if critical variables are missing.
 */

interface EnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnstileSiteKey: string;
  isTurnstileEnabled: boolean;
  appUrl: string;
  stripePublishableKey: string;
}

function validateEnv(): EnvConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const disableTurnstile = import.meta.env.VITE_DISABLE_TURNSTILE === 'true';
  const appUrl = import.meta.env.VITE_APP_URL;
  const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

  const errors: string[] = [];

  if (!supabaseUrl || typeof supabaseUrl !== 'string') {
    errors.push('VITE_SUPABASE_URL is required');
  }

  if (!supabaseAnonKey || typeof supabaseAnonKey !== 'string') {
    errors.push('VITE_SUPABASE_ANON_KEY is required');
  }

  if (!disableTurnstile && (!turnstileSiteKey || typeof turnstileSiteKey !== 'string')) {
    errors.push('VITE_TURNSTILE_SITE_KEY is required (or set VITE_DISABLE_TURNSTILE=true)');
  }

  if (!appUrl || typeof appUrl !== 'string') {
    errors.push('VITE_APP_URL is required');
  }

  if (!stripePublishableKey || typeof stripePublishableKey !== 'string') {
    errors.push('VITE_STRIPE_PUBLISHABLE_KEY is required');
  }

  if (errors.length > 0) {
    const errorMessage = [
      '❌ Missing required environment variables:',
      ...errors.map(e => `   - ${e}`),
      '',
      '💡 Check your .env file and ensure all variables are set correctly.',
    ].join('\n');

    console.error(errorMessage);
    throw new Error('Missing required environment variables. Check console for details.');
  }

  const config: EnvConfig = {
    supabaseUrl,
    supabaseAnonKey,
    turnstileSiteKey: turnstileSiteKey || '',
    isTurnstileEnabled: !disableTurnstile,
    appUrl,
    stripePublishableKey,
  };

  if (import.meta.env.DEV) {
    console.log('✅ Environment configuration loaded:', {
      supabaseUrl: config.supabaseUrl,
      turnstileEnabled: config.isTurnstileEnabled,
      appUrl: config.appUrl,
    });
  }

  return config;
}

export const env = validateEnv();
