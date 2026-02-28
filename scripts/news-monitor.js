/**
 * Local news monitor — runs alongside `npm run dev`
 *
 * Usage:
 *   npm run monitor
 *
 * Runs THREE scanners:
 *
 * 1. Watchlist scanner  (/api/cron/news-alerts)      — every tick
 *    - Reads tickers from data/watchlist.json  (optional)
 *    - Fetches news for each ticker and alerts on high-impact catalysts
 *
 * 2. Broad market news  (/api/cron/market-scan)       — every tick
 *    - No watchlist needed — scans ALL financial news feeds
 *    - Detects FDA, M&A, earnings, analyst upgrades etc. for ANY stock
 *    - Extracts ticker from headline automatically
 *
 * 3. Pre-market scanner (/api/scan/pre-market?alert=1) — every 5 ticks
 *    - Scans the ENTIRE US market (not just a watchlist)
 *    - Only runs 4:00–9:30 AM ET (auto-skips outside pre-market)
 *    - Criteria: price<$30 · preMktVol>12K · cap<$2B · chg≥12%
 *    - Exchanges: CBOE, NASDAQ, NYSE, NYSE ARCA
 *    - Sends a Telegram digest listing ALL matching stocks
 *
 * Config (set in .env.local or shell environment):
 *   MONITOR_INTERVAL_SECONDS=60            — tick interval (default: 60s)
 *   ALERT_COOLDOWN_MINUTES=15              — news alert gap (default: 15m)
 *   PRE_MARKET_DIGEST_COOLDOWN_MINUTES=30  — pre-mkt digest re-send gap (default: 30m)
 *   PRE_MAX_PRICE=30                       — price cap (default: $30)
 *   PRE_MIN_VOL=12000                      — min pre-mkt volume (default: 12 000)
 *   PRE_MAX_MCAP=2000000000               — max market cap (default: $2 B)
 *   PRE_MIN_CHANGE=12                      — min pre-mkt % change (default: 12 %)
 *   APP_URL=http://localhost:3000          — appended to news alert links
 *
 * Files:
 *   data/watchlist.json      — optional tickers, e.g. ["NVDA", "AAPL"]
 *   data/sent-alerts.json    — news headline dedupe cache  (auto-managed)
 *   data/cooldowns.json      — per-ticker cooldown timestamps (auto-managed)
 *   data/pm-scan-cache.json  — pre-market digest dedup cache (auto-managed)
 *   data/alert-log.jsonl     — full audit log of every attempt (auto-appended)
 */

const cron = require('node-cron');

const PORT                   = process.env.PORT || 3000;
const BASE_URL               = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CHECK_INTERVAL_SECONDS = parseInt(process.env.MONITOR_INTERVAL_SECONDS || '60', 10);
const CRON_EXPRESSION        = `*/${CHECK_INTERVAL_SECONDS} * * * * *`; // 6-field: seconds
// Pre-market scan runs every PRE_SCAN_EVERY ticks (= every N * interval seconds)
const PRE_SCAN_EVERY         = 5;  // every 5 min by default (5 × 60s = 300s)

let checkCount = 0;

// ── Watchlist scanner ─────────────────────────────────────────────────────────

async function checkWatchlist(ts) {
  try {
    const res  = await fetch(`${BASE_URL}/api/cron/news-alerts`);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[${ts}] [watchlist] ❌ HTTP ${res.status}:`, data);
      return;
    }

    const { watchlist = [], results = [], totalSent = 0, cooldownMin = 15 } = data;

    if (watchlist.length === 0) {
      process.stdout.write(`[${ts}] [watchlist] ⚠️  empty (add tickers to data/watchlist.json)\n`);
      return;
    }

    if (totalSent > 0) {
      console.log(`\n[${ts}] [watchlist] 🚨 ${totalSent} ALERT(S) SENT`);
    } else {
      process.stdout.write(`[${ts}] [watchlist] ✅  `);
    }

    for (const r of results) {
      const parts = [`${r.symbol.padEnd(6)}`];
      if (r.sent > 0)             parts.push(`🚨 ${r.sent} sent`);
      if (r.skipped_cooldown > 0) parts.push(`⏳ ${r.skipped_cooldown} cooldown`);
      if (r.skipped_dedupe > 0)   parts.push(`♻  ${r.skipped_dedupe} dedupe`);
      if (r.catalysts === 0)      parts.push(`· no catalysts`);
      if (r.error)                parts.push(`❌ ${r.error}`);

      if (totalSent > 0) console.log(`  ${parts.join('  ')}`);
      else process.stdout.write(parts.join(' ') + '  ');
    }

    if (totalSent === 0) process.stdout.write(`(cooldown: ${cooldownMin}m)\n`);
    else console.log('');

  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`[${ts}] [watchlist] ❌ Cannot reach ${BASE_URL} — is "npm run dev" running?`);
    } else {
      console.error(`[${ts}] [watchlist] ❌`, err.message);
    }
  }
}

// ── Broad market news scanner ─────────────────────────────────────────────────

async function checkMarketScan(ts) {
  try {
    const res  = await fetch(`${BASE_URL}/api/cron/market-scan`);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[${ts}] [market]    ❌ HTTP ${res.status}:`, data);
      return;
    }

    const { fetched = 0, sent = 0, skipped = 0 } = data;

    if (sent > 0) {
      console.log(`[${ts}] [market]    🌐 ${sent} ALERT(S) SENT  (${fetched} catalysts, ${skipped} skipped)`);
    } else {
      process.stdout.write(`[${ts}] [market]    ✅  ${fetched} catalysts  ${skipped} skipped\n`);
    }

  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`[${ts}] [market]    ❌ Cannot reach ${BASE_URL} — is "npm run dev" running?`);
    } else {
      console.error(`[${ts}] [market]    ❌`, err.message);
    }
  }
}

