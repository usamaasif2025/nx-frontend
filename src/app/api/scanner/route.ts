import { NextResponse } from 'next/server';
import * as polygon from '@/lib/api/polygon';
import * as alphaVantage from '@/lib/api/alphaVantage';
import { getQuote } from '@/lib/api/finnhub';
import { getExtendedHoursMovers } from '@/lib/api/yahooFinance';
import { StockQuote, MarketSession } from '@/types';

function getSession(): MarketSession {
  const now = new Date();
  const nyHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = nyHour.getHours();
  const m = nyHour.getMinutes();
  const totalMins = h * 60 + m;

  if (totalMins >= 240 && totalMins < 570) return 'pre';    // 4:00 AM – 9:30 AM ET
  if (totalMins >= 570 && totalMins < 960) return 'regular'; // 9:30 AM – 4:00 PM ET
  return 'post';                                              // 4:00 PM – 8:00 PM ET
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minPct = parseFloat(searchParams.get('minPct') || '3');

  try {
    const session = getSession();
    let results: StockQuote[] = [];

    // ── Extended hours (pre / post market) ──────────────────────────────────
    // Yahoo Finance returns explicit preMarketPrice / postMarketPrice fields,
    // so we get real extended-hours prices instead of stale snapshots.
    if (session === 'pre' || session === 'post') {
      results = await getExtendedHoursMovers(session, minPct);

      // If Yahoo Finance worked, return immediately
      if (results.length > 0) {
        return NextResponse.json({ stocks: results, session, updatedAt: Date.now() });
      }
      // else fall through to Polygon / Alpha Vantage as last resort
    }

    // ── Regular session (or extended-hours fallback) ─────────────────────────
    let polygonGainers = await polygon.getGainers(minPct);

    if (polygonGainers.length > 0) {
      for (const snap of polygonGainers.slice(0, 30)) {
        const fq = await getQuote(snap.ticker);
        const price =
          (session === 'pre' ? snap.lastTrade?.p : null) ||
          fq?.c ||
          snap.lastTrade?.p ||
          snap.day?.c ||
          0;
        const prevClose = snap.prevDay?.c || fq?.pc || 0;
        const changePercent =
          prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : snap.todaysChangePerc;

        if (Math.abs(changePercent) >= minPct) {
          results.push({
            symbol: snap.ticker,
            name: snap.ticker,
            price,
            change: price - prevClose,
            changePercent,
            volume: snap.min?.v || snap.day?.v || 0,
            avgVolume: snap.prevDay?.v || snap.day?.v || 0,
            volumeRatio: 1,
            high: snap.day?.h || price,
            low: snap.day?.l || price,
            open: snap.day?.o || price,
            prevClose,
            session,
            timestamp: Date.now(),
            triggered: Math.abs(changePercent) >= minPct,
          });
        }
      }
    } else {
      // Last resort: Alpha Vantage top gainers (reflects previous session)
      const avGainers = await alphaVantage.getTopGainers();
      for (const g of avGainers.slice(0, 20)) {
        const pct = parseFloat(g.changePercent?.replace('%', '') || '0');
        if (Math.abs(pct) >= minPct) {
          results.push({
            symbol: g.symbol,
            name: g.symbol,
            price: parseFloat(g.price || '0'),
            change: 0,
            changePercent: pct,
            volume: 0,
            avgVolume: 0,
            volumeRatio: 1,
            high: 0,
            low: 0,
            open: 0,
            prevClose: 0,
            session,
            timestamp: Date.now(),
            triggered: true,
          });
        }
      }
    }

    return NextResponse.json({ stocks: results, session, updatedAt: Date.now() });
  } catch (err) {
    console.error('Scanner API error:', err);
    return NextResponse.json({ error: 'Failed to fetch scanner data' }, { status: 500 });
  }
}
