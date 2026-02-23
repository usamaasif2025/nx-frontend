import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: number; // unix seconds
  thumbnail: string | null;
  summary: string | null;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: {
        q: symbol,
        lang: 'en-US',
        region: 'US',
        quotesCount: 0,
        newsCount: 20,
        enableCb: true,
        type: 'news',
      },
      headers: HEADERS,
      timeout: 10_000,
    });

    const raw: any[] = res.data?.news || [];

    const items: NewsItem[] = raw.map((n: any) => ({
      id:          n.uuid || n.link || String(n.providerPublishTime),
      title:       n.title || '',
      url:         n.link || '',
      publisher:   n.publisher || '',
      publishedAt: n.providerPublishTime || 0,
      thumbnail:   n.thumbnail?.resolutions?.[0]?.url || null,
      summary:     n.summary || null,
    })).filter(n => n.title && n.url);

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('[news]', err.message);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 502 });
  }
}
