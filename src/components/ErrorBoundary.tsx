import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { logger } from '../lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-center text-gray-900">
              Algo deu errado
            </h2>
            <p className="mt-2 text-sm text-center text-gray-600">
              Ocorreu um erro inesperado. Por favor, recarregue a página.
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-primary text-white py-2 px-4 rounded-md hover:opacity-90"
              >
                Recarregar Página
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-4 p-4 bg-gray-100 rounded text-xs overflow-auto">
                <pre>{this.state.error.toString()}</pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
