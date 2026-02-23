/**
 * GET  /api/watchlist         — returns the current watchlist
 * POST /api/watchlist         — body: { symbol: "NVDA" }  — adds a ticker
 * DELETE /api/watchlist       — body: { symbol: "NVDA" }  — removes a ticker
 */

import { NextRequest, NextResponse } from 'next/server';
import fs                            from 'fs/promises';
import path                          from 'path';

const DATA_DIR       = path.join(process.cwd(), 'data');
const WATCHLIST_PATH = path.join(DATA_DIR, 'watchlist.json');

async function read(): Promise<string[]> {
  try {
    const raw = await fs.readFile(WATCHLIST_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function write(list: string[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(WATCHLIST_PATH, JSON.stringify(list, null, 2));
}

export async function GET() {
  const list = await read();
  return NextResponse.json({ watchlist: list });
}

export async function POST(req: NextRequest) {
  const { symbol } = await req.json();
  const ticker     = symbol?.toUpperCase().trim();
  if (!ticker) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const list = await read();
  if (list.includes(ticker)) {
    return NextResponse.json({ message: `${ticker} already in watchlist`, watchlist: list });
  }

  const updated = [...list, ticker];
  await write(updated);
  return NextResponse.json({ message: `${ticker} added`, watchlist: updated });
}

export async function DELETE(req: NextRequest) {
  const { symbol } = await req.json();
  const ticker     = symbol?.toUpperCase().trim();
  if (!ticker) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const list    = await read();
  const updated = list.filter(s => s !== ticker);
  await write(updated);
  return NextResponse.json({ message: `${ticker} removed`, watchlist: updated });
}
