import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, Building2, Layers, Tag } from 'lucide-react';
import { useAuthStore } from '../context/useAuthStore';
import SubsidiaryManager from '../components/SubsidiaryManager';
import HrDepartmentUnitManager from '../components/HrDepartmentUnitManager';
import EmployeeTypeManager from '../components/EmployeeTypeManager';

/**
 * Trang cấu hình danh mục trong module Nhân sự: công ty con, bộ phận, loại nhân viên.
 * Quyền vào trang (route): `MANAGE_HR`, `FULL_ACCESS`, `VIEW_HR`, `VIEW_EMPLOYEE_TYPE_CATALOG`, `MANAGE_EMPLOYEE_TYPE_CATALOG`.
 */
const HrCatalogSettings = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const canEditSubsidiaryUnit = hasPermission('MANAGE_HR') || hasPermission('FULL_ACCESS');
  /** Đọc Công ty con / Bộ phận (khớp API `HR_MASTER_CATALOG_READ_PERMISSIONS`). */
  const canViewSubsidiaryUnitCatalog =
    hasPermission('MANAGE_HR') || hasPermission('VIEW_HR') || hasPermission('FULL_ACCESS');
  const canEditEmployeeTypeCatalog =
    hasPermission('MANAGE_EMPLOYEE_TYPE_CATALOG') ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS');
  const canViewEmployeeTypeCatalog =
    hasPermission('VIEW_EMPLOYEE_TYPE_CATALOG') ||
    hasPermission('MANAGE_EMPLOYEE_TYPE_CATALOG') ||
    hasPermission('MANAGE_HR') ||
    hasPermission('FULL_ACCESS');

  const [tab, setTab] = useState<'subsidiary' | 'unit' | 'employeeType'>(() =>
    !canViewSubsidiaryUnitCatalog && canViewEmployeeTypeCatalog ? 'employeeType' : 'subsidiary'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <button
          type="button"
          onClick={() => navigate('/hr')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium shrink-0"
        >
          <ChevronLeft size={20} />
          Về danh sách nhân sự
        </button>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-900">Danh mục Nhân sự</h2>
          <p className="text-gray-500 text-sm mt-1">
            Quản lý công ty con, bộ phận và loại nhân viên dùng trong lọc, hồ sơ và nhập/xuất Excel.
          </p>
        </div>
      </div>

      <div className="bg-gray-100 p-1 rounded-lg flex gap-1 w-full sm:w-auto flex-wrap">
        {canViewSubsidiaryUnitCatalog && (
          <>
            <button
              type="button"
              onClick={() => setTab('subsidiary')}
              className={clsx(
                'flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center gap-2',
                tab === 'subsidiary' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Building2 size={18} />
              Công ty con
            </button>
            <button
              type="button"
              onClick={() => setTab('unit')}
              className={clsx(
                'flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center gap-2',
                tab === 'unit' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Layers size={18} />
              Bộ phận
            </button>
          </>
        )}
        {canViewEmployeeTypeCatalog && (
          <button
            type="button"
            onClick={() => setTab('employeeType')}
            className={clsx(
              'flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center gap-2',
              tab === 'employeeType' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <Tag size={18} />
            Loại nhân viên
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
        {tab === 'subsidiary' && canViewSubsidiaryUnitCatalog && (
          <SubsidiaryManager canEdit={canEditSubsidiaryUnit} />
        )}
        {tab === 'unit' && canViewSubsidiaryUnitCatalog && (
          <HrDepartmentUnitManager canEdit={canEditSubsidiaryUnit} />
        )}
        {tab === 'employeeType' && canViewEmployeeTypeCatalog && (
          <EmployeeTypeManager canEdit={canEditEmployeeTypeCatalog} />
        )}
      </div>
    </div>
  );
};

export default HrCatalogSettings;
