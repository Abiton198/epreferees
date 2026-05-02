import React from 'react';
import type { AppointmentStatus } from '@/types';

const styles: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
};

const StatusBadge: React.FC<{ status: AppointmentStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${styles[status]}`}>
    {status}
  </span>
);

export default StatusBadge;
