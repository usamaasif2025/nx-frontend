import { NextResponse } from 'next/server';
import { getQuote } from '@/lib/api/finnhub';
import { getTickerSnapshot } from '@/lib/api/polygon';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Try Finnhub first
  const quote = await getQuote(symbol);
  if (quote && quote.c > 0) {
    return NextResponse.json({
      symbol,
      c:  quote.c,   // current price
      d:  quote.d,   // change
      dp: quote.dp,  // change percent
      h:  quote.h,   // day high
      l:  quote.l,   // day low
      o:  quote.o,   // open
      pc: quote.pc,  // prev close
    });
  }

  // Fallback to Polygon snapshot
  const snap = await getTickerSnapshot(symbol);
  if (snap) {
    const price = snap.lastTrade?.p || snap.day?.c || 0;
    const prevClose = snap.prevDay?.c || 0;
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return NextResponse.json({
      symbol,
      c:  price,
      d:  change,
      dp: changePct,
      h:  snap.day?.h || 0,
      l:  snap.day?.l || 0,
      o:  snap.day?.o || 0,
      pc: prevClose,
    });
  }

  return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
}
