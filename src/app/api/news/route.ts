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
  source: 'json' | 'rss';
}

// ── Source 1: Yahoo Finance JSON search ──────────────────────────────────────
async function fetchYahooJson(symbol: string): Promise<NewsItem[]> {
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
    timeout: 8_000,
  });

  const raw: any[] = res.data?.news || [];
  return raw
    .map((n: any) => ({
      id:          n.uuid || n.link || String(n.providerPublishTime),
      title:       (n.title || '').trim(),
      url:         n.link || '',
      publisher:   n.publisher || '',
      publishedAt: n.providerPublishTime || 0,
      thumbnail:   n.thumbnail?.resolutions?.[0]?.url || null,
      summary:     n.summary || null,
      source:      'json' as const,
    }))
    .filter(n => n.title && n.url);
}

// ── Source 2: Yahoo Finance RSS feed ─────────────────────────────────────────
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

function parseRssItems(xml: string): NewsItem[] {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return itemBlocks.map((m) => {
    const block = m[1];
    const title = extractTag(block, 'title');
    const url   = extractTag(block, 'link') || extractTag(block, 'guid');
    const pub   = extractTag(block, 'pubDate');
    const desc  = extractTag(block, 'description');
    const src   = extractTag(block, 'source');

    const publishedAt = pub ? Math.floor(new Date(pub).getTime() / 1000) : 0;

    return {
      id:          url || title,
      title,
      url,
      publisher:   src || 'Yahoo Finance',
      publishedAt,
      thumbnail:   null,
      summary:     desc || null,
      source:      'rss' as const,
    };
  }).filter(n => n.title && n.url);
}

async function fetchYahooRss(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get(
    `https://feeds.finance.yahoo.com/rss/2.0/headline`,
    {
      params: { s: symbol, region: 'US', lang: 'en-US' },
      headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
      timeout: 8_000,
      responseType: 'text',
    },
  );
  return parseRssItems(res.data as string);
}

// ── Merge & deduplicate ───────────────────────────────────────────────────────
function merge(a: NewsItem[], b: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];

  for (const item of [...a, ...b]) {
    // Deduplicate by URL (normalised) or by near-identical title prefix
    const key = item.url.split('?')[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out.sort((x, y) => y.publishedAt - x.publishedAt);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Run both sources in parallel — whichever fails is simply ignored
  const [jsonResult, rssResult] = await Promise.allSettled([
    fetchYahooJson(symbol),
    fetchYahooRss(symbol),
  ]);

  const jsonItems = jsonResult.status === 'fulfilled' ? jsonResult.value : [];
  const rssItems  = rssResult.status  === 'fulfilled' ? rssResult.value  : [];

  if (jsonItems.length === 0 && rssItems.length === 0) {
    console.error('[news] both sources failed for', symbol,
      jsonResult.status === 'rejected' ? jsonResult.reason?.message : '',
      rssResult.status  === 'rejected' ? rssResult.reason?.message  : '',
    );
    return NextResponse.json({ error: 'No news available' }, { status: 502 });
  }

  const items = merge(jsonItems, rssItems);
  return NextResponse.json({ items, sources: { json: jsonItems.length, rss: rssItems.length } });
}
