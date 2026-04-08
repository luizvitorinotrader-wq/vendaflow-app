import { AlertTriangle } from 'lucide-react';

interface InactivityWarningProps {
  onContinue: () => void;
}

export default function InactivityWarning({ onContinue }: InactivityWarningProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="bg-yellow-100 p-3 rounded-full mb-4">
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Sessão inativa
          </h2>

          <p className="text-gray-600 mb-6">
            Sua sessão está prestes a expirar por inatividade. Deseja continuar conectado?
          </p>

          <button
            onClick={onContinue}
            className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-semibold hover:opacity-90 transition"
          >
            Continuar conectado
          </button>

          <p className="text-xs text-gray-500 mt-4">
            Se não houver ação, você será desconectado automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
