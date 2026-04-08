import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

type UserRole = 'admin' | 'manager' | 'attendant';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  requireSystemAdmin?: boolean;
  fallback?: ReactNode;
  redirectTo?: string;
}

export function RoleGuard({ children, allowedRoles, requireSystemAdmin = false, fallback, redirectTo = '/app/dashboard' }: RoleGuardProps) {
  const { effectiveUserRole, isSuperAdmin, isSupportMode, loading } = useAuth();

  console.log('[RoleGuard] Render', { loading, effectiveUserRole, isSuperAdmin, isSupportMode, allowedRoles, requireSystemAdmin });

  if (loading) {
    console.log('[RoleGuard] Showing loading spinner');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // CRITICAL: requireSystemAdmin is LEGACY and deprecated
  // This guard is now only used for the old /app/admin route
  // New code should NOT use requireSystemAdmin
  if (requireSystemAdmin) {
    // IMPORTANT: Only super_admin role should have access to admin routes
    // isSystemAdmin (legacy field) should NOT grant access anymore
    if (!isSuperAdmin) {
      if (fallback) {
        return <>{fallback}</>;
      }

      if (redirectTo) {
        return <Navigate to={redirectTo} replace />;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Acesso Negado</h1>
            <p className="text-gray-600 mb-8">Apenas super administradores podem acessar esta página.</p>
            <a
              href="/app/dashboard"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:opacity-90"
            >
              Voltar ao Dashboard
            </a>
          </div>
        </div>
      );
    }

    // Super admin has access
    return <>{children}</>;
  }

  // Check store-level role requirements
  if (allowedRoles && allowedRoles.length > 0) {
    // CRITICAL: Use effectiveUserRole which is 'owner' during support mode
    // If effectiveUserRole is still null/undefined, deny access
    if (!effectiveUserRole) {
      return <Navigate to="/login" replace />;
    }

    const hasAccess = allowedRoles.includes(effectiveUserRole);

    if (!hasAccess) {
      if (fallback) {
        return <>{fallback}</>;
      }

      if (redirectTo) {
        return <Navigate to={redirectTo} replace />;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Acesso Negado</h1>
            <p className="text-gray-600 mb-8">Você não tem permissão para acessar esta página.</p>
            <a
              href="/app/dashboard"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:opacity-90"
            >
              Voltar ao Dashboard
            </a>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
