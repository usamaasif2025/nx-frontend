import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const runtime    = 'nodejs';
export const maxDuration = 15;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/rss+xml, text/xml, application/xml',
};

function extractTag(xml: string, tag: string): string {
  const m = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  );
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const [yahooRes, googleRes] = await Promise.allSettled([
      axios.get('https://feeds.finance.yahoo.com/rss/2.0/headline', {
        params: { s: symbol, region: 'US', lang: 'en-US' },
        headers: HEADERS,
        timeout: 8_000,
        responseType: 'text',
      }),
      axios.get('https://news.google.com/rss/search', {
        params: { q: `${symbol} stock`, hl: 'en-US', gl: 'US', ceid: 'US:en' },
        headers: HEADERS,
        timeout: 8_000,
        responseType: 'text',
      }),
    ]);

    const items: { title: string; url: string; publisher: string; publishedAt: number }[] = [];
    const seen = new Set<string>();

    for (const res of [yahooRes, googleRes]) {
      if (res.status !== 'fulfilled') continue;
      const xml = res.value.data as string;
      const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
      for (const m of blocks) {
        const block  = m[1];
        const title  = extractTag(block, 'title');
        const url    = extractTag(block, 'link') || extractTag(block, 'guid');
        const pub    = extractTag(block, 'pubDate');
        const src    = extractTag(block, 'source');
        const publishedAt = pub ? Math.floor(new Date(pub).getTime() / 1000) : 0;
        const key = title.slice(0, 60).toLowerCase();
        if (!title || !url || seen.has(key)) continue;
        seen.add(key);
        items.push({ title, url, publisher: src || 'News', publishedAt });
      }
    }

    items.sort((a, b) => b.publishedAt - a.publishedAt);

    return NextResponse.json({ symbol, items: items.slice(0, 20) });
  } catch (err) {
    console.error('[news/symbol]', err);
    return NextResponse.json({ error: 'Failed to fetch symbol news' }, { status: 500 });
  }
}
