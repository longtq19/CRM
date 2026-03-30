import { ROOT_COUNTABLE_CROPS } from '../constants/cropConfigs';

export type MainCropsRootCounts = Record<string, number>;

export const normalizeMainCropsRootCounts = (v: any): MainCropsRootCounts => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};

  const out: MainCropsRootCounts = {};
  for (const [k, raw] of Object.entries(v as Record<string, any>)) {
    if (typeof k !== 'string' || !k.trim()) continue;
    const n =
      typeof raw === 'number'
        ? raw
        : raw === null || raw === undefined || raw === ''
          ? NaN
          : Number(String(raw).trim());
    if (!Number.isFinite(n)) continue;
    out[k] = Math.floor(n);
  }
  return out;
};

export const validateMainCropsAndRootCounts = (opts: {
  mainCrops: string[];
  mainCropsRootCounts: MainCropsRootCounts;
}): { isValid: boolean; errors: string[] } => {
  const { mainCrops, mainCropsRootCounts } = opts;
  const errors: string[] = [];

  if (!Array.isArray(mainCrops) || mainCrops.length === 0) {
    errors.push('Cây trồng chính là bắt buộc');
    return { isValid: false, errors };
  }

  const selectedRootCrops = mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));
  for (const crop of selectedRootCrops) {
    const val = mainCropsRootCounts?.[crop];
    if (!Number.isFinite(val) || (val as number) <= 0) {
      errors.push(`Số gốc cho "${crop}" là bắt buộc và phải > 0`);
    }
  }

  return { isValid: errors.length === 0, errors };
};

