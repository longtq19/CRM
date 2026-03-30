import DOMPurify from 'dompurify';

const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;

const ALLOWED_TAGS = [
  'b',
  'i',
  'u',
  's',
  'font',
  'span',
  'br',
  'p',
  'div',
  'strong',
  'em',
  'a',
] as const;

const ALLOWED_ATTR = ['color', 'style', 'class', 'href', 'target', 'rel'] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function linkifyPlainText(text: string): string {
  const re = /https?:\/\/[^\s<]+/gi;
  const parts: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    parts.push(escapeHtml(text.slice(lastIndex, m.index)));
    const url = m[0];
    const safeHref = escapeHtmlAttr(url);
    const safeDisplay = escapeHtml(url);
    parts.push(
      `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeDisplay}</a>`
    );
    lastIndex = m.index + url.length;
  }
  parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join('');
}

function addBlankTargetToAnchors(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild as HTMLDivElement | null;
  if (!container) return html;
  container.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return container.innerHTML;
}

/** Sanitize HTML tin nhắn chat; liên kết https mở tab mới. */
export function sanitizeChatMessageHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
  });
  return addBlankTargetToAnchors(sanitized);
}

/**
 * Chuẩn bị HTML an toàn để hiển thị bubble tin nhắn:
 * - Nội dung có thẻ HTML (rich text): sanitize + ép `target="_blank"` cho `http(s)`.
 * - Văn bản thuần: escape + tự bọc URL bằng `<a target="_blank">`.
 */
export function renderChatMessageHtml(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (HTML_TAG_PATTERN.test(trimmed)) {
    return sanitizeChatMessageHtml(content);
  }
  return sanitizeChatMessageHtml(linkifyPlainText(content));
}
