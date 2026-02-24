import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type NewsCategory =
  | 'FDA Approval'
  | 'Clinical Trial'
  | 'Merger & Acquisition'
  | 'Partnership'
  | 'Government Contract'
  | 'Major Investment'
  | 'Geopolitical'
  | 'Earnings'
  | 'Analyst Rating'
  | 'General';

export type NewsSentiment = 'bullish' | 'bearish' | 'neutral';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: number; // unix seconds
  thumbnail: string | null;
  summary: string | null;
  source: 'json' | 'rss' | 'google' | 'edgar' | 'globenewswire' | 'finnhub';
  category: NewsCategory;
  sentiment: NewsSentiment;
  isPinned: boolean;
}

// ── Category detection ────────────────────────────────────────────────────────

export const HIGH_IMPACT: NewsCategory[] = [
  'FDA Approval',
  'Clinical Trial',
  'Merger & Acquisition',
  'Major Investment',
  'Government Contract',
];

const CATEGORY_RULES: Array<{ category: NewsCategory; patterns: RegExp[] }> = [
  {
    category: 'FDA Approval',
    patterns: [
      /\bFDA\b/, /food and drug/i, /\bapproval\b/i, /\bapproved\b/i,
      /\bNDA\b/, /\bBLA\b/, /\b510[kK]\b/, /\bclearance\b/i, /\bEUA\b/,
      /regulatory (submission|filing|decision)/i,
    ],
  },
  {
    category: 'Clinical Trial',
    patterns: [
      /clinical trial/i, /phase [123I] /i, /trial (results?|data|readout)/i,
      /\bplacebo\b/i, /primary endpoint/i, /pivotal (trial|study)/i,
      /\bPHASE-[123]\b/i, /\bphase [123]\b/i,
    ],
  },
  {
    category: 'Merger & Acquisition',
    patterns: [
      /\bmerger\b/i, /\bacquisition\b/i, /\bacquires?\b/i, /\btakeover\b/i,
      /\bbuyout\b/i, /to acquire/i, /to buy/i, /\bM&A\b/, /\btender offer\b/i,
      /going private/i,
    ],
  },
  {
    category: 'Partnership',
    patterns: [
      /\bpartnership\b/i, /\bcollaboration\b/i, /joint venture/i,
      /strategic (deal|agreement|alliance)/i, /licensing agreement/i,
      /co-develop/i, /supply agreement/i, /distribution agreement/i,
    ],
  },
  {
    category: 'Government Contract',
    patterns: [
      /government contract/i, /\b(DOD|DOE|FAA|FCC|DARPA|GSA)\b/,
      /\bPentagon\b/, /federal contract/i, /military contract/i,
      /\bNASA\b/, /Department of Defense/i,
      /U\.S\. (Air Force|Army|Navy|military)/i,
      /awarded (a )?(contract|deal)/i,
    ],
  },
  {
    category: 'Major Investment',
    patterns: [
      /\binvests?\b/i, /stake in/i, /raises? \$\d/i, /\bIPO\b/,
      /secondary offering/i, /private placement/i, /\bwarrant\b/i,
      /convertible note/i, /\bfunding round\b/i, /Series [A-Z] /i,
    ],
  },
  {
    category: 'Geopolitical',
    patterns: [
      /\bsanction/i, /\bembargo\b/i, /trade war/i, /\btariff/i,
      /geopolit/i, /\bwar\b/i, /\bconflict\b/i, /\bRussia\b/,
      /\bChina\b/, /\bUkraine\b/, /\bIran\b/, /North Korea/i,
      /export ban/i, /\bNATO\b/, /export control/i,
    ],
  },
  {
    category: 'Earnings',
    patterns: [
      /\bearnings\b/i, /\brevenue\b/i, /\bEPS\b/, /quarterly (results?|report)/i,
      /Q[1234] \d{4}/i, /fiscal (year|quarter)/i, /net (income|loss)/i,
      /operating (income|loss)/i, /earnings per share/i,
    ],
  },
  {
    category: 'Analyst Rating',
    patterns: [
      /\bupgrades?\b/i, /\bdowngrades?\b/i, /price target/i, /\banalyst\b/i,
      /\binitiate[sd]?\b/i, /\boutperform\b/i, /\bunderperform\b/i,
      /\boverweight\b/i, /\bunderweight\b/i, /buy rating/i, /sell rating/i,
      /\bneutral rating\b/i, /coverage (initiated|started)/i,
    ],
  },
];

export function categorize(title: string, summary: string | null): NewsCategory {
  const text = `${title} ${summary ?? ''}`;
  for (const { category, patterns } of CATEGORY_RULES) {
    if (patterns.some(p => p.test(text))) return category;
  }
  return 'General';
}

// ── Sentiment detection ───────────────────────────────────────────────────────

