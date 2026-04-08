import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
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
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { canAccessModule } from '../lib/permissions';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const { signOut, profile, isSuperAdmin, effectiveUserRole, isSupportMode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

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

  const filteredMenuItems = permissionBasedMenuItems.filter(item => canAccessModule(effectiveUserRole, item.module));
  const menuItems = [...filteredMenuItems, ...alwaysVisibleMenuItems];

  const adminMenuItem = { path: '/app/admin', icon: <Shield className="w-5 h-5" />, label: 'Admin' };
  const superAdminMenuItem = { path: '/app/super-admin', icon: <Shield className="w-5 h-5" />, label: 'Super Admin' };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <div className={`fixed left-0 top-0 h-full w-64 bg-gray-900 text-white z-50 flex flex-col lg:hidden transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-2 rounded-lg">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg">Açaí POS</div>
              <div className="text-xs text-gray-400">{profile?.full_name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
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

          {isSuperAdmin && !isSupportMode && (
            <>
              <div className="border-t border-gray-700 my-2"></div>
              <NavLink
                to={superAdminMenuItem.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-500 to-purple-700 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                {superAdminMenuItem.icon}
                <span className="font-medium">{superAdminMenuItem.label}</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
              onClose();
            }}
            className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition w-full"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </div>
    </>
  );
}
