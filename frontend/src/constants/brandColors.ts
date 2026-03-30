/**
 * Bảng màu thương hiệu / giao diện — dùng cho:
 * - `tailwind.config.ts` (class `bg-primary`, `text-secondary`, …)
 * - Chart, inline style, export PDF/Excel khi cần mã hex
 *
 * Không hard-code lại hex ở nơi khác; import từ đây hoặc dùng utility Tailwind.
 */
export const brandPalette = {
  primary: '#089b2e',
  secondary: '#070330',
  /** Icon khối (DIVISION / Layers): tím trầm, cùng tông đậm với secondary, bổ trợ primary */
  division: '#5b21b6',
  accent: '#fff8d7',
  support: '#B87A2A',
  success: '#079b2d',
  warning: '#E8B620',
  error: '#EF4444',
} as const;

export type BrandPaletteKey = keyof typeof brandPalette;

/** Truy cập an toàn theo tên (ví dụ theme động). */
export function getBrandColor(key: BrandPaletteKey): string {
  return brandPalette[key];
}
