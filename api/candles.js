// api/candles.js
export default async function handler(req, res) {
  try {
    // --- 1️⃣  Validate input ---
    const tickerRaw = (req.query.ticker || "").toString().trim();
    const timeframeRaw = (req.query.timeframe || "1d").toString().trim();
    const ticker = tickerRaw.toUpperCase();
    const timeframe = timeframeRaw.toLowerCase();

    if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }

    // --- 2️⃣  Load environment variable ---
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing FINNHUB_API_KEY env var" });
    }

    // --- 3️⃣  Map timeframes to Finnhub resolutions ---
    const resolutionMap = {
      "15s": "1",
      "1m": "1",
      "1h": "60",
      "1d": "D",
      "1w": "W",
      "1mo": "M",
    };
    const resolution = resolutionMap[timeframe] || "D";

    // --- 4️⃣  Date range: past 2 years ---
    const now = Math.floor(Date.now() / 1000);
    const from = now - 60 * 60 * 24 * 365 * 2;

    // --- 5️⃣  Fetch from Finnhub ---
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
      ticker
    )}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${now}&token=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).json({ error: "Finnhub request failed" });
    }

    const data = await r.json();

    // --- 6️⃣  Validate response ---
    if (data.s !== "ok" || !data.t || data.t.length === 0) {
      return res.status(404).json({ error: "No candle data available", details: data });
    }

    // --- 7️⃣  Build candle data structure ---
    const candles = data.t.map((t, i) => ({
      time: t,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
    }));

    // --- 8️⃣  Send JSON response ---
    return res.status(200).json({
      ticker,
      timeframe,
      candles,
      from,
      to: now,
      source: "Finnhub",
    });
  } catch (e) {
    // --- 9️⃣  Catch any unhandled errors ---
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
