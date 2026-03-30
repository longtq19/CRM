import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

interface QuickSearchProps {
  open: boolean;
  onClose: () => void;
}

type EmployeeItem = { id: string; fullName: string; code?: string; department?: { name: string; division?: { name: string } } };
type CustomerItem = { id: string; name: string; phone: string; address?: string };
type ProductItem = { id: string; code: string; name: string; type?: string };
type DocumentItem = { id: string; code: string; name: string; type?: string };

const QuickSearch = ({ open, onClose }: QuickSearchProps) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setEmployees([]);
      setCustomers([]);
      setProducts([]);
      setDocuments([]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const debouncedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!debouncedQuery) {
        setEmployees([]);
        setCustomers([]);
        setProducts([]);
        setDocuments([]);
        return;
      }
      setLoading(true);
      try {
        const [empRes, cusRes, prodRes, docRes] = await Promise.allSettled([
          apiClient.get(`/hr/employees?search=${encodeURIComponent(debouncedQuery)}&limit=5`),
          apiClient.get(`/customers?search=${encodeURIComponent(debouncedQuery)}&limit=5`),
          apiClient.get(`/products?search=${encodeURIComponent(debouncedQuery)}&limit=5`),
          apiClient.get(`/documents?search=${encodeURIComponent(debouncedQuery)}`)
        ]);
        if (!active) return;
        if (empRes.status === 'fulfilled' && empRes.value && empRes.value.data) {
          setEmployees(empRes.value.data.slice(0, 5));
        } else {
          setEmployees([]);
        }
        if (cusRes.status === 'fulfilled' && Array.isArray(cusRes.value)) {
          setCustomers(cusRes.value.slice(0, 5));
        } else {
          setCustomers([]);
        }
        if (prodRes.status === 'fulfilled' && prodRes.value && prodRes.value.data) {
          setProducts(prodRes.value.data.slice(0, 5));
        } else {
          setProducts([]);
        }
        if (docRes.status === 'fulfilled' && Array.isArray(docRes.value)) {
          setDocuments(docRes.value.slice(0, 5));
        } else {
          setDocuments([]);
        }
      } catch {
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [debouncedQuery]);

  const handleClose = () => {
    onClose();
  };

  const onEnterFirst = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const first =
        employees[0] ||
        customers[0] ||
        products[0] ||
        documents[0];
      if (!first) return;
      if ('fullName' in first) {
        navigate(`/hr/${first.id}/view`);
      } else if ('phone' in first) {
        navigate(`/customers/${first.id}`);
      } else if ('type' in first && 'code' in first && !('name' in first && 'content' in first)) {
        navigate('/products');
      } else {
        navigate('/documents');
      }
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-start sm:items-center justify-center bg-black/40 px-4 pt-20 sm:pt-0">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Search className="text-gray-500" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onEnterFirst}
            placeholder="Tìm nhanh: nhân viên, khách hàng, sản phẩm, tài liệu"
            className="flex-1 outline-none text-sm placeholder:text-gray-400"
          />
          <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100 text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-500">Đang tìm kiếm...</div>
          )}
          {!loading && !debouncedQuery && (
            <div className="px-4 py-3 text-sm text-gray-500">Nhập từ khóa để tìm kiếm</div>
          )}
          {!loading && debouncedQuery && (
            <>
              {employees.length > 0 && (
                <div className="mb-3">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500">Nhân viên</div>
                  <ul className="space-y-1">
                    {employees.map((e) => (
                      <li key={e.id}>
                        <button
                          className="w-full text-left px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => {
                            navigate(`/hr/${e.id}/view`);
                            onClose();
                          }}
                        >
                          <span className="text-sm font-medium text-secondary">{e.fullName}</span>
                          <span className="text-xs text-gray-500">{(e as any).hrDepartmentUnit?.name || ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {customers.length > 0 && (
                <div className="mb-3">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500">Khách hàng</div>
                  <ul className="space-y-1">
                    {customers.map((c) => (
                      <li key={c.id}>
                        <button
                          className="w-full text-left px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => {
                            navigate(`/customers/${c.id}`);
                            onClose();
                          }}
                        >
                          <span className="text-sm font-medium text-secondary">{c.name}</span>
                          <span className="text-xs text-gray-500">{c.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {products.length > 0 && (
                <div className="mb-3">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500">Sản phẩm</div>
                  <ul className="space-y-1">
                    {products.map((p) => (
                      <li key={p.id}>
                        <button
                          className="w-full text-left px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => {
                            navigate('/products');
                            onClose();
                          }}
                        >
                          <span className="text-sm font-medium text-secondary">{p.name}</span>
                          <span className="text-xs text-gray-500">{p.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {documents.length > 0 && (
                <div className="mb-3">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500">Tài liệu</div>
                  <ul className="space-y-1">
                    {documents.map((d) => (
                      <li key={d.id}>
                        <button
                          className="w-full text-left px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => {
                            navigate('/documents');
                            onClose();
                          }}
                        >
                          <span className="text-sm font-medium text-secondary">{d.name}</span>
                          <span className="text-xs text-gray-500">{d.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {employees.length === 0 && customers.length === 0 && products.length === 0 && documents.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500">Không có kết quả phù hợp</div>
              )}
            </>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500 flex items-center justify-between">
          <span>Nhấn Enter để mở kết quả đầu tiên</span>
          <span>Phím tắt: Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};

export default QuickSearch;
