/**
 * Cloudflare Turnstile Widget Component
 *
 * Isolated, resilient Turnstile widget that handles:
 * - Script loading (once per page)
 * - Widget lifecycle (render, reset, cleanup)
 * - Error handling and recovery
 * - StrictMode compatibility (no double renders)
 */

import { useEffect, useRef, useState } from 'react';
import { env } from '../../lib/env';

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  enabled?: boolean;
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const SCRIPT_ID = 'turnstile-script';

export default function TurnstileWidget({
  onVerify,
  onExpire,
  onError,
  enabled = true,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const mountedRef = useRef(false);

  const isEnabled = enabled && env.isTurnstileEnabled;

  useEffect(() => {
    if (!isEnabled) return;

    if (mountedRef.current) return;
    mountedRef.current = true;

    const existingScript = document.getElementById(SCRIPT_ID);

    if (existingScript) {
      if (window.turnstile) {
        setScriptLoaded(true);
      } else {
        existingScript.addEventListener('load', () => setScriptLoaded(true));
        existingScript.addEventListener('error', () => setScriptError(true));
      }
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;

    script.addEventListener('load', () => {
      setScriptLoaded(true);
    });

    script.addEventListener('error', () => {
      console.error('Failed to load Turnstile script from Cloudflare');
      setScriptError(true);
      onError?.();
    });

    document.head.appendChild(script);

    return () => {
      mountedRef.current = false;
    };
  }, [isEnabled, onError]);

  useEffect(() => {
    if (!isEnabled || !scriptLoaded || !containerRef.current || !window.turnstile) {
      return;
    }

    if (widgetIdRef.current) {
      return;
    }

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: env.turnstileSiteKey,
        callback: (token: string) => {
          onVerify(token);
        },
        'expired-callback': () => {
          onExpire?.();
        },
        'error-callback': () => {
          console.error('Turnstile widget error callback triggered');
          onError?.();
        },
        theme: 'light',
        size: 'normal',
      });

      widgetIdRef.current = widgetId;
    } catch (error) {
      console.error('Failed to render Turnstile widget:', error);
      setScriptError(true);
      onError?.();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (error) {
          console.warn('Failed to remove Turnstile widget:', error);
        }
        widgetIdRef.current = null;
      }
    };
  }, [isEnabled, scriptLoaded, onVerify, onExpire, onError]);

  if (!isEnabled) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">
          Verificação de segurança desabilitada (modo desenvolvimento)
        </p>
      </div>
    );
  }

  if (scriptError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <p className="text-sm text-red-700">
          Falha ao carregar verificação de segurança. Verifique sua conexão e recarregue a página.
        </p>
      </div>
    );
  }

  if (!scriptLoaded) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-600">Carregando verificação de segurança...</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="flex justify-center" />;
}
