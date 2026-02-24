/**
 * Local news monitor — runs alongside `npm run dev`
 *
 * Usage:
 *   npm run monitor
 *
 * Every MONITOR_INTERVAL_SECONDS it calls /api/cron/news-alerts which:
 *   1. Reads your watchlist from data/watchlist.json
 *   2. Fetches news for each ticker (Yahoo JSON/RSS, Google News, SEC EDGAR,
 *      GlobeNewswire, BusinessWire, Finnhub)
 *   3. Identifies Tier-1 catalyst items (FDA, M&A, Clinical Trial, etc.)
 *   4. Applies headline dedupe  — skips articles already sent (7-day cache)
 *   5. Applies per-ticker cooldown — skips if ticker was alerted recently
 *   6. Sends Telegram alert for new catalysts
 *   7. Appends every attempt to data/alert-log.jsonl
 *
 * Config (set in .env.local or shell environment):
 *   MONITOR_INTERVAL_SECONDS=30   — how often to check  (default: 30s)
 *   ALERT_COOLDOWN_MINUTES=15     — min gap between alerts per ticker (default: 15m)
 *   APP_URL=http://localhost:3000  — base URL appended to alert messages
 *
 * Files:
 *   data/watchlist.json    — tickers to monitor, e.g. ["NVDA", "AAPL", "TSLA"]
 *   data/sent-alerts.json  — headline dedupe cache (auto-managed)
 *   data/cooldowns.json    — per-ticker last-alerted timestamps (auto-managed)
 *   data/alert-log.jsonl   — full log of every alert attempt (auto-appended)
 */

const cron = require('node-cron');

const PORT                   = process.env.PORT || 3000;
const BASE_URL               = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CHECK_INTERVAL_SECONDS = parseInt(process.env.MONITOR_INTERVAL_SECONDS || '30', 10);
const CRON_EXPRESSION        = `*/${CHECK_INTERVAL_SECONDS} * * * * *`; // 6-field: seconds

let checkCount = 0;

async function checkAlerts() {
  checkCount++;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });

  try {
    const res  = await fetch(`${BASE_URL}/api/cron/news-alerts`);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[${ts}] ❌ Check #${checkCount} failed (HTTP ${res.status}):`, data);
      return;
    }

    const { watchlist = [], results = [], totalSent = 0, cooldownMin = 15 } = data;

    if (watchlist.length === 0) {
      console.log(`[${ts}] ⚠️  Watchlist empty — add tickers to data/watchlist.json`);
      return;
    }

    if (totalSent > 0) {
      console.log(`\n[${ts}] 🚨 Check #${checkCount} — ${totalSent} NEW ALERT(S) SENT\n`);
    } else {
      process.stdout.write(`[${ts}] ✅ #${checkCount}  `);
    }

    for (const r of results) {
      const parts = [`${r.symbol.padEnd(6)}`];
      if (r.sent > 0)              parts.push(`🚨 ${r.sent} sent`);
      if (r.skipped_cooldown > 0)  parts.push(`⏳ ${r.skipped_cooldown} cooldown`);
      if (r.skipped_dedupe > 0)    parts.push(`♻  ${r.skipped_dedupe} dedupe`);
      if (r.catalysts === 0)       parts.push(`· no catalysts`);
      if (r.error)                 parts.push(`❌ ${r.error}`);

      if (totalSent > 0) {
        console.log(`  ${parts.join('  ')}`);
      } else {
        process.stdout.write(parts.join(' ') + '  ');
      }
    }

    if (totalSent === 0) process.stdout.write(`(cooldown: ${cooldownMin}m)\n`);
    else console.log('');

  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`[${ts}] ❌ Cannot reach ${BASE_URL} — is "npm run dev" running?`);
    } else {
      console.error(`[${ts}] ❌ Monitor error:`, err.message);
    }
  }
}

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║         NX-1  News Monitor               ║`);
console.log(`╚══════════════════════════════════════════╝`);
console.log(`  Endpoint : ${BASE_URL}/api/cron/news-alerts`);
console.log(`  Interval : every ${CHECK_INTERVAL_SECONDS}s  (MONITOR_INTERVAL_SECONDS)`);
console.log(`  Cooldown : ${process.env.ALERT_COOLDOWN_MINUTES ?? 15}m per ticker  (ALERT_COOLDOWN_MINUTES)`);
console.log(`  Watchlist: data/watchlist.json`);
console.log(`  Log      : data/alert-log.jsonl`);
console.log(`  Press Ctrl+C to stop\n`);

// Run immediately on start, then on schedule
checkAlerts();
cron.schedule(CRON_EXPRESSION, checkAlerts);
