import { format, isValid } from 'date-fns';
import { vi } from 'date-fns/locale';

function toDate(date: string | Date | null | undefined): Date | null {
  if (date === null || date === undefined) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return isValid(d) ? d : null;
}

/** Hiển thị ngày: dd/MM/yyyy (chuẩn giao diện VN) */
export const formatDate = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  return format(d, 'dd/MM/yyyy', { locale: vi });
};

/** Ngày + giờ: dd/MM/yyyy HH:mm */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  return format(d, 'dd/MM/yyyy HH:mm', { locale: vi });
};

/** Nhật ký / chi tiết: dd/MM/yyyy HH:mm:ss */
export const formatDateTimeSeconds = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  return format(d, 'dd/MM/yyyy HH:mm:ss', { locale: vi });
};

/** Báo cáo theo tháng: «tháng … năm …» */
export const formatMonthYear = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  return format(d, 'MMMM yyyy', { locale: vi });
};

/** Lịch hẹn: T2, dd/MM/yyyy */
export const formatDateWeekday = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  return format(d, 'EEE, dd/MM/yyyy', { locale: vi });
};

export const formatCurrency = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '0 ₫';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};

export const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
};

export const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
};
