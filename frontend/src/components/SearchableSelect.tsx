
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { resolveUploadUrl } from '../utils/assetsUrl';

interface Option {
    value: string;
    label: string;
    subLabel?: string;
    avatarUrl?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    creatable?: boolean;
    onCreate?: (label: string) => void;
    className?: string;
    /** Class bổ sung cho panel dropdown (vd. z-[200] khi dùng trong modal) */
    dropdownPanelClassName?: string;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    error?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Chọn...',
    creatable = false,
    onCreate,
    className,
    dropdownPanelClassName,
    disabled = false,
    label,
    required = false,
    error = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(o => o.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => {
        return options.filter(option => 
            option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (option.subLabel && option.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [options, searchTerm]);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleCreate = (nameOverride?: string) => {
        if (!onCreate) return;
        const name = (nameOverride ?? searchTerm.trim()).trim();
        if (name) {
            onCreate(name);
            setIsOpen(false);
            setSearchTerm('');
        } else {
            const entered = window.prompt('Nhập tên loại mới:');
            if (entered && entered.trim()) {
                onCreate(entered.trim());
                setIsOpen(false);
                setSearchTerm('');
            }
        }
    };

    const renderAvatar = (url: string | undefined, label: string) => {
        if (url) {
            const finalUrl = resolveUploadUrl(url);
            return (
                <img 
                    src={finalUrl} 
                    alt={label} 
                    className="w-6 h-6 rounded-full object-cover border border-gray-200 flex-shrink-0"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = getUiAvatarFallbackUrl(label);
                    }}
                />
            );
        }
        return (
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold border border-gray-200 flex-shrink-0">
                {label.charAt(0)}
            </div>
        );
    };

    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label} {required && <span className="text-red-500">*</span>}
                </label>
            )}
            <div className="relative" ref={wrapperRef}>
                <div
                    className={clsx(
                        "w-full px-3 py-2 border rounded-lg flex items-center justify-between bg-white cursor-pointer",
                        disabled ? "bg-gray-100 cursor-not-allowed" : "hover:border-primary/50",
                        error ? "border-red-500 bg-red-50" : (isOpen ? "ring-2 ring-primary/50 border-primary" : "border-gray-200")
                    )}
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                >
                    <div className="flex-1 truncate flex items-center gap-2">
                        {selectedOption ? (
                            <>
                                {renderAvatar(selectedOption.avatarUrl, selectedOption.label)}
                                <span className="text-gray-900">{selectedOption.label} {selectedOption.subLabel && <span className="text-gray-500 text-sm">({selectedOption.subLabel})</span>}</span>
                            </>
                        ) : (
                            <span className="text-gray-400">{placeholder}</span>
                        )}
                    </div>
                    <ChevronDown size={16} className="text-gray-400 ml-2" />
                </div>

                {isOpen && (
                    <div
                        className={clsx(
                            'absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col animate-fade-in',
                            dropdownPanelClassName
                        )}
                    >
                        <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-primary"
                                    placeholder="Tìm kiếm..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 min-h-0">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((option) => (
                                    <div
                                        key={option.value}
                                        className={clsx(
                                            "px-3 py-2 text-sm cursor-pointer flex items-center justify-between",
                                            option.value === value ? "bg-primary/5 text-primary font-medium" : "text-gray-700 hover:bg-gray-50"
                                        )}
                                        onClick={() => handleSelect(option.value)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {renderAvatar(option.avatarUrl, option.label)}
                                            <div>
                                                {option.label}
                                                {option.subLabel && <span className="text-xs text-gray-500 ml-1">({option.subLabel})</span>}
                                            </div>
                                        </div>
                                        {option.value === value && <Check size={14} />}
                                    </div>
                                ))
                            ) : (
                                <div className="px-3 py-4 text-center text-sm text-gray-500">
                                    {options.length === 0 ? 'Chưa có dữ liệu' : 'Không tìm thấy kết quả'}
                                </div>
                            )}

                            {creatable && searchTerm.trim() && !filteredOptions.find(o => o.label.toLowerCase() === searchTerm.toLowerCase()) && (
                                <div 
                                    className="px-3 py-2 text-sm text-primary hover:bg-primary/5 cursor-pointer border-t border-gray-100 flex items-center gap-2"
                                    onClick={() => handleCreate()}
                                >
                                    <Plus size={14} />
                                    Tạo mới &quot;{searchTerm}&quot;
                                </div>
                            )}

                            {creatable && onCreate && (
                                <div 
                                    className="sticky bottom-0 px-3 py-2.5 text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 cursor-pointer border-t border-gray-200 flex items-center gap-2"
                                    onClick={() => handleCreate()}
                                >
                                    <Plus size={16} />
                                    Thêm mới
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
