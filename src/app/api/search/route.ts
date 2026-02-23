import { NextResponse } from 'next/server';

const KEY = process.env.NEXT_PUBLIC_FINNHUB_KEY || process.env.FINNHUB_KEY || '';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().toUpperCase();

  if (!q || q.length < 1) return NextResponse.json({ result: [] });

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${KEY}`
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 502 });
  }
}
