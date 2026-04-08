/**
 * Global Window Type Extensions
 */

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
}

interface TurnstileInstance {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  getResponse: (widgetId: string) => string | undefined;
}

interface PlausibleFunction {
  (event: string, options?: { props?: Record<string, string | number> }): void;
  q?: Array<[string, Record<string, string | number>?]>;
  o?: Record<string, unknown>;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
    onloadTurnstileCallback?: () => void;
    plausible?: PlausibleFunction;
  }
}

export {};
