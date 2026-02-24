/**
 * Local news monitor — runs alongside `npm run dev`
 *
 * Usage:
 *   npm run monitor
 *
 * Every CHECK_INTERVAL_MINUTES it calls /api/cron/news-alerts which:
 *   1. Reads your watchlist from data/watchlist.json
 *   2. Fetches news for each ticker (Yahoo + Google News)
 *   3. Identifies high-impact catalysts (FDA, M&A, Clinical Trial, etc.)
 *   4. Sends a Telegram alert for any new catalyst found
 *
 * Tip: add tickers to data/watchlist.json, e.g.:
 *   ["NVDA", "AAPL", "TSLA", "PFE"]
 *
 * Telegram setup:
 *   1. Open Telegram → search @BotFather → /newbot → copy token
 *   2. Send any message to your new bot
 *   3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates → copy chat_id
 *   4. Add to .env.local:
 *        TELEGRAM_BOT_TOKEN=123456:ABC...
 *        TELEGRAM_CHAT_ID=987654321
 */

const cron = require('node-cron');

const PORT                   = process.env.PORT || 3000;
const BASE_URL               = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CHECK_INTERVAL_SECONDS = parseInt(process.env.MONITOR_INTERVAL_SECONDS || '15', 10);
const CRON_EXPRESSION        = `*/${CHECK_INTERVAL_SECONDS} * * * * *`; // 6-field: seconds

async function checkAlerts() {
  const ts = new Date().toISOString();
  try {
    const res  = await fetch(`${BASE_URL}/api/cron/news-alerts`);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[${ts}] Alert check failed (${res.status}):`, data);
      return;
    }

    const { watchlist = [], results = [], totalSent = 0 } = data;

    if (watchlist.length === 0) {
      console.log(`[${ts}] Watchlist is empty. Edit data/watchlist.json to add tickers.`);
      return;
    }

    const summary = results
      .map(r => `${r.symbol}: ${r.catalysts} catalyst(s), ${r.sent} alert(s) sent${r.error ? ` [ERR: ${r.error}]` : ''}`)
      .join(' | ');

    console.log(`[${ts}] Checked ${watchlist.join(', ')} → ${totalSent} new alert(s) | ${summary}`);
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`[${ts}] Cannot reach ${BASE_URL} — is "npm run dev" running?`);
    } else {
      console.error(`[${ts}] Monitor error:`, err.message);
    }
  }
}

console.log(`\n🔔 News Monitor started`);
console.log(`   Endpoint : ${BASE_URL}/api/cron/news-alerts`);
console.log(`   Schedule : every ${CHECK_INTERVAL_SECONDS} second(s)`);
console.log(`   Sources  : Yahoo JSON, Yahoo RSS, Google News, SEC EDGAR, GlobeNewswire, BusinessWire, Finnhub`);
console.log(`   Watchlist: data/watchlist.json`);
console.log(`   Press Ctrl+C to stop\n`);

// Run immediately on start, then on schedule
checkAlerts();
cron.schedule(CRON_EXPRESSION, checkAlerts);
