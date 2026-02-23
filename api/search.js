
export default async function handler(req, res) {
  try {
    const qRaw = (req.query.q || "").toString().trim();
    const q = qRaw.toUpperCase();

    if (!q) {
      return res.status(400).json({ error: "Missing search query" });
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing FINNHUB_API_KEY" });
    }

    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    const data = await r.json();

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Server error", details: String(e) });
  }
}
