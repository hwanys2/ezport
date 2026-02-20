/**
 * 텔레그램 봇 메시지 전송 헬퍼
 * TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 환경변수가 설정된 경우에만 동작합니다.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function isConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/**
 * 텔레그램으로 메시지 전송
 * @param {string} text - 전송할 메시지
 * @param {object} [options] - { disable_notification, parse_mode: 'HTML' | 'Markdown' } 등
 * @returns {Promise<boolean>} 전송 성공 여부 (미설정 시 false)
 */
async function sendMessage(text, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Telegram] Skipped (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set):', text?.slice(0, 50));
    }
    return false;
  }

  try {
    const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: String(text),
      disable_notification: options.disable_notification ?? false,
      ...(options.parse_mode && { parse_mode: options.parse_mode }),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.warn('[Telegram] sendMessage failed:', data.description || res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Telegram] sendMessage error:', err.message);
    return false;
  }
}

/**
 * 에러/알림용 메시지 전송 (HTML 포맷 가능)
 * @param {string} title - 제목 (예: "배포 알림", "에러 발생")
 * @param {string} body - 본문
 */
async function notify(title, body) {
  const text = `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;
  return sendMessage(text, { parse_mode: 'HTML' });
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  isConfigured,
  sendMessage,
  notify,
};
