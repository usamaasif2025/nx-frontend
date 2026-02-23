import { NextResponse } from 'next/server';
import { getNews } from '@/lib/api/finnhub';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const news = await getNews(symbol);
  const topImpactScore = news.length > 0
    ? Math.max(...news.map((n) => Math.abs(n.impactScore)))
    : 0;

  // Determine overall news sentiment
  const avgScore = news.length > 0
    ? news.slice(0, 5).reduce((s, n) => s + n.impactScore, 0) / Math.min(news.length, 5)
    : 0;

  return NextResponse.json({
    symbol,
    news,
    summary: {
      count: news.length,
      avgScore: Math.round(avgScore * 10) / 10,
      topImpactScore,
      bullish: news.filter((n) => n.impactScore > 0).length,
      bearish: news.filter((n) => n.impactScore < 0).length,
      addToWatchlist: news.some((n) => n.addToWatchlist),
      removeFromWatchlist: news.every((n) => n.removeFromWatchlist),
    },
  });
}
