import { NavLink, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Package,
  Archive,
  Wallet,
  BarChart3,
  Store,
  LogOut,
  ArrowLeftRight,
  LayoutDashboard,
  Shield,
  CreditCard,
  User,
  Utensils,
  FolderOpen,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { canAccessModule } from '../lib/permissions';

export default function Sidebar() {
  const { signOut, profile, isSuperAdmin, isSupportMode, effectiveUserRole } = useAuth();
  const navigate = useNavigate();

  console.log('[Sidebar] Render', { profile: !!profile, effectiveUserRole, isSuperAdmin, isSupportMode });

  // Super admin menu - only platform admin options
  const superAdminMenuItems = [
    { path: '/app/super-admin', icon: <Shield className="w-5 h-5" />, label: 'Super Admin' },
    { path: '/app/minha-conta', icon: <User className="w-5 h-5" />, label: 'Minha Conta' },
  ];

  // Store user menu - operational items
  const permissionBasedMenuItems = [
    { path: '/app/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard', module: 'dashboard' },
    { path: '/app/pdv', icon: <ShoppingCart className="w-5 h-5" />, label: 'PDV', module: 'pdv' },
    { path: '/app/tables', icon: <Utensils className="w-5 h-5" />, label: 'Mesas', module: 'tables' },
    { path: '/app/cash', icon: <Wallet className="w-5 h-5" />, label: 'Caixa', module: 'cash' },
    { path: '/app/products', icon: <Package className="w-5 h-5" />, label: 'Produtos', module: 'products' },
    { path: '/app/categories', icon: <FolderOpen className="w-5 h-5" />, label: 'Categorias', module: 'products' },
    { path: '/app/stock', icon: <Archive className="w-5 h-5" />, label: 'Estoque', module: 'stock' },
    { path: '/app/movements', icon: <ArrowLeftRight className="w-5 h-5" />, label: 'Movimentações', module: 'movements' },
    { path: '/app/reports', icon: <BarChart3 className="w-5 h-5" />, label: 'Relatórios', module: 'reports' },
    { path: '/app/team', icon: <Users className="w-5 h-5" />, label: 'Equipe', module: 'team' },
    { path: '/app/my-subscription', icon: <CreditCard className="w-5 h-5" />, label: 'Minha Assinatura', module: 'subscription' },
  ];

  const alwaysVisibleMenuItems = [
    { path: '/app/minha-conta', icon: <User className="w-5 h-5" />, label: 'Minha Conta' },
  ];

  // CRITICAL: Support mode takes precedence over super admin
  // When in support mode, show store menu even if user is super admin
  // Use effectiveUserRole which is 'owner' during support mode
  const menuItems = (isSuperAdmin && !isSupportMode)
    ? superAdminMenuItems
    : [...permissionBasedMenuItems.filter(item => canAccessModule(effectiveUserRole, item.module)), ...alwaysVisibleMenuItems];

  const adminMenuItem = { path: '/app/admin', icon: <Shield className="w-5 h-5" />, label: 'Admin' };

  return (
    <div className="hidden lg:flex w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 flex-col">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-2 rounded-lg">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-lg">VendaFlow</div>
            <div className="text-xs text-gray-400">{profile?.full_name}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}

        {/* REMOVED: Legacy isSystemAdmin check - only super_admin role should see admin menu */}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
          className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition w-full"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sair</span>
        </button>
      </div>
    </div>
  );
}
