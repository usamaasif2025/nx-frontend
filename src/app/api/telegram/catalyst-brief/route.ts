import { NextResponse } from 'next/server';
import { fetchNewsForSymbol } from '@/lib/news-fetch';
import { buildCatalystBriefMessage, sendTelegram } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const { symbol, chartUrl, price: clientPrice, name: clientName } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    // Fetch news + optional live price in parallel
    const [newsResult, quoteResult] = await Promise.allSettled([
      fetchNewsForSymbol(symbol),
      fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } },
      ).then((r) => r.json()),
    ]);

    const items = newsResult.status === 'fulfilled' ? newsResult.value.items : [];

    // Use client-provided price/name if available, otherwise pull from quote
    let price = clientPrice ?? 0;
    let name  = clientName  ?? symbol;

    if ((!price || !clientName) && quoteResult.status === 'fulfilled') {
      const q = quoteResult.value?.quoteResponse?.result?.[0];
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
