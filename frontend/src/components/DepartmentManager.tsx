import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../api/client';
import { translate } from '../utils/dictionary';
import { Plus, Edit, Trash2, Check, X, ChevronDown, ChevronRight, Users, GripVertical, Building2, Layers, UsersRound, UserPlus, UserMinus, Search } from 'lucide-react';
import type { Department, Division, DivisionDataFlowShares, Employee } from '../types';
import DivisionDataFlowPanel, { getLeafDepartmentsInDivisionSubtree } from './DivisionDataFlowPanel';
import EmployeeDetailModal from './EmployeeDetailModal';
import {
    ORG_UNIT_FUNCTION_CODES,
    ORG_UNIT_FUNCTION_LABELS,
    ORG_UNIT_FUNCTION_BADGE_LABELS,
    ORG_FUNC_RELAXED_STAFF_PICKER,
    type OrgUnitFunctionCode,
} from '../constants/orgUnitFunctions';
import clsx from 'clsx';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { SearchableSelect } from './SearchableSelect';
import { DndContext, type DragEndEvent, DragOverlay, useDraggable, useDroppable, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const renderAvatar = (emp: Employee | undefined, size = 6) => {
    if (!emp) return null;
    const avatarUrl = emp.avatarUrl || (emp as any).avatar;
    if (avatarUrl) {
        const finalUrl = resolveUploadUrl(avatarUrl);
        return (
            <img 
                src={finalUrl} 
                alt={emp.fullName} 
                className={`w-${size} h-${size} rounded-full object-cover border border-gray-100 flex-shrink-0`}
                onError={(e) => {
                    (e.target as HTMLImageElement).src = getUiAvatarFallbackUrl(emp.fullName);
                }}
            />
        );
    }
    return (
        <div className={`w-${size} h-${size} rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-normal border border-gray-100 flex-shrink-0`}>
            {emp.fullName.charAt(0)}
        </div>
    );
};

const ORG_FUNC_TO_EMPLOYEE_TYPE: Record<string, string> = {
    MARKETING: 'marketing',
    SALES: 'sales',
    CSKH: 'customer_service',
};

const ORG_FUNC_SORT_INDEX: Record<string, number> = Object.fromEntries(
    ORG_UNIT_FUNCTION_CODES.map((c, i) => [c, i])
);

function sortRootDepartmentsByOrgFunction(depts: Department[]): Department[] {
    return [...depts].sort((a, b) => {
        const ia = a.function != null ? ORG_FUNC_SORT_INDEX[a.function] ?? 100 : 100;
        const ib = b.function != null ? ORG_FUNC_SORT_INDEX[b.function] ?? 100 : 100;
        if (ia !== ib) return ia - ib;
        return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    });
}

function countDepartmentUnitsInDivision(divisionId: string, all: Department[]): number {
    return all.filter((d) => d.divisionId === divisionId).length;
}

function groupRootDeptsByFunction(sortedRoots: Department[]): { key: string; label: string; items: Department[] }[] {
    const groups: { key: string; label: string; items: Department[] }[] = [];
    for (const d of sortedRoots) {
        const key = d.function || '_other';
        const label =
            d.function && ORG_UNIT_FUNCTION_LABELS[d.function as OrgUnitFunctionCode]
                ? ORG_UNIT_FUNCTION_LABELS[d.function as OrgUnitFunctionCode]
                : 'Khác';
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.items.push(d);
        else groups.push({ key, label, items: [d] });
    }
    return groups;
}

/** Nhãn số khối cấp 1: luôn dạng count + " khối" (chữ khối viết thường). Chỉ định dạng hiển thị — không thay logic đếm. */
function formatTopLevelDivisionCountLabel(count: number): string {
    return `${count} khối`;
}

function LeafUnitStaffPanel({
    dept,
    canEdit,
    canRemoveFromUnit,
    allDepartments,
    getFirstPositionIdForDept,
    employeeTypes,
    showNotification,
    onChanged,
}: {
    dept: Department;
    canEdit: boolean;
    /** Chỉ Quản trị hệ thống / Quản trị CRM — gỡ khỏi đơn vị vận hành (department/position = null). */
    canRemoveFromUnit?: boolean;
    allDepartments: Department[];
    /** Đảm bảo có chức danh (tự tạo «Thành viên» nếu trống) — không còn quản lý chức danh trên cây. */
    getFirstPositionIdForDept: (departmentId: string) => Promise<string | null>;
    employeeTypes: { id: string; code: string; name: string }[];
    showNotification: (message: string, type?: 'success' | 'error') => void;
    onChanged?: () => void;
}) {
    const fn = dept.function;
    const expectedCode = fn ? ORG_FUNC_TO_EMPLOYEE_TYPE[fn] : '';
    const expectedTypeId = expectedCode ? employeeTypes.find((t) => t.code === expectedCode)?.id : undefined;

    const [staff, setStaff] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [candidates, setCandidates] = useState<Employee[]>([]);
    const [loadingCand, setLoadingCand] = useState(false);
    const [transferEmp, setTransferEmp] = useState<Employee | null>(null);
    const [targetDeptId, setTargetDeptId] = useState('');
    const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);
    const [pickerSearch, setPickerSearch] = useState('');

    const loadStaff = useCallback(async () => {
        setLoading(true);
        try {
            const res: any = await apiClient.get(
                `/hr/employees?departmentId=${encodeURIComponent(dept.id)}&directDepartment=1&limit=500`
            );
            const list = res?.data ?? [];
            setStaff(Array.isArray(list) ? list : []);
        } catch (e: any) {
            showNotification(e?.message || 'Không tải được danh sách nhân viên', 'error');
        } finally {
            setLoading(false);
        }
    }, [dept.id, showNotification]);

    useEffect(() => {
        void loadStaff();
    }, [loadStaff]);

    const transferTargets = useMemo(() => {
        if (!fn) return [];
        return allDepartments.filter((d) => {
            if (d.id === dept.id) return false;
            if (d.function !== fn) return false;
            const hasChild = allDepartments.some((c) => c.parentId === d.id);
            if (hasChild) return false;
            return true;
        });
    }, [allDepartments, dept.id, fn]);

    const openPicker = async () => {
        if (!fn) return;
        if (!ORG_FUNC_RELAXED_STAFF_PICKER.has(fn) && !expectedTypeId) return;
        setPickerSearch('');
        setPickerOpen(true);
        setLoadingCand(true);
        try {
            const url = ORG_FUNC_RELAXED_STAFF_PICKER.has(fn)
                ? '/hr/employees?limit=500'
                : `/hr/employees?employeeTypeId=${encodeURIComponent(expectedTypeId!)}&limit=500`;
            const res: any = await apiClient.get(url);
            const list = res?.data ?? [];
            setCandidates(Array.isArray(list) ? list : []);
        } catch (e: any) {
            showNotification(e?.message || 'Không tải danh sách ứng viên', 'error');
        } finally {
            setLoadingCand(false);
        }
    };

    const assign = async (emp: Employee) => {
        const posId = await getFirstPositionIdForDept(dept.id);
        if (!posId) {
            showNotification('Không tạo/lấy được chức danh mặc định cho đơn vị.', 'error');
            return;
        }
        try {
            await apiClient.put(`/hr/departments/${encodeURIComponent(dept.id)}/staff-assignment`, {
                employeeId: emp.id,
                positionId: posId,
            });
            showNotification('Đã gán nhân viên vào đơn vị');
            setPickerOpen(false);
            setPickerSearch('');
            await loadStaff();
            onChanged?.();
        } catch (e: any) {
            showNotification(e?.message || 'Không gán được', 'error');
        }
    };

    const doTransfer = async () => {
        if (!transferEmp || !targetDeptId) return;
        const posId = await getFirstPositionIdForDept(targetDeptId);
        if (!posId) {
            showNotification('Không tạo/lấy được chức danh cho đơn vị đích.', 'error');
            return;
        }
        try {
            await apiClient.put(`/hr/departments/${encodeURIComponent(targetDeptId)}/staff-assignment`, {
                employeeId: transferEmp.id,
                positionId: posId,
                allowReassignFromOtherUnit: true,
            });
            showNotification('Đã chuyển nhân viên');
            setTransferEmp(null);
            setTargetDeptId('');
            await loadStaff();
            onChanged?.();
        } catch (e: any) {
            showNotification(e?.message || 'Không chuyển được', 'error');
        }
    };

    const removeFromUnit = async (emp: Employee) => {
        if (
            !window.confirm(
                `Gỡ «${emp.fullName}» khỏi đơn vị vận hành này?\nNhân viên sẽ không còn đơn vị/chức danh vận hành cho đến khi được gán lại.`
            )
        ) {
            return;
        }
        try {
            await apiClient.delete(
                `/hr/departments/${encodeURIComponent(dept.id)}/staff-assignment/${encodeURIComponent(emp.id)}`
            );
            showNotification('Đã gỡ nhân viên khỏi đơn vị');
            await loadStaff();
            onChanged?.();
        } catch (e: any) {
            showNotification(e?.message || 'Không gỡ được', 'error');
        }
    };

    const pickable = candidates.filter((c) => c.departmentId !== dept.id);

    const pickableFiltered = useMemo(() => {
        const q = pickerSearch.trim().toLowerCase();
        if (!q) return pickable;
        return pickable.filter((emp) => {
            const name = (emp.fullName || '').toLowerCase();
            const code = (emp.code || '').toLowerCase();
            const phone = (emp.phone || '').toLowerCase();
            const deptName = ((emp as any).department?.name || '').toLowerCase();
            return name.includes(q) || code.includes(q) || phone.includes(q) || deptName.includes(q);
        });
    }, [pickable, pickerSearch]);

    return (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 pl-4 pr-2">
            <div className="flex items-center justify-between gap-2 mb-2">
                <h5 className="text-xs font-normal text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Users size={12} className="text-black" />
                    Nhân viên trong đơn vị
                </h5>
                {canEdit && fn && (expectedTypeId || ORG_FUNC_RELAXED_STAFF_PICKER.has(fn)) && (
                    <button
                        type="button"
                        onClick={() => void openPicker()}
                        className="text-xs font-medium text-primary hover:text-primary/90 flex items-center gap-1"
                    >
                        <UserPlus size={14} className="text-black" />
                        Thêm nhân viên
                    </button>
                )}
            </div>
            {!fn && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                    Gán chức năng đơn vị lá (Marketing, Sales, CSKH hoặc ghi nhận doanh thu theo data) trong «Sửa đơn vị» trước khi thêm nhân viên.
                </p>
            )}
            {loading ? (
                <p className="text-xs text-gray-400 italic py-1">Đang tải…</p>
            ) : staff.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-1">Chưa có nhân viên trực tiếp trong đơn vị này.</p>
            ) : (
                <ul className="space-y-2">
                    {staff.map((emp) => (
                        <li
                            key={emp.id}
                            className="flex items-center justify-between gap-2 bg-gray-50/80 rounded-lg px-3 py-2 border border-gray-100"
                        >
                            <button
                                type="button"
                                className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md hover:bg-gray-100/90 -my-0.5 -mx-1 px-1 py-0.5 transition-colors"
                                onClick={() => setDetailEmployeeId(emp.id)}
                                title="Xem thông tin chi tiết nhân viên"
                            >
                                {renderAvatar(emp, 5)}
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</div>
                                    <div className="text-xs text-gray-500 font-mono truncate">{emp.code || '—'}</div>
                                </div>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                                {canEdit && transferTargets.length > 0 && (
                                    <button
                                        type="button"
                                        className="text-xs text-gray-500 hover:text-primary"
                                        onClick={() => {
                                            setTransferEmp(emp);
                                            setTargetDeptId('');
                                        }}
                                    >
                                        Chuyển
                                    </button>
                                )}
                                {canRemoveFromUnit && (
                                    <button
                                        type="button"
                                        className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-0.5"
                                        title="Gỡ khỏi đơn vị vận hành (cần quyền cấu trúc / luồng dữ liệu / HR)"
                                        onClick={() => void removeFromUnit(emp)}
                                    >
                                        <UserMinus size={14} />
                                        Gỡ
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {pickerOpen &&
                createPortal(
                    <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                            <h4 className="font-normal text-gray-900 text-sm">Chọn nhân viên</h4>
                            <button
                                type="button"
                                className="text-gray-400 hover:text-gray-600"
                                onClick={() => {
                                    setPickerOpen(false);
                                    setPickerSearch('');
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-3 flex flex-col flex-1 min-h-0 gap-2">
                            {loadingCand ? (
                                <p className="text-sm text-gray-500 text-center py-6">Đang tải…</p>
                            ) : pickable.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-6">
                                    Không có nhân viên loại phù hợp hoặc đã thuộc đơn vị này.
                                </p>
                            ) : (
                                <>
                                    <div className="relative shrink-0">
                                        <Search
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                                            size={16}
                                            aria-hidden
                                        />
                                        <input
                                            type="search"
                                            autoComplete="off"
                                            placeholder="Tìm nhanh theo tên, mã NV, SĐT…"
                                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                            value={pickerSearch}
                                            onChange={(e) => setPickerSearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="overflow-y-auto flex-1 min-h-0">
                                        {pickableFiltered.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-6">
                                                Không có nhân viên khớp tìm kiếm.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {pickableFiltered.map((emp) => (
                                                    <li key={emp.id}>
                                                        <button
                                                            type="button"
                                                            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100"
                                                            onClick={() => void assign(emp)}
                                                        >
                                                            {renderAvatar(emp, 5)}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-medium truncate">
                                                                    {emp.fullName}
                                                                    {emp.code ? (
                                                                        <span className="text-gray-500 font-mono font-normal">
                                                                            {' '}
                                                                            · {emp.code}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                {(emp as any).department?.name && (
                                                                    <div className="text-xs text-gray-400 truncate">
                                                                        Đang tại: {(emp as any).department.name}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                    document.body
                )}

            {detailEmployeeId && (
                <EmployeeDetailModal employeeId={detailEmployeeId} onClose={() => setDetailEmployeeId(null)} />
            )}

            {transferEmp &&
                createPortal(
                    <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
                        <h4 className="font-normal text-gray-900">Chuyển nhân viên</h4>
                        <p className="text-sm text-gray-600">
                            <span className="font-medium">{transferEmp.fullName}</span> → đơn vị lá cùng chức năng (
                            {fn && fn in ORG_UNIT_FUNCTION_LABELS
                                ? ORG_UNIT_FUNCTION_LABELS[fn as OrgUnitFunctionCode]
                                : fn})
                        </p>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Đơn vị đích</label>
                            <select
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                value={targetDeptId}
                                onChange={(e) => setTargetDeptId(e.target.value)}
                            >
                                <option value="">— Chọn —</option>
                                {transferTargets.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {translate(d.name)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                                onClick={() => {
                                    setTransferEmp(null);
                                    setTargetDeptId('');
                                }}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                disabled={!targetDeptId}
                                className="px-3 py-2 text-sm bg-primary text-white rounded-lg disabled:opacity-50"
                                onClick={() => void doTransfer()}
                            >
                                Chuyển
                            </button>
                        </div>
                    </div>
                </div>,
                    document.body
                )}
        </div>
    );
}

interface DepartmentManagerProps {
    canEdit: boolean;
    /** Sửa tỉ lệ phân luồng data trên khối (CONFIG_DATA_FLOW / CONFIG_ORG_STRUCTURE / MANAGE_HR / FULL_ACCESS). */
    canEditDataFlow?: boolean;
    /** Gỡ NV khỏi đơn vị lá — một trong CONFIG_ORG_STRUCTURE / CONFIG_DATA_FLOW / MANAGE_HR (đồng bộ API). */
    canRemoveStaffFromOpsUnit?: boolean;
}

// Recursive Department Item Component
const DepartmentItem = ({ 
    dept, 
    allDepartments, 
    level = 0, 
    expandedDepartments, 
    toggleExpandDepartment, 
    departmentPositions, 
    canEdit, 
    canRemoveStaffFromOpsUnit,
    getFirstPositionIdForDept,
    handleOpenModal, 
    handleDelete, 
    sortableEnabled,
    employeeTypes,
    showNotification,
    onStaffListChanged,
    flowMeta,
    allDivisions = [],
}: any) => {
    const {
        attributes,
        listeners,
        setNodeRef: setSortableRef,
        transform,
        transition,
        isDragging: isSortDragging,
    } = useSortable({
        id: dept.id,
        data: { type: 'department', dept },
        disabled: !sortableEnabled || !canEdit,
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: dept.id,
        data: { type: 'department', dept }
    });

    const setNodeRef = React.useCallback(
        (node: HTMLElement | null) => {
            setSortableRef(node);
            setDroppableRef(node);
        },
        [setSortableRef, setDroppableRef]
    );

    const style = {
        transform: sortableEnabled && canEdit ? CSS.Translate.toString(transform) : undefined,
        transition: sortableEnabled && canEdit ? transition : undefined,
        opacity: isSortDragging ? 0.55 : 1,
        marginLeft: `${level * 24}px`
    };

    const isDeptExpanded = expandedDepartments.has(dept.id);
    const childDepts = allDepartments
        .filter((d: Department) => d.parentId === dept.id)
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    const hasChildren = childDepts.length > 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx(
                'transition-colors rounded-lg border-t border-gray-50 first:border-t-0',
                isOver && !isSortDragging && 'bg-primary/5 ring-2 ring-primary/25 ring-inset',
                isSortDragging && 'z-50 relative'
            )}
        >
                <div 
                    className={clsx(
                      'px-6 py-4 flex items-center justify-between hover:bg-gray-50 group transition-colors pl-4',
                    )}
                >
                    {sortableEnabled && canEdit && (
                        <button
                            type="button"
                            className="shrink-0 mr-1 p-1 rounded text-primary/50 hover:text-primary hover:bg-primary/5 cursor-grab active:cursor-grabbing touch-none mt-0.5"
                            title="Kéo để sắp xếp (cùng cấp)"
                            {...attributes}
                            {...listeners}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GripVertical size={16} />
                        </button>
                    )}
                    <div
                        className="flex-1 flex items-start gap-3 cursor-pointer min-w-0"
                        onClick={() => toggleExpandDepartment(dept.id)}
                    >
                        <div className="mt-1 text-black">
                            {isDeptExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <UsersRound size={16} className="text-black shrink-0" aria-hidden />
                                <span className="font-bold text-secondary">{translate(dept.name)}</span>
                                {dept.function === 'MARKETING' && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    {ORG_UNIT_FUNCTION_BADGE_LABELS.MARKETING}
                                  </span>
                                )}
                                {dept.function === 'SALES' && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary font-medium">
                                    {ORG_UNIT_FUNCTION_BADGE_LABELS.SALES}
                                  </span>
                                )}
                                {dept.function === 'CSKH' && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-support/15 text-support font-medium">
                                    {ORG_UNIT_FUNCTION_BADGE_LABELS.CSKH}
                                  </span>
                                )}
                                {dept.function === 'REV_DATA_BEFORE_20250701' && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-medium border border-amber-100 max-w-[min(100%,280px)] leading-snug inline-block">
                                    {ORG_UNIT_FUNCTION_BADGE_LABELS.REV_DATA_BEFORE_20250701}
                                  </span>
                                )}
                                {dept.function === 'REV_DATA_RANGE_20250701_20260131' && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-900 font-medium border border-teal-100 max-w-[min(100%,280px)] leading-snug inline-block">
                                    {ORG_UNIT_FUNCTION_BADGE_LABELS.REV_DATA_RANGE_20250701_20260131}
                                  </span>
                                )}
                                {(() => {
                                    if (!flowMeta?.shares || hasChildren) return null;
                                    let p: number | undefined;
                                    if (dept.function === 'SALES')
                                        p =
                                            flowMeta.shares.marketingToSalesPct?.[dept.id] ??
                                            flowMeta.shares.externalMarketingToSalesPct?.[dept.id];
                                    else if (dept.function === 'CSKH') {
                                        p = flowMeta.csOnly
                                            ? flowMeta.shares.csOnlyPct?.[dept.id]
                                            : flowMeta.shares.salesToCsPct?.[dept.id];
                                    }
                                    if (p == null || !Number.isFinite(Number(p))) return null;
                                    return (
                                        <span
                                            className="text-xs font-medium text-gray-500 tabular-nums"
                                            title="Tỉ lệ phân luồng (cấu hình khối)"
                                        >
                                            · {p}%
                                        </span>
                                    );
                                })()}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-secondary/80">
                                <Users size={14} className="text-black shrink-0" />
                                <span className="text-xs text-secondary/60">Quản lý:</span>
                                <div className="flex items-center gap-2">
                                    {renderAvatar(dept.manager)}
                                    <span className={clsx(dept.manager ? "text-secondary font-medium" : "text-gray-400 italic")}>
                                        {dept.manager ? dept.manager.fullName : 'Chưa có quản lý'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {canEdit && (
                        <div className="flex items-center gap-2 opacity-100 transition-opacity" onClick={e => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            <button 
                                onClick={() => handleOpenModal('department', dept)}
                                className="p-1.5 text-gray-400 hover:text-primary hover:bg-white rounded border border-transparent hover:border-gray-200"
                                title="Sửa Phòng ban"
                            >
                                <Edit size={16} />
                            </button>
                            <button 
                                onClick={() => handleDelete('department', dept.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded border border-transparent hover:border-gray-200"
                                title="Xóa Phòng ban"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {isDeptExpanded && (
                    <div className="pb-2">
                        <div className="pl-12 pr-6 pb-2 animate-fade-in">
                            {!hasChildren && Array.isArray(employeeTypes) && showNotification && (
                                <LeafUnitStaffPanel
                                    dept={dept}
                                    canEdit={canEdit}
                                    canRemoveFromUnit={!!canRemoveStaffFromOpsUnit}
                                    allDepartments={allDepartments}
                                    getFirstPositionIdForDept={getFirstPositionIdForDept}
                                    employeeTypes={employeeTypes}
                                    showNotification={showNotification}
                                    onChanged={onStaffListChanged}
                                />
                            )}

                            {/* Data Flow Panel for leaf units (Marketting/Sales/CSKH) to allow unit-to-unit routing */}
                            {!hasChildren && dept.function && (
                                <div className="mt-4 border-t border-gray-100 pt-4">
                                   <div className="text-[11px] font-bold text-secondary/40 uppercase tracking-widest mb-3">Phân luồng đơn vị</div>
                                   <DivisionDataFlowPanel
                                       division={dept as any}
                                       departments={allDepartments}
                                       allDivisions={allDivisions} 
                                       canEdit={!!canEdit}
                                       onSaved={(updated) => onStaffListChanged?.()}
                                       showNotification={showNotification}
                                   />
                                </div>
                            )}
                            
                            {/* Children Departments */}
                            {childDepts.length > 0 && (
                                <div className="border-l-2 border-gray-100 pl-2 ml-2">
                                    <SortableContext
                                        items={childDepts.map((c: Department) => c.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {childDepts.map((child: Department) => (
                                            <DepartmentItem
                                                key={child.id}
                                                dept={child}
                                                allDepartments={allDepartments}
                                                level={0}
                                                expandedDepartments={expandedDepartments}
                                                toggleExpandDepartment={toggleExpandDepartment}
                                                departmentPositions={departmentPositions}
                                                canEdit={canEdit}
                                                canRemoveStaffFromOpsUnit={canRemoveStaffFromOpsUnit}
                                                getFirstPositionIdForDept={getFirstPositionIdForDept}
                                                handleOpenModal={handleOpenModal}
                                                handleDelete={handleDelete}
                                                sortableEnabled={canEdit}
                                                employeeTypes={employeeTypes}
                                                showNotification={showNotification}
                                                onStaffListChanged={onStaffListChanged}
                                                flowMeta={flowMeta}
                                                allDivisions={allDivisions}
                                            />
                                        ))}
                                    </SortableContext>
                                </div>
                            )}
                        </div>
                    </div>
                )}
        </div>
    );
};

// Khối (mọi cấp): kéo thả sắp xếp anh em khi enableDivisionReorder
const SortableDivisionSection = ({
    division,
    departments,
    allDivisions,
    expandedDivisions,
    toggleExpand,
    canEdit,
    canRemoveStaffFromOpsUnit,
    getFirstPositionIdForDept,
    handleOpenModal,
    onAddChildDivision,
    handleDelete,
    expandedDepartments,
    toggleExpandDepartment,
    departmentPositions,
    enableDivisionReorder,
    employeeTypes,
    showNotification,
    onStaffListChanged,
    canEditDataFlow,
    onDivisionDataFlowSaved,
}: any) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({
        id: division.id,
        data: { type: 'division', division },
        disabled: !enableDivisionReorder,
    });

    const isExpanded = expandedDivisions.has(division.id);
    const divisionDepts = departments.filter((d: Department) => d.divisionId === division.id);
    // Đơn vị gốc dưới khối: parent_id trong DB = id bản ghi DIVISION (không phải null)
    const rootDeptsRaw = divisionDepts.filter((d: Department) => d.parentId === division.id);
    const rootDepts = sortRootDepartmentsByOrgFunction(rootDeptsRaw);
    const rootGroups = groupRootDeptsByFunction(rootDepts);
    const leavesInDiv = getLeafDepartmentsInDivisionSubtree(division.id, departments, allDivisions);
    const hasMktLeaf = leavesInDiv.some((d: Department) => d.function === 'MARKETING');
    const hasSalesLeaf = leavesInDiv.some((d: Department) => d.function === 'SALES');
    const hasCsLeaf = leavesInDiv.some((d: Department) => d.function === 'CSKH');
    const csOnlyBlock = !hasMktLeaf && !hasSalesLeaf && hasCsLeaf;
    const flowMeta: { csOnly: boolean; shares: DivisionDataFlowShares | null | undefined } = {
        csOnly: csOnlyBlock,
        shares: division.dataFlowShares,
    };
    const childDivisions = allDivisions
        .filter((d: Division) => d.parentId === division.id)
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    const style = {
        transform: enableDivisionReorder ? CSS.Translate.toString(transform) : undefined,
        transition: enableDivisionReorder ? transition : undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 1,
        position: 'relative' as const,
    };

    return (
        <div 
            key={division.id} 
            ref={setNodeRef}
            style={style}
            className={clsx(
                "bg-white rounded-xl border shadow-sm overflow-hidden transition-colors",
                isOver && !isDragging ? "border-primary/40 bg-primary/5 ring-2 ring-primary/20" : "border-gray-200"
            )}
        >
            {/* Division Header — kéo thả sắp xếp chỉ khi enableDivisionReorder */}
            <div 
                className={clsx(
                  'px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center hover:bg-gray-100 transition-colors',
                  canEdit && enableDivisionReorder && 'cursor-grab active:cursor-grabbing'
                )}
                {...(canEdit && enableDivisionReorder ? { ...attributes, ...listeners } : {})}
            >
                <div className="flex items-center gap-3 flex-1">
                    <div 
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-black cursor-pointer"
                        onClick={() => toggleExpand(division.id)}
                    >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div className="cursor-pointer flex items-start gap-2 min-w-0" onClick={() => toggleExpand(division.id)}>
                        <Layers size={18} className="text-division shrink-0 mt-1" aria-hidden />
                        <div className="min-w-0">
                        <h4 className="font-bold text-secondary leading-tight">
                            {translate(division.name)}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-secondary/70">
                            <span>{childDivisions.length} khối con, {rootDeptsRaw.length} đơn vị</span>
                            <span className="text-secondary/40">·</span>
                            <span className="flex items-center gap-1 min-w-0">
                                <Users size={12} className="text-black shrink-0" aria-hidden />
                                <span className="text-secondary/55 shrink-0">QL:</span>
                                {renderAvatar(division.manager, 5)}
                                <span className={clsx("truncate", division.manager ? "text-secondary font-medium" : "text-gray-400 italic")}>
                                    {division.manager ? division.manager.fullName : '—'}
                                </span>
                            </span>
                        </div>
                        </div>
                    </div>
                </div>
                {canEdit && (
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <button 
                            onClick={() => handleOpenModal('division', division)}
                            className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-200 rounded"
                            title="Sửa Khối"
                        >
                            <Edit size={16} />
                        </button>
                        <button 
                            onClick={() => handleDelete('division', division.id)}
                            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-gray-200 rounded"
                            title="Xóa Khối"
                        >
                            <Trash2 size={16} />
                        </button>
                        <div className="h-4 w-px bg-gray-300 mx-2"></div>
                        <button
                            onClick={() => {
                                if (!isExpanded) toggleExpand(division.id);
                                handleOpenModal('department', undefined, division.id);
                            }}
                            className="px-2 sm:px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50 flex items-center gap-1"
                            title="Thêm đơn vị (cùng cấp dưới khối)"
                        >
                            <Plus size={14} /> <span className="hidden sm:inline">Thêm đơn vị</span>
                        </button>
                        <button
                            onClick={() => {
                                if (!isExpanded) toggleExpand(division.id);
                                onAddChildDivision(division.id);
                            }}
                            className="px-2 sm:px-3 py-1 bg-white border border-secondary/20 text-secondary rounded-md text-xs font-medium hover:bg-secondary/5 flex items-center gap-1"
                            title="Thêm khối con dưới khối này"
                        >
                            <Plus size={14} /> <span className="hidden sm:inline">Khối con</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Departments List */}
            {isExpanded && (
                <div className="divide-y divide-gray-100 animate-fade-in min-h-[50px]">
                    {childDivisions.length > 0 && (
                        <div className="px-3 py-2 bg-primary/5 border-b border-primary/15 space-y-2">
                            <p className="text-[11px] font-semibold text-secondary/80 uppercase tracking-wide">Khối con</p>
                            <SortableContext
                                items={childDivisions.map((c: Division) => c.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-3">
                                    {childDivisions.map((child: Division) => (
                                        <SortableDivisionSection
                                            key={child.id}
                                            division={child}
                                            departments={departments}
                                            allDivisions={allDivisions}
                                            expandedDivisions={expandedDivisions}
                                            toggleExpand={toggleExpand}
                                            canEdit={canEdit}
                                            canRemoveStaffFromOpsUnit={canRemoveStaffFromOpsUnit}
                                            getFirstPositionIdForDept={getFirstPositionIdForDept}
                                            handleOpenModal={handleOpenModal}
                                            onAddChildDivision={onAddChildDivision}
                                            handleDelete={handleDelete}
                                            expandedDepartments={expandedDepartments}
                                            toggleExpandDepartment={toggleExpandDepartment}
                                            departmentPositions={departmentPositions}
                                            enableDivisionReorder={canEdit}
                                            employeeTypes={employeeTypes}
                                            showNotification={showNotification}
                                            onStaffListChanged={onStaffListChanged}
                                            canEditDataFlow={canEditDataFlow}
                                            onDivisionDataFlowSaved={onDivisionDataFlowSaved}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </div>
                    )}
                    <DivisionDataFlowPanel
                        division={division}
                        departments={departments}
                        allDivisions={allDivisions}
                        canEdit={!!canEditDataFlow}
                        onSaved={onDivisionDataFlowSaved}
                        showNotification={showNotification}
                    />
                    {rootDepts.length === 0 && childDivisions.length === 0 ? (
                        <div className="px-6 py-8 text-center text-gray-400 text-sm italic">
                            Chưa có đơn vị nào trong khối này.
                            <br/>
                            <span className="text-xs text-gray-300">
                                Dùng «+ Thêm đơn vị» để tạo mới, hoặc kéo thả đơn vị từ khối khác vào đây.
                            </span>
                        </div>
                    ) : (
                        <SortableContext
                            items={rootDepts.map((d: Department) => d.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {rootGroups.map((g) => (
                                <div key={g.key} className="border-t border-gray-100 first:border-t-0">
                                    <div className="px-6 py-2 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wide text-secondary/70">
                                        {g.label}
                                    </div>
                                    {g.items.map((dept: Department) => (
                                        <DepartmentItem
                                            key={dept.id}
                                            dept={dept}
                                            allDepartments={departments}
                                            level={0}
                                            expandedDepartments={expandedDepartments}
                                            toggleExpandDepartment={toggleExpandDepartment}
                                            departmentPositions={departmentPositions}
                                            canEdit={canEdit}
                                            canRemoveStaffFromOpsUnit={canRemoveStaffFromOpsUnit}
                                            getFirstPositionIdForDept={getFirstPositionIdForDept}
                                            handleOpenModal={handleOpenModal}
                                            handleDelete={handleDelete}
                                            sortableEnabled={canEdit}
                                            employeeTypes={employeeTypes}
                                            showNotification={showNotification}
                                            onStaffListChanged={onStaffListChanged}
                                            flowMeta={flowMeta}
                                            allDivisions={allDivisions}
                                        />
                                    ))}
                                </div>
                            ))}
                        </SortableContext>
                    )}
                </div>
            )}

        </div>
    );
};

type OrgRow = { id: string; code: string; name: string; rootDepartmentId?: string | null };

const DepartmentManager: React.FC<DepartmentManagerProps> = ({
    canEdit,
    canEditDataFlow = false,
    canRemoveStaffFromOpsUnit = false,
}) => {
    const [organizations, setOrganizations] = useState<OrgRow[]>([]);
    const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [managers, setManagers] = useState<Employee[]>([]);
    const [departmentPositions, setDepartmentPositions] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [employeeTypes, setEmployeeTypes] = useState<{ id: string; code: string; name: string }[]>([]);
    const [newDivisionParentId, setNewDivisionParentId] = useState<string | null>(null);
    const [orgModalOpen, setOrgModalOpen] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [newOrgCode, setNewOrgCode] = useState('');
    const [savingOrg, setSavingOrg] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState<'division' | 'department'>('department');
    const [editingItem, setEditingItem] = useState<any>(null);
    /** Tạo đơn vị mới từ cây: khối/cha đã xác định — không cho đổi «Thuộc khối / nút cha» */
    const [departmentPlacementLocked, setDepartmentPlacementLocked] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        divisionId: '',
        managerId: '',
        parentId: '', // For sub-department
        orgFunction: '' as '' | OrgUnitFunctionCode,
    });

    // Expanded States
    const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());
    const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
    /** Thu gọn / mở toàn bộ danh sách khối của tổ chức đang chọn */
    const [orgBlocksExpanded, setOrgBlocksExpanded] = useState(true);

    // Notification
    const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({
        show: false, message: '', type: 'success'
    });

    const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
    };

    const handleDivisionDataFlowSaved = useCallback((updated: Division) => {
        setDivisions((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    }, []);

    useEffect(() => {
        void loadOrganizations();
        fetchManagers();
        void (async () => {
            try {
                const raw: any = await apiClient.get('/hr/employee-types');
                const list = Array.isArray(raw) ? raw : [];
                setEmployeeTypes(list);
            } catch {
                setEmployeeTypes([]);
            }
        })();
    }, []);

    useEffect(() => {
        if (selectedOrganizationId) void fetchData();
    }, [selectedOrganizationId]);

    const loadOrganizations = async () => {
        try {
            const res: any = await apiClient.get('/hr/organizations');
            const list: OrgRow[] = Array.isArray(res) ? res : res?.data ?? [];
            setOrganizations(list);
            if (list.length > 0) {
                setSelectedOrganizationId((prev) => prev || list[0]!.id);
            } else {
                setLoading(false);
            }
        } catch (error) {
            console.error('Error loading organizations:', error);
            setLoading(false);
        }
    };

    const fetchData = async () => {
        if (!selectedOrganizationId) return;
        try {
            setLoading(true);
            const q = `organizationId=${encodeURIComponent(selectedOrganizationId)}`;
            const [divRes, deptRes] = await Promise.all([
                apiClient.get(`/hr/divisions?${q}`),
                apiClient.get(`/hr/departments?${q}`),
            ]);
            setDivisions((divRes as any) || []);
            setDepartments((deptRes as any) || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedOrg = organizations.find((o) => o.id === selectedOrganizationId);
    
    // Tìm rootDepartmentId (COMPANY) theo thứ tự ưu tiên:
    // 1. Từ API /hr/organizations (trường enriched rootDepartmentId)
    // 2. Từ danh sách departments (tìm type COMPANY)
    // 3. Suy ra từ danh sách divisions: parentId phổ biến nhất mà KHÔNG phải ID của division nào
    //    (tức là parentId trỏ lên nút COMPANY bên ngoài danh sách divisions)
    const rootFromOrg = selectedOrg?.rootDepartmentId;
    const rootFromDepts = departments.find((d) => d.type === 'COMPANY' && (d as any).organizationId === selectedOrganizationId)?.id;
    const inferredRoot = (() => {
        if (rootFromOrg || rootFromDepts) return null; // không cần suy
        // Đếm parentId phổ biến nhất trong divisions, loại trừ parentId là ID của division khác
        const divIds = new Set(divisions.map((d) => d.id));
        const parentCounts = new Map<string, number>();
        for (const d of divisions) {
            if (d.parentId && !divIds.has(d.parentId)) {
                parentCounts.set(d.parentId, (parentCounts.get(d.parentId) || 0) + 1);
            }
        }
        let best: string | null = null;
        let bestCount = 0;
        for (const [pid, cnt] of parentCounts) {
            if (cnt > bestCount) { best = pid; bestCount = cnt; }
        }
        return best;
    })();
    const finalRootId = rootFromOrg || rootFromDepts || inferredRoot || null;

    const orgCodeNorm = (selectedOrg?.code || '').trim().toUpperCase();
    const orgNameNorm = (selectedOrg?.name || '').trim().toLowerCase();

    const topLevelDivisions = (
        finalRootId
            ? divisions.filter((d) => d.parentId === finalRootId)
            : divisions.filter((d) => !d.parentId)
    )
        .filter((d) => {
            const codeU = (d.code || '').trim().toUpperCase();
            const nameN = (d.name || '').trim().toLowerCase();
            // Không hiển thị nếu mã khối hoặc tên khối trùng chính xác với tổ chức (trường hợp khối ảo / nút gốc bị nhầm)
            if (orgCodeNorm && codeU === orgCodeNorm) return false;
            if (orgNameNorm && nameN === orgNameNorm) return false;
            return true;
        })
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    const saveNewOrganization = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrgName.trim()) {
            showNotification('Nhập tên tổ chức', 'error');
            return;
        }
        setSavingOrg(true);
        try {
            const body: { name: string; code?: string } = { name: newOrgName.trim() };
            if (newOrgCode.trim()) body.code = newOrgCode.trim().toUpperCase();
            const created: any = await apiClient.post('/hr/organizations', body);
            const row = created?.data ?? created;
            await loadOrganizations();
            if (row?.id) setSelectedOrganizationId(row.id);
            setOrgModalOpen(false);
            setNewOrgName('');
            setNewOrgCode('');
            showNotification('Đã tạo tổ chức');
        } catch (err: any) {
            showNotification(err?.message || 'Không tạo được tổ chức', 'error');
        } finally {
            setSavingOrg(false);
        }
    };

    const fetchManagers = async () => {
        try {
            const res: any = await apiClient.get('/hr/employees?limit=1000'); // Fetch all to be safe, or filter onlyManagers
            if (res.data) {
                const employees = Array.isArray(res.data) ? res.data : (res.data?.data || []);
                setManagers(employees);
            }
        } catch (error) {
            console.error('Error fetching managers:', error);
        }
    };

    /** Tải chức danh theo đơn vị; nếu trống tự tạo một chức danh mặc định «Thành viên» (backend vẫn cần position khi gán NV). */
    const fetchPositions = useCallback(async (departmentId: string): Promise<any[]> => {
        try {
            const res: any = await apiClient.get(`/hr/positions?departmentId=${encodeURIComponent(departmentId)}`);
            const data = res.data || res;
            let list = Array.isArray(data) ? data : [];
            if (list.length === 0) {
                const cr: any = await apiClient.post('/hr/positions', {
                    name: 'Thành viên',
                    departmentId,
                });
                const created = cr.data || cr;
                list = created ? [created] : [];
            }
            setDepartmentPositions((prev) => ({
                ...prev,
                [departmentId]: list,
            }));
            return list;
        } catch (error) {
            console.error('Error fetching positions:', error);
            return [];
        }
    }, []);

    const getFirstPositionIdForDept = useCallback(
        async (departmentId: string): Promise<string | null> => {
            const list = await fetchPositions(departmentId);
            return list[0]?.id ?? null;
        },
        [fetchPositions]
    );

    const handleOpenModal = (
        type: 'division' | 'department',
        item?: any,
        secondaryId?: string,
        tertiaryId?: string,
        divisionParentForNew?: string | null
    ) => {
        setDepartmentPlacementLocked(false);
        setModalType(type);
        setEditingItem(item || null);
        if (type === 'division') {
            if (item) setNewDivisionParentId(null);
            else setNewDivisionParentId(divisionParentForNew ?? null);
        }
        if (item) {
            if (type === 'division') {
                 const div = item as Division;
                 setFormData({
                    name: item.name,
                    code: item.code,
                    divisionId: '',
                    managerId: div.managerId || '',
                    parentId: '',
                    orgFunction: '',
                 });
            } else {
                const dept = item as Department;
                setFormData({
                    name: item.name,
                    code: '',
                    divisionId: type === 'department' ? dept.divisionId : '',
                    managerId: type === 'department' ? dept.managerId || '' : '',
                    parentId: type === 'department' ? (dept.parentId || '') : '',
                    orgFunction: (type === 'department' && (dept as any).function) || '',
                });
            }
        } else {
            const isDepartment = type === 'department';

            if (isDepartment) {
                setDepartmentPlacementLocked(Boolean(secondaryId || tertiaryId));
            }

            setFormData({
                name: '',
                code: '',
                divisionId: isDepartment
                    ? secondaryId ||
                      (topLevelDivisions[0]?.id ?? divisions[0]?.id ?? '')
                    : '',
                managerId: '',
                parentId: isDepartment ? (tertiaryId || '') : '',
                orgFunction: '',
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isEdit = !!editingItem;
            let url = '';
            let method = isEdit ? 'put' : 'post';
            let body: any = { name: formData.name };

            if (modalType === 'department') {
                const editingDept = editingItem as Department | undefined;
                const isParentNode =
                    !!editingDept && departments.some((d) => d.parentId === editingDept.id);
                if (!isParentNode && !formData.orgFunction) {
                    showNotification('Vui lòng chọn chức năng đơn vị', 'error');
                    return;
                }
            }

            if (modalType === 'division') {
                url = isEdit ? `/hr/divisions/${editingItem?.id}` : '/hr/divisions';
                body.managerId = formData.managerId || null;
                if (selectedOrganizationId) body.organizationId = selectedOrganizationId;
                if (!isEdit && newDivisionParentId) body.parentId = newDivisionParentId;
            } else if (modalType === 'department') {
                url = isEdit ? `/hr/departments/${editingItem?.id}` : '/hr/departments';
                body.divisionId = formData.divisionId;
                body.managerId = formData.managerId || null;
                body.parentId = formData.parentId || null;
                body.function = formData.orgFunction || null;
            }

            const res: any = await (apiClient as any)[method](url, body);
            
            // Handle Local State Update
            if (res) { 
                const data = res.data || res; 
                
                if (modalType === 'division') {
                    if (isEdit) {
                         setDivisions(prev => prev.map(item => item.id === data.id ? data : item));
                    } else {
                         setDivisions(prev => [...prev, data]);
                    }
                } else if (modalType === 'department') {
                    if (isEdit) {
                        setDepartments(prev => prev.map(item => item.id === data.id ? data : item));
                    } else {
                        setDepartments(prev => [...prev, data]);
                        showNotification('Tạo mới thành công');
                        setNewDivisionParentId(null);
                        fetchData();
                        setIsModalOpen(false);
                        return;
                    }
                }

                showNotification(isEdit ? 'Cập nhật thành công' : 'Tạo mới thành công');
                setNewDivisionParentId(null);
                fetchData(); // Reload data from server to ensure all relations (like manager position) are up to date
            }
            
            setIsModalOpen(false);
        } catch (error: any) {
            console.error('Error saving data:', error);
            showNotification(error.message || 'Có lỗi xảy ra khi lưu dữ liệu', 'error');
        }
    };

    const handleDelete = async (type: 'division' | 'department', id: string) => {
        if (!window.confirm(`Bạn có chắc chắn muốn xóa ${type === 'division' ? 'Khối' : 'Phòng ban'} này?`)) return;
        try {
            let url = '';
            if (type === 'division') url = `/hr/divisions/${id}`;
            else if (type === 'department') url = `/hr/departments/${id}`;

            await apiClient.delete(url);
            
            // Update local state
            if (type === 'division') {
                setDivisions(prev => prev.filter(item => item.id !== id));
            } else if (type === 'department') {
                setDepartments(prev => prev.filter(item => item.id !== id));
            }
            showNotification('Xóa thành công');
        } catch (error: any) {
            console.error('Error deleting:', error);
            showNotification(error.message || 'Có lỗi xảy ra khi xóa', 'error');
        }
    };

    const toggleExpandDepartment = (departmentId: string) => {
        const newSet = new Set(expandedDepartments);
        if (newSet.has(departmentId)) {
            newSet.delete(departmentId);
        } else {
            newSet.add(departmentId);
            fetchPositions(departmentId);
        }
        setExpandedDepartments(newSet);
    };

    const toggleExpand = (divisionId: string) => {
        const newSet = new Set(expandedDivisions);
        if (newSet.has(divisionId)) {
            newSet.delete(divisionId);
        } else {
            newSet.add(divisionId);
        }
        setExpandedDivisions(newSet);
    };

    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragStart = (event: any) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) {
            setActiveId(null);
            return;
        }
        
        setActiveId(null);
        const activeId = active.id as string;
        const overId = over.id as string;
        
        if (activeId === overId) return;

        // Sắp xếp khối (DIVISION) cùng cha
        if (active.data.current?.type === 'division') {
            const activeDiv = divisions.find((d) => d.id === activeId);
            const overDiv = divisions.find((d) => d.id === overId);
            if (activeDiv && overDiv && activeDiv.parentId === overDiv.parentId) {
                const siblings = divisions
                    .filter((d) => d.parentId === activeDiv.parentId)
                    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
                const oldIndex = siblings.findIndex((d) => d.id === activeId);
                const newIndex = siblings.findIndex((d) => d.id === overId);
                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const newSiblings = arrayMove(siblings, oldIndex, newIndex);
                    const orderMap = new Map(newSiblings.map((d, i) => [d.id, i]));
                    setDivisions((prev) =>
                        prev.map((d) => (orderMap.has(d.id) ? { ...d, displayOrder: orderMap.get(d.id)! } : d))
                    );
                    try {
                        await apiClient.put('/hr/divisions/reorder', {
                            items: newSiblings.map((d, i) => ({ id: d.id, displayOrder: i })),
                        });
                    } catch (error) {
                        console.error('Error reordering divisions:', error);
                        fetchData();
                    }
                }
            }
            return;
        }

        const activeDept = departments.find((d) => d.id === activeId);
        if (!activeDept) return;

        const overDept = departments.find((d) => d.id === overId);
        if (overDept && active.data.current?.type === 'department') {
            const sameDiv = activeDept.divisionId === overDept.divisionId;
            const sameParent = (activeDept.parentId || null) === (overDept.parentId || null);
            if (sameDiv && sameParent) {
                const siblings = departments
                    .filter(
                        (d) =>
                            d.divisionId === activeDept.divisionId &&
                            (d.parentId || null) === (activeDept.parentId || null)
                    )
                    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
                const oldIndex = siblings.findIndex((d) => d.id === activeId);
                const newIndex = siblings.findIndex((d) => d.id === overId);
                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const newSiblings = arrayMove(siblings, oldIndex, newIndex);
                    const orderMap = new Map(newSiblings.map((d, i) => [d.id, i]));
                    setDepartments((prev) =>
                        prev.map((d) => (orderMap.has(d.id) ? { ...d, displayOrder: orderMap.get(d.id)! } : d))
                    );
                    try {
                        await apiClient.put('/hr/divisions/reorder', {
                            items: newSiblings.map((d, i) => ({ id: d.id, displayOrder: i })),
                        });
                    } catch {
                        fetchData();
                    }
                }
                return;
            }
        }

        try {
            // Check if dropping on a Division
            if (over.data.current?.type === 'division') {
                const newDivisionId = overId; // The ID is the division ID

                // Đơn vị gốc dưới khối: parent_id = id khối (DIVISION), không phải null
                if (activeDept.parentId === newDivisionId && activeDept.divisionId === newDivisionId) return;

                await apiClient.put(`/hr/departments/${activeId}`, {
                    divisionId: newDivisionId,
                });

                setDepartments((prev) =>
                    prev.map((d) =>
                        d.id === activeId
                            ? { ...d, divisionId: newDivisionId, parentId: newDivisionId }
                            : d
                    )
                );
                fetchData();
            } else {
                // Dropping on another department (nesting)
                const parentDept = departments.find(d => d.id === overId);
                
                // If dropping on something that is not a division AND not a known department
                // It might be an issue with data sync or stale state
                if (!parentDept) {
                    // Check if it's actually a division but type wasn't passed correctly?
                    const possibleDiv = divisions.find(d => d.id === overId);
                    if (possibleDiv) {
                        if (activeDept.parentId === possibleDiv.id && activeDept.divisionId === possibleDiv.id) return;

                        await apiClient.put(`/hr/departments/${activeId}`, {
                            divisionId: possibleDiv.id,
                        });
                        setDepartments((prev) =>
                            prev.map((d) =>
                                d.id === activeId
                                    ? { ...d, divisionId: possibleDiv.id, parentId: possibleDiv.id }
                                    : d
                            )
                        );
                        fetchData();
                        return;
                    }
                    return;
                }

                // Check circular: Is overId a descendant of activeId?
                let current = parentDept;
                let isCircular = false;
                // Safety depth limit to prevent infinite loops if data is corrupted
                let depth = 0;
                while (current.parentId && depth < 50) {
                    if (current.parentId === activeId) {
                        isCircular = true;
                        break;
                    }
                    const nextParent = departments.find(d => d.id === current.parentId);
                    if (!nextParent) break;
                    current = nextParent;
                    depth++;
                }
                
                if (isCircular || parentDept.id === activeId) {
                    showNotification("Không thể di chuyển phòng ban vào bên trong chính nó hoặc con của nó!", 'error');
                    return;
                }

                await apiClient.put(`/hr/departments/${activeId}`, {
                    parentId: overId,
                    divisionId: parentDept.divisionId // Auto-move to parent's division
                });

                setDepartments(prev => prev.map(d => d.id === activeId ? { ...d, parentId: overId, divisionId: parentDept.divisionId } : d));
                fetchData();
            }
        } catch (error: any) {
            console.error('Error moving department:', error);
            showNotification(error.message || 'Lỗi khi di chuyển phòng ban', 'error');
            fetchData(); // Revert on error
        }
    };

    const onAddChildDivision = (parentId: string) => {
        handleOpenModal('division', undefined, undefined, undefined, parentId);
    };

    const orgModalEl = orgModalOpen ? (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <h3 className="font-normal text-lg text-gray-900 mb-4">Thêm tổ chức</h3>
                <form onSubmit={saveNewOrganization} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tên <span className="text-red-500">*</span>
                        </label>
                        <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            placeholder="Ví dụ: Công ty XYZ"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mã (tùy chọn)</label>
                        <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase"
                            value={newOrgCode}
                            onChange={(e) => setNewOrgCode(e.target.value)}
                            placeholder="Để trống sẽ tự sinh từ tên"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                            onClick={() => setOrgModalOpen(false)}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={savingOrg}
                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                            {savingOrg ? 'Đang tạo…' : 'Tạo tổ chức'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    ) : null;

    if (loading && !organizations.length) return <div className="text-center py-8">Loading...</div>;
    if (!organizations.length) {
        return (
            <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                    Chưa có tổ chức. Chạy migration / khởi động backend để tạo KAGRI, hoặc tạo tổ chức mới.
                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => setOrgModalOpen(true)}
                            className="ml-3 px-3 py-1 bg-amber-800 text-white rounded-md text-xs"
                        >
                            Thêm tổ chức
                        </button>
                    )}
                </div>
                {orgModalEl}
            </>
        );
    }

    return (
        <div className="space-y-6">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-gray-200">
                        {organizations.length > 1 && (
                            <select
                                aria-label="Chọn tổ chức"
                                value={selectedOrganizationId}
                                onChange={(e) => setSelectedOrganizationId(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 max-w-[min(220px,45vw)] border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-secondary bg-white"
                            >
                                {organizations.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {translate(o.name)}
                                    </option>
                                ))}
                            </select>
                        )}
                        <button
                            type="button"
                            onClick={() => setOrgBlocksExpanded((v) => !v)}
                            className="flex flex-1 min-w-0 items-center gap-3 text-left transition-colors hover:opacity-90 rounded-md pr-2"
                        >
                            <span className="shrink-0 text-black">
                                {orgBlocksExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </span>
                            <Building2 size={22} className="text-primary shrink-0" aria-hidden />
                            <span className="text-secondary truncate min-w-0">
                                {selectedOrg ? (
                                    <>
                                        <span className="font-bold">{translate(selectedOrg.name)}</span>
                                        <span className="font-normal">
                                            {' '}
                                            {formatTopLevelDivisionCountLabel(topLevelDivisions.length)}
                                        </span>
                                    </>
                                ) : (
                                    '—'
                                )}
                            </span>
                        </button>
                        {canEdit && selectedOrg && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenModal('division', undefined, undefined, undefined, null);
                                }}
                                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-primary hover:bg-primary/5"
                            >
                                <Plus size={16} className="text-primary" />
                                Thêm khối
                            </button>
                        )}
                    </div>
                    {orgBlocksExpanded && (
                        <div className="p-4 space-y-3">
                            <SortableContext
                                items={topLevelDivisions.map((d) => d.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="grid grid-cols-1 gap-4">
                                    {loading ? (
                                        <div className="text-center py-8 text-gray-500">Đang tải…</div>
                                    ) : topLevelDivisions.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                            Chưa có khối dưới tổ chức này
                                        </div>
                                    ) : (
                                        topLevelDivisions.map((division) => (
                                            <SortableDivisionSection
                                                key={division.id}
                                                division={division}
                                                departments={departments}
                                                allDivisions={divisions}
                                                expandedDivisions={expandedDivisions}
                                                toggleExpand={toggleExpand}
                                                canEdit={canEdit}
                                                canRemoveStaffFromOpsUnit={canRemoveStaffFromOpsUnit}
                                                getFirstPositionIdForDept={getFirstPositionIdForDept}
                                                handleOpenModal={handleOpenModal}
                                                onAddChildDivision={onAddChildDivision}
                                                handleDelete={handleDelete}
                                                expandedDepartments={expandedDepartments}
                                                toggleExpandDepartment={toggleExpandDepartment}
                                                departmentPositions={departmentPositions}
                                                enableDivisionReorder={canEdit}
                                                employeeTypes={employeeTypes}
                                                showNotification={showNotification}
                                                onStaffListChanged={fetchManagers}
                                                canEditDataFlow={canEditDataFlow}
                                                onDivisionDataFlowSaved={handleDivisionDataFlowSaved}
                                            />
                                        ))
                                    )}
                                </div>
                            </SortableContext>
                            {canEdit && !loading && (
                                <div className="flex justify-center pt-2 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setOrgModalOpen(true)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-primary/50 text-sm font-medium text-primary hover:bg-primary/5"
                                    >
                                        <Building2 size={18} className="text-primary shrink-0" />
                                        Thêm tổ chức
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DragOverlay>
                    {activeId ? (() => {
                        const dept = departments.find(d => d.id === activeId);
                        const div = divisions.find(d => d.id === activeId);
                        const name = dept ? translate(dept.name) : div ? translate(div.name) : '';
                        
                        return (
                            <div className="bg-white p-4 rounded-lg shadow-xl border-2 border-primary opacity-90 w-[300px] pointer-events-none">
                                <div className="font-bold text-secondary">
                                    {name}
                                </div>
                            </div>
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-normal text-secondary">
                                {editingItem ? 'Cập nhật' : 'Thêm mới'}{' '}
                                {modalType === 'division'
                                    ? newDivisionParentId
                                        ? 'khối con'
                                        : 'khối (dưới gốc)'
                                    : 'đơn vị'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên {modalType === 'division' ? 'khối' : 'đơn vị'}{' '}
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder={`Nhập tên ${modalType === 'division' ? 'khối' : 'đơn vị'}...`}
                                />
                            </div>

                            {modalType === 'division' && !editingItem && newDivisionParentId && (
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-1">
                                        Khối cha
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={translate(
                                            divisions.find((d) => d.id === newDivisionParentId)?.name || '—'
                                        )}
                                        className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-secondary/70 text-sm"
                                    />
                                </div>
                            )}

                            {modalType === 'division' && (
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-1">
                                        Quản lý Khối
                                    </label>
                                    <SearchableSelect
                                        options={managers.map(m => ({ 
                                            value: m.id, 
                                            label: m.fullName,
                                            avatarUrl: m.avatarUrl || (m as any).avatar
                                        }))}
                                        value={formData.managerId}
                                        onChange={(value) => setFormData({...formData, managerId: value})}
                                        placeholder="Chọn quản lý..."
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {modalType === 'department' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Thuộc khối / nút cha <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            required
                                            value={formData.divisionId}
                                            onChange={(e) => setFormData({...formData, divisionId: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-100 disabled:text-gray-500"
                                            disabled={!!formData.parentId || departmentPlacementLocked}
                                        >
                                            <option value="">-- Chọn khối (hoặc khối con) --</option>
                                            {divisions.map((div) => (
                                                <option key={div.id} value={div.id}>
                                                    {translate(div.name)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {formData.parentId && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Thuộc đơn vị cha
                                            </label>
                                            <input
                                                type="text"
                                                disabled
                                                value={departments.find(d => d.id === formData.parentId)?.name || ''}
                                                className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-500"
                                            />
                                        </div>
                                    )}

                                    {editingItem &&
                                      departments.some((d) => d.parentId === (editingItem as Department).id) && (
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            Đơn vị có cấp con: không gán chức năng lá (Marketing, Sales, CSKH, ghi nhận DT…) cho nút cha.
                                        </p>
                                    )}

                                    {(!editingItem ||
                                      !departments.some((d) => d.parentId === (editingItem as Department).id)) && (
                                      <div>
                                        <label className="block text-sm font-medium text-secondary mb-1">
                                          Chức năng đơn vị <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                          required
                                          value={formData.orgFunction}
                                          onChange={(e) =>
                                            setFormData({
                                              ...formData,
                                              orgFunction: e.target.value as typeof formData.orgFunction,
                                            })
                                          }
                                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        >
                                          <option value="">-- Chọn chức năng --</option>
                                          {ORG_UNIT_FUNCTION_CODES.map((code) => (
                                              <option key={code} value={code}>
                                                  {ORG_UNIT_FUNCTION_LABELS[code]}
                                              </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    <div>
                                        <SearchableSelect
                                            label="Quản lý (tùy chọn)"
                                            placeholder="Chọn quản lý từ nhân sự..."
                                            options={managers.map(emp => ({
                                                value: emp.id,
                                                label: emp.fullName,
                                                avatarUrl: emp.avatarUrl || (emp as any).avatar
                                            }))}
                                            value={formData.managerId}
                                            onChange={(val) => setFormData({...formData, managerId: val})}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Không bắt buộc. Người được chọn là quản lý của đơn vị này.
                                        </p>
                                    </div>
                                </>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 shadow-sm"
                                >
                                    {editingItem ? 'Cập nhật' : 'Tạo mới'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Notification Toast */}
            {notification.show && (
                <div className={clsx(
                    "fixed top-5 right-5 z-[100] bg-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in border-l-4 min-w-[300px]",
                    notification.type === 'success' ? "border-primary" : "border-error"
                )}>
                    {notification.type === 'success' ? <Check className="text-primary" /> : <X className="text-error" />}
                    <div>
                        <h4 className="font-normal text-sm text-secondary">{notification.type === 'success' ? 'Thành công' : 'Lỗi'}</h4>
                        <p className="text-secondary/70 text-sm">{notification.message}</p>
                    </div>
                </div>
            )}
            {orgModalEl}
        </div>
    );
};

export default DepartmentManager;
