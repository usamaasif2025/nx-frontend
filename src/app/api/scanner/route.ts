import { NextResponse } from 'next/server';
import * as polygon from '@/lib/api/polygon';
import * as alphaVantage from '@/lib/api/alphaVantage';
import { getQuote } from '@/lib/api/finnhub';
import { StockQuote, MarketSession } from '@/types';

function getSession(): MarketSession {
  const now = new Date();
  const nyHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = nyHour.getHours();
  const m = nyHour.getMinutes();
  const totalMins = h * 60 + m;

  if (totalMins >= 240 && totalMins < 570) return 'pre';   // 4:00AM - 9:30AM ET
  if (totalMins >= 570 && totalMins < 960) return 'regular'; // 9:30AM - 4:00PM ET
  return 'post'; // 4:00PM - 8:00PM ET
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minPct = parseFloat(searchParams.get('minPct') || '7');

  try {
    const session = getSession();
    const results: StockQuote[] = [];

    // During pre-market use watchlist scanner (lastTrade vs prevDay),
    // because the standard gainers endpoint relies on todaysChangePerc which
    // is zero until the regular session opens.
    let polygonGainers = session === 'pre'
      ? await polygon.getPreMarketMovers(minPct)
      : await polygon.getGainers(minPct);

    // Fallback: if pre-market scanner returned nothing, try regular gainers
    if (polygonGainers.length === 0) {
      polygonGainers = await polygon.getGainers(minPct);
    }

    if (polygonGainers.length > 0) {
      for (const snap of polygonGainers.slice(0, 30)) {
        // Enrich with Finnhub for real-time price
        const fq = await getQuote(snap.ticker);
        // Pre-market: prefer lastTrade (extended-hours) over day close
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
            // Pre-market: day volume not yet available, use minute bar volume
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
      // Fallback: Alpha Vantage top gainers
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
