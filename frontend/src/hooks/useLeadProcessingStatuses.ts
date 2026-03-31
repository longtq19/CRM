import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export type LeadProcessingStatusOption = { code: string; label: string };

/**
 * Danh mục trạng thái xử lý (đồng bộ Vận hành / `lead_processing_statuses`).
 */
export function useLeadProcessingStatuses() {
  const [options, setOptions] = useState<LeadProcessingStatusOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/processing-statuses/active')
      .then((res: unknown) => {
        const list = Array.isArray(res) ? res : [];
        const mapped = list
          .filter((row): row is { code: string; name: string } =>
            Boolean(row && typeof row === 'object' && 'code' in row && 'name' in row),
          )
          .map((s) => ({ code: s.code, label: s.name }));
        if (!cancelled) setOptions(mapped);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = useCallback(
    (code: string | null | undefined) => options.find((o) => o.code === code)?.label || code || '—',
    [options],
  );

  return { options, loading, statusLabel };
}
