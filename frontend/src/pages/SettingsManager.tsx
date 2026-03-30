import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../context/useAuthStore';
import RoleGroupManager from '../components/RoleGroupManager';
import DepartmentManager from '../components/DepartmentManager';
import SubsidiaryManager from '../components/SubsidiaryManager';
import StaffAccountManager from '../components/StaffAccountManager';
import OperationRulesSettings from '../components/settings/OperationRulesSettings';
import CustomerRankSettings from '../components/settings/CustomerRankSettings';
import SalesTargetSettings from '../components/settings/SalesTargetSettings';
import CustomerStatusSettings from '../components/settings/CustomerStatusSettings';
import { translate } from '../utils/dictionary';
import { Shield, Building2, Building, Settings, Award, Target, UserCog, Tags } from 'lucide-react';
import clsx from 'clsx';
import { isTechnicalAdminRole } from '../constants/rbac';

type SettingsTab = 'rbac' | 'org' | 'subsidiary' | 'staff-accounts' | 'operation' | 'customer-rank' | 'customer-status' | 'sales-target';

const SettingsManager = () => {
  const location = useLocation();
  const { user, hasPermission } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    (location.state as any)?.openTab === 'operation' ? 'operation' : 'rbac'
  );

  useEffect(() => {
    const state = (location.state || {}) as { openTab?: string };
    if (state?.openTab === 'operation') setActiveTab('operation');
  }, [location.state]);

  // Get permissions for display (handle both array of objects and array of strings)
  const permissions = (user?.permissions || []).map((p: any) => typeof p === 'string' ? p : p.code);
  
  const canEdit = hasPermission('EDIT_SETTINGS') || hasPermission('FULL_ACCESS');
  const canEditDataFlow =
    hasPermission('CONFIG_DATA_FLOW') ||
    hasPermission('CONFIG_ORG_STRUCTURE') ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS');
  const canView = hasPermission('VIEW_SETTINGS') || hasPermission('FULL_ACCESS');
  const canManageOperationRules =
    hasPermission('CONFIG_OPERATIONS') || hasPermission('EDIT_SETTINGS') || hasPermission('FULL_ACCESS');
  const canStaffAccounts =
    hasPermission('STAFF_LOGOUT') ||
    hasPermission('STAFF_LOCK') ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS') ||
    isTechnicalAdminRole(user?.roleGroup?.code);

  if (!canView && !canManageOperationRules) {
      return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-red-600">{translate('Access Denied')}</h2>
                <p className="text-gray-500">{translate('You do not have permission to access this module.')}</p>
            </div>
        </div>
      );
  }

  const tabs: { id: SettingsTab; label: string; icon: any; hidden?: boolean }[] = [
    {
      id: 'rbac' as SettingsTab,
      label: 'Quản lý phân quyền',
      icon: Shield
    },
    {
      id: 'org' as SettingsTab,
      label: 'Organization Settings',
      icon: Building2
    },
    {
      id: 'subsidiary' as SettingsTab,
      label: 'Subsidiary Settings',
      icon: Building
    },
    {
      id: 'operation' as SettingsTab,
      label: 'Quy tắc vận hành',
      icon: Settings
    },
    {
      id: 'customer-rank' as SettingsTab,
      label: 'Phân hạng khách hàng',
      icon: Award
    },
    {
      id: 'customer-status' as SettingsTab,
      label: 'Trạng thái khách hàng',
      icon: Tags
    },
    {
      id: 'sales-target' as SettingsTab,
      label: 'Mục tiêu kinh doanh',
      icon: Target,
      hidden: !canEdit
    },
    {
      id: 'staff-accounts' as SettingsTab,
      label: 'Tài khoản nhân sự',
      icon: UserCog,
      hidden: !canStaffAccounts
    }
  ].filter(tab => !tab.hidden);

  if (!tabs.find(t => t.id === activeTab)) {
    setActiveTab(tabs[0].id);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{translate('System Settings')}</h2>
          <p className="text-gray-500 text-sm">{translate('Manage configuration and system settings')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold mb-4 text-gray-800">{translate('Current Permissions')}</h3>
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="mb-2"><strong className="text-gray-700">{translate('Role Group')}:</strong> <span className="text-secondary font-medium">{translate(user?.role)}</span></p>
            
            <p className="mb-2"><strong className="text-gray-700">{translate('Menu Access')}:</strong></p>
            {user?.menus && user.menus.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                    {user.menus.map(menu => (
                        <span key={menu.id} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                            {translate(menu.label)}
                        </span>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 italic mb-4">{translate('No menu access')}</p>
            )}

            <p className="mb-2"><strong className="text-gray-700">{translate('Permissions')}:</strong></p>
            {permissions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {permissions.map(p => (
                        <span key={p} className="px-2 py-1 bg-secondary/10 text-secondary text-xs rounded-full font-medium">
                            {translate(p)}
                        </span>
                    ))}
                </div>
            ) : (
                <span className="text-gray-500 italic">{translate('No special permissions')}</span>
            )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-8 min-w-max" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                  'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm gap-2 transition-colors'
                )}
              >
                <Icon size={18} className={clsx(
                  activeTab === tab.id ? 'text-primary' : 'text-gray-400 group-hover:text-gray-500'
                )} />
                {translate(tab.label)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'rbac' && (
            canEdit ? <RoleGroupManager /> : (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-yellow-800">
                    {translate('You only have view permission, please contact Admin to edit permissions.')}
                </div>
            )
        )}
        
        {activeTab === 'org' && (
            <DepartmentManager canEdit={canEdit} canEditDataFlow={canEditDataFlow} />
        )}

        {activeTab === 'subsidiary' && (
            <SubsidiaryManager canEdit={canEdit} />
        )}

        {activeTab === 'operation' && (
            <OperationRulesSettings
              operationsParamsOnly
              initialCategory={(location.state as any)?.openCategory}
              readOnly={!canManageOperationRules}
            />
        )}

        {activeTab === 'customer-rank' && (
            canEdit ? <CustomerRankSettings /> : (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-yellow-800">
                    {translate('You only have view permission, please contact Admin to edit permissions.')}
                </div>
            )
        )}

        {activeTab === 'customer-status' && (
            canEdit ? <CustomerStatusSettings /> : (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-yellow-800">
                    {translate('You only have view permission, please contact Admin to edit permissions.')}
                </div>
            )
        )}

        {activeTab === 'staff-accounts' && (
          <StaffAccountManager />
        )}

        {activeTab === 'sales-target' && (
          canEdit ? <SalesTargetSettings canEdit={canEdit} /> : (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-yellow-800">
              {translate('You only have view permission, please contact Admin to edit permissions.')}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default SettingsManager;
