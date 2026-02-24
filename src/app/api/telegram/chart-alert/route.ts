import { NextResponse } from 'next/server';
import { fetchNewsForSymbol } from '@/lib/news-fetch';
import { buildChartOpenMessage, sendTelegram } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const { symbol, name, price, change, pct, tf, chartUrl } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    const { items } = await fetchNewsForSymbol(symbol);

    const text = buildChartOpenMessage(
      symbol,
      name   ?? symbol,
      price  ?? 0,
      change ?? 0,
      pct    ?? 0,
      tf     ?? '1m',
      items,
    );

    await sendTelegram(text, chartUrl || undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[chart-alert]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
