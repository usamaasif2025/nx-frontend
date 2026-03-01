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
  source: string;
  category: NewsCategory;
  sentiment: NewsSentiment;
  isPinned: boolean;
  bigBeat?: boolean; // true for standout earnings beats or major analyst raises
}

// ── Category detection ────────────────────────────────────────────────────────

export const HIGH_IMPACT: NewsCategory[] = [
  'FDA Approval',
  'Clinical Trial',
  'Merger & Acquisition',
  'Partnership',
  'Government Contract',
  'Major Investment',
  'Geopolitical',
  'Earnings',
  'Analyst Rating',
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
      // Existing
      /\binvests?\b/i, /stake in/i, /\bIPO\b/,
      /secondary offering/i, /private placement/i, /\bwarrant\b/i,
      /convertible note/i, /\bfunding round\b/i, /Series [A-Z] /i,
      // All tenses of "raise" + dollar amount
      /raises? \$\d/i, /raising \$\d/i, /raised \$\d/i,
      // Offering types missed before
      /equity offering/i, /public offering/i,
      /stock (offering|sale)/i, /share (offering|sale)/i,
      /follow.on offering/i, /registered direct/i,
      /at.the.market offering/i, /\bATM offering\b/i,
      /bought deal/i, /equity financ/i, /underwritten offering/i,
      // Action verbs on a dollar amount
      /prices? \$\d/i, /completes? \$\d/i, /closes? \$\d/i,
      // Selling stock (all verb forms)
      /sells?.{0,30}shares?\b/i, /selling.{0,30}shares?\b/i, /sold.{0,30}shares?\b/i,
      // "$175M offering" — amount before the word
      /\$\d+.{0,30}offering/i,
      // "upsizes offering" — almost exclusively equity raise language
      /\bupsizes?\b/i,
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
  {
    category: 'Geopolitical',
    patterns: [
      // Unambiguous geopolitical terms (no country name required)
      /\bsanction/i, /\bembargo\b/i, /trade war/i, /\btariff/i,
      /geopolit/i, /export ban/i, /export control/i, /\bNATO\b/,
      // Armed conflict — require explicit military/war context to avoid "price war", "conflict of interest"
      /\b(military|armed) conflict\b/i,
      /\b(airstrike|ceasefire|invasion|annexation|warfront)\b/i,
      // Russia / Ukraine / Iran / North Korea — require geopolitical context word nearby
      /\b(Russia|Ukraine|Iran|North Korea)\b.{0,80}(sanction|war|invasion|troops|military|nuclear|missile|embargo|airstrike|attack|conflict)/i,
      /(sanction|war|invasion|troops|military|nuclear|missile|embargo|airstrike|attack|conflict).{0,80}\b(Russia|Ukraine|Iran|North Korea)\b/i,
      // Israel / Gaza / Hamas — geopolitical conflict zone
      /\b(Israel|Gaza|Hamas|Hezbollah|West Bank)\b.{0,60}(war|attack|invasion|troops|military|airstrike|ceasefire|conflict)/i,
      /(war|attack|invasion|troops|military|airstrike|ceasefire|conflict).{0,60}\b(Israel|Gaza|Hamas|Hezbollah|West Bank)\b/i,
      // China — ONLY with geopolitical context; plain "China" (e.g. "China revenue") falls to General/Earnings
      /\bChina\b.{0,60}(tariff|trade war|sanction|export ban|export control|South China Sea|Taiwan Strait|Taiwan independence|military|troops|invasion)/i,
      /(tariff|trade war|sanction|export ban|export control|South China Sea|Taiwan Strait|military|troops|invasion).{0,60}\bChina\b/i,
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
  /raises? (price )?target/i, /boosts? (price )?target/i,
  /hikes? (price )?target/i, /increases? (price )?target/i,
  // Equity raise — securing capital is inherently bullish
  /\boversubscribed\b/i, /\bupsized?\b/i,
  /raises? \$\d/i, /raising \$\d/i, /raised \$\d/i,
  /announces?.{0,20}\$\d/i,
  /completes?.{0,40}(offering|raise|financing)/i,
  /closes?.{0,40}(offering|raise|financing)/i,
  /pric(es?|ed|ing).{0,40}(offering|deal)/i,
  /(offering|deal).{0,20}pric(es?|ed|ing)/i,
  /sells?.{0,30}shares?\b/i,
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
  // Equity raise bearish signals
  /\bdilutive\b/i, /dilutes? (shareholders?|equity)/i,
];

export function getSentiment(title: string, summary: string | null): NewsSentiment {
  const text = `${title} ${summary ?? ''}`;
  const bull = BULLISH_PAT.filter(p => p.test(text)).length;
  const bear = BEARISH_PAT.filter(p => p.test(text)).length;
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

// ── Big-beat detection ────────────────────────────────────────────────────────
// Patterns that signal an especially strong catalyst — used to apply the
// "BIG BEAT" badge in the news feed and in Catalyst Mode ranking.

const BIG_BEAT_PATS = [
  // Record-setting results
  /record (quarter|revenue|earnings?|profit|sales|results?)/i,
  /\brecord-breaking\b/i,
  /best (quarter|year|results?) in \d/i,
  // Blowout / crush language
  /blowout (quarter|earnings?|results?)/i,
  /\bcrush(es|ed)?\b.{0,60}\bestimate/i,
  /\bsmash(es|ed)?\b.{0,60}\bestimate/i,
  // Beat + guidance raise in same headline
  /beat.{0,80}raise[sd]? (guidance|outlook|forecast)/i,
  /raises? (guidance|outlook|forecast).{0,80}beat/i,
  /raised? (annual|full.year|fy\d?) (guidance|outlook|forecast)/i,
  // Top / surpass wall street
  /top(ped|s)? (wall street|analyst|consensus) estimate/i,
  /surpasse?[sd]? (wall street|analyst|consensus)/i,
  // Magnitude qualifiers
  /significant(ly)? (beat|exceed|surpass)/i,
  /(massive|huge|monster|blockbuster) (beat|quarter|earnings?)/i,
  // Analyst: major raise or initiation at strong buy
  /raises? (price )?target.{0,30}\$\d{2,}/i,
  /initiates?.{0,20}(strong buy|outperform|buy)/i,
];

/** Returns true for earnings or analyst items that carry an especially strong signal. */
export function isBigBeat(title: string, summary: string | null): boolean {
  const text = `${title} ${summary ?? ''}`;
  return BIG_BEAT_PATS.some(p => p.test(text));
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

/**
 * Parse an RSS pubDate string to a unix timestamp (seconds, UTC).
 *
 * Handles non-standard formats emitted by specific sources:
 *   - Investing.com: "2026-02-28 04:19:11"  → no timezone, no T separator
 *     Their server sends UTC; we add T+Z to make it unambiguously UTC.
 *   - Standard RFC 2822: "Fri, 28 Feb 2026 09:00:00 -0500" — native Date() handles fine.
 */
function parsePubDate(pub: string): number {
  if (!pub) return 0;
  // "YYYY-MM-DD HH:MM:SS" with no timezone → Investing.com UTC timestamp
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(pub.trim())
    ? pub.trim().replace(' ', 'T') + 'Z'
    : pub;
  const ms = new Date(normalized).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
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
      const publishedAt = parsePubDate(pub);
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

// ── Source 8: TheStreet (financial news & analysis) ───────────────────────────

async function fetchTheStreet(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://www.thestreet.com/feeds/rss/index.xml', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'thestreet' as const, publisher: i.publisher || 'TheStreet' }));
}

// ── Source 9: Reuters ─────────────────────────────────────────────────────────

async function fetchReuters(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://feeds.reuters.com/reuters/businessNews', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'reuters', publisher: i.publisher || 'Reuters' }));
}

// ── Source 10: CNBC ───────────────────────────────────────────────────────────

async function fetchCNBC(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://www.cnbc.com/id/10000664/device/rss/rss.html', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'cnbc', publisher: i.publisher || 'CNBC' }));
}

// ── Source 11: MarketWatch ────────────────────────────────────────────────────

async function fetchMarketWatch(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://feeds.marketwatch.com/marketwatch/topstories/', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'marketwatch', publisher: i.publisher || 'MarketWatch' }));
}

// ── Source 12: Seeking Alpha (symbol-specific) ────────────────────────────────

async function fetchSeekingAlpha(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get(`https://seekingalpha.com/symbol/${encodeURIComponent(symbol)}.xml`, {
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'seekingalpha', publisher: i.publisher || 'Seeking Alpha' }));
}

// ── Source 13: Benzinga ───────────────────────────────────────────────────────

async function fetchBenzinga(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://www.benzinga.com/feeds/news', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'benzinga', publisher: i.publisher || 'Benzinga' }));
}

// ── Source 14: AP Finance ─────────────────────────────────────────────────────

async function fetchAP(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://feeds.apnews.com/apnews/business', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'ap', publisher: i.publisher || 'AP' }));
}

// ── Source 15: Forbes Investing ───────────────────────────────────────────────

async function fetchForbes(symbol: string): Promise<NewsItem[]> {
  const res = await axios.get('https://www.forbes.com/investing/feed/', {
    params: { q: symbol },
    headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
    timeout: 8_000,
    responseType: 'text',
  });
  const items = parseRssItems(res.data as string, 'rss');
  return items.map(i => ({ ...i, source: 'forbes', publisher: i.publisher || 'Forbes' }));
}

// ── Ticker extraction ─────────────────────────────────────────────────────────
// Words that look like tickers but are not — used to filter false positives.

const NON_TICKERS = new Set([
  // Regulators / agencies
  'FDA', 'SEC', 'FTC', 'DOJ', 'DOD', 'DOE', 'FCC', 'CDC', 'NIH', 'CMS',
  'EMA', 'WHO', 'IRS', 'OMB', 'OSHA', 'EPA', 'FAA', 'NHTSA', 'CFIA',
  'NASA', 'DARPA', 'GSA', 'FDIC', 'OCC', 'CFPB',
  // Drug / trial terms
  'NDA', 'BLA', 'EUA', 'IND', 'ANDA', 'PDUFA', 'PFS', 'ORR', 'DCR',
  // Finance / markets
  'NYSE', 'AMEX', 'CBOE', 'CME', 'ETF', 'IPO', 'EPS', 'ROI', 'EBITDA',
  'GDP', 'CPI', 'PPI', 'PMI', 'NFP', 'ATH', 'ATL', 'YTD', 'YOY', 'QOQ',
  'ECB', 'IMF', 'WTO', 'OPEC', 'FOMC', 'BoE', 'BoJ', 'RBI',
  'G7', 'G20', 'ESG', 'KPI', 'SaaS', 'B2B', 'B2C',
  // Currencies
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'INR',
  'BTC', 'ETH', 'NFT',
  // Corporate suffixes
  'LLC', 'INC', 'CORP', 'LTD', 'PLC', 'AG', 'SA', 'NV',
  // C-suite / titles
  'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'CMO', 'CPO',
  // Geopolitical / orgs
  'US', 'UK', 'EU', 'UN', 'NATO', 'BRICS',
  // Common short words that happen to be uppercase in headlines
  'AI', 'IT', 'HR', 'IR', 'PR', 'PC', 'TV', 'AM', 'PM', 'OR', 'NO',
  'OK', 'SO', 'AS', 'IS', 'AT', 'BY', 'IN', 'ON', 'OF', 'TO', 'DO',
  'ME', 'MY', 'BE', 'HE', 'WE', 'IF', 'UP', 'GO', 'AN', 'ST',
  // Periods
  'Q1', 'Q2', 'Q3', 'Q4', 'FY', 'H1', 'H2',
]);

/**
 * Try to extract a stock ticker symbol from a news headline / summary.
 * Returns the first confident match or null.
 */
export function extractTicker(text: string): string | null {
  // 1. $TICKER — explicit tagging (highest confidence)
  const dollar = text.match(/\$([A-Z]{1,5})\b/);
  if (dollar && !NON_TICKERS.has(dollar[1])) return dollar[1];

  // 2. Exchange-tagged: NYSE: AAPL  or  Nasdaq: AAPL
  const exchange = text.match(/\b(?:NYSE|Nasdaq|AMEX|OTCQB|OTCQX|OTC):\s*([A-Z]{1,5})\b/i);
  if (exchange) return exchange[1].toUpperCase();

  // 3. Parenthetical at end of headline: "Company Name (AAPL)"
  const paren = text.match(/\(([A-Z]{2,5})\)(?:\s*[-–—,.]|\s*$)/);
  if (paren && !NON_TICKERS.has(paren[1])) return paren[1];

  // 4. "TICKER stock" or "TICKER shares" — lower confidence, only 2–4 chars
  const stock = text.match(/\b([A-Z]{2,4})\s+(?:stock|shares|equity)\b/);
  if (stock && !NON_TICKERS.has(stock[1])) return stock[1];

  return null;
}

// ── Broad market news (no symbol required) ────────────────────────────────────

/**
 * Fetch ALL general financial news from public RSS feeds.
 * Returns every item enriched with category/sentiment/ticker — no high-impact filter.
 * Used by the /news page feed.
 */
export async function fetchAllMarketNews(): Promise<{
  items: Array<NewsItem & { ticker: string | null }>;
  sources: Record<string, number>;
}> {
  const googleSearches = [
    'FDA approved OR "FDA approval" stock',
    '"clinical trial" OR "phase 3" OR "phase 2" stock results',
    '"merger" OR "acquisition" OR "acquires" stock deal',
    '"earnings" OR "quarterly results" beats misses stock',
    '"analyst" OR "price target" OR "upgrade" OR "downgrade" stock rating',
    '"government contract" OR "awarded contract" OR "defense contract" stock',
    '"raises" OR "IPO" OR "private placement" OR "secondary offering" stock',
  ];

  const [
    cnbcRes, mwRes,
    wsjMarketsRes, wsjBusinessRes, benzRes, investingRes, saRes, prnewswireRes, foolRes,
    gnwNasdaqRes, gnwNyseRes,
    foxRes, bbcRes,
    wallstRes, appleinsiderRes, fortuneRes, techcrunchRes, quartzRes, nasdaqRes,
    bloombergMarketsRes, bloombergTechRes, beincryptoRes, blackenterpriseRes,
    cbsRes, coinDeskRes, cryptonewsRes, commObserverRes, coinGapeRes,
    ftRes, decryptRes, fastcoRes, etfTrendsRes, digitalTrendsRes, engadgetRes, fierceBioRes,
    dailyUpsideRes, theBlockRes, pymntRes, oilpriceRes, guruFocusRes,
    laTimesRes, timeRes, freightWavesRes, housingWireRes, nbcBizRes,
    ...googleRes
  ] = await Promise.allSettled([
    axios.get('https://www.cnbc.com/id/10000664/device/rss/rss.html',                { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.marketwatch.com/marketwatch/topstories/',               { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.a.dj.com/rss/RSSMarketsMain.xml',                      { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',                    { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.benzinga.com/feed',                                       { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.investing.com/rss/news.rss',                             { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://seekingalpha.com/market_currents.xml',                       { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.prnewswire.com/rss/news-releases-list.rss',              { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.fool.com/a/feeds/foolwatch?apikey=foolwatch-feed',       { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.globenewswire.com/RssFeed/exchange/NASDAQ',              { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.globenewswire.com/RssFeed/exchange/NYSE',                { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://moxie.foxbusiness.com/google-publisher/latest.xml',          { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.bbci.co.uk/news/business/rss.xml',                     { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://247wallst.com/feed/',                                         { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://appleinsider.com/rss/news/',                                 { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://fortune.com/feed/',                                           { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://techcrunch.com/feed/',                                        { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://qz.com/rss',                                                  { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.nasdaq.com/feed/rssoutbound?category=Markets',           { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.bloomberg.com/markets/news.rss',                      { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.bloomberg.com/technology/news.rss',                   { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://beincrypto.com/feed/',                                       { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.blackenterprise.com/feed/',                              { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.cbsnews.com/latest/rss/moneywatch',                     { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.coindesk.com/arc/outboundfeeds/rss/',                   { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://cryptonews.com/news/feed/',                                  { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://commercialobserver.com/feed/',                               { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://coingape.com/feed/',                                         { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.ft.com/news-feed?format=rss',                           { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://decrypt.co/feed',                                            { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.fastcompany.com/latest/rss',                            { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.etftrends.com/feed/',                                    { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.digitaltrends.com/feed/',                               { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.engadget.com/rss.xml',                                  { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.fiercebiotech.com/rss/xml',                             { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.thedailyupside.com/feed/',                              { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.theblock.co/rss.xml',                                   { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.pymnts.com/feed/',                                       { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://oilprice.com/rss/main',                                     { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.gurufocus.com/rss.php',                                 { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.latimes.com/rss2.0.xml',                                { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://time.com/feed/',                                             { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.freightwaves.com/feed',                                 { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.housingwire.com/feed/',                                 { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.nbcnews.com/nbcnews/public/business',                 { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    ...googleSearches.map(q =>
      axios.get('https://news.google.com/rss/search', {
        params: { q, hl: 'en-US', gl: 'US', ceid: 'US:en' },
        headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
        timeout: 8_000,
        responseType: 'text',
      }),
    ),
  ]);

  const parseText = (r: PromiseSettledResult<any>, src: 'rss' | 'google'): NewsItem[] => {
    if (r.status !== 'fulfilled') return [];
    return parseRssItems(r.value.data as string, src);
  };

  const cnbcItems       = parseText(cnbcRes,          'rss').map(i => ({ ...i, source: 'cnbc',          publisher: i.publisher || 'CNBC' }));
  const mwItems         = parseText(mwRes,            'rss').map(i => ({ ...i, source: 'marketwatch',   publisher: i.publisher || 'MarketWatch' }));
  const wsjItems        = [
    ...parseText(wsjMarketsRes,  'rss'),
    ...parseText(wsjBusinessRes, 'rss'),
  ].map(i => ({ ...i, source: 'wsj', publisher: i.publisher || 'WSJ' }));
  const benzItems       = parseText(benzRes,          'rss').map(i => ({ ...i, source: 'benzinga',      publisher: i.publisher || 'Benzinga' }));
  const investingItems  = parseText(investingRes,     'rss').map(i => ({ ...i, source: 'investing',     publisher: i.publisher || 'Investing.com' }));
  const saItems         = parseText(saRes,            'rss').map(i => ({ ...i, source: 'seekingalpha',  publisher: i.publisher || 'Seeking Alpha' }));
  const prItems         = parseText(prnewswireRes,    'rss').map(i => ({ ...i, source: 'prnewswire',    publisher: i.publisher || 'PR Newswire' }));
  const foolItems       = parseText(foolRes,          'rss').map(i => ({ ...i, source: 'fool',          publisher: i.publisher || 'Motley Fool' }));
  const gnwItems        = [
    ...parseText(gnwNasdaqRes,   'rss'),
    ...parseText(gnwNyseRes,     'rss'),
  ].map(i => ({ ...i, source: 'globenewswire', publisher: i.publisher || 'GlobeNewswire' }));
  const foxItems        = parseText(foxRes,           'rss').map(i => ({ ...i, source: 'foxbusiness',   publisher: i.publisher || 'Fox Business' }));
  const bbcItems        = parseText(bbcRes,           'rss').map(i => ({ ...i, source: 'bbc',           publisher: i.publisher || 'BBC' }));
  const wallstItems     = parseText(wallstRes,        'rss').map(i => ({ ...i, source: 'wallst',        publisher: i.publisher || '24/7 Wall St.' }));
  const appleinsiderItems = parseText(appleinsiderRes,'rss').map(i => ({ ...i, source: 'appleinsider',  publisher: i.publisher || 'AppleInsider' }));
  const fortuneItems    = parseText(fortuneRes,       'rss').map(i => ({ ...i, source: 'fortune',       publisher: i.publisher || 'Fortune' }));
  const techcrunchItems = parseText(techcrunchRes,    'rss').map(i => ({ ...i, source: 'techcrunch',    publisher: i.publisher || 'TechCrunch' }));
  const quartzItems     = parseText(quartzRes,        'rss').map(i => ({ ...i, source: 'quartz',        publisher: i.publisher || 'Quartz' }));
  const nasdaqItems          = parseText(nasdaqRes,           'rss').map(i => ({ ...i, source: 'nasdaq',          publisher: i.publisher || 'Nasdaq' }));
  const bloombergMarketsItems= parseText(bloombergMarketsRes, 'rss').map(i => ({ ...i, source: 'bloomberg',       publisher: i.publisher || 'Bloomberg' }));
  const bloombergTechItems   = parseText(bloombergTechRes,    'rss').map(i => ({ ...i, source: 'bloomberg',       publisher: i.publisher || 'Bloomberg Technology' }));
  const beincryptoItems      = parseText(beincryptoRes,       'rss').map(i => ({ ...i, source: 'beincrypto',      publisher: i.publisher || 'BeInCrypto' }));
  const blackenterpriseItems = parseText(blackenterpriseRes,  'rss').map(i => ({ ...i, source: 'blackenterprise', publisher: i.publisher || 'Black Enterprise' }));
  const cbsItems         = parseText(cbsRes,          'rss').map(i => ({ ...i, source: 'cbs',             publisher: i.publisher || 'CBS MoneyWatch' }));
  const coinDeskItems    = parseText(coinDeskRes,      'rss').map(i => ({ ...i, source: 'coindesk',        publisher: i.publisher || 'CoinDesk' }));
  const cryptonewsItems  = parseText(cryptonewsRes,    'rss').map(i => ({ ...i, source: 'cryptonews',      publisher: i.publisher || 'Cryptonews' }));
  const commObserverItems= parseText(commObserverRes,  'rss').map(i => ({ ...i, source: 'commobserver',    publisher: i.publisher || 'Commercial Observer' }));
  const coinGapeItems    = parseText(coinGapeRes,      'rss').map(i => ({ ...i, source: 'coingape',        publisher: i.publisher || 'CoinGape' }));
  const ftItems          = parseText(ftRes,            'rss').map(i => ({ ...i, source: 'ft',              publisher: i.publisher || 'Financial Times' }));
  const decryptItems     = parseText(decryptRes,       'rss').map(i => ({ ...i, source: 'decrypt',         publisher: i.publisher || 'Decrypt' }));
  const fastcoItems      = parseText(fastcoRes,        'rss').map(i => ({ ...i, source: 'fastco',          publisher: i.publisher || 'Fast Company' }));
  const etfTrendsItems   = parseText(etfTrendsRes,     'rss').map(i => ({ ...i, source: 'etftrends',       publisher: i.publisher || 'ETF Trends' }));
  const digitalTrendsItems= parseText(digitalTrendsRes,'rss').map(i => ({ ...i, source: 'digitaltrends',   publisher: i.publisher || 'Digital Trends' }));
  const engadgetItems    = parseText(engadgetRes,      'rss').map(i => ({ ...i, source: 'engadget',        publisher: i.publisher || 'Engadget' }));
  const fierceBioItems   = parseText(fierceBioRes,     'rss').map(i => ({ ...i, source: 'fiercebio',       publisher: i.publisher || 'FierceBiotech' }));
  const dailyUpsideItems = parseText(dailyUpsideRes,   'rss').map(i => ({ ...i, source: 'dailyupside',     publisher: i.publisher || 'The Daily Upside' }));
  const theBlockItems    = parseText(theBlockRes,      'rss').map(i => ({ ...i, source: 'theblock',        publisher: i.publisher || 'The Block' }));
  const pymntItems       = parseText(pymntRes,         'rss').map(i => ({ ...i, source: 'pymnts',          publisher: i.publisher || 'PYMNTS' }));
  const oilpriceItems    = parseText(oilpriceRes,      'rss').map(i => ({ ...i, source: 'oilprice',        publisher: i.publisher || 'OilPrice.com' }));
  const guruFocusItems   = parseText(guruFocusRes,     'rss').map(i => ({ ...i, source: 'gurufocus',       publisher: i.publisher || 'GuruFocus' }));
  const laTimesItems     = parseText(laTimesRes,       'rss').map(i => ({ ...i, source: 'latimes',         publisher: i.publisher || 'LA Times' }));
  const timeItems        = parseText(timeRes,          'rss').map(i => ({ ...i, source: 'time',            publisher: i.publisher || 'Time' }));
  const freightWavesItems= parseText(freightWavesRes,  'rss').map(i => ({ ...i, source: 'freightwaves',    publisher: i.publisher || 'FreightWaves' }));
  const housingWireItems = parseText(housingWireRes,   'rss').map(i => ({ ...i, source: 'housingwire',     publisher: i.publisher || 'HousingWire' }));
  const nbcBizItems      = parseText(nbcBizRes,        'rss').map(i => ({ ...i, source: 'nbc',             publisher: i.publisher || 'NBC News' }));
  const googleItems     = googleRes.flatMap(r => parseText(r, 'google'));

  const sixHoursAgo = Math.floor(Date.now() / 1000) - 6 * 60 * 60;

  const all = merge(
    cnbcItems, mwItems, wsjItems, benzItems,
    investingItems, saItems, prItems, foolItems, gnwItems,
    foxItems, bbcItems,
    wallstItems, appleinsiderItems, fortuneItems, techcrunchItems, quartzItems, nasdaqItems,
    bloombergMarketsItems, bloombergTechItems, beincryptoItems, blackenterpriseItems,
    cbsItems, coinDeskItems, cryptonewsItems, commObserverItems, coinGapeItems,
    ftItems, decryptItems, fastcoItems, etfTrendsItems, digitalTrendsItems, engadgetItems, fierceBioItems,
    dailyUpsideItems, theBlockItems, pymntItems, oilpriceItems, guruFocusItems,
    laTimesItems, timeItems, freightWavesItems, housingWireItems, nbcBizItems,
    googleItems,
  ).filter(item => item.publishedAt > 0 && item.publishedAt >= sixHoursAgo);

  const items = all.map(item => {
    const category  = categorize(item.title, item.summary);
    const sentiment = getSentiment(item.title, item.summary);
    const bigBeat   = (category === 'Earnings' || category === 'Analyst Rating')
      ? isBigBeat(item.title, item.summary)
      : false;
    return {
      ...item,
      category,
      sentiment,
      isPinned: HIGH_IMPACT.includes(category),
      ticker:   extractTicker(`${item.title} ${item.summary ?? ''}`),
      bigBeat,
    };
  });

  return {
    items,
    sources: {
      cnbc:          cnbcItems.length,
      marketwatch:   mwItems.length,
      wsj:           wsjItems.length,
      benzinga:      benzItems.length,
      investing:     investingItems.length,
      seekingalpha:  saItems.length,
      prnewswire:    prItems.length,
      fool:          foolItems.length,
      globenewswire: gnwItems.length,
      foxbusiness:   foxItems.length,
      bbc:           bbcItems.length,
      wallst:        wallstItems.length,
      appleinsider:  appleinsiderItems.length,
      fortune:       fortuneItems.length,
      techcrunch:    techcrunchItems.length,
      quartz:        quartzItems.length,
      nasdaq:        nasdaqItems.length,
      bloomberg:     bloombergMarketsItems.length + bloombergTechItems.length,
      beincrypto:    beincryptoItems.length,
      blackenterprise: blackenterpriseItems.length,
      cbs:           cbsItems.length,
      coindesk:      coinDeskItems.length,
      cryptonews:    cryptonewsItems.length,
      commobserver:  commObserverItems.length,
      coingape:      coinGapeItems.length,
      ft:            ftItems.length,
      decrypt:       decryptItems.length,
      fastco:        fastcoItems.length,
      etftrends:     etfTrendsItems.length,
      digitaltrends: digitalTrendsItems.length,
      engadget:      engadgetItems.length,
      fiercebio:     fierceBioItems.length,
      dailyupside:   dailyUpsideItems.length,
      theblock:      theBlockItems.length,
      pymnts:        pymntItems.length,
      oilprice:      oilpriceItems.length,
      gurufocus:     guruFocusItems.length,
      latimes:       laTimesItems.length,
      time:          timeItems.length,
      freightwaves:  freightWavesItems.length,
      housingwire:   housingWireItems.length,
      nbc:           nbcBizItems.length,
      google:        googleItems.length,
    },
  };
}

/**
 * Fetch general financial news from sources that don't need a ticker symbol.
 * Each item is enriched with category/sentiment and a best-effort ticker.
 * Only HIGH_IMPACT items are returned.
 */
export async function fetchBroadMarketNews(): Promise<Array<{ item: NewsItem; ticker: string | null }>> {
  // Google News searches for the specific event types we care about most
  const googleSearches = [
    'FDA approved OR "FDA approval" stock',
    '"clinical trial" OR "phase 3" OR "phase 2" stock results',
    '"merger" OR "acquisition" OR "acquires" stock deal',
    '"earnings" OR "quarterly results" beats misses stock',
    '"analyst" OR "price target" OR "upgrade" OR "downgrade" stock rating',
    '"government contract" OR "awarded contract" OR "defense contract" stock',
    '"raises" OR "IPO" OR "private placement" OR "secondary offering" stock',
  ];

  const [
    reutersRes, cnbcRes, mwRes, apRes, forbesRes,
    ...googleRes
  ] = await Promise.allSettled([
    // General financial RSS feeds (return their full feed regardless of q param)
    axios.get('https://feeds.reuters.com/reuters/businessNews',         { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.cnbc.com/id/10000664/device/rss/rss.html',   { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.marketwatch.com/marketwatch/topstories/',  { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://feeds.apnews.com/apnews/business',               { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    axios.get('https://www.forbes.com/investing/feed/',                  { headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' }, timeout: 8_000, responseType: 'text' }),
    // Targeted Google News searches for each high-impact category
    ...googleSearches.map(q =>
      axios.get('https://news.google.com/rss/search', {
        params: { q, hl: 'en-US', gl: 'US', ceid: 'US:en' },
        headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml' },
        timeout: 8_000,
        responseType: 'text',
      }),
    ),
  ]);

  const parseText = (r: PromiseSettledResult<any>, src: 'rss' | 'google'): NewsItem[] => {
    if (r.status !== 'fulfilled') return [];
    return parseRssItems(r.value.data as string, src);
  };

  const all = merge(
    parseText(reutersRes, 'rss').map(i => ({ ...i, source: 'reuters', publisher: i.publisher || 'Reuters' })),
    parseText(cnbcRes,    'rss').map(i => ({ ...i, source: 'cnbc',    publisher: i.publisher || 'CNBC' })),
    parseText(mwRes,      'rss').map(i => ({ ...i, source: 'marketwatch', publisher: i.publisher || 'MarketWatch' })),
    parseText(apRes,      'rss').map(i => ({ ...i, source: 'ap',      publisher: i.publisher || 'AP' })),
    parseText(forbesRes,  'rss').map(i => ({ ...i, source: 'forbes',  publisher: i.publisher || 'Forbes' })),
    ...googleRes.map(r => parseText(r, 'google')),
  );

  return all
    .map(item => {
      const category  = categorize(item.title, item.summary);
      const sentiment = getSentiment(item.title, item.summary);
      const enriched: NewsItem = { ...item, category, sentiment, isPinned: HIGH_IMPACT.includes(category) };
      return enriched;
    })
    .filter(item => item.isPinned)
    .map(item => ({
      item,
      ticker: extractTicker(`${item.title} ${item.summary ?? ''}`),
    }));
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
  sources: Record<string, number>;
}> {
  const [
    jsonResult, rssResult, googleResult, edgarResult, gnwResult, bwResult,
    finnhubResult, tsResult, reutersResult, cnbcResult, mwResult,
    saResult, benzResult, apResult, forbesResult,
  ] = await Promise.allSettled([
    fetchYahooJson(symbol),
    fetchYahooRss(symbol),
    fetchGoogleNews(symbol),
    fetchSecEdgar(symbol),
    fetchGlobeNewswire(symbol),
    fetchBusinessWire(symbol),
    fetchFinnhub(symbol),
    fetchTheStreet(symbol),
    fetchReuters(symbol),
    fetchCNBC(symbol),
    fetchMarketWatch(symbol),
    fetchSeekingAlpha(symbol),
    fetchBenzinga(symbol),
    fetchAP(symbol),
    fetchForbes(symbol),
  ]);

  const ok = <T>(r: PromiseSettledResult<T[]>): T[] => r.status === 'fulfilled' ? r.value : [];

  const jsonItems       = ok(jsonResult);
  const rssItems        = ok(rssResult);
  const googleItems     = ok(googleResult);
  const edgarItems      = ok(edgarResult);
  const gnwItems        = ok(gnwResult);
  const bwItems         = ok(bwResult);
  const finnhubItems    = ok(finnhubResult);
  const thestreetItems  = ok(tsResult);
  const reutersItems    = ok(reutersResult);
  const cnbcItems       = ok(cnbcResult);
  const mwItems         = ok(mwResult);
  const saItems         = ok(saResult);
  const benzItems       = ok(benzResult);
  const apItems         = ok(apResult);
  const forbesItems     = ok(forbesResult);

  const items = merge(
    jsonItems, rssItems, googleItems, edgarItems, gnwItems, bwItems,
    finnhubItems, thestreetItems, reutersItems, cnbcItems, mwItems,
    saItems, benzItems, apItems, forbesItems,
  ).map(item => {
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
      thestreet:     thestreetItems.length,
      reuters:       reutersItems.length,
      cnbc:          cnbcItems.length,
      marketwatch:   mwItems.length,
      seekingalpha:  saItems.length,
      benzinga:      benzItems.length,
      ap:            apItems.length,
      forbes:        forbesItems.length,
    },
  };
}
