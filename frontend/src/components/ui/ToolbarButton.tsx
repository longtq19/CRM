import clsx from 'clsx';
import type { ButtonHTMLAttributes, LabelHTMLAttributes } from 'react';

export type ToolbarButtonVariant = 'primary' | 'secondary';

export type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ToolbarButtonVariant;
};

/**
 * Nút thanh công cụ / footer form — đồng bộ với `.btn-toolbar-*` trong `index.css`.
 * Mặc định `type="button"` để tránh submit nhầm trong `<form>`.
 */
export function ToolbarButton({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ToolbarButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        variant === 'primary' ? 'btn-toolbar-primary' : 'btn-toolbar-secondary',
        className
      )}
      {...props}
    />
  );
}

export type ToolbarFileLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  variant?: ToolbarButtonVariant;
};

/** `<label>` styled như nút secondary/primary, dùng cho input file ẩn (Nhập Excel, …). */
export function ToolbarFileLabel({
  variant = 'secondary',
  className,
  ...props
}: ToolbarFileLabelProps) {
  return (
    <label
      className={clsx(
        variant === 'primary' ? 'btn-toolbar-primary' : 'btn-toolbar-secondary',
        className
      )}
      {...props}
    />
  );
}
