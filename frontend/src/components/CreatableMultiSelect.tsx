import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Plus, Check } from 'lucide-react';

interface Option {
  id?: string;
  name: string;
  [key: string]: any;
}

interface CreatableMultiSelectProps {
  options: Option[];
  value: Option[]; // Selected items
  onChange: (newValue: Option[]) => void;
  placeholder?: string;
  /** `false`: chỉ chọn từ `options` (không nhập tên mới / không thêm ngoài danh sách). */
  allowCreate?: boolean;
}

export const CreatableMultiSelect: React.FC<CreatableMultiSelectProps> = ({
  options,
  value = [],
  onChange,
  placeholder = 'Select...',
  allowCreate = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newValue, setNewValue] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: Option) => {
    const isSelected = value.some(v => (v.id && option.id && v.id === option.id) || v.name === option.name);
    if (isSelected) {
      onChange(value.filter(v => !((v.id && option.id && v.id === option.id) || v.name === option.name)));
    } else {
      onChange([...value, option]);
    }
    setInputValue('');
  };

  const handleConfirmCreate = () => {
    if (!allowCreate) return;
    if (!newValue.trim()) return;
    const existing = options.find(o => o.name.toLowerCase() === newValue.toLowerCase());
    if (existing) {
      handleSelect(existing);
    } else {
      onChange([...value, { name: newValue.trim() }]);
    }
    setNewValue('');
    setIsCreating(false);
    setIsOpen(true);
  };

  const filteredOptions = options.filter(o => 
    o.name.toLowerCase().includes(inputValue.toLowerCase()) &&
    !value.some(v => (v.id && o.id && v.id === o.id) || v.name === o.name)
  );

  return (
    <div className="relative" ref={wrapperRef}>
      {allowCreate && isCreating ? (
        <div className="flex gap-2">
            <input 
                type="text" 
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="Nhập tên công ty con mới..."
                className="input-field"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmCreate();
                  }
                }}
            />
            <button type="button" onClick={handleConfirmCreate} className="p-2 bg-green-100 text-green-600 rounded hover:bg-green-200"><Check size={18} /></button>
            <button type="button" onClick={() => setIsCreating(false)} className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200"><X size={18} /></button>
        </div>
      ) : (
        <>
          <div 
            className="input-field min-h-[42px] flex flex-wrap gap-1.5 items-center cursor-text"
            onClick={() => setIsOpen(true)}
          >
            {value.map((v, index) => (
              <span key={v.id || index} className="bg-blue-100 text-blue-800 text-sm px-2 py-0.5 rounded-full flex items-center gap-1">
                {v.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((_, i) => i !== index));
                  }}
                  className="hover:text-blue-900"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
            <input
              type="text"
              className="flex-1 outline-none min-w-[80px] bg-transparent"
              placeholder={value.length === 0 ? placeholder : ''}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsOpen(true)}
            />
            <ChevronDown size={16} className="text-gray-400 ml-auto" />
          </div>

          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.id}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                    onClick={() => handleSelect(option)}
                  >
                    {option.name}
                  </div>
                ))
              ) : null}

              {allowCreate && (
                <div
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-primary font-bold flex items-center gap-2 border-t border-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCreating(true);
                    setIsOpen(false);
                  }}
                >
                  <Plus size={14} /> Thêm mới...
                </div>
              )}

              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-gray-500 text-center text-sm">
                  {allowCreate
                    ? 'No options'
                    : options.length === 0
                      ? 'Chưa có danh mục'
                      : inputValue.trim()
                        ? 'Không tìm thấy'
                        : 'Không có mục để chọn'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
