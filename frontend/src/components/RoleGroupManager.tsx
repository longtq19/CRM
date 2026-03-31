import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { RoleGroup, Menu, Permission } from '../types';
import { Save, Check, Shield, Menu as MenuIcon, Users, UserPlus, Plus, Trash2, Edit2, X, Eye, Copy, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { translate, translatePermissionLabel, permissionTooltip } from '../utils/dictionary';
import { RoleGroupAssignmentModal } from './RoleGroupAssignmentModal';
import { RoleGroupCreateModal } from './RoleGroupCreateModal';
import { isTechnicalAdminRole } from '../constants/rbac';
import { useAuthStore } from '../context/useAuthStore';

const RoleGroupManager: React.FC = () => {
    const { hasPermission } = useAuthStore();
    /** Chỉnh sửa nhóm quyền: quyền mới hoặc tương thích `EDIT_SETTINGS` / `FULL_ACCESS`. */
    const canManageRoleGroups =
        hasPermission('MANAGE_ROLE_GROUPS') ||
        hasPermission('EDIT_SETTINGS') ||
        hasPermission('FULL_ACCESS');
    const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([]);
    const [allMenus, setAllMenus] = useState<Menu[]>([]);
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    
    const [selectedRoleGroup, setSelectedRoleGroup] = useState<RoleGroup | null>(null);
    const [selectedMenus, setSelectedMenus] = useState<Set<string>>(new Set());
    const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
    const [viewScopes, setViewScopes] = useState<{ hr: string; customer: string }>({ hr: 'SELF_RECURSIVE', customer: 'SELF_RECURSIVE' });
    const [savingViewScope, setSavingViewScope] = useState(false);
    
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (!selectedRoleGroup) {
            setSelectedMenus(new Set());
            setSelectedPermissions(new Set());
            setViewScopes({ hr: 'SELF_RECURSIVE', customer: 'SELF_RECURSIVE' });
            return;
        }
        if (isTechnicalAdminRole(selectedRoleGroup.code)) {
            setSelectedMenus(new Set(allMenus.map(m => m.id)));
            setSelectedPermissions(new Set(allPermissions.map(p => p.id)));
            setViewScopes({ hr: 'COMPANY', customer: 'COMPANY' });
            setIsRenaming(false);
            return;
        }
        setSelectedMenus(new Set(selectedRoleGroup.menus.map(m => m.id)));
        setSelectedPermissions(new Set(selectedRoleGroup.permissions.map(p => p.id)));
        setIsRenaming(false);
        fetchViewScopes(selectedRoleGroup.id);
    }, [selectedRoleGroup, allMenus, allPermissions]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [rolesRes, menusRes, permsRes] = await Promise.all([
                apiClient.get('/role-groups'),
                apiClient.get('/role-groups/menus'),
                apiClient.get('/role-groups/permissions')
            ]);

            if (rolesRes.success) setRoleGroups(rolesRes.data);
            if (menusRes.success) setAllMenus(menusRes.data);
            if (permsRes.success) setAllPermissions(permsRes.data);
            
            // Select first role by default if available
            if (rolesRes.success && rolesRes.data.length > 0 && !selectedRoleGroup) {
                setSelectedRoleGroup(rolesRes.data[0]);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
            setMessage({ type: 'error', text: 'Không thể tải dữ liệu phân quyền.' });
        } finally {
            setLoading(false);
        }
    };

    const fetchViewScopes = async (roleGroupId: string) => {
        try {
            const res = await apiClient.get('/role-groups/view-scopes');
            if (res.success && res.data?.scopesMap?.[roleGroupId]) {
                const s = res.data.scopesMap[roleGroupId];
                setViewScopes({ hr: s.HR || 'SELF_RECURSIVE', customer: s.CUSTOMER || 'SELF_RECURSIVE' });
            } else {
                setViewScopes({ hr: 'SELF_RECURSIVE', customer: 'SELF_RECURSIVE' });
            }
        } catch {
            setViewScopes({ hr: 'SELF_RECURSIVE', customer: 'SELF_RECURSIVE' });
        }
    };

    const handleSaveViewScope = async (context: 'HR' | 'CUSTOMER', scope: string) => {
        if (!selectedRoleGroup) return;
        if (isTechnicalAdminRole(selectedRoleGroup.code)) return;
        if (!canManageRoleGroups) return;
        if (savingViewScope) return;
        setMessage(null);
        try {
            setSavingViewScope(true);
            const body = context === 'HR' ? { roleGroupId: selectedRoleGroup.id, hrScope: scope } : { roleGroupId: selectedRoleGroup.id, customerScope: scope };
            const res: any = await apiClient.put('/role-groups/view-scopes', body);
            if (res?.success) {
                setViewScopes(prev => ({ ...prev, [context === 'HR' ? 'hr' : 'customer']: scope }));
                setMessage({ type: 'success', text: 'Cập nhật phạm vi xem thành công!' });
            } else {
                setMessage({ type: 'error', text: res?.message || 'Cập nhật thất bại' });
            }
        } catch (e: any) {
            const msg = e?.message || 'Lỗi khi cập nhật phạm vi xem.';
            setMessage({ type: 'error', text: msg });
        } finally {
            setSavingViewScope(false);
        }
    };

    const handleSave = async () => {
        if (!selectedRoleGroup) return;
        if (isTechnicalAdminRole(selectedRoleGroup.code)) return;
        if (!canManageRoleGroups) return;

        try {
            setSaving(true);
            setMessage(null);
            
            const res = await apiClient.put(`/role-groups/${selectedRoleGroup.id}`, {
                menuIds: Array.from(selectedMenus),
                permissionIds: Array.from(selectedPermissions)
            });

            if (res.success) {
                setMessage({ type: 'success', text: 'Cập nhật quyền thành công!' });
                // Update local state
                const updatedRole = res.data;
                setRoleGroups(prev => prev.map(r => r.id === updatedRole.id ? updatedRole : r));
                setSelectedRoleGroup(updatedRole);
            } else {
                setMessage({ type: 'error', text: res.message || 'Lỗi khi lưu dữ liệu.' });
            }
        } catch (error) {
            console.error('Save error:', error);
            setMessage({ type: 'error', text: 'Lỗi hệ thống khi lưu dữ liệu.' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedRoleGroup) return;
        if (isTechnicalAdminRole(selectedRoleGroup.code)) return;
        if (!canManageRoleGroups) return;
        if (!window.confirm(`Bạn có chắc chắn muốn xóa nhóm quyền "${translate(selectedRoleGroup.name)}"?`)) return;

        try {
            setLoading(true);
            const res: any = await apiClient.delete(`/role-groups/${selectedRoleGroup.id}`);
            if (res.success) {
                const newRoles = roleGroups.filter(r => r.id !== selectedRoleGroup.id);
                setRoleGroups(newRoles);
                setSelectedRoleGroup(newRoles.length > 0 ? newRoles[0] : null);
                setMessage({ type: 'success', text: 'Đã xóa nhóm quyền.' });
            } else {
                setMessage({ type: 'error', text: res.message || 'Không thể xóa nhóm quyền.' });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Lỗi khi xóa.' });
        } finally {
            setLoading(false);
        }
    };

    const toggleMenu = (id: string) => {
        const newSet = new Set(selectedMenus);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedMenus(newSet);
    };

    const togglePermission = (id: string) => {
        const newSet = new Set(selectedPermissions);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedPermissions(newSet);
    };

    const toggleAllMenus = () => {
        if (selectedMenus.size === allMenus.length) {
            setSelectedMenus(new Set());
        } else {
            setSelectedMenus(new Set(allMenus.map(m => m.id)));
        }
    };

    const toggleAllPermissions = () => {
        if (selectedPermissions.size === allPermissions.length) {
            setSelectedPermissions(new Set());
        } else {
            setSelectedPermissions(new Set(allPermissions.map(p => p.id)));
        }
    };

    const handleRename = async () => {
        if (!selectedRoleGroup || !renameValue.trim()) return;
        if (isTechnicalAdminRole(selectedRoleGroup.code)) return;
        if (!canManageRoleGroups) return;

        try {
            setSaving(true);
            const res = await apiClient.put(`/role-groups/${selectedRoleGroup.id}`, {
                name: renameValue
            });

            if (res.success) {
                setMessage({ type: 'success', text: 'Đổi tên thành công!' });
                const updatedRole = res.data;
                setRoleGroups(prev => prev.map(r => r.id === updatedRole.id ? updatedRole : r));
                setSelectedRoleGroup(updatedRole);
                setIsRenaming(false);
            } else {
                setMessage({ type: 'error', text: res.message || 'Lỗi khi đổi tên.' });
            }
        } catch (error) {
            console.error('Rename error:', error);
            setMessage({ type: 'error', text: 'Lỗi hệ thống khi đổi tên.' });
        } finally {
            setSaving(false);
        }
    };

    const PERMISSION_GROUPS: Record<string, string> = {
        // 1. Hệ thống
        FULL_ACCESS: '1. Hệ thống',
        MANAGE_SYSTEM: '1. Hệ thống',
        VIEW_LOGS: '1. Hệ thống',
        VIEW_SETTINGS: '1. Hệ thống',
        EDIT_SETTINGS: '1. Hệ thống',
        STAFF_LOGOUT: '1. Hệ thống',
        STAFF_LOCK: '1. Hệ thống',
        VIEW_ROLE_GROUPS: '1. Hệ thống',
        MANAGE_ROLE_GROUPS: '1. Hệ thống',
        // 2. Dashboard & Báo cáo
        VIEW_DASHBOARD: '2. Dashboard & Báo cáo',
        VIEW_REPORTS: '2. Dashboard & Báo cáo',
        VIEW_PERFORMANCE: '2. Dashboard & Báo cáo',
        // 3. Nhân sự
        MANAGE_HR: '3. Nhân sự',
        VIEW_HR: '3. Nhân sự',
        VIEW_EMPLOYEE_TYPE_CATALOG: '3. Nhân sự',
        MANAGE_EMPLOYEE_TYPE_CATALOG: '3. Nhân sự',
        VIEW_CONTRACTS: '3. Nhân sự',
        VIEW_LEAVE_REQUESTS: '3. Nhân sự',
        MANAGE_LEAVE_REQUESTS: '3. Nhân sự',
        DELETE_LEAVE_REQUESTS: '3. Nhân sự',
        // 4. Kho số & Phân bổ
        VIEW_FLOATING_POOL: '4. Kho số & Phân bổ',
        MANAGE_DATA_POOL: '4. Kho số & Phân bổ',
        DATA_POOL_CONFIG: '4. Kho số & Phân bổ',
        CONFIG_DISTRIBUTION: '4. Kho số & Phân bổ',
        CLAIM_LEAD: '4. Kho số & Phân bổ',
        ASSIGN_LEAD: '4. Kho số & Phân bổ',
        DISTRIBUTE_FLOATING_POOL: '4. Kho số & Phân bổ',
        DISTRIBUTE_FLOATING_CROSS_ORG: '4. Kho số & Phân bổ',
        CLAIM_FLOATING_POOL: '4. Kho số & Phân bổ',
        VIEW_CSKH_POOL: '4. Kho số & Phân bổ',
        MANAGE_CSKH_POOL: '4. Kho số & Phân bổ',
        DISTRIBUTE_SALES_CROSS_ORG: '4. Kho số & Phân bổ',
        VIEW_MANAGED_UNIT_POOL: '4. Kho số & Phân bổ',
        RECALL_MANAGED_UNIT_LEADS: '4. Kho số & Phân bổ',
        // 5. Kinh doanh
        VIEW_CUSTOMERS: '5. Kinh doanh',
        VIEW_ALL_COMPANY_CUSTOMERS: '5. Kinh doanh',
        MANAGE_CUSTOMERS: '5. Kinh doanh',
        VIEW_MARKETING_PLATFORMS: '5. Kinh doanh',
        CREATE_MARKETING_PLATFORM: '5. Kinh doanh',
        UPDATE_MARKETING_PLATFORM: '5. Kinh doanh',
        DELETE_MARKETING_PLATFORM: '5. Kinh doanh',
        DELETE_CUSTOMER: '5. Kinh doanh',
        MANAGE_MARKETING_GROUPS: '5. Kinh doanh',
        VIEW_MARKETING_CAMPAIGNS: '5. Kinh doanh',
        CREATE_MARKETING_CAMPAIGN: '5. Kinh doanh',
        UPDATE_MARKETING_CAMPAIGN: '5. Kinh doanh',
        DELETE_MARKETING_CAMPAIGN: '5. Kinh doanh',
        VIEW_SALES: '5. Kinh doanh',
        MANAGE_SALES: '5. Kinh doanh',
        VIEW_RESALES: '5. Kinh doanh',
        MANAGE_RESALES: '5. Kinh doanh',
        VIEW_SALES_EFFECTIVENESS: '5. Kinh doanh',
        VIEW_CSKH_EFFECTIVENESS: '5. Kinh doanh',
        MANAGE_PRODUCTS: '5. Kinh doanh',
        MANAGE_SUPPORT_TICKETS: '5. Kinh doanh',
        // 6. Đơn hàng & Vận chuyển
        VIEW_ORDERS: '6. Đơn hàng & Vận chuyển',
        VIEW_ALL_COMPANY_ORDERS: '6. Đơn hàng & Vận chuyển',
        CREATE_ORDER: '6. Đơn hàng & Vận chuyển',
        MANAGE_ORDERS: '6. Đơn hàng & Vận chuyển',
        MANAGE_SHIPPING: '6. Đơn hàng & Vận chuyển',
        ASSIGN_SHIPPING_DAILY_QUOTA: '6. Đơn hàng & Vận chuyển',
        CREATE_ORDER_OUTSIDE_SYSTEM: '6. Đơn hàng & Vận chuyển',
        // 7. Kho vận
        MANAGE_WAREHOUSE: '7. Kho vận',
        // 8. Kế toán
        VIEW_ACCOUNTING: '8. Kế toán',
        MANAGE_ACCOUNTING: '8. Kế toán',
        // 9. Vận hành & Cơ cấu
        CONFIG_OPERATIONS: '9. Vận hành & Cơ cấu',
        CONFIG_ORG_STRUCTURE: '9. Vận hành & Cơ cấu',
        CONFIG_DATA_FLOW: '9. Vận hành & Cơ cấu',
        VIEW_DIVISIONS: '9. Vận hành & Cơ cấu',
        // 10. Tiện ích
        MANAGE_NOTIFICATIONS: '10. Tiện ích',
        CREATE_DRAFT_NOTIFICATION: '10. Tiện ích',
        MANAGE_DOCUMENTS: '10. Tiện ích',
        MANAGE_INTERNAL_NOTES: '10. Tiện ích',
        DELETE_CONVERSATION: '10. Tiện ích',
    };

    const getPermissionGroup = (code: string) => PERMISSION_GROUPS[code] || '99. Khác';

    const groupedPermissions = allPermissions.reduce((acc, perm) => {
        const group = getPermissionGroup(perm.code);
        if (!acc[group]) acc[group] = [];
        acc[group].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    const sortedPermissionGroupKeys = Object.keys(groupedPermissions).sort((a, b) =>
        a.localeCompare(b, 'vi', { numeric: true })
    );

    const copyRoleGroupCode = async (code: string | undefined) => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            setMessage({ type: 'success', text: 'Đã sao chép mã nhóm quyền.' });
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = code;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setMessage({ type: 'success', text: 'Đã sao chép mã nhóm quyền.' });
            } catch {
                setMessage({ type: 'error', text: 'Không thể sao chép mã.' });
            }
        }
    };

    const togglePermissionGroup = (groupName: string) => {
        const groupPerms = groupedPermissions[groupName] || [];
        const allSelected = groupPerms.every(p => selectedPermissions.has(p.id));
        
        const newSet = new Set(selectedPermissions);
        groupPerms.forEach(p => {
            if (allSelected) newSet.delete(p.id);
            else newSet.add(p.id);
        });
        setSelectedPermissions(newSet);
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;

    const rbacLocked = isTechnicalAdminRole(selectedRoleGroup?.code);
    const formLocked = rbacLocked || !canManageRoleGroups;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
            {/* Sidebar List */}
            <div className="w-full md:w-1/4 border-r border-gray-100 bg-gray-50">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                        <Users size={18} />
                        Nhóm quyền
                    </h3>
                    <div className="flex gap-1">
                        <button 
                            type="button"
                            onClick={() => setIsCreateModalOpen(true)}
                            disabled={!canManageRoleGroups}
                            className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            title="Tạo nhóm quyền mới"
                        >
                            <Plus size={16} />
                        </button>
                        <button 
                            type="button"
                            onClick={() => setIsAssignModalOpen(true)}
                            disabled={!canManageRoleGroups}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            title="Phân quyền nhanh cho nhân viên"
                        >
                            <UserPlus size={16} />
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto h-64 md:h-[calc(100%-60px)]">
                    {roleGroups.map(group => (
                        <div
                            key={group.id}
                            className={clsx(
                                'flex items-start gap-1 border-l-4 transition-colors hover:bg-gray-100',
                                selectedRoleGroup?.id === group.id
                                    ? 'border-emerald-500 bg-white font-medium text-emerald-700'
                                    : 'border-transparent text-gray-600'
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => setSelectedRoleGroup(group)}
                                className="flex-1 text-left px-3 py-3 min-w-0"
                            >
                                {translate(group.name)}
                                <div className="text-xs text-gray-400 mt-1 font-mono break-all">{group.code}</div>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void copyRoleGroupCode(group.code);
                                }}
                                className="shrink-0 p-2 mt-1 mr-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Sao chép mã nhóm quyền"
                            >
                                <Copy size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white sticky top-0 z-10 gap-4 shadow-sm sm:shadow-none">
                    <div className="w-full sm:w-auto">
                        {isRenaming ? (
                            <div className="flex items-center gap-2 w-full">
                                <input 
                                    type="text" 
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="text-lg md:text-xl font-bold text-gray-800 border-b-2 border-primary focus:outline-none px-1 flex-1 min-w-0"
                                    autoFocus
                                />
                                <button 
                                    onClick={handleRename}
                                    disabled={saving}
                                    className="p-2 text-success hover:bg-success/10 rounded-lg shrink-0"
                                    title="Lưu tên mới"
                                >
                                    <Check size={20} />
                                </button>
                                <button 
                                    onClick={() => setIsRenaming(false)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                                    title="Hủy"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group">
                                <h2 className="text-lg md:text-xl font-bold text-gray-800 break-all line-clamp-1">{translate(selectedRoleGroup?.name)}</h2>
                                {!formLocked && (
                                    <button 
                                        onClick={() => {
                                            setRenameValue(selectedRoleGroup?.name || '');
                                            setIsRenaming(true);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-primary transition-all hover:bg-gray-100 rounded-lg shrink-0"
                                        title="Đổi tên nhóm quyền"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200 max-w-full">
                                <span className="break-all">{selectedRoleGroup?.code}</span>
                                <button
                                    type="button"
                                    onClick={() => void copyRoleGroupCode(selectedRoleGroup?.code)}
                                    className="p-0.5 rounded text-gray-500 hover:text-emerald-600 hover:bg-gray-200 shrink-0"
                                    title="Sao chép mã nhóm quyền"
                                >
                                    <Copy size={14} />
                                </button>
                            </span>
                            <span className="text-xs md:text-sm text-gray-500 flex items-center gap-1">
                                <Users size={12} />
                                {selectedRoleGroup?.employees?.length || 0} người dùng
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {!formLocked && (
                            <>
                                <button 
                                    type="button"
                                    onClick={handleDelete}
                                    className="flex-1 sm:flex-none justify-center px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium flex items-center gap-2 transition-colors text-sm"
                                    title="Xóa nhóm quyền này"
                                >
                                    <Trash2 size={16} />
                                    <span className="hidden sm:inline">Xóa</span>
                                </button>
                                <button 
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 sm:flex-none justify-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium flex items-center gap-2 shadow-sm transition-colors text-sm"
                                >
                                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save size={16} />}
                                    Lưu thay đổi
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {message && (
                    <div className={clsx(
                        "mx-4 mt-4 p-3 rounded-lg text-sm font-medium animate-fade-in",
                        message.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                    )}>
                        {message.text}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    {rbacLocked && (
                        <div className="mb-4 p-3 rounded-lg text-sm bg-slate-100 text-slate-700 border border-slate-200">
                            Nhóm <strong>Quản trị hệ thống</strong> luôn có đủ menu, quyền và phạm vi xem <strong>toàn công ty</strong>; không chỉnh sửa tại đây. Khi hệ thống bổ sung quyền hoặc phạm vi mới, nhóm này được gán tự động khi khởi động backend.
                        </div>
                    )}
                    {!rbacLocked && !canManageRoleGroups && (
                        <div className="mb-4 p-3 rounded-lg text-sm bg-amber-50 text-amber-900 border border-amber-200">
                            Bạn chỉ có quyền <strong>xem</strong> nhóm quyền; không thể lưu, tạo, xóa hoặc sửa phân quyền. Cần quyền <strong>Quản lý nhóm quyền</strong> hoặc <strong>Chỉnh sửa cấu hình hệ thống</strong> (hoặc tương đương) để chỉnh sửa.
                        </div>
                    )}
                    <div className={clsx('space-y-6', formLocked && 'opacity-60 pointer-events-none select-none')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 1. Menu truy cập */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                        <MenuIcon size={16} />
                                    </div>
                                    {translate('Menu Access')}
                                </h4>
                                <button
                                    type="button"
                                    onClick={toggleAllMenus}
                                    disabled={formLocked}
                                    className="text-xs px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors font-medium whitespace-nowrap disabled:opacity-50"
                                >
                                    {selectedMenus.size === allMenus.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                </button>
                            </div>
                            <div className="space-y-1">
                                {allMenus.map(menu => (
                                    <label key={menu.id} className="flex items-center gap-3 p-3 hover:bg-white hover:shadow-sm rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-all select-none bg-white sm:bg-transparent">
                                        <div className={clsx(
                                            "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                                            selectedMenus.has(menu.id) 
                                                ? "bg-blue-500 border-blue-500 text-white" 
                                                : "border-gray-300 bg-white"
                                        )}>
                                            {selectedMenus.has(menu.id) && <Check size={14} />}
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            className="hidden" 
                                            checked={selectedMenus.has(menu.id)}
                                            disabled={formLocked}
                                            onChange={() => toggleMenu(menu.id)}
                                        />
                                        <span className={clsx(selectedMenus.has(menu.id) ? "text-gray-900 font-medium" : "text-gray-600", "text-sm")}>
                                            {menu.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* 2. Phạm vi xem được */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <div className="mb-4 pb-2 border-b border-gray-200">
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                                    <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
                                        <Eye size={16} />
                                    </div>
                                    Phạm vi xem được
                                </h4>
                                <p className="text-xs text-gray-500 mt-1">Nhân sự & Khách hàng</p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Nhân sự (HR)</label>
                                    <select
                                        value={viewScopes.hr}
                                        onChange={(e) => handleSaveViewScope('HR', e.target.value)}
                                        disabled={formLocked || savingViewScope}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                                    >
                                        <option value="SELF_RECURSIVE">Bản thân / cấp dưới</option>
                                        <option value="DEPARTMENT">Cùng phòng ban</option>
                                        <option value="DIVISION">Cùng khối</option>
                                        <option value="COMPANY">Toàn công ty</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Khách hàng</label>
                                    <select
                                        value={viewScopes.customer}
                                        onChange={(e) => handleSaveViewScope('CUSTOMER', e.target.value)}
                                        disabled={formLocked || savingViewScope}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                                    >
                                        <option value="SELF_RECURSIVE">Bản thân / cấp dưới</option>
                                        <option value="DEPARTMENT">Cùng phòng ban</option>
                                        <option value="DIVISION">Cùng khối</option>
                                        <option value="COMPANY">Toàn công ty</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* 4. Chức năng hệ thống */}
                    <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                                <div>
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                                    <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                                        <Shield size={16} />
                                    </div>
                                    {translate('System Functions')}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1.5 pl-1">
                                    Di chuột vào <HelpCircle className="inline w-3.5 h-3.5 align-text-bottom text-gray-400" aria-hidden /> hoặc dòng quyền để xem hướng dẫn (đồng bộ từ catalog backend). Mã quyền dùng trong API và JWT.
                                </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleAllPermissions}
                                    disabled={formLocked}
                                    className="text-xs px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition-colors font-medium whitespace-nowrap disabled:opacity-50"
                                >
                                    {selectedPermissions.size === allPermissions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                </button>
                            </div>
                            <div className="space-y-4 h-[calc(100%-60px)] overflow-y-auto pr-2">
                                {sortedPermissionGroupKeys.map((group) => {
                                    const perms = [...(groupedPermissions[group] || [])].sort((a, b) =>
                                        a.code.localeCompare(b.code)
                                    );
                                    return (
                                    <div key={group} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                        <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
                                            <h5 className="text-sm font-bold text-gray-700">{group}</h5>
                                            <button 
                                                type="button"
                                                onClick={() => togglePermissionGroup(group)} 
                                                disabled={formLocked}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                            >
                                                {perms.every(p => selectedPermissions.has(p.id)) ? 'Bỏ chọn nhóm' : 'Chọn nhóm'}
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            {perms.map(perm => {
                                                const tip = permissionTooltip(perm.code, perm.name, perm.description);
                                                return (
                                                <label key={perm.id} title={tip} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors select-none">
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded border flex items-center justify-center transition-colors mt-0.5 shrink-0",
                                                        selectedPermissions.has(perm.id) 
                                                            ? "bg-purple-500 border-purple-500 text-white" 
                                                            : "border-gray-300 bg-white"
                                                    )}>
                                                        {selectedPermissions.has(perm.id) && <Check size={14} />}
                                                    </div>
                                                    <input 
                                                        type="checkbox" 
                                                        className="hidden" 
                                                        checked={selectedPermissions.has(perm.id)}
                                                        disabled={formLocked}
                                                        onChange={() => togglePermission(perm.id)}
                                                    />
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="flex items-start gap-1.5 min-w-0">
                                                            <span className={clsx(selectedPermissions.has(perm.id) ? "text-gray-900 font-medium" : "text-gray-600", "text-sm flex-1")}>
                                                                {translatePermissionLabel(perm.code, perm.name)}
                                                            </span>
                                                            <HelpCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" aria-hidden title={tip} />
                                                        </span>
                                                        <span className="text-xs text-gray-400 font-mono">{perm.code}</span>
                                                    </div>
                                                </label>
                                            );
                                            })}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <RoleGroupAssignmentModal 
                isOpen={isAssignModalOpen}
                onClose={() => setIsAssignModalOpen(false)}
                roleGroups={roleGroups}
                onSuccess={() => {
                    // Optional: Refresh data if needed, but assignment doesn't change Role definitions
                }}
            />

            <RoleGroupCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={(newRole) => {
                    setRoleGroups([...roleGroups, newRole]);
                    setSelectedRoleGroup(newRole);
                    setMessage({ type: 'success', text: 'Tạo nhóm quyền thành công!' });
                }}
            />
        </div>
    );
};

export default RoleGroupManager;
