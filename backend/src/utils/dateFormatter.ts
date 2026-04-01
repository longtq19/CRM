/**
 * Format a date to dd/MM/yyyy in Vietnam time (ICT).
 */
export function formatICTDate(date: Date | string | number | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(d);
}

/**
 * Format a date to dd/MM/yyyy HH:mm in Vietnam time (ICT).
 */
export function formatICTDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  const parts = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh'
  }).formatToParts(d);

  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/**
 * Format a date to HH:mm in Vietnam time (ICT).
 */
export function formatICTTime(date: Date | string | number | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(d);
}

/**
 * Format a date to dd/MM/yyyy HH:mm:ss in Vietnam time (ICT).
 */
export function formatICTDateTimeFull(date: Date | string | number | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  const parts = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh'
  }).formatToParts(d);

  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}
