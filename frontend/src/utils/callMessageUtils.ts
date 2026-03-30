/**
 * Utility helpers for rendering CALL-type chat messages.
 */

export interface CallMessageData {
  duration: number;
  result: 'completed' | 'missed' | 'rejected';
  callType: 'video' | 'audio';
}

/** Parse CALL message JSON content safely */
export const parseCallContent = (content: string | null | undefined): CallMessageData => {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return { duration: 0, result: 'missed', callType: 'audio' };
  }
};

/** Format call duration as MM:SS */
export const formatCallDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

/** Short text preview for call messages (used in conversation lists) */
export const getCallPreviewText = (content: string | null | undefined): string => {
  const data = parseCallContent(content);
  const isVideo = data.callType === 'video';
  const icon = isVideo ? '📹' : '📞';
  const type = isVideo ? 'video' : 'thoại';

  if (data.result === 'completed') {
    const dur = formatCallDuration(data.duration);
    return `${icon} Cuộc gọi ${type}${dur ? ` • ${dur}` : ''}`;
  }
  if (data.result === 'rejected') return `${icon} Cuộc gọi ${type} bị từ chối`;
  return `${icon} Cuộc gọi ${type} nhỡ`;
};
