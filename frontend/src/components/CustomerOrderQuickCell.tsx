import React, { useState } from 'react';
import { Package, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Truck, CreditCard } from 'lucide-react';
import type { Order } from '../types';
import { formatDate, formatCurrency } from '../utils/format';

interface Props {
  orders?: Order[];
  className?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Chờ xử lý', color: 'text-amber-600 bg-amber-50', icon: Clock },
  CONFIRMED: { label: 'Đã xác nhận', color: 'text-blue-600 bg-blue-50', icon: CheckCircle2 },
  PROCESSING: { label: 'Đang xử lý', color: 'text-indigo-600 bg-indigo-50', icon: Package },
  SHIPPING: { label: 'Đang giao', color: 'text-purple-600 bg-purple-50', icon: Truck },
  COMPLETED: { label: 'Hoàn thành', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
  CANCELLED: { label: 'Đã hủy', color: 'text-red-600 bg-red-50', icon: XCircle },
  RETURNED: { label: 'Trả hàng', color: 'text-gray-600 bg-gray-50', icon: XCircle },
};

export const CustomerOrderQuickCell: React.FC<Props> = ({ orders, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!orders || orders.length === 0) {
    return <span className="text-gray-400 text-xs italic">Chưa có đơn hàng</span>;
  }

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`text-xs ${className}`}>
      <div 
        className="flex items-center gap-1 cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors group"
        onClick={toggleExpand}
      >
        <Package className="w-3.5 h-3.5 text-blue-500" />
        <span className="font-medium text-blue-700">
          {orders.length} đơn hàng
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500" />
        )}
      </div>

      {isExpanded && (
        <div className="mt-2 space-y-2 border-l-2 border-blue-100 pl-2 py-1 max-w-[280px]">
          {orders.map((order) => {
            const status = STATUS_MAP[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-50', icon: Package };
            const StatusIcon = status.icon;

            return (
              <div key={order.id} className="bg-white border rounded p-2 shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-gray-800">{order.code}</span>
                  <span className="text-[10px] text-gray-400">
                    {formatDate(order.orderDate)}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-1 mb-1">
                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${status.color}`}>
                    <StatusIcon className="w-2.5 h-2.5" />
                    {status.label}
                  </span>
                  {order.paymentStatus === 'PAID' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-green-600 bg-green-50 border border-green-100">
                      <CreditCard className="w-2.5 h-2.5" />
                      Đã thanh toán
                    </span>
                  )}
                </div>

                <div className="text-[11px] font-semibold text-gray-900 mb-1">
                  {formatCurrency(order.finalAmount)}
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="border-t pt-1 mt-1">
                    <ul className="space-y-0.5">
                      {order.items.slice(0, 3).map((item) => (
                        <li key={item.id} className="text-[10px] text-gray-600 flex justify-between">
                          <span className="truncate pr-2">{item.product?.name || 'Sản phẩm...'}</span>
                          <span className="font-medium whitespace-nowrap">x{item.quantity}</span>
                        </li>
                      ))}
                      {order.items.length > 3 && (
                        <li className="text-[9px] text-gray-400 italic">...và {order.items.length - 3} món khác</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerOrderQuickCell;
