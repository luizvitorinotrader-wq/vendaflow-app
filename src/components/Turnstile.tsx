import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { logger } from '../lib/logger';

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export interface TurnstileRef {
  reset: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact';
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(({ onVerify, onError, onExpire }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const renderAttemptedRef = useRef(false);
  const isMountedRef = useRef(true);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          logger.log('Resetting Turnstile widget via ref');
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {
          logger.error('Error resetting Turnstile via ref:', e);
        }
      }
    }
  }));

  useEffect(() => {
    isMountedRef.current = true;

    if (!siteKey) {
      logger.error('VITE_TURNSTILE_SITE_KEY is not configured');
      setLoadError(true);
      return;
    }

    const scriptId = 'turnstile-script';
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      if (window.turnstile) {
        logger.log('Turnstile script already loaded');
        if (isMountedRef.current) {
          setIsLoaded(true);
        }
      } else {
        logger.log('Turnstile script exists but not ready, waiting...');
        checkIntervalRef.current = setInterval(() => {
          if (window.turnstile && isMountedRef.current) {
            logger.log('Turnstile now available');
            setIsLoaded(true);
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
          }
        }, 100);

        timeoutRef.current = setTimeout(() => {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }
          if (!window.turnstile && isMountedRef.current) {
            logger.error('Turnstile failed to load after timeout');
            setLoadError(true);
          }
        }, 5000);
      }
      return;
    }

    logger.log('Loading Turnstile script for the first time');
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      logger.log('Turnstile script loaded successfully');
      if (isMountedRef.current) {
        setIsLoaded(true);
      }
    };

    script.onerror = () => {
      logger.error('Failed to load Turnstile script');
      if (isMountedRef.current) {
        setLoadError(true);
      }
    };

    document.head.appendChild(script);

    return () => {
      isMountedRef.current = false;

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (widgetIdRef.current && window.turnstile) {
        try {
          logger.log('Cleaning up Turnstile widget:', widgetIdRef.current);
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
          renderAttemptedRef.current = false;
        } catch (e) {
          logger.error('Error removing Turnstile widget:', e);
        }
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || !window.turnstile || renderAttemptedRef.current || !isMountedRef.current) {
      return;
    }

    if (widgetIdRef.current) {
      logger.log('Turnstile widget already rendered');
      return;
    }

    const container = containerRef.current;

    if (container.children.length > 0) {
      logger.log('Turnstile container already has children, skipping render');
      return;
    }

    renderAttemptedRef.current = true;
    logger.log('Rendering Turnstile widget');

    try {
      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => {
          if (!isMountedRef.current) {
            logger.log('Turnstile callback fired after unmount, ignoring');
            return;
          }
          logger.log('Turnstile verification successful');
          onVerify(token);
        },
        'error-callback': () => {
          if (!isMountedRef.current) {
            logger.log('Turnstile error callback fired after unmount, ignoring');
            return;
          }
          logger.error('Turnstile error callback triggered');
          onError?.();
        },
        'expired-callback': () => {
          if (!isMountedRef.current) {
            logger.log('Turnstile expired callback fired after unmount, ignoring');
            return;
          }
          logger.log('Turnstile token expired, resetting...');
          onExpire?.();
          if (widgetIdRef.current && window.turnstile) {
            try {
              window.turnstile.reset(widgetIdRef.current);
            } catch (e) {
              logger.error('Error resetting Turnstile:', e);
            }
          }
        },
        theme: 'light',
        size: 'normal',
      });
      logger.log('Turnstile widget rendered with ID:', widgetIdRef.current);
    } catch (error) {
      logger.error('Failed to render Turnstile:', error);
      renderAttemptedRef.current = false;
      if (isMountedRef.current) {
        setLoadError(true);
      }
    }
  }, [isLoaded, siteKey, onVerify, onError, onExpire]);

  if (!siteKey) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800 text-center font-medium">
          ⚠️ Verificação de segurança não disponível
        </p>
        <p className="text-xs text-yellow-700 text-center mt-1">
          Entre em contato com o suporte se o problema persistir.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-800 text-center font-medium">
          ❌ Erro ao carregar verificação de segurança
        </p>
        <p className="text-xs text-red-700 text-center mt-1">
          Verifique sua conexão e recarregue a página. Se o erro persistir, tente usar outro navegador.
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div ref={containerRef} className="turnstile-widget" />
    </div>
  );
});

Turnstile.displayName = 'Turnstile';

export default Turnstile;
