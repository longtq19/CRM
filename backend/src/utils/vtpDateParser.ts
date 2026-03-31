/**
 * Parse Viettel Post date strings robustly.
 * VTP often sends dates in "dd/MM/yyyy HH:mm:ss" format.
 * Browser/Node new Date() can misinterpret this as "MM/dd/yyyy" (US format)
 * or fail entirely.
 */
export function parseVtpDate(raw: any): Date {
  if (!raw) return new Date();
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? new Date() : raw;
  }
  const s = String(raw).trim();
  if (!s) return new Date();

  // 1. Try ISO 8601 parsing first (2024-01-15T10:30:00)
  if (s.includes('T') || s.includes('-')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Parse dd/MM/yyyy HH:mm:ss
  // Regex matches: 1-2 digits/1-2 digits/4 digits then optional space and time
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (match) {
    const dStr = match[1];
    const mStr = match[2];
    const yStr = match[3];
    const hStr = match[4] || '0';
    const minStr = match[5] || '0';
    const secStr = match[6] || '0';

    // VTP returns ICT (GMT+7). We parse it as UTC first, then adjust by -7 hours
    // so that the resulting Date object correctly represents the point in time in GMT+7.
    const date = new Date(Date.UTC(
      parseInt(yStr, 10),
      parseInt(mStr, 10) - 1,
      parseInt(dStr, 10),
      parseInt(hStr, 10) - 7, // GMT+7 offset
      parseInt(minStr, 10),
      parseInt(secStr, 10)
    ));

    if (!isNaN(date.getTime())) return date;
  }

  // 3. Fallback to native parsing
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}
