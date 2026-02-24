import { NextResponse } from 'next/server';
import axios from 'axios';
import { fetchNewsForSymbol } from '@/lib/news-fetch';
import { buildCatalystBriefMessage, sendTelegram } from '@/lib/telegram';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

export async function POST(req: Request) {
  try {
    const { symbol, chartUrl, price: clientPrice, name: clientName } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    // Fetch news + optional live quote in parallel; failures are non-fatal
    const [newsResult, quoteResult] = await Promise.allSettled([
      fetchNewsForSymbol(symbol),
      axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
        params: { symbols: symbol },
        headers: HEADERS,
        timeout: 6_000,
      }),
    ]);

    const items = newsResult.status === 'fulfilled' ? newsResult.value.items : [];

    // Prefer price/name passed from the client (already on screen); fall back to quote
    let price = clientPrice ?? 0;
    let name  = clientName  ?? symbol;

    if ((!price || !clientName) && quoteResult.status === 'fulfilled') {
      const q = quoteResult.value.data?.quoteResponse?.result?.[0];
      if (q) {
        if (!price) price = q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0;
        if (!clientName) name = q.longName ?? q.shortName ?? symbol;
      }
    }

    const text = buildCatalystBriefMessage(symbol, name, price, items, chartUrl ?? '');
    await sendTelegram(text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[catalyst-brief]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