const BULLISH_PAT = [
  /\bapproved?\b/i, /\bbeats?\b/i, /record (high|revenue|sales|earnings)/i,
  /\bgrowth\b/i, /\bsurge[sd]?\b/i, /\brally\b/i, /\bjump[sed]?\b/i,
  /\bsoar[sed]?\b/i, /\bclimb[sed]?\b/i, /\bbreakthrough\b/i,
  /\bupgrade[sd]?\b/i, /\boutperform/i, /\bwins?\b/i, /\bsuccess(ful)?\b/i,
  /strong (quarter|results?|revenue|sales)/i, /\bgain[sed]?\b/i,
  /\bexceed[sed]?\b/i, /partnership/i, /positive (results?|data|trial)/i,
  /\braise[sd]? guidance\b/i, /\bbeat[sed]? estimate/i,
];

const BEARISH_PAT = [
  /\brecall[sed]?\b/i, /\brejected?\b/i, /fails? (to|trial|study|endpoint)/i,
  /\bmisses?\b/i, /\bdecline[sd]?\b/i, /\blawsuit\b/i, /\bsued?\b/i,
  /\binvestigation\b/i, /\bdowngrade[sd]?\b/i, /\bwarning\b/i,
  /\bplunges?\b/i, /\bcrash\b/i, /\bdrops?\b/i, /\bfalls?\b/i,
  /\bloss(es)?\b/i, /\bsanction[sed]?\b/i, /\bban\b/i, /\bsuspend(ed)?\b/i,
  /\bshortfall\b/i, /weaker? (than expected|results?|revenue)/i,
  /\bright[- ]issue\b/i, /missed (estimates|expectations)/i,
  /\bcut[sd]? guidance\b/i, /\blowers? (guidance|outlook)\b/i,
];

export function getSentiment(title: string, summary: string | null): NewsSentiment {
  const text = `${title} ${summary ?? ''}`;
  const bull = BULLISH_PAT.filter(p => p.test(text)).length;
  const bear = BEARISH_PAT.filter(p => p.test(text)).length;
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

// ── Source 1: Yahoo Finance JSON ──────────────────────────────────────────────

async function fetchYahooJson(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
    params: {
      q: symbol, lang: 'en-US', region: 'US',
      quotesCount: 0, newsCount: 20, enableCb: true, type: 'news',
    },
    headers: HEADERS,
    timeout: 8_000,
  });
  const raw: any[] = res.data?.news || [];
  return raw
    .map((n: any): NewsItem => ({
      id:          n.uuid || n.link || String(n.providerPublishTime),
      title:       (n.title || '').trim(),
      url:         n.link || '',
      publisher:   n.publisher || '',
      publishedAt: n.providerPublishTime || 0,
      thumbnail:   n.thumbnail?.resolutions?.[0]?.url || null,
      summary:     n.summary || null,
      source:      'json',
      category:    'General',
      sentiment:   'neutral',
      isPinned:    false,
    }))
    .filter(n => n.title && n.url);
}

// ── Source 2 & 3: RSS (Yahoo + Google News) ───────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const m = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  );
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

function parseRssItems(xml: string, source: 'rss' | 'google'): NewsItem[] {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return itemBlocks
    .map((m): NewsItem => {
      const block       = m[1];
      const title       = extractTag(block, 'title');
      const url         = extractTag(block, 'link') || extractTag(block, 'guid');
      const pub         = extractTag(block, 'pubDate');
      const desc        = extractTag(block, 'description');
      const src         = extractTag(block, 'source');
      const publishedAt = pub ? Math.floor(new Date(pub).getTime() / 1000) : 0;
      return {
        id:          url || title,
        title,
        url,
        publisher:   src || (source === 'google' ? 'Google News' : 'Yahoo Finance'),
        publishedAt,
        thumbnail:   null,
        summary:     desc || null,
        source,
        category:    'General',
        sentiment:   'neutral',
        isPinned:    false,
      };
    })
    .filter(n => n.title && n.url);
}

async function fetchYahooRss(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://feeds.finance.yahoo.com/rss/2.0/headline', {
    params: { s: symbol, region: 'US', lang: 'en-US' },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  return parseRssItems(res.data as string, 'rss');
}

async function fetchGoogleNews(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://news.google.com/rss/search', {
    params: { q: `${symbol} stock`, hl: 'en-US', gl: 'US', ceid: 'US:en' },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  return parseRssItems(res.data as string, 'google');
}

// ── Source 4: SEC EDGAR (8-K filings — direct regulatory events) ──────────────

