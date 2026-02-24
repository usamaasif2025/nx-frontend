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

// Telegram HTML mode only supports &amp; &lt; &gt; in text content
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// For href attributes: percent-encode chars that can break the HTML attribute.
// Use %3C/%3E instead of &lt;/&gt; so Telegram's non-standard parser can't
// misinterpret them as tag boundaries inside the href value.
function escapeUrl(url: string): string {
  return url
    .replace(/&/g, '&amp;') // & must be &amp; per HTML spec in href
    .replace(/"/g, '%22')   // " would close the attribute
    .replace(/</g, '%3C')   // < percent-encode, not &lt;
    .replace(/>/g, '%3E');  // > percent-encode, not &gt;
}

// Truncate at a line boundary so we never cut inside an HTML tag.
function truncateLines(lines: string[], max = 4000): string {
  const full = lines.join('\n');
  if (full.length <= max) return full;
  const ellipsis = '\n…';
  let length = 0;
  let kept = 0;
  for (let i = 0; i < lines.length; i++) {
    const add = (i === 0 ? 0 : 1) + lines[i].length;
    if (length + add + ellipsis.length > max) break;
    length += add;
    kept = i + 1;
  }
  return lines.slice(0, kept).join('\n') + ellipsis;
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Momentum scanner alert (price move + news catalyst) ───────────────────────

export function buildMomentumAlertMessage(
  symbol:      string,
  name:        string,
  price:       number,
  changePct:   number,
  item:        NewsItem,
  session:     'pre' | 'regular' | 'closed',
  prevDayHigh  = 0,
): string {
  const catEmoji  = CATEGORY_EMOJI[item.category];
  const sentEmoji = SENTIMENT_EMOJI[item.sentiment];
  const age       = timeAgo(item.publishedAt);
  const sign      = changePct >= 0 ? '+' : '';

  const header = session === 'pre'
    ? `🌅 <b>PRE-MARKET ALERT</b>`
    : `🚀 <b>MOMENTUM ALERT</b>`;

  const moveLine = session === 'pre' && prevDayHigh > 0
    ? `🟢 <b>${sign}${changePct.toFixed(1)}%</b> pre-mkt  ·  $${price.toFixed(2)} above D-High $${prevDayHigh.toFixed(2)}`
    : `🟢 <b>${sign}${changePct.toFixed(1)}%</b> today`;

  return [
    header,
    ``,
    `🏷 <b>${escapeHtml(symbol)}</b>  ·  ${escapeHtml(name)}`,
    moveLine,
    ``,
    `${catEmoji} <b>${escapeHtml(item.category).toUpperCase()}</b>  ·  ${sentEmoji}`,
    `<b>${escapeHtml(item.title)}</b>`,
    ``,
    `📰 ${escapeHtml(item.publisher)} · ${age}`,
    `<a href="${escapeUrl(item.url)}">Read Article →</a>`,
  ].join('\n');
}

// ── Watchlist catalyst alert ───────────────────────────────────────────────────

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
    `<a href="${escapeUrl(item.url)}">Read Article →</a>`,
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
): string {
  const isUp      = change >= 0;
  const dir       = isUp ? '🟢' : '🔴';
  const sign      = isUp ? '+' : '';
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
        `<a href="${escapeUrl(item.url)}">Read →</a>`,
      );
    }
  }

  if (others.length > 0) {
    lines.push(``, `<b>── Latest News ───────────────────</b>`);
    for (const item of others) {
      lines.push(`• <a href="${escapeUrl(item.url)}">${escapeHtml(item.title)}</a>`);
    }
  }

  return truncateLines(lines);
}

// ── Catalyst brief (manual) ───────────────────────────────────────────────────

export function buildCatalystBriefMessage(
  symbol:   string,
  name:     string,
  price:    number,
  news:     NewsItem[],
): string {
  const pinned  = news.filter((n) => n.isPinned).slice(0, 4);
  const recent  = news.filter((n) => !n.isPinned).slice(0, 6);

  const dateStr  = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const priceStr = price > 0 ? `  ·  Last: $${price.toFixed(2)}` : '';

  const bullCount = news.filter((n) => n.sentiment === 'bullish').length;
  const bearCount = news.filter((n) => n.sentiment === 'bearish').length;
  const sentLabel = bullCount > bearCount ? '🟢 Mostly Bullish'
    : bearCount > bullCount ? '🔴 Mostly Bearish'
    : '⚪ Mixed';

  const lines: string[] = [
    `📋 <b>CATALYST BRIEF</b>  ·  <b>${escapeHtml(symbol)}</b>`,
    ``,
    `${escapeHtml(name)}${priceStr}`,
    `📅 ${dateStr}  ·  ${sentLabel}`,
  ];

  if (pinned.length > 0) {
    lines.push(``, `🔥 <b>HIGH-IMPACT (${pinned.length})</b>`);
    pinned.forEach((item, i) => {
      lines.push(
        ``,
        `${i + 1}. ${CATEGORY_EMOJI[item.category]} <b>${escapeHtml(item.category).toUpperCase()}</b>  ·  ${SENTIMENT_EMOJI[item.sentiment]}`,
        `<b>${escapeHtml(item.title)}</b>`,
        `${escapeHtml(item.publisher)} · ${timeAgo(item.publishedAt)}`,
        `<a href="${escapeUrl(item.url)}">Read →</a>`,
      );
    });
  }

  if (recent.length > 0) {
    lines.push(``, `📰 <b>LATEST NEWS</b>`);
    for (const item of recent) {
      const cat = item.category !== 'General' ? ` [${escapeHtml(item.category)}]` : '';
      lines.push(`• ${SENTIMENT_EMOJI[item.sentiment].slice(0, 2)} <a href="${escapeUrl(item.url)}">${escapeHtml(item.title)}</a>${cat} — ${timeAgo(item.publishedAt)}`);
    }
  }

  if (pinned.length === 0 && recent.length === 0) {
    lines.push(``, `<i>No recent news found. Try again in a few minutes.</i>`);
  }

  return truncateLines(lines);
}

// ── Shared send helper ────────────────────────────────────────────────────────
// chartUrl is appended as plain text — Telegram Desktop auto-detects and
// hyperlinks raw URLs (including localhost) in message bodies. Inline keyboard
// buttons and <a href> tags both reject localhost per Telegram Bot API rules.

export async function sendTelegram(text: string, chartUrl?: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env.local');
  }

  const fullText = chartUrl ? `${text}\n\n📈 ${chartUrl}` : text;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:                  chatId,
      text:                     fullText,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${err}`);
  }
}

// ── Per-item alert (cron usage) ───────────────────────────────────────────────

export async function sendTelegramAlert(item: NewsItem, symbol: string, appUrl = ''): Promise<void> {
  const chartUrl = appUrl ? `${appUrl}/?symbol=${symbol}&tf=1m` : undefined;
  await sendTelegram(buildAlertMessage(item, symbol), chartUrl);
}
