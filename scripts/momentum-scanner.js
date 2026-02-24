/**
 * Momentum Scanner — runs alongside `npm run dev`
 *
 * Usage:
 *   npm run scanner
 *
 * Every MONITOR_INTERVAL_SECONDS it:
 *   1. Fetches today's top gainers from Yahoo Finance
 *   2. Filters stocks moving >= PRICE_MOVE_PCT % (default: 7%)
 *   3. For each mover NOT in cooldown, fetches Tier-1 news
 *   4. If catalyst found → sends Telegram alert with % move + headline
 *   5. Applies dedupe (same headline never sent twice)
 *   6. Applies per-ticker cooldown (no spam per ticker)
 *   7. Logs every attempt to data/alert-log.jsonl
 *
 * No watchlist needed — stocks are found automatically by price move.
 *
 * Config (set in .env.local):
 *   PRICE_MOVE_PCT=7              — minimum % move to scan (default: 7)
 *   MAX_MOVERS=15                 — max stocks to check per cycle (default: 15)
 *   MONITOR_INTERVAL_SECONDS=60  — how often to scan (default: 60s)
 *   ALERT_COOLDOWN_MINUTES=15    — min gap between alerts per ticker
 *   APP_URL=http://localhost:3000 — base URL for chart links
 *
 * Files auto-managed:
 *   data/sent-alerts.json   — headline dedupe cache
 *   data/cooldowns.json     — per-ticker last-alerted timestamps
 *   data/alert-log.jsonl    — full audit log of every attempt
 */

const cron = require('node-cron');

const PORT                   = process.env.PORT || 3000;
const BASE_URL               = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CHECK_INTERVAL_SECONDS = parseInt(process.env.MONITOR_INTERVAL_SECONDS || '60', 10);
const CRON_EXPRESSION        = `*/${CHECK_INTERVAL_SECONDS} * * * * *`;

/** Format market cap: 1500000000 → "$1.5B" */
function fmtMcap(mc) {
  if (!mc || mc <= 0) return '';
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toLocaleString()}`;
}

let checkCount = 0;

async function scan() {
  checkCount++;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });

  try {
    const res  = await fetch(`${BASE_URL}/api/cron/momentum-scanner`);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[${ts}] ❌ Scan #${checkCount} failed (HTTP ${res.status}):`, data?.error ?? data);
      return;
    }

    const {
      movers      = 0,
      results     = [],
      totalSent   = 0,
      threshold   = 7,
      cooldownMin = 15,
      session     = '',
      message,
    } = data;

    // Market closed or no movers matching filters
    if (message) {
      const icon = message.includes('closed') ? '💤' : '🔍';
      console.log(`[${ts}] ${icon} #${checkCount}  [${session}]  ${message}`);
      return;
    }

    const sessionLabel = session === 'pre' ? '🌅 PRE' : session === 'regular' ? '📈 REG' : session;

    if (totalSent > 0) {
      console.log(`\n[${ts}] 🚨 [${sessionLabel}] Scan #${checkCount} — ${totalSent} ALERT(S) SENT!\n`);
    } else {
      process.stdout.write(`[${ts}] ✅ [${sessionLabel}] #${checkCount}  ${movers} mover(s) >${threshold}%  `);
    }

    for (const r of results) {
      const sign  = r.changePct >= 0 ? '+' : '';
      const dh    = r.prevDayHigh > 0 ? `  D-H:$${r.prevDayHigh.toFixed(2)}` : '';
      const px    = r.price      > 0 ? `  $${r.price.toFixed(2)}` : '';
      const mc    = r.marketCap  > 0 ? `  ${fmtMcap(r.marketCap)}` : '';
      const parts = [`${r.symbol.padEnd(6)} ${sign}${r.changePct.toFixed(1)}%${px}${mc}${dh}`];

      if (r.sent > 0)              parts.push(`🚨 ${r.sent} sent`);
      if (r.catalysts > 0 && r.sent === 0) parts.push(`🔕 ${r.catalysts} catalyst(s) — dedupe/cooldown`);
      if (r.skipped_cooldown > 0)  parts.push(`⏳ cooldown`);
      if (r.catalysts === 0 && !r.skipped_cooldown) parts.push(`· no Tier-1 news`);
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
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Cannot reach ${BASE_URL} — is "npm run dev" running?`);
    } else {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Scanner error:`, err.message);
    }
  }
}

const movePct  = process.env.PRICE_MOVE_PCT        ?? '7';
const maxMov   = process.env.MAX_MOVERS             ?? '15';
const cooldown = process.env.ALERT_COOLDOWN_MINUTES ?? '15';
const maxPx    = process.env.PRE_MAX_PRICE          ?? '30';
const maxMcap  = process.env.PRE_MAX_MARKET_CAP     ?? '2000000000';

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`║       NX-1  Momentum Scanner                 ║`);
console.log(`╚══════════════════════════════════════════════╝`);
console.log(`  Endpoint   : ${BASE_URL}/api/cron/momentum-scanner`);
console.log(`  Interval   : every ${CHECK_INTERVAL_SECONDS}s  (MONITOR_INTERVAL_SECONDS)`);
console.log(`  Threshold  : >${movePct}% move  (PRICE_MOVE_PCT)`);
console.log(`  Pre-market : price <=$${maxPx}  |  mktcap <=$${(parseFloat(maxMcap)/1e9).toFixed(0)}B`);
console.log(`  Max movers : ${maxMov} per cycle  (MAX_MOVERS)`);
console.log(`  Cooldown   : ${cooldown}m per ticker  (ALERT_COOLDOWN_MINUTES)`);
console.log(`  Log        : data/alert-log.jsonl`);
console.log(`  Press Ctrl+C to stop\n`);

scan();
cron.schedule(CRON_EXPRESSION, scan);
