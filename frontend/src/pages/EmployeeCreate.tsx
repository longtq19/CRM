import React from 'react';
import { EmployeeForm } from '../components/EmployeeForm';

const EmployeeCreate = () => {
  return (
    <div className="space-y-6">
      <EmployeeForm mode="add" />
    </div>
  );
};

export default EmployeeCreate;
