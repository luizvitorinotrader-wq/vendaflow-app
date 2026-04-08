import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, X } from 'lucide-react';

export default function SupportModeBanner() {
  const { isSupportMode, store, endSupportMode } = useAuth();

  if (!isSupportMode || !store) {
    return null;
  }

  return (
    <div className="bg-orange-500 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        <div>
          <span className="font-semibold">Modo suporte ativo</span>
          <span className="mx-2">—</span>
          <span>Loja: {store.name}</span>
        </div>
      </div>
      <button
        onClick={endSupportMode}
        className="flex items-center gap-2 bg-white text-orange-600 px-4 py-2 rounded-lg font-medium hover:bg-orange-50 transition"
      >
        <X className="w-4 h-4" />
        Sair do modo suporte
      </button>
    </div>
  );
}
