import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import InactivityWarning from './components/InactivityWarning';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RoleGuard } from './components/RoleGuard';
import { Loader2 } from 'lucide-react';
// import Landing from './pages/Landing'; // Removido no app puro
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MagicLink from './pages/MagicLink';
import SetupStore from './pages/SetupStore';
import SubscriptionBlocked from './pages/SubscriptionBlocked';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import PDV from './pages/PDV';
import Products from './pages/Products';
import Recipe from './pages/Recipe';
import Stock from './pages/Stock';
import Cash from './pages/Cash';
import Reports from './pages/Reports';
import Movements from './pages/Movements';
import Admin from './pages/Admin';
import MySubscription from './pages/MySubscription';
import MyAccount from './pages/MyAccount';
import Tables from './pages/Tables';
import TabView from './pages/TabView';
import Categories from './pages/Categories';
import SuperAdmin from './pages/SuperAdmin';
import Team from './pages/Team';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, hasValidStore, isSubscriptionBlocked, loading, signOut } = useAuth();

  const { showWarning, extendSession } = useInactivityTimeout({
    timeoutMinutes: 30,
    warningMinutes: 2,
    onTimeout: async () => {
      await signOut();
      window.location.href = '/login';
    },
  });

  if (loading) {
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
    return <Navigate to="/login" replace />;
  }

  if (!hasValidStore) {
    return <Navigate to="/setup-store" replace />;
  }

  if (isSubscriptionBlocked) {
    return <Navigate to="/app/subscription-blocked" replace />;
  }

  return (
    <>
      {showWarning && <InactivityWarning onContinue={extendSession} />}
      {children}
    </>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, hasValidStore, isSubscriptionBlocked, loading, isSuperAdmin, isSupportMode, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <>{children}</>;
  }

  if (isSuperAdmin && !isSupportMode) {
    return <Navigate to="/app/super-admin" replace />;
  }

  if (hasValidStore && !isSubscriptionBlocked) {
    return <Navigate to="/app/dashboard" replace />;
  }

  if (hasValidStore && isSubscriptionBlocked) {
    return <Navigate to="/app/subscription-blocked" replace />;
  }

  if (!hasValidStore) {
    return <Navigate to="/setup-store" replace />;
  }

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin, isSupportMode, loading } = useAuth();

  if (loading) {
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
    return <Navigate to="/login" replace />;
  }

  if (isSupportMode) {
    return <Navigate to="/app/dashboard" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}

function SetupStoreRoute({ children }: { children: React.ReactNode }) {
  const { user, hasValidStore, isSuperAdmin, isSupportMode, loading } = useAuth();

  if (loading) {
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
    return <Navigate to="/login" replace />;
  }

  if (isSuperAdmin && !isSupportMode) {
    return <Navigate to="/app/super-admin" replace />;
  }

  if (hasValidStore) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/magic-link" element={<MagicLink />} />
            <Route
              path="/setup-store"
              element={
                <SetupStoreRoute>
                  <SetupStore />
                </SetupStoreRoute>
              }
            />
            <Route path="/app/subscription-blocked" element={<SubscriptionBlocked />} />
            <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route
                path="dashboard"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']} redirectTo="/app/pdv">
                    <Dashboard />
                  </RoleGuard>
                }
              />
              <Route
                path="pdv"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager', 'staff']}>
                    <PDV />
                  </RoleGuard>
                }
              />
              <Route
                path="cash"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Cash />
                  </RoleGuard>
                }
              />
              <Route
                path="products"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Products />
                  </RoleGuard>
                }
              />
              <Route
                path="products/:productId/recipe"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Recipe />
                  </RoleGuard>
                }
              />
              <Route
                path="categories"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Categories />
                  </RoleGuard>
                }
              />
              <Route
                path="stock"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Stock />
                  </RoleGuard>
                }
              />
              <Route
                path="movements"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Movements />
                  </RoleGuard>
                }
              />
              <Route
                path="reports"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager']}>
                    <Reports />
                  </RoleGuard>
                }
              />
              <Route
                path="team"
                element={
                  <RoleGuard allowedRoles={['owner']}>
                    <Team />
                  </RoleGuard>
                }
              />
              <Route
                path="my-subscription"
                element={
                  <RoleGuard allowedRoles={['owner']}>
                    <MySubscription />
                  </RoleGuard>
                }
              />
              <Route
                path="tables"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager', 'staff']}>
                    <Tables />
                  </RoleGuard>
                }
              />
              <Route
                path="tables/:tableId"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager', 'staff']}>
                    <TabView />
                  </RoleGuard>
                }
              />
              <Route
                path="tables/:tableId/tab/:tabId"
                element={
                  <RoleGuard allowedRoles={['owner', 'manager', 'staff']}>
                    <TabView />
                  </RoleGuard>
                }
              />
              <Route path="minha-conta" element={<MyAccount />} />
              <Route
                path="admin"
                element={
                  <RoleGuard requireSystemAdmin={true}>
                    <Admin />
                  </RoleGuard>
                }
              />
            </Route>

            <Route
              path="/app/super-admin"
              element={
                <SuperAdminRoute>
                  <AppLayout />
                </SuperAdminRoute>
              }
            >
              <Route index element={<SuperAdmin />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