function parseAtomEntries(xml: string, publisher: string): NewsItem[] {
  const entryBlocks = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
  return entryBlocks
    .map((m): NewsItem => {
      const block      = m[1];
      const title      = extractTag(block, 'title');
      const linkMatch  = block.match(/href="([^"]+)"/);
      const url        = linkMatch?.[1] || extractTag(block, 'id');
      const updated    = extractTag(block, 'updated') || extractTag(block, 'published');
      const summary    = extractTag(block, 'summary') || extractTag(block, 'content');
      const publishedAt = updated ? Math.floor(new Date(updated).getTime() / 1000) : 0;
      return {
        id:          url || title,
        title,
        url,
        publisher,
        publishedAt,
        thumbnail:   null,
        summary:     summary || null,
        source:      'edgar',
        category:    'General',
        sentiment:   'neutral',
        isPinned:    false,
      };
    })
    .filter(n => n.title && n.url);
}

async function fetchSecEdgar(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://www.sec.gov/cgi-bin/browse-edgar', {
    params: {
      action:  'getcompany',
      CIK:     symbol,
      type:    '8-K',
      dateb:   '',
      owner:   'include',
      count:   10,
      output:  'atom',
    },
    headers: { ...HEADERS, Accept: 'application/atom+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  return parseAtomEntries(res.data as string, 'SEC EDGAR');
}

// ── Source 5: GlobeNewswire (direct press releases) ───────────────────────────

async function fetchGlobeNewswire(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get(`https://www.globenewswire.com/RssFeed/company/${symbol}`, {
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'globenewswire' as const, publisher: i.publisher || 'GlobeNewswire' }));
}

// ── Source 6: BusinessWire (direct press releases) ────────────────────────────

async function fetchBusinessWire(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://feed.businesswire.com/rss/home/', {
    params: { rss: 'G22', ticker: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'globenewswire' as const, publisher: i.publisher || 'BusinessWire' }));
}

// ── Source 7: Finnhub (fast aggregated news) ──────────────────────────────────

async function fetchFinnhub(symbol: string): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_KEY;
  if (!key || key === 'your_finnhub_api_key_here') return [];

  const to   = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt  = (d: Date) => d.toISOString().slice(0, 10);

  const res = await axios.get('https://finnhub.io/api/v1/company-news', {
    params: { symbol, from: fmt(from), to: fmt(to), token: key },
    headers: HEADERS,
    timeout: 8_000,
  });

  const raw: any[] = res.data || [];
  return raw
    .map((n: any): NewsItem => ({
      id:          String(n.id || n.url || n.headline),
      title:       (n.headline || '').trim(),
      url:         n.url || '',
      publisher:   n.source || 'Finnhub',
      publishedAt: n.datetime || 0,
      thumbnail:   n.image || null,
      summary:     n.summary || null,
      source:      'finnhub',
      category:    'General',
      sentiment:   'neutral',
      isPinned:    false,
    }))
    .filter(n => n.title && n.url);
}

// ── Merge, dedup & enrich ─────────────────────────────────────────────────────

function merge(...arrays: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of arrays.flat()) {
    const key = item.url.split('?')[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((x, y) => y.publishedAt - x.publishedAt);
}

export async function fetchNewsForSymbol(symbol: string): Promise<{
  items: NewsItem[];
  sources: { json: number; rss: number; google: number; edgar: number; globenewswire: number; businesswire: number; finnhub: number };
}> {
  const [jsonResult, rssResult, googleResult, edgarResult, gnwResult, bwResult, finnhubResult] = await Promise.allSettled([
    fetchYahooJson(symbol),
    fetchYahooRss(symbol),
    fetchGoogleNews(symbol),
    fetchSecEdgar(symbol),
    fetchGlobeNewswire(symbol),
    fetchBusinessWire(symbol),
    fetchFinnhub(symbol),
  ]);

  const jsonItems     = jsonResult.status     === 'fulfilled' ? jsonResult.value     : [];
  const rssItems      = rssResult.status      === 'fulfilled' ? rssResult.value      : [];
  const googleItems   = googleResult.status   === 'fulfilled' ? googleResult.value   : [];
  const edgarItems    = edgarResult.status    === 'fulfilled' ? edgarResult.value    : [];
  const gnwItems      = gnwResult.status      === 'fulfilled' ? gnwResult.value      : [];
  const bwItems       = bwResult.status       === 'fulfilled' ? bwResult.value       : [];
  const finnhubItems  = finnhubResult.status  === 'fulfilled' ? finnhubResult.value  : [];

  const items = merge(jsonItems, rssItems, googleItems, edgarItems, gnwItems, bwItems, finnhubItems).map(item => {
    const category  = categorize(item.title, item.summary);
    const sentiment = getSentiment(item.title, item.summary);
    return { ...item, category, sentiment, isPinned: HIGH_IMPACT.includes(category) };
  });

  return {
    items,
    sources: {
      json:          jsonItems.length,
      rss:           rssItems.length,
      google:        googleItems.length,
      edgar:         edgarItems.length,
      globenewswire: gnwItems.length,
      businesswire:  bwItems.length,
      finnhub:       finnhubItems.length,
    },
  };
}
