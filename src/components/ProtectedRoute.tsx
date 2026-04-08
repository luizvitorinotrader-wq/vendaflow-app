import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  console.log('[ProtectedRoute] Render', { loading, user: !!user });

  useEffect(() => {
    console.log('[ProtectedRoute] useEffect', { loading, user: !!user });
    if (!loading && !user) {
      console.log('[ProtectedRoute] Redirecting to /login');
      navigate('/login', { replace: true });
    } else if (!loading && user) {
      console.log('[ProtectedRoute] User authenticated, allowing render');
    }
  }, [user, loading, navigate]);

  if (loading) {
    console.log('[ProtectedRoute] Showing loading spinner');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('[ProtectedRoute] No user, returning null');
    return null;
  }

  console.log('[ProtectedRoute] Rendering children');
  return <>{children}</>;
}
