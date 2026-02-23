import type { NewsItem, NewsCategory, NewsSentiment } from './news-fetch';

const CATEGORY_EMOJI: Record<NewsCategory, string> = {
  'FDA Approval':         '💊',
  'Clinical Trial':       '🧪',
  'Merger & Acquisition': '🤝',
  'Partnership':          '🤝',
  'Government Contract':  '🏛️',
  'Major Investment':     '💰',
  'Geopolitical':         '🌍',
  'Earnings':             '📊',
  'Analyst Rating':       '📈',
  'General':              '📰',
};

const SENTIMENT_EMOJI: Record<NewsSentiment, string> = {
  bullish: '🟢 Bullish',
  bearish: '🔴 Bearish',
  neutral: '⚪ Neutral',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function buildAlertMessage(item: NewsItem, symbol: string): string {
  const catEmoji  = CATEGORY_EMOJI[item.category];
  const sentEmoji = SENTIMENT_EMOJI[item.sentiment];
  const age       = timeAgo(item.publishedAt);

  return [
    `⚡ <b>CATALYST ALERT</b>`,
    ``,
    `🏷 <b>${escapeHtml(symbol)}</b> — ${catEmoji} <b>${escapeHtml(item.category)}</b>`,
    `📈 Sentiment: ${sentEmoji}`,
    ``,
    `<b>${escapeHtml(item.title)}</b>`,
    ``,
    `📰 ${escapeHtml(item.publisher)} · ${age}`,
    `<a href="${escapeHtml(item.url)}">Read Article →</a>`,
  ].join('\n');
}

export async function sendTelegramAlert(item: NewsItem, symbol: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert');
    return;
  }

  const body = {
    chat_id:                  chatId,
    text:                     buildAlertMessage(item, symbol),
    parse_mode:               'HTML',
    disable_web_page_preview: false,
  };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${err}`);
  }
}
