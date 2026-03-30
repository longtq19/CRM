import { ReactNode } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { useSidebarStore } from '../context/useSidebarStore';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

const PageHeader = ({ title, subtitle, icon, actions }: PageHeaderProps) => {
  const { isCollapsed, toggleCollapse } = useSidebarStore();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleCollapse}
          className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
          title={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
        >
          {isCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
        </button>
        
        {icon && (
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            {icon}
          </div>
        )}
        
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