// ── Pre-market stock scanner ──────────────────────────────────────────────────

async function checkPreMarket(ts) {
  try {
    const res  = await fetch(`${BASE_URL}/api/scan/pre-market?alert=1`);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[${ts}] [pre-mkt]   ❌ HTTP ${res.status}:`, data);
      return;
    }

    const { session, count = 0, source = '?', alert = {} } = data;

    if (session !== 'pre') {
      process.stdout.write(`[${ts}] [pre-mkt]   💤 outside window (${session})\n`);
      return;
    }

    if (count === 0) {
      process.stdout.write(`[${ts}] [pre-mkt]   ✅  0 matches  (source: ${source})\n`);
      return;
    }

    if (alert.sent) {
      console.log(`[${ts}] [pre-mkt]   🌅 DIGEST SENT — ${count} stock${count !== 1 ? 's' : ''}  (source: ${source})`);
    } else {
      const skip = alert.skipped ? ` · ${alert.skipped}` : '';
      process.stdout.write(`[${ts}] [pre-mkt]   ✅  ${count} match${count !== 1 ? 'es' : ''}  (source: ${source}${skip})\n`);
    }

  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`[${ts}] [pre-mkt]   ❌ Cannot reach ${BASE_URL} — is "npm run dev" running?`);
    } else {
      console.error(`[${ts}] [pre-mkt]   ❌`, err.message);
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick() {
  checkCount++;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`\n[${ts}] ── Check #${checkCount} ────────────────────────────`);

  // News scanners run every tick; pre-market scanner every PRE_SCAN_EVERY ticks
  const tasks = [checkWatchlist(ts), checkMarketScan(ts)];
  if (checkCount % PRE_SCAN_EVERY === 1) tasks.push(checkPreMarket(ts));

  await Promise.all(tasks);
}

// ── Startup ───────────────────────────────────────────────────────────────────

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`║        NX-1  News + Price Monitor            ║`);
console.log(`╚══════════════════════════════════════════════╝`);
console.log(`  [watchlist]  data/watchlist.json  (optional)`);
console.log(`  [market]     broad news scan — any stock`);
console.log(`  [pre-mkt]    4:00–9:30 AM ET · price<$${process.env.PRE_MAX_PRICE ?? 30} · vol>${process.env.PRE_MIN_VOL ?? '12K'} · cap<$${process.env.PRE_MAX_MCAP ? (parseFloat(process.env.PRE_MAX_MCAP) / 1e9).toFixed(0) + 'B' : '2B'} · chg≥${process.env.PRE_MIN_CHANGE ?? 12}%`);
console.log(`  Tick         every ${CHECK_INTERVAL_SECONDS}s  ·  pre-mkt scan every ${CHECK_INTERVAL_SECONDS * PRE_SCAN_EVERY}s`);
console.log(`  Cooldown     news: ${process.env.ALERT_COOLDOWN_MINUTES ?? 15}m  ·  digest: ${process.env.PRE_MARKET_DIGEST_COOLDOWN_MINUTES ?? 30}m`);
console.log(`  Log          data/alert-log.jsonl`);
console.log(`  Press Ctrl+C to stop\n`);

tick();
cron.schedule(CRON_EXPRESSION, tick);
