const STORAGE_KEY = 'hcrm_chat_quick_messages_v1';

export const DEFAULT_CHAT_QUICK_MESSAGES: string[] = [
  'Đã nhận, cảm ơn bạn!',
  'Đang xử lý, nhờ bạn chờ thêm.',
  'OK, để tôi kiểm tra lại.',
  'Bạn gửi giúp mình thêm chi tiết nhé.',
];

export function loadChatQuickMessages(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_CHAT_QUICK_MESSAGES];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      const filtered = parsed.map((s) => s.trim()).filter(Boolean);
      return filtered.length > 0 ? filtered : [...DEFAULT_CHAT_QUICK_MESSAGES];
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_CHAT_QUICK_MESSAGES];
}

export function saveChatQuickMessages(messages: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* ignore */
  }
}
