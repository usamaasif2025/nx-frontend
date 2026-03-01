import { NextRequest, NextResponse }  from 'next/server';
import { fetchNewsForSymbol }          from '@/lib/news-fetch';
import { scoreNewsRelevance }          from '@/lib/news-score';

export const runtime     = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const { items } = await fetchNewsForSymbol(symbol);

    // Take newest 20, then score all in parallel (fail-open)
    const top = items.slice(0, 20);
    const scored = await Promise.all(
      top.map(async (item) => {
        const { score, reason } = await scoreNewsRelevance(
          item.title, item.summary ?? '', item.category, symbol, item.sentiment,
        );
        return {
          title:       item.title,
          url:         item.url,
          publisher:   item.publisher,
          publishedAt: item.publishedAt,
          category:    item.category,
          sentiment:   item.sentiment,
          bigBeat:     item.bigBeat ?? false,
          isPinned:    item.isPinned,
          score,
          scoreReason: reason,
        };
      }),
    );

    return NextResponse.json({ symbol, items: scored });
  } catch (err) {
    console.error('[news/symbol]', err);
    return NextResponse.json({ error: 'Failed to fetch symbol news' }, { status: 500 });
  }
}
