import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import MobileDrawer from './MobileDrawer';
import SupportModeBanner from './SupportModeBanner';

export default function AppLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  console.log('[AppLayout] Rendering');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <MobileDrawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-30 p-2 bg-gray-900 text-white rounded-lg shadow-lg hover:bg-gray-800 transition"
        >
          <Menu className="w-6 h-6" />
        </button>

        <SupportModeBanner />
        <main className="pt-4 pb-4 pl-16 pr-4 md:p-6 lg:p-8 flex-1 w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
