import { useEffect, useState } from 'react';
import { X, Bell, UserPlus, CheckCircle, AlertCircle, Info } from 'lucide-react';
import clsx from 'clsx';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'new_lead';
  title: string;
  message: string;
  link?: string;
  duration?: number;
}

interface ToastNotificationProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
  onNavigate?: (link: string) => void;
}

const ToastNotification = ({ toasts, onRemove, onNavigate }: ToastNotificationProps) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onRemove={onRemove}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
  onNavigate?: (link: string) => void;
}

const ToastItem = ({ toast, onRemove, onNavigate }: ToastItemProps) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration || 5000;
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const handleClick = () => {
    if (toast.link && onNavigate) {
      onNavigate(toast.link);
      onRemove(toast.id);
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'new_lead':
        return <UserPlus className="w-5 h-5 text-indigo-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBgColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'new_lead':
        return 'bg-indigo-50 border-indigo-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div
      className={clsx(
        'pointer-events-auto rounded-lg border shadow-lg p-4 transition-all duration-300',
        getBgColor(),
        toast.link && 'cursor-pointer hover:shadow-xl',
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{toast.message}</p>
          {toast.link && (
            <p className="text-xs text-indigo-600 mt-2 font-medium">Nhấn để xem chi tiết →</p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-1 rounded-full hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
};

export default ToastNotification;
