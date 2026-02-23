export default async function handler(req, res) {
  try {
    const tickerRaw = (req.query.ticker || "").toString().trim();
    const timeframe = (req.query.timeframe || "1d").toLowerCase();
    const ticker = tickerRaw.toUpperCase();

    if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing FINNHUB_API_KEY env var" });
    }

    const resolutionMap = {
      "15s": "1",
      "1m": "1",
      "1h": "60",
      "1d": "D",
      "1w": "W",
      "1mo": "M",
    };

    // Map frontend timeframe to Finnhub resolutions
    const resolution = resolutionMap[timeframe] || "D";
    const now = Math.floor(Date.now() / 1000);
    const from = now - 60 * 60 * 24 * 365 * 2; // 2 years of data

    const candleUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
      ticker
    )}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${now}&token=${encodeURIComponent(apiKey)}`;

    const r = await fetch(candleUrl);
    const data = await r.json();

    if (data.s !== "ok") {
      return res.status(502).json({ error: "Candle data not available", details: data });
    }

    const candles = data.t.map((t, i) => ({
      time: t,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
    }));

    res.status(200).json({
      ticker,
      timeframe,
      timeframeResolved: resolution,
      candles,
      from,
      to: now,
      fallbackApplied: false,
    });
  } catch (e) {
    res.status(500).json({ error: "Server error", details: String(e) });
  }
}

