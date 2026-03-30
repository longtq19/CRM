import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Plus, 
  Trash2, 
  Search,
  AlertTriangle
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { toast } from 'react-hot-toast';
import type { Product } from '../../types';
import { formatDate } from '../../utils/format';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  warehouses: any[];
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onSuccess, warehouses }) => {
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [stocks, setStocks] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSourceWarehouseId('');
      setNote('');
      setItems([]);
      setSearchTerm('');
      setSearchResults([]);
      setStocks([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (sourceWarehouseId) {
      fetchStocks();
    }
  }, [sourceWarehouseId]);

  const fetchStocks = async () => {
    try {
      const res: any = await apiClient.get(`/inventory/stocks?warehouseId=${sourceWarehouseId}`);
      if (res && res.data) {
        setStocks(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch stocks', error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchTerm.trim() || !sourceWarehouseId) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res: any = await apiClient.get(`/products?search=${searchTerm}&limit=10`);
        const productsWithStock = (res.data || []).filter((p: Product) => 
          stocks.some(s => s.product.id === p.id && s.quantity > 0)
        );
        setSearchResults(productsWithStock);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, sourceWarehouseId, stocks]);

  const getStockForProduct = (productId: string) => {
    return stocks.find(s => s.product.id === productId);
  };

  const handleAddItem = (product: Product) => {
    const stock = getStockForProduct(product.id);
    if (!stock || stock.quantity <= 0) {
      toast.error('Sản phẩm không có tồn kho');
      return;
    }

    const categoryCode = product.category?.code || 'BIO';

    setItems(prev => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        type: categoryCode,
        quantity: 1,
        maxQuantity: stock.quantity,
        batch: categoryCode === 'BIO' && stock.batch ? { 
          code: stock.batch.code, 
          mfgDate: stock.batch.mfgDate, 
          expDate: stock.batch.expDate 
        } : null,
        serials: categoryCode === 'TECH' ? [''] : null
      }
    ]);
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const handleSerialChange = (itemIndex: number, serialIndex: number, value: string) => {
    setItems(prev => {
      const newItems = [...prev];
      const newSerials = [...newItems[itemIndex].serials];
      newSerials[serialIndex] = value;
      newItems[itemIndex].serials = newSerials;
      return newItems;
    });
  };

  const addSerialField = (index: number) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index].serials.push('');
      newItems[index].quantity = newItems[index].serials.length;
      return newItems;
    });
  };

  const removeSerialField = (itemIndex: number, serialIndex: number) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[itemIndex].serials = newItems[itemIndex].serials.filter((_: any, i: number) => i !== serialIndex);
      newItems[itemIndex].quantity = newItems[itemIndex].serials.length;
      return newItems;
    });
  };

  const handleSubmit = async () => {
    if (!sourceWarehouseId) {
      toast.error('Vui lòng chọn kho xuất');
      return;
    }
    if (items.length === 0) {
      toast.error('Vui lòng chọn sản phẩm');
      return;
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        toast.error(`Số lượng cho ${item.productName} phải lớn hơn 0`);
        return;
      }
      if (item.quantity > item.maxQuantity) {
        toast.error(`Số lượng xuất ${item.productName} vượt quá tồn kho (${item.maxQuantity})`);
        return;
      }
      if (item.type === 'TECH') {
        if (item.serials.some((s: string) => !s.trim())) {
          toast.error(`Vui lòng nhập đầy đủ Serial cho ${item.productName}`);
          return;
        }
        if (new Set(item.serials).size !== item.serials.length) {
          toast.error(`Serial trùng lặp cho ${item.productName}`);
          return;
        }
      }
    }

    try {
      await apiClient.post('/inventory/transactions', {
        type: 'EXPORT',
        sourceWarehouseId,
        note,
        items
      });
      toast.success('Xuất kho thành công');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi khi xuất kho');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900">Xuất kho</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kho xuất *</label>
              <select
                value={sourceWarehouseId}
                onChange={e => setSourceWarehouseId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
              >
                <option value="">Chọn kho</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Nhập ghi chú phiếu xuất..."
              />
            </div>
          </div>

          {!sourceWarehouseId && (
            <div className="flex items-center gap-2 p-4 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
              <AlertTriangle size={20} />
              <span className="text-sm">Vui lòng chọn kho xuất trước khi thêm sản phẩm</span>
            </div>
          )}

          {sourceWarehouseId && (
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Thêm sản phẩm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Tìm sản phẩm có trong kho..."
                />
              </div>
              
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  {searchResults.map(product => {
                    const stock = getStockForProduct(product.id);
                    return (
                      <div 
                        key={product.id}
                        onClick={() => handleAddItem(product)}
                        className="p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between border-b last:border-0"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.code}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded-full text-xs ${product.category?.code === 'BIO' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {product.category?.code === 'BIO' ? 'BIO' : 'TECH'}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">Tồn: {stock?.quantity || 0}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200 relative">
                <button 
                  onClick={() => handleRemoveItem(index)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={18} />
                </button>
                
                <h4 className="font-medium text-gray-900 mb-2">
                  {item.productName} 
                  <span className="text-gray-500 text-sm ml-1">({item.productCode})</span>
                  <span className="text-xs text-gray-400 ml-2">Tồn kho: {item.maxQuantity}</span>
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Số lượng xuất</label>
                    <input
                      type="number"
                      min="1"
                      max={item.maxQuantity}
                      value={item.quantity}
                      onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      disabled={item.type === 'TECH'}
                    />
                    {item.quantity > item.maxQuantity && (
                      <p className="text-xs text-red-500 mt-1">Vượt quá tồn kho!</p>
                    )}
                  </div>

                  {item.type === 'BIO' && item.batch && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Mã Lô</label>
                        <input
                          type="text"
                          value={item.batch.code}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600"
                          disabled
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Hạn SD</label>
                        <input
                          type="text"
                          value={item.batch.expDate ? formatDate(item.batch.expDate) : '-'}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600"
                          disabled
                        />
                      </div>
                    </>
                  )}
                </div>

                {item.type === 'TECH' && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Danh sách Serial xuất</label>
                    <div className="space-y-2">
                      {item.serials.map((serial: string, sIndex: number) => (
                        <div key={sIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={serial}
                            onChange={e => handleSerialChange(index, sIndex, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder={`Serial #${sIndex + 1}`}
                          />
                          {item.serials.length > 1 && (
                            <button onClick={() => removeSerialField(index, sIndex)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      {item.serials.length < item.maxQuantity && (
                        <button 
                          onClick={() => addSerialField(index)}
                          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium mt-2"
                        >
                          <Plus size={16} /> Thêm Serial
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {items.length === 0 && sourceWarehouseId && (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                Chưa có sản phẩm nào. Vui lòng tìm kiếm và thêm sản phẩm.
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium shadow-sm"
          >
            <Save size={18} /> Lưu phiếu xuất
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
