import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import DepartmentManager from '../components/DepartmentManager';
import OperationRulesSettings from '../components/settings/OperationRulesSettings';
import CustomerRankSettings from '../components/settings/CustomerRankSettings';
import SalesTargetSettings from '../components/settings/SalesTargetSettings';
import { useAuthStore } from '../context/useAuthStore';
import { OPS_LEAF_STAFF_REMOVE_PERMISSIONS } from '../constants/routePermissionPolicy';
import {
  Building2,
  Settings,
  Award,
  Target,
} from 'lucide-react';
import clsx from 'clsx';

type TabId = 'org' | 'params' | 'customer-ranks' | 'sales-targets';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'org', label: 'Cấu trúc tổ chức', icon: Building2 },
  { id: 'params', label: 'Tham số vận hành', icon: Settings },
  { id: 'customer-ranks', label: 'Phân hạng KH', icon: Award },
  { id: 'sales-targets', label: 'Mục tiêu KD', icon: Target },
];

const Operations = () => {
  const location = useLocation();
  const { hasPermission } = useAuthStore();
  const canRemoveStaffFromOpsUnit = OPS_LEAF_STAFF_REMOVE_PERMISSIONS.some((p) => hasPermission(p));
  const canEdit = hasPermission('EDIT_SETTINGS') || hasPermission('MANAGE_HR') || hasPermission('FULL_ACCESS');
  const canEditOrgStructure =
    canEdit || hasPermission('CONFIG_ORG_STRUCTURE');
  const canEditDataFlow =
    hasPermission('CONFIG_DATA_FLOW') ||
    hasPermission('CONFIG_ORG_STRUCTURE') ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS');
  const canManageOperationRules =
    hasPermission('CONFIG_OPERATIONS') || hasPermission('EDIT_SETTINGS') || hasPermission('FULL_ACCESS');
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    (location.state as any)?.openTab === 'operation' ? 'params' : 'org'
  );

  useEffect(() => {
    const state = (location.state || {}) as { openTab?: string };
    if (state?.openTab === 'operation') setActiveTab('params');
  }, [location.state]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Vận hành</h2>
        <p className="text-gray-500 text-sm">Quản lý cấu hình hệ thống và tổ chức</p>
      </div>

      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-1 min-w-max" aria-label="Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'inline-flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {activeTab === 'org' && (
          <DepartmentManager
            canEdit={canEditOrgStructure}
            canEditDataFlow={canEditDataFlow}
            canRemoveStaffFromOpsUnit={canRemoveStaffFromOpsUnit}
          />
        )}
        {activeTab === 'params' && (
          <OperationRulesSettings
            operationsParamsOnly
            initialCategory={(location.state as any)?.openCategory}
            readOnly={!canManageOperationRules}
          />
        )}
        {activeTab === 'customer-ranks' && <CustomerRankSettings />}
        {activeTab === 'sales-targets' && <SalesTargetSettings canEdit={canEdit} />}
      </div>
    </div>
  );
};

export default Operations;
