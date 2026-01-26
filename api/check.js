export default async function handler(req, res) {
  try {
    const tickerRaw = (req.query.ticker || "").toString().trim();
    const ticker = tickerRaw.toUpperCase();

    if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing FINNHUB_API_KEY env var" });
    }

    const threshold = Number(process.env.THRESHOLD ?? 0.14); // 14% default

    // Finnhub quote: c=current, pc=prev close, o=open, h=high, l=low, t=timestamp
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
      ticker
    )}&token=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).json({ error: "Quote provider error" });
    }

    const q = await r.json();

    const current = Number(q.c);
    const prevClose = Number(q.pc);
    const open = Number(q.o);
    const high = Number(q.h);
    const low = Number(q.l);
    const ts = Number(q.t);

    if (!current || !prevClose) {
      return res.status(404).json({ error: "No data for ticker (or market closed)" });
    }

    const pctChange = (current - prevClose) / prevClose; // decimal
    const meetsRule = pctChange >= threshold;

    return res.status(200).json({
      ticker,
      meetsRule,
      threshold,
      current,
      prevClose,
      pctChange,
      open,
      high,
      low,
      timestamp: ts ? new Date(ts * 1000).toISOString() : null,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
