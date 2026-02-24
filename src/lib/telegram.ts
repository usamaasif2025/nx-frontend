import type { NewsItem, NewsCategory, NewsSentiment } from './news-fetch';

// ── Types ──────────────────────────────────────────────────────────────────────

export type { NewsItem };

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

// Telegram HTML mode only supports &amp; &lt; &gt; — &quot; will cause a 400 reject
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Guard against Telegram's 4096-char message limit
function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n…';
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

// ── Chart-open alert ──────────────────────────────────────────────────────────

export function buildChartOpenMessage(
  symbol:   string,
  name:     string,
  price:    number,
  change:   number,
  pct:      number,
  tf:       string,
  news:     NewsItem[],
  chartUrl: string,
): string {
  const isUp     = change >= 0;
  const dir      = isUp ? '🟢' : '🔴';
  const sign     = isUp ? '+' : '';
  const catalysts = news.filter((n) => n.isPinned).slice(0, 3);
  const others    = news.filter((n) => !n.isPinned).slice(0, 5);

  const lines: string[] = [
    `📊 <b>CHART OPENED</b>`,
    ``,
    `🏷 <b>${escapeHtml(symbol)}</b>  ·  ${escapeHtml(name)}`,
    `💵 $${price.toFixed(2)}  ·  ${dir} ${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`,
  ];

  if (catalysts.length > 0) {
    lines.push(``, `<b>── Catalysts ─────────────────────</b>`);
    for (const item of catalysts) {
      lines.push(
        ``,
        `${CATEGORY_EMOJI[item.category]} <b>${escapeHtml(item.category).toUpperCase()}</b>  ·  ${SENTIMENT_EMOJI[item.sentiment]}`,
        `<b>${escapeHtml(item.title)}</b>`,
        `${escapeHtml(item.publisher)} · ${timeAgo(item.publishedAt)}`,
        `<a href="${escapeHtml(item.url)}">Read →</a>`,
      );
    }
  }

  if (others.length > 0) {
    lines.push(``, `<b>── Latest News ───────────────────</b>`);
    for (const item of others) {
      lines.push(`• <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>`);
    }
  }

  lines.push(``, `🔗 <a href="${escapeHtml(chartUrl)}">Open ${tf.toUpperCase()} Chart →</a>`);
  return truncate(lines.join('\n'));
}

// ── Catalyst brief (manual) ───────────────────────────────────────────────────

export function buildCatalystBriefMessage(
  symbol:   string,
  name:     string,
  price:    number,
  news:     NewsItem[],
  chartUrl: string,
): string {
  const todayStartSec = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  const pinned  = news.filter((n) => n.isPinned);
  // Prefer today's catalysts; fall back to all-time if none found today
  const catalysts =
    pinned.filter((n) => n.publishedAt >= todayStartSec).length > 0
      ? pinned.filter((n) => n.publishedAt >= todayStartSec)
      : pinned.slice(0, 5);

  const todayOther = news
    .filter((n) => !n.isPinned && n.publishedAt >= todayStartSec)
    .slice(0, 5);

  const dateStr  = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const priceStr = price > 0 ? `  ·  Last: $${price.toFixed(2)}` : '';

  const lines: string[] = [
    `📋 <b>CATALYST BRIEF</b>  ·  <b>${escapeHtml(symbol)}</b>`,
    ``,
    `${escapeHtml(name)}${priceStr}`,
    `📅 ${dateStr}`,
  ];

  if (catalysts.length > 0) {
    lines.push(``, `🔥 <b>HIGH-IMPACT CATALYSTS (${catalysts.length})</b>`);
    catalysts.forEach((item, i) => {
      lines.push(
        ``,
        `${i + 1}. ${CATEGORY_EMOJI[item.category]} <b>${escapeHtml(item.category).toUpperCase()}</b>  ·  ${SENTIMENT_EMOJI[item.sentiment]}`,
        `   <b>${escapeHtml(item.title)}</b>`,
        `   ${escapeHtml(item.publisher)} · ${timeAgo(item.publishedAt)}`,
        `   <a href="${escapeHtml(item.url)}">Read →</a>`,
      );
    });
  } else {
    lines.push(``, `<i>No high-impact catalysts found today.</i>`);
  }

  if (todayOther.length > 0) {
    lines.push(``, `📰 <b>OTHER NEWS TODAY</b>`);
    for (const item of todayOther) {
      lines.push(`• ${timeAgo(item.publishedAt)} — <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>`);
    }
  }

  lines.push(``, `🔗 <a href="${escapeHtml(chartUrl)}">Open 1M Chart →</a>`);
  return truncate(lines.join('\n'));
}

// ── Shared send helper ────────────────────────────────────────────────────────

export async function sendTelegram(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                  chatId,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${err}`);
  }
}

// ── Per-item alert (existing cron usage) ─────────────────────────────────────

export async function sendTelegramAlert(item: NewsItem, symbol: string): Promise<void> {
  await sendTelegram(buildAlertMessage(item, symbol));
}
