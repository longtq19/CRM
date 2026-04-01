import { isValid, isToday, isYesterday } from 'date-fns';


function toDate(date: string | Date | null | undefined): Date | null {
  if (date === null || date === undefined) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return isValid(d) ? d : null;
}

const ICT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Force Vietnam Date (dd/mm/yyyy) */
export const formatDate = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: ICT_TIMEZONE
  }).format(d);
};

/** Force Vietnam DateTime (dd/mm/yyyy HH:mm) - 24h */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  
  const parts = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ICT_TIMEZONE
  }).formatToParts(d);

  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;

  return `${day}/${month}/${year} ${hour}:${minute}`;
};

/** Force Vietnam DateTime with seconds (dd/mm/yyyy HH:mm:ss) - 24h */
export const formatDateTimeSeconds = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  
  const parts = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: ICT_TIMEZONE
  }).formatToParts(d);

  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
};

/** Force Vietnam MonthYear */
export const formatMonthYear = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  // formatToParts to ensure correct Vietnam labels
  return new Intl.DateTimeFormat('vi-VN', {
    month: 'long',
    year: 'numeric',
    timeZone: ICT_TIMEZONE
  }).format(d);
};

/** Force Vietnam Weekday (T2, dd/mm/yyyy) */
export const formatDateWeekday = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  
  const parts = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: ICT_TIMEZONE
  }).formatToParts(d);

  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;

  return `${weekday}, ${day}/${month}/${year}`;
};

/** Force Vietnam Time (HH:mm) - 24h */
export const formatTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';
  
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ICT_TIMEZONE
  }).format(d);
};

/** Smart Date for Chat (HH:mm if today/yesterday, otherwise dd/mm/yyyy) */
export const formatSmartDate = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '-';

  if (isToday(d)) {
    return formatTime(d);
  }
  if (isYesterday(d)) {
    return `Hôm qua ${formatTime(d)}`;
  }
  return formatDate(d);
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
