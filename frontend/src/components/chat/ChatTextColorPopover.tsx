import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

export interface ColorPreset {
  name: string;
  value: string;
}

function normalizeHex(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  return null;
}

interface Props {
  /** Mở popover — reset draft khi vừa mở */
  open: boolean;
  presets: ColorPreset[];
  /** Áp dụng màu chữ (execCommand foreColor). `close` = đóng popover sau khi chọn (preset). */
  onApply: (hex: string, options?: { close?: boolean }) => void;
}

/**
 * Popover chọn màu chữ chat: bảng màu đầy đủ (react-colorful) + ô HEX + swatch nhanh.
 * onMouseDown preventDefault ở container để giữ selection trong contenteditable.
 */
export const ChatTextColorPopover: React.FC<Props> = ({ open, presets, onApply }) => {
  /** Luôn hợp lệ cho HexColorPicker */
  const [hex, setHex] = useState('#000000');
  /** Cho phép gõ dở trong ô HEX */
  const [hexInput, setHexInput] = useState('#000000');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setHex('#000000');
      setHexInput('#000000');
    }
  }, [open]);

  const flushDebounced = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  const scheduleApply = useCallback(
    (nextHex: string) => {
      flushDebounced();
      debounceTimer.current = setTimeout(() => {
        onApply(nextHex, { close: false });
      }, 90);
    },
    [flushDebounced, onApply]
  );

  useEffect(() => {
    return () => flushDebounced();
  }, [flushDebounced]);

  const handlePickerChange = (next: string) => {
    const n = normalizeHex(next);
    if (!n) return;
    setHex(n);
    setHexInput(n);
    scheduleApply(n);
  };

  const handleHexInputChange = (raw: string) => {
    setHexInput(raw);
    const n = normalizeHex(raw);
    if (n) {
      setHex(n);
      scheduleApply(n);
    }
  };

  const handleHexBlur = () => {
    const n = normalizeHex(hexInput);
    if (n) {
      setHex(n);
      setHexInput(n);
      onApply(n, { close: false });
    } else {
      setHexInput(hex);
    }
  };

  if (!open) return null;

  return (
    <div
      className="chat-text-color-popover w-[min(100vw-2rem,280px)] rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <HexColorPicker color={hex} onChange={handlePickerChange} className="chat-hex-color-picker" />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            title={p.name}
            onClick={() => {
              setHex(p.value);
              setHexInput(p.value);
              flushDebounced();
              onApply(p.value, { close: true });
            }}
            className="h-7 w-7 shrink-0 rounded-full border-2 border-gray-200 transition hover:scale-105 hover:border-gray-400"
            style={{ backgroundColor: p.value }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Hex</span>
        <input
          type="text"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 font-mono text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          value={hexInput}
          onChange={(e) => handleHexInputChange(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="#000000"
          maxLength={9}
        />
      </div>
    </div>
  );
};
