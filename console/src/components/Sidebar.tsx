import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, ShieldAlert, BarChart3, MessageSquare } from 'lucide-react';
import { ROUTES } from '@/lib/constants';

const ICON_MAP: Record<string, React.ReactNode> = {
  ClipboardList: <ClipboardList size={18} />,
  ShieldAlert: <ShieldAlert size={18} />,
  BarChart3: <BarChart3 size={18} />,
  MessageSquare: <MessageSquare size={18} />,
};

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="w-64 bg-mtn-dark text-gray-400 flex flex-col h-screen fixed left-0 top-0 z-50">
      <div className="p-5 flex items-center gap-3">
        <div className="w-8 h-8 bg-mtn-yellow rounded-lg flex items-center justify-center text-gray-900 font-bold text-sm">
          M
        </div>
        <div>
          <div className="text-white font-semibold text-sm">MTN Console</div>
          <div className="text-xs text-gray-500">Management Dashboard</div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2">
        {ROUTES.map((route) => {
          const isActive = location.pathname === route.path;
          return (
            <button
              key={route.id}
              onClick={() => navigate(route.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-mtn-yellow text-gray-900'
                  : 'hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {ICON_MAP[route.icon]}
              {route.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-500">v1.0.0</div>
      </div>
    </aside>
  );
}
