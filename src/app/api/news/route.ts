import { NextRequest, NextResponse } from 'next/server';
import { fetchNewsForSymbol } from '@/lib/news-fetch';

// Re-export types so consumers (NewsPanel, etc.) can import from this path
export type { NewsCategory, NewsSentiment, NewsItem } from '@/lib/news-fetch';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const result = await fetchNewsForSymbol(symbol);

  if (result.items.length === 0) {
    return NextResponse.json({ error: 'No news available' }, { status: 502 });
  }

  return NextResponse.json(result);
}
