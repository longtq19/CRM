import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES, DEFAULT_PAGE_SIZE, normalizePageSize, type PageSize } from '../constants/pagination';

interface PaginationBarProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  /** Nhãn đơn vị, ví dụ: "đơn hàng", "sản phẩm", "khách hàng" */
  itemLabel?: string;
  /** Ẩn selector số dòng/trang nếu chỉ có 1 trang và không cần đổi limit */
  showLimitSelector?: boolean;
}

export default function PaginationBar({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  itemLabel = 'mục',
  showLimitSelector = true,
}: PaginationBarProps) {
  const safeLimit = normalizePageSize(limit);
  const start = total === 0 ? 0 : (page - 1) * safeLimit + 1;
  const end = Math.min(page * safeLimit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500">
          Hiển thị {start} - {end} / {total} {itemLabel}
        </span>
        {showLimitSelector && onLimitChange && (
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Số dòng:</span>
            <select
              value={safeLimit}
              onChange={(e) => onLimitChange(Number(e.target.value) as PageSize)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
          aria-label="Trang trước"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="px-3 py-1 text-sm text-gray-600">
          Trang {page} / {totalPages || 1}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
          aria-label="Trang sau"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
