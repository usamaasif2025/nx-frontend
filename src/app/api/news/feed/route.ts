import { NextResponse } from 'next/server';
import { fetchAllMarketNews } from '@/lib/news-fetch';

export const runtime    = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const { items, sources } = await fetchAllMarketNews();
    return NextResponse.json({
      items,
      sources,
      total:     items.length,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    console.error('[news/feed]', err);
    return NextResponse.json({ error: 'Failed to fetch news feed' }, { status: 500 });
  }
}
