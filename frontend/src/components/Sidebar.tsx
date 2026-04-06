import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BarChart3,
  Bot, 
  Users, 
  Wifi, 
  Settings, 
  FileText,
  Book,
  Megaphone,
  ShoppingCart,
  CircleHelp,
  Calculator,
  Settings2,
  Package,
  MessageSquare,
  ShieldCheck,
  Sprout,
  Warehouse,
  Database,
  Phone,
  UserCheck,
  Truck,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../context/useAuthStore';
import clsx from 'clsx';
import { translate } from '../utils/dictionary';
import { prefetchRoute } from '../utils/prefetchRoutes';

const iconMap: Record<string, any> = {
  LayoutDashboard,
  BarChart3,
  Bot,
  Users,
  Wifi,
  Settings,
  Settings2,
  FileText,
  Book,
  Megaphone,
  ShoppingCart,
  CircleHelp,
  Calculator,
  Package,
  MessageSquare,
  ShieldCheck,
  Sprout,
  Warehouse,
  Database,
  Phone,
  UserCheck,
  Truck
};

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

const Sidebar = ({ isOpen, isCollapsed, onClose, onToggleCollapse }: SidebarProps) => {
  const { user } = useAuthStore();

  if (!user) return null;

  const menus = user.menus || [];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={clsx(
        "bg-secondary border-r border-white/10 h-screen fixed left-0 top-0 flex flex-col z-30 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo Section */}
        <div className={clsx(
          "flex flex-col items-center justify-center border-b border-white/10 transition-all duration-300",
          isCollapsed ? "p-3" : "px-5 py-4"
        )}>
          <img 
            src="/sideBarLogo.png?v=4" 
            alt="ZENO" 
            className={clsx(
              "object-contain transition-all duration-300",
              isCollapsed ? "w-10 h-10" : "w-40 h-auto"
            )} 
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
          {menus.map((item) => {
            const Icon = iconMap[item.icon || 'CircleHelp'] || CircleHelp;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onMouseEnter={() => prefetchRoute(item.path)}
                onClick={() => {
                  if (window.innerWidth < 768) {
                    onClose();
                  }
                }}
                title={isCollapsed ? translate(item.label) : undefined}
                className={({ isActive }) => clsx(
                  "flex items-center rounded-xl transition-colors font-medium",
                  isCollapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3",
                  isActive 
                    ? "bg-primary text-white shadow-sm" 
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon size={20} />
                {!isCollapsed && (
                  <span className="truncate">{translate(item.label)}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse Toggle Button */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            title={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <>
                <ChevronLeft size={20} />
                <span className="text-sm font-medium">Thu gọn</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
